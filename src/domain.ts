export type ArtifactRole = "document" | "source";

export interface Artifact {
  id: string;
  role: ArtifactRole;
  name: string;
  mediaType: "text/plain" | "text/markdown";
  byteLength: number;
  sha256: string;
}

export interface ArtifactRecord {
  artifact: Artifact;
  bytes: Uint8Array;
  text: string;
}

