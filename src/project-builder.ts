import { readFile, realpath } from "node:fs/promises";
import { createRequire } from "node:module";
import { basename, dirname, isAbsolute, relative, resolve } from "node:path";

import { Ajv2020, type ValidateFunction } from "ajv/dist/2020.js";

import { ingestTextArtifact, sha256, verifyArtifactBytes } from "./artifacts.js";
import { EvidenceReviewEngine, locateNormalizedQuote } from "./evidence-review.js";
import { FixtureEvidenceRelationChecker } from "./fixture-checker.js";
import {
  CachedEvidenceRelationChecker,
  FileAssessmentCache,
  createJevCheckerFromEnvironment,
} from "./jev-checker.js";
import type { ArgumentEdge, Claim, ReviewManifest } from "./manifest.js";

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
  | { type: "jev"; cacheDirectory: string; model?: string; rubricVersion?: string };

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

async function resolveProjectFile(projectDirectory: string, declaredPath: string): Promise<string> {
  if (isAbsolute(declaredPath)) {
    throw new Error(`Project artifact paths must be relative: ${declaredPath}`);
  }
  const root = await realpath(projectDirectory);
  const candidate = resolve(root, declaredPath);
  const resolvedCandidate = await realpath(candidate);
  const fromRoot = relative(root, resolvedCandidate);
  if (fromRoot.startsWith("..") || isAbsolute(fromRoot)) {
    throw new Error(`Project artifact path escapes the project directory: ${declaredPath}`);
  }
  return resolvedCandidate;
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

export async function buildReviewProject(
  options: BuildReviewProjectOptions,
): Promise<ReviewManifest> {
  const now = options.now ?? (() => new Date());
  const project = await readProject(options.projectPath);
  const projectDirectory = dirname(options.projectPath);

  const documentPath = await resolveProjectFile(projectDirectory, project.document.path);
  const document = ingestTextArtifact({
    ...project.document,
    role: "document",
    name: basename(project.document.path),
    bytes: await readFile(documentPath),
  });
  const sourceRecords = await Promise.all(
    project.sources.map(async (source) =>
      ingestTextArtifact({
        ...source,
        role: "source",
        name: basename(source.path),
        bytes: await readFile(await resolveProjectFile(projectDirectory, source.path)),
      }),
    ),
  );
  const sourceById = new Map(sourceRecords.map((source) => [source.artifact.id, source]));

  const claims: Claim[] = project.claims.map((input) => {
    const match = locateNormalizedQuote(document.text, input.originText);
    if (match === null) {
      throw new Error(`Claim ${input.id} origin text was not found in the document`);
    }
    return {
      id: input.id,
      text: input.text,
      origin: {
        artifactId: document.artifact.id,
        start: match.start,
        end: match.end,
        textSha256: sha256(match.text),
        offsetEncoding: "unicode-code-point",
      },
      kind: input.kind,
      proposedBy: input.proposedBy,
      proposalModel: null,
    };
  });
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
            model: options.checker.model ?? "jev-1.13.0",
            rubricVersion,
            now,
          }),
          new FileAssessmentCache(options.checker.cacheDirectory),
          `${options.checker.model ?? "jev-1.13.0"}:${rubricVersion}:sdk-0.6.0`,
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
  const declarations = [project.document, ...project.sources];
  const expectedById = new Map(
    [manifest.document, ...manifest.sources].map((artifact) => [artifact.id, artifact]),
  );
  const errors: string[] = [];
  const records = new Map<string, ReturnType<typeof ingestTextArtifact>>();

  for (const declaration of declarations) {
    const expected = expectedById.get(declaration.id);
    if (expected === undefined) {
      errors.push(`${declaration.id}: artifact is absent from the manifest`);
      continue;
    }
    const bytes = await readFile(await resolveProjectFile(projectDirectory, declaration.path));
    const record = ingestTextArtifact({
      ...declaration,
      role: declaration.id === project.document.id ? "document" : "source",
      name: basename(declaration.path),
      bytes,
    });
    records.set(declaration.id, record);
    const result = verifyArtifactBytes(expected, bytes);
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
      }
    }
  }

  const manifestRelationById = new Map(
    manifest.evidenceRelations.map((relation) => [relation.id, relation]),
  );
  for (const claimInput of project.claims) {
    for (const input of claimInput.evidence) {
      const relation = manifestRelationById.get(input.id);
      const sourceText = records.get(input.sourceId)?.text;
      const expectedAnchor = sourceText ? locateNormalizedQuote(sourceText, input.quote) : null;
      if (relation === undefined) {
        errors.push(`${input.id}: evidence relation is absent from the manifest`);
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

  return { valid: errors.length === 0, errors };
}
