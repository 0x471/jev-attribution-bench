import { describe, expect, it } from "vitest";

import { ingestTextArtifact, verifyArtifactBytes } from "../src/artifacts.js";

describe("ArtifactStore seam", () => {
  it("preserves bytes and gives a text artifact a stable SHA-256 identity", () => {
    const bytes = new TextEncoder().encode("hello");
    const record = ingestTextArtifact({
      id: "draft-v1",
      role: "document",
      name: "draft.md",
      mediaType: "text/markdown",
      bytes,
    });

    expect(record.artifact.sha256).toBe(
      "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824",
    );
    expect(record.artifact.byteLength).toBe(5);
    expect(record.text).toBe("hello");
    expect(record.bytes).toEqual(bytes);
    expect(verifyArtifactBytes(record.artifact, bytes)).toEqual({ valid: true });
  });

  it("rejects unsupported and invalid text input instead of silently extracting it", () => {
    const binary = new Uint8Array([0xff, 0xfe, 0xfd]);

    expect(() =>
      ingestTextArtifact({
        id: "source-pdf",
        role: "source",
        name: "source.pdf",
        mediaType: "application/pdf",
        bytes: binary,
      }),
    ).toThrow(/unsupported media type/i);

    expect(() =>
      ingestTextArtifact({
        id: "source-bad-text",
        role: "source",
        name: "source.txt",
        mediaType: "text/plain",
        bytes: binary,
      }),
    ).toThrow(/valid UTF-8/i);
  });
});
