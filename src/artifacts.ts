import { createHash } from "node:crypto";

import type { Artifact, ArtifactRecord, ArtifactRole } from "./domain.js";

const SUPPORTED_MEDIA_TYPES = new Set(["text/plain", "text/markdown"] as const);

export interface IngestTextArtifactInput {
  id: string;
  role: ArtifactRole;
  name: string;
  mediaType: string;
  bytes: Uint8Array;
}

export type ArtifactVerification =
  | { valid: true }
  | { valid: false; expectedSha256: string; actualSha256: string };

export function sha256(bytes: Uint8Array | string): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export function ingestTextArtifact(input: IngestTextArtifactInput): ArtifactRecord {
  if (!SUPPORTED_MEDIA_TYPES.has(input.mediaType as "text/plain" | "text/markdown")) {
    throw new Error(
      `Unsupported media type ${JSON.stringify(input.mediaType)}; v0 accepts text/plain and text/markdown only`,
    );
  }

  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(input.bytes);
  } catch (error) {
    throw new Error(`${input.name} is not valid UTF-8 text`, { cause: error });
  }

  const bytes = input.bytes.slice();
  const artifact: Artifact = {
    id: input.id,
    role: input.role,
    name: input.name,
    mediaType: input.mediaType as Artifact["mediaType"],
    byteLength: bytes.byteLength,
    sha256: sha256(bytes),
  };

  return { artifact, bytes, text };
}

export function verifyArtifactBytes(
  artifact: Artifact,
  bytes: Uint8Array,
): ArtifactVerification {
  const actualSha256 = sha256(bytes);
  return actualSha256 === artifact.sha256
    ? { valid: true }
    : { valid: false, expectedSha256: artifact.sha256, actualSha256 };
}
