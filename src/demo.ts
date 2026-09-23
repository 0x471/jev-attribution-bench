import { join } from "node:path";

import { buildReviewProject } from "./project-builder.js";
import { ReviewLedger } from "./review-ledger.js";
import { exportStaticSite } from "./static-site.js";
import type { ReviewManifest, ReviewSubjectType } from "./manifest.js";

const fixtureDirectory = new URL("../fixtures/synthetic/", import.meta.url).pathname;
const projectPath = join(fixtureDirectory, "project.json");

export async function buildCertifiedDemo(outputDirectory: string): Promise<ReviewManifest> {
  const buildTime = new Date("2026-09-23T09:00:00.000Z");
  let actionNumber = 0;
  let actionSecond = 0;
  const ledger = new ReviewLedger({
    now: () => new Date(buildTime.getTime() + ++actionSecond * 1_000),
    createId: () => `demo-${String(++actionNumber).padStart(3, "0")}`,
  });
  let manifest = await buildReviewProject({
    projectPath,
    checker: {
      type: "fixture",
      assessmentsPath: join(fixtureDirectory, "assessments.json"),
    },
    now: () => new Date(buildTime),
  });

  const reviewer = { displayName: "Sample reviewer", identityAssurance: "self-asserted" as const };
  const subjects: Array<[ReviewSubjectType, string, string]> = [];
  for (const claim of manifest.claims) {
    subjects.push(["claim", claim.id, "Claim wording and draft origin reviewed."]);
  }
  for (const relation of manifest.evidenceRelations) {
    subjects.push([
      "evidence-relation",
      relation.id,
      "Evidence span and automated relation assessment reviewed.",
    ]);
  }
  for (const edge of manifest.argumentEdges) {
    subjects.push(["argument-edge", edge.id, "Claim relationship reviewed."]);
  }

  for (const [subjectType, subjectId, reason] of subjects) {
    manifest = ledger.record(manifest, {
      subjectType,
      subjectId,
      decision: "approve",
      reason,
      reviewer,
    });
  }
  manifest = ledger.certify(manifest, reviewer);
  await exportStaticSite(manifest, outputDirectory, projectPath);
  return manifest;
}
