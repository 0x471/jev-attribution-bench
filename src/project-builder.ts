import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname } from "node:path";

import { Ajv2020, type ValidateFunction } from "ajv/dist/2020.js";

import { sha256, verifyArtifactBytes } from "./artifacts.js";
import { ProjectArtifactStore } from "./artifact-store.js";
import { importClaims } from "./claim-catalog.js";
import { EvidenceReviewEngine, locateNormalizedQuote } from "./evidence-review.js";
import { FixtureEvidenceRelationChecker } from "./fixture-checker.js";
import {
  CachedEvidenceRelationChecker,
  FileAssessmentCache,
  PINNED_JEV_MODEL,
  createJevCheckerFromEnvironment,
} from "./jev-checker.js";
import { canonicalJson, type ArgumentEdge, type ReviewManifest } from "./manifest.js";

const require = createRequire(import.meta.url);
const addFormats = require("ajv-formats") as typeof import("ajv-formats").default;

interface ArtifactInput {
  id: string;
  path: string;
  mediaType: "text/plain" | "text/markdown";
}

interface EvidenceInput {
  id: string;
  sourceId: string;
  quote: string;
}

interface ClaimInput {
  id: string;
  text: string;
  originText: string;
  kind: "stated" | "implicit-premise";
  proposedBy: "human";
  proposalModel: null;
  evidence: EvidenceInput[];
}

interface ProjectInput {
  schemaVersion: "0.1.0";
  reviewId: string;
  publication: { fixture: boolean; containsSensitiveData: boolean };
  document: ArtifactInput;
  sources: ArtifactInput[];
  claims: ClaimInput[];
  argumentEdges: ArgumentEdge[];
}

export type CheckerConfiguration =
  | { type: "fixture"; assessmentsPath: string }
  | { type: "jev"; cacheDirectory: string; rubricVersion?: string };

export interface BuildReviewProjectOptions {
  projectPath: string;
  checker: CheckerConfiguration;
  now?: () => Date;
}

export interface ProjectArtifactVerification {
  valid: boolean;
  errors: string[];
}

async function readProject(projectPath: string): Promise<ProjectInput> {
  const value: unknown = JSON.parse(await readFile(projectPath, "utf8"));
  const validate = await projectValidator();
  if (!validate(value)) {
    const errors = (validate.errors ?? [])
      .map((error) => `${error.instancePath || "/"} ${error.message ?? "is invalid"}`)
      .join("\n");
    throw new Error(`Invalid project file:\n${errors}`);
  }
  const project = value as ProjectInput;
  assertUniqueIds(project);
  assertProjectReferences(project);
  return project;
}

async function projectValidator(): Promise<ValidateFunction> {
  const schema = JSON.parse(
    await readFile(new URL("../schemas/project.schema.json", import.meta.url), "utf8"),
  ) as object;
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  addFormats(ajv);
  return ajv.compile(schema);
}

function assertUniqueIds(project: ProjectInput): void {
  const ids = [
    project.document.id,
    ...project.sources.map((source) => source.id),
    ...project.claims.flatMap((claim) => [
      claim.id,
      ...claim.evidence.map((evidence) => evidence.id),
    ]),
    ...project.argumentEdges.map((edge) => edge.id),
  ];
  const seen = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) throw new Error(`Duplicate project id ${id}`);
    seen.add(id);
  }
}

function assertProjectReferences(project: ProjectInput): void {
  const sourceIds = new Set(project.sources.map((source) => source.id));
  const claimIds = new Set(project.claims.map((claim) => claim.id));
  for (const claim of project.claims) {
    for (const evidence of claim.evidence) {
      if (!sourceIds.has(evidence.sourceId)) {
        throw new Error(`Evidence ${evidence.id} references unknown source ${evidence.sourceId}`);
      }
    }
  }
  for (const edge of project.argumentEdges) {
    if (!claimIds.has(edge.fromClaimId)) {
      throw new Error(`Argument edge ${edge.id} references unknown claim ${edge.fromClaimId}`);
    }
    if (!claimIds.has(edge.toClaimId)) {
      throw new Error(`Argument edge ${edge.id} references unknown claim ${edge.toClaimId}`);
    }
  }
}

export async function buildReviewProject(
  options: BuildReviewProjectOptions,
): Promise<ReviewManifest> {
  const now = options.now ?? (() => new Date());
  const project = await readProject(options.projectPath);
  const projectDirectory = dirname(options.projectPath);
  const artifactStore = await ProjectArtifactStore.open(projectDirectory);

  const document = await artifactStore.ingest(project.document, "document");
  const sourceRecords = await Promise.all(
    project.sources.map(async (source) => artifactStore.ingest(source, "source")),
  );
  const sourceById = new Map(sourceRecords.map((source) => [source.artifact.id, source]));

  const claims = importClaims(document, project.claims);
  const claimById = new Map(claims.map((claim) => [claim.id, claim]));

  const rubricVersion =
    options.checker.type === "jev"
      ? (options.checker.rubricVersion ?? "evidence-relation-v1")
      : "evidence-relation-v1";
  const checker =
    options.checker.type === "fixture"
      ? await FixtureEvidenceRelationChecker.fromFile(options.checker.assessmentsPath, now)
      : new CachedEvidenceRelationChecker(
          createJevCheckerFromEnvironment({
            model: PINNED_JEV_MODEL,
            rubricVersion,
            now,
          }),
          new FileAssessmentCache(options.checker.cacheDirectory),
          `${PINNED_JEV_MODEL}:${rubricVersion}:sdk-0.6.0`,
        );
  const engine = new EvidenceReviewEngine(checker, {
    rubricVersion,
    contextCharacters: 1_000,
    now,
  });

  const evidenceRelations = [];
  for (const claimInput of project.claims) {
    const claim = claimById.get(claimInput.id)!;
    for (const evidence of claimInput.evidence) {
      const source = sourceById.get(evidence.sourceId);
      if (source === undefined) {
        throw new Error(`Evidence ${evidence.id} references unknown source ${evidence.sourceId}`);
      }
      evidenceRelations.push(
        await engine.review({
          id: evidence.id,
          claim,
          source,
          proposedQuote: evidence.quote,
        }),
      );
    }
  }

  return {
    schemaVersion: "0.1.0",
    reviewId: project.reviewId,
    createdAt: now().toISOString(),
    publication: project.publication,
    document: document.artifact,
    sources: sourceRecords.map((source) => source.artifact),
    claims,
    evidenceRelations,
    argumentEdges: project.argumentEdges,
    reviewActions: [],
    certification: null,
    toolchain: {
      claimLedgerVersion: "0.0.0",
      nodeVersion: process.version,
      sdkVersion: options.checker.type === "jev" ? "0.6.0" : null,
    },
  };
}

export async function verifyProjectArtifacts(
  projectPath: string,
  manifest: ReviewManifest,
): Promise<ProjectArtifactVerification> {
  const project = await readProject(projectPath);
  const projectDirectory = dirname(projectPath);
  const artifactStore = await ProjectArtifactStore.open(projectDirectory);
  const declarations = [project.document, ...project.sources];
  const expectedById = new Map(
    [manifest.document, ...manifest.sources].map((artifact) => [artifact.id, artifact]),
  );
  const errors: string[] = [];
  const records = new Map<string, Awaited<ReturnType<ProjectArtifactStore["ingest"]>>>();

  for (const declaration of declarations) {
    const expected = expectedById.get(declaration.id);
    if (expected === undefined) {
      errors.push(`${declaration.id}: artifact is absent from the manifest`);
      continue;
    }
    const record = await artifactStore.ingest(
      declaration,
      declaration.id === project.document.id ? "document" : "source",
    );
    records.set(declaration.id, record);
    const result = verifyArtifactBytes(expected, record.bytes);
    if (!result.valid) {
      errors.push(
        `${declaration.id}: sha256 mismatch; expected ${result.expectedSha256}, got ${result.actualSha256}`,
      );
    }
  }

  for (const artifact of expectedById.values()) {
    if (!declarations.some((declaration) => declaration.id === artifact.id)) {
      errors.push(`${artifact.id}: artifact is absent from the project`);
    }
  }

  const manifestClaimById = new Map(manifest.claims.map((claim) => [claim.id, claim]));
  const projectClaimIds = new Set(project.claims.map((claim) => claim.id));
  for (const claim of manifest.claims) {
    if (!projectClaimIds.has(claim.id)) errors.push(`${claim.id}: claim is absent from the project`);
  }
  const documentText = records.get(project.document.id)?.text;
  if (documentText !== undefined) {
    for (const input of project.claims) {
      const claim = manifestClaimById.get(input.id);
      const expectedAnchor = locateNormalizedQuote(documentText, input.originText);
      if (
        claim === undefined ||
        expectedAnchor === null ||
        claim.origin.artifactId !== project.document.id ||
        claim.origin.start !== expectedAnchor.start ||
        claim.origin.end !== expectedAnchor.end ||
        claim.origin.textSha256 !== sha256(expectedAnchor.text)
      ) {
        errors.push(`${input.id}: claim anchor does not match the declared document text`);
      } else if (
        claim.text !== input.text ||
        claim.kind !== input.kind ||
        claim.proposedBy !== input.proposedBy ||
        claim.proposalModel !== input.proposalModel
      ) {
        errors.push(`${input.id}: claim fields do not match the project declaration`);
      }
    }
  }

  const manifestRelationById = new Map(
    manifest.evidenceRelations.map((relation) => [relation.id, relation]),
  );
  const projectRelationIds = new Set(
    project.claims.flatMap((claim) => claim.evidence.map((evidence) => evidence.id)),
  );
  for (const relation of manifest.evidenceRelations) {
    if (!projectRelationIds.has(relation.id)) {
      errors.push(`${relation.id}: evidence relation is absent from the project`);
    }
  }
  for (const claimInput of project.claims) {
    for (const input of claimInput.evidence) {
      const relation = manifestRelationById.get(input.id);
      const sourceText = records.get(input.sourceId)?.text;
      const expectedAnchor = sourceText ? locateNormalizedQuote(sourceText, input.quote) : null;
      if (relation === undefined) {
        errors.push(`${input.id}: evidence relation is absent from the manifest`);
      } else if (
        relation.claimId !== claimInput.id ||
        relation.evidence.sourceArtifactId !== input.sourceId ||
        relation.evidence.proposedQuote !== input.quote
      ) {
        errors.push(`${input.id}: evidence relation fields do not match the project declaration`);
      } else if (expectedAnchor === null) {
        if (relation.evidence.anchor !== null || relation.assessment.relation !== "fabricated") {
          errors.push(`${input.id}: missing quote must be recorded as fabricated`);
        }
      } else if (
        relation.evidence.anchor?.artifactId !== input.sourceId ||
        relation.evidence.anchor.start !== expectedAnchor.start ||
        relation.evidence.anchor.end !== expectedAnchor.end ||
        relation.evidence.anchor.textSha256 !== sha256(expectedAnchor.text) ||
        relation.evidence.text !== expectedAnchor.text
      ) {
        errors.push(`${input.id}: evidence anchor does not match the declared source text`);
      }
    }
  }

  const manifestEdges = [...manifest.argumentEdges].sort((left, right) => left.id.localeCompare(right.id));
  const projectEdges = [...project.argumentEdges].sort((left, right) => left.id.localeCompare(right.id));
  if (canonicalJson(manifestEdges) !== canonicalJson(projectEdges)) {
    errors.push("argument edges do not match the project declaration");
  }

  return { valid: errors.length === 0, errors };
}
