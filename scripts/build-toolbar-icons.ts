#!/usr/bin/env node

import { Resvg } from "@resvg/resvg-js";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildDirectory } from "translation-core/paths";

const scriptPath = fileURLToPath(import.meta.url);
const repositoryRoot = resolve(dirname(scriptPath), "..");
const sizes = [16, 32, 48, 96, 128, 512];

export async function buildToolbarIcons(
  iconRoot = buildDirectory("extension", "chrome", "icons"),
): Promise<void> {
  const svg = await readFile(join(repositoryRoot, "icons", "toolbar.svg"));
  await mkdir(iconRoot, { recursive: true });

  for (const size of sizes) {
    const renderer = new Resvg(svg, {
      fitTo: { mode: "width", value: size },
      font: { loadSystemFonts: false },
    });
    const rendered = renderer.render();
    if (rendered.width !== size || rendered.height !== size) {
      throw new Error(`Expected a square ${size}px toolbar icon`);
    }
    await writeFile(join(iconRoot, `toolbar-${size}.png`), rendered.asPng());
  }
}

if (process.argv[1] && resolve(process.argv[1]) === scriptPath) {
  for (const browser of ["chrome", "firefox"]) {
    await buildToolbarIcons(buildDirectory("extension", browser, "icons"));
  }
  console.log(`도구 모음 아이콘 ${sizes.length}개 생성 완료`);
}
