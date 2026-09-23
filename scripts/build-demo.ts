import { resolve } from "node:path";

import { buildCertifiedDemo } from "../src/demo.js";

const outputDirectory = resolve(process.argv[2] ?? "review");
const manifest = await buildCertifiedDemo(outputDirectory);

console.log(`Certified synthetic demo written to ${outputDirectory}`);
console.log(
  `${manifest.claims.length} claims, ${manifest.evidenceRelations.length} evidence checks, ${manifest.argumentEdges.length} claim relationship`,
);
