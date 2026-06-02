#!/usr/bin/env node

import { readFileSync, writeFileSync } from "node:fs";
import { Resvg } from "@resvg/resvg-js";

const [input, output, widthStr] = process.argv.slice(2);
if (!input || !output) {
  console.error("Usage: convert-svg.ts <input.svg> <output.png> [width]");
  process.exit(1);
}

const svg = readFileSync(input);
const width = widthStr ? parseInt(widthStr, 10) : undefined;
const resvg = new Resvg(
  svg,
  width ? { fitTo: { mode: "width", value: width } } : {},
);
const pngData = resvg.render();
writeFileSync(output, pngData.asPng());
