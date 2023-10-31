import manifest from "../src/manifest.js";
import { readFileSync } from "node:fs";
import path from "node:path";

const pkg = JSON.parse(
  readFileSync(path.join(__dirname, "..", "package.json"), "utf8"),
);
console.log(JSON.stringify(manifest(pkg), null, 2));
