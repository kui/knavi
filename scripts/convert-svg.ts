#!/usr/bin/env node

import { readFileSync, writeFileSync } from "node:fs";
import { Resvg } from "@resvg/resvg-js";

export function convertSvg(
  input: string,
  output: string,
  width?: number,
): void {
  const svg = readFileSync(input);
  const resvg = new Resvg(
    svg,
    width ? { fitTo: { mode: "width", value: width } } : {},
  );
  const pngData = resvg.render();
  writeFileSync(output, pngData.asPng());
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [input, output, widthStr] = process.argv.slice(2);
  if (!input || !output) {
    console.error("Usage: convert-svg.ts <input.svg> <output.png> [width]");
    process.exit(1);
  }
  convertSvg(input, output, widthStr ? parseInt(widthStr, 10) : undefined);
}
