#!/usr/bin/env node

import { build as esbuild } from "esbuild";
import {
  copyFileSync,
  mkdirSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { convertSvg } from "./convert-svg";
import { jsonizeManifest } from "./jsonize-manifest";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const SRC = path.join(ROOT, "src");
const BUILD = path.join(ROOT, "build");

const JS_ENTRIES = ["background", "content-root", "content-all", "options"];
const ICON_WIDTHS = [16, 48, 128];

export interface BuildOptions {
  // Enables esbuild minification. esbuild also auto-defines
  // process.env.NODE_ENV to "production" when minification is enabled.
  readonly minify?: boolean;
}

export async function build({
  minify = false,
}: BuildOptions = {}): Promise<void> {
  // Recreate the build directory from scratch (no incremental builds).
  rmSync(BUILD, { recursive: true, force: true });
  mkdirSync(BUILD, { recursive: true });

  // manifest.json
  writeFileSync(path.join(BUILD, "manifest.json"), jsonizeManifest());

  // Copy static assets (*.html, *.css).
  for (const file of readdirSync(SRC)) {
    if (file.endsWith(".html") || file.endsWith(".css")) {
      copyFileSync(path.join(SRC, file), path.join(BUILD, file));
    }
  }

  // Generate icons from icon.svg.
  for (const w of ICON_WIDTHS) {
    convertSvg(path.join(SRC, "icon.svg"), path.join(BUILD, `icon${w}.png`), w);
  }

  // Generate other PNGs from the remaining SVGs (width 40).
  for (const file of readdirSync(SRC)) {
    if (file.endsWith(".svg") && file !== "icon.svg") {
      const name = path.basename(file, ".svg");
      convertSvg(path.join(SRC, file), path.join(BUILD, `${name}.png`), 40);
    }
  }

  // Bundle JS entries with esbuild.
  await esbuild({
    entryPoints: JS_ENTRIES.map((e) => path.join(SRC, e)),
    outdir: BUILD,
    bundle: true,
    sourcemap: true,
    minify,
    target: "chrome100",
    tsconfig: path.join(SRC, "tsconfig.esbuild.json"),
    pure: [
      "console.debug",
      "console.log",
      "console.info",
      "console.time",
      "console.timeEnd",
    ],
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await build({ minify: process.env.NODE_ENV === "production" });
}
