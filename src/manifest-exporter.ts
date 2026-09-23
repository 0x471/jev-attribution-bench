import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname } from "node:path";

import { Ajv2020, type ValidateFunction } from "ajv/dist/2020.js";

import { certificationStatus } from "./review-ledger.js";
import type { ReviewManifest, ReviewSubjectType } from "./manifest.js";

const require = createRequire(import.meta.url);
const addFormats = require("ajv-formats") as typeof import("ajv-formats").default;

export interface ManifestVerification {
  valid: boolean;
  errors: string[];
}

function duplicates(values: string[]): string[] {
  const seen = new Set<string>();
  const repeated = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) repeated.add(value);
    seen.add(value);
  }
  return [...repeated].sort();
}

function knownSubject(
  manifest: ReviewManifest,
  subjectType: ReviewSubjectType,
  subjectId: string,
): boolean {
  if (subjectType === "document") return manifest.document.id === subjectId;
  if (subjectType === "claim") return manifest.claims.some((claim) => claim.id === subjectId);
  if (subjectType === "evidence-relation") {
    return manifest.evidenceRelations.some((relation) => relation.id === subjectId);
  }
  return manifest.argumentEdges.some((edge) => edge.id === subjectId);
}

export class ManifestExporter {
  readonly #validateSchema: ValidateFunction;

  private constructor(validateSchema: ValidateFunction) {
    this.#validateSchema = validateSchema;
  }

  static async create(): Promise<ManifestExporter> {
    const schemaUrl = new URL("../schemas/review-manifest.schema.json", import.meta.url);
    const schema = JSON.parse(await readFile(schemaUrl, "utf8")) as object;
    const ajv = new Ajv2020({ allErrors: true, strict: true });
    addFormats(ajv);
    return new ManifestExporter(ajv.compile(schema));
  }

  verify(value: unknown): ManifestVerification {
    if (!this.#validateSchema(value)) {
      return {
        valid: false,
        errors: (this.#validateSchema.errors ?? []).map(
          (error) => `${error.instancePath || "/"} ${error.message ?? "is invalid"}`,
        ),
      };
    }

    const manifest = value as ReviewManifest;
    const errors: string[] = [];
    if (manifest.document.role !== "document") errors.push("document artifact role must be document");
    for (const source of manifest.sources) {
      if (source.role !== "source") errors.push(`source ${source.id} artifact role must be source`);
    }

    const allIds = [
      manifest.document.id,
      ...manifest.sources.map((source) => source.id),
      ...manifest.claims.map((claim) => claim.id),
      ...manifest.evidenceRelations.map((relation) => relation.id),
      ...manifest.argumentEdges.map((edge) => edge.id),
      ...manifest.reviewActions.map((action) => action.id),
    ];
    for (const id of duplicates(allIds)) errors.push(`duplicate id ${id}`);

    const claimIds = new Set(manifest.claims.map((claim) => claim.id));
    const sourceIds = new Set(manifest.sources.map((source) => source.id));
    for (const claim of manifest.claims) {
      if (claim.origin.artifactId !== manifest.document.id) {
        errors.push(`claim ${claim.id} origin does not reference document ${manifest.document.id}`);
      }
      if (claim.origin.start >= claim.origin.end) {
        errors.push(`claim ${claim.id} has an empty or reversed origin`);
      }
    }
    for (const relation of manifest.evidenceRelations) {
      if (!claimIds.has(relation.claimId)) {
        errors.push(
          `evidence relation ${relation.id} references unknown claim ${relation.claimId}`,
        );
      }
      if (!sourceIds.has(relation.evidence.sourceArtifactId)) {
        errors.push(
          `evidence relation ${relation.id} references unknown source ${relation.evidence.sourceArtifactId}`,
        );
      }
      if (
        relation.evidence.anchor !== null &&
        relation.evidence.anchor.artifactId !== relation.evidence.sourceArtifactId
      ) {
        errors.push(`evidence relation ${relation.id} anchor references a different source`);
      }
      if (relation.assessment.exactMatch !== (relation.evidence.anchor !== null)) {
        errors.push(`evidence relation ${relation.id} exact-match state is inconsistent`);
      }
      const assessment = relation.assessment;
      if (assessment.relation === "fabricated") {
        if (
          relation.evidence.anchor !== null ||
          assessment.exactMatch ||
          assessment.requestedModel !== null ||
          assessment.resolvedModel !== null ||
          assessment.probabilities !== null ||
          assessment.confidence !== null ||
          assessment.inputTokens !== null ||
          assessment.outputTokens !== null
        ) {
          errors.push(
            `evidence relation ${relation.id} has an invalid fabricated assessment shape`,
          );
        }
      } else {
        if (
          relation.evidence.anchor === null ||
          !assessment.exactMatch ||
          assessment.requestedModel === null ||
          assessment.resolvedModel === null ||
          assessment.probabilities === null ||
          assessment.confidence === null ||
          assessment.inputTokens === null ||
          assessment.outputTokens === null
        ) {
          errors.push(`evidence relation ${relation.id} has an incomplete model assessment`);
        } else {
          const probabilitySum = Object.values(assessment.probabilities).reduce(
            (sum, probability) => sum + probability,
            0,
          );
          if (Math.abs(probabilitySum - 1) > 0.001) {
            errors.push(`evidence relation ${relation.id} probabilities do not sum to 1`);
          }
        }
      }
    }
    for (const edge of manifest.argumentEdges) {
      if (!claimIds.has(edge.fromClaimId)) {
        errors.push(`argument edge ${edge.id} references unknown claim ${edge.fromClaimId}`);
      }
      if (!claimIds.has(edge.toClaimId)) {
        errors.push(`argument edge ${edge.id} references unknown claim ${edge.toClaimId}`);
      }
    }
    for (const action of manifest.reviewActions) {
      if (!knownSubject(manifest, action.subjectType, action.subjectId)) {
        errors.push(
          `review action ${action.id} references unknown ${action.subjectType} ${action.subjectId}`,
        );
      }
      if (action.decision === "waive" && !action.reason?.trim()) {
        errors.push(`review action ${action.id} waives a subject without a reason`);
      }
      const boundSourceIds = action.boundSources
        .map((binding) => binding.artifactId)
        .sort();
      if (JSON.stringify(boundSourceIds) !== JSON.stringify([...sourceIds].sort())) {
        errors.push(`review action ${action.id} does not bind every declared source identity`);
      }
    }
    if (manifest.certification !== null) {
      const status = certificationStatus(manifest);
      if (!status.valid) errors.push(`certification is invalid: ${status.reason}`);
    }

    return { valid: errors.length === 0, errors };
  }

  async export(manifest: ReviewManifest, outputPath: string): Promise<void> {
    const verification = this.verify(manifest);
    if (!verification.valid) {
      throw new Error(`Refusing to export invalid manifest:\n${verification.errors.join("\n")}`);
    }

    await mkdir(dirname(outputPath), { recursive: true });
    const temporary = `${outputPath}.tmp-${process.pid}-${Date.now()}`;
    await writeFile(temporary, `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 });
    await rename(temporary, outputPath);
  }
}
