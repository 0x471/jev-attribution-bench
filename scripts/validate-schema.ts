import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import process from "node:process";

import { Ajv2020 } from "ajv/dist/2020.js";

const require = createRequire(import.meta.url);
const addFormats = require("ajv-formats") as typeof import("ajv-formats").default;

const schemaUrl = new URL("../schemas/review-manifest.schema.json", import.meta.url);
const schema = JSON.parse(await readFile(schemaUrl, "utf8")) as object;
const targets = process.argv.slice(2);

if (targets.length === 0) {
  throw new Error("usage: validate-schema <manifest.json> [...]");
}

const ajv = new Ajv2020({ allErrors: true, strict: true });
addFormats(ajv);
const validate = ajv.compile(schema);
let failed = false;

for (const target of targets) {
  const value: unknown = JSON.parse(await readFile(target, "utf8"));
  if (validate(value)) {
    console.log(`valid: ${target}`);
    continue;
  }

  failed = true;
  console.error(`invalid: ${target}`);
  console.error(ajv.errorsText(validate.errors, { separator: "\n" }));
}

if (failed) process.exitCode = 1;
