import { sha256 } from "./artifacts.js";
import type { ArtifactRecord } from "./domain.js";
import { locateNormalizedQuote } from "./evidence-review.js";
import type { Claim } from "./manifest.js";

export interface ClaimProposalInput {
  id: string;
  text: string;
  originText: string;
  kind: "stated" | "implicit-premise";
  proposedBy: "human";
  proposalModel: null;
}

export function importClaims(
  document: ArtifactRecord,
  proposals: readonly ClaimProposalInput[],
): Claim[] {
  return proposals.map((proposal) => {
    const match = locateNormalizedQuote(document.text, proposal.originText);
    if (match === null) {
      throw new Error(`Claim ${proposal.id} origin text was not found in the document`);
    }
    return {
      id: proposal.id,
      text: proposal.text,
      origin: {
        artifactId: document.artifact.id,
        start: match.start,
        end: match.end,
        textSha256: sha256(match.text),
        offsetEncoding: "unicode-code-point",
      },
      kind: proposal.kind,
      proposedBy: proposal.proposedBy,
      proposalModel: null,
    };
  });
}
