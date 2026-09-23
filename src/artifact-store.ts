import { readFile, realpath } from "node:fs/promises";
import { basename, isAbsolute, relative, resolve } from "node:path";

import { ingestTextArtifact } from "./artifacts.js";
import type { ArtifactRecord, ArtifactRole } from "./domain.js";

export interface TextArtifactDeclaration {
  id: string;
  path: string;
  mediaType: "text/plain" | "text/markdown";
}

export class ProjectArtifactStore {
  readonly #root: string;

  private constructor(root: string) {
    this.#root = root;
  }

  static async open(projectDirectory: string): Promise<ProjectArtifactStore> {
    return new ProjectArtifactStore(await realpath(projectDirectory));
  }

  async ingest(declaration: TextArtifactDeclaration, role: ArtifactRole): Promise<ArtifactRecord> {
    if (isAbsolute(declaration.path)) {
      throw new Error(`Project artifact paths must be relative: ${declaration.path}`);
    }
    const candidate = await realpath(resolve(this.#root, declaration.path));
    const fromRoot = relative(this.#root, candidate);
    if (fromRoot.startsWith("..") || isAbsolute(fromRoot)) {
      throw new Error(`Project artifact path escapes the project directory: ${declaration.path}`);
    }
    return ingestTextArtifact({
      ...declaration,
      role,
      name: basename(declaration.path),
      bytes: await readFile(candidate),
    });
  }
}
