#!/usr/bin/env node

import { access, mkdir, writeFile, rename } from "node:fs/promises";
import { join, resolve } from "node:path";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUTPUT = join(ROOT, "tmp", "problems-source");
const INDEX_PATH = join(OUTPUT, "index.json");
const CONCURRENCY = Number(process.env.YUKI_DOWNLOAD_CONCURRENCY ?? 6);
const DELAY_MS = Number(process.env.YUKI_DOWNLOAD_DELAY_MS ?? 200);
const RETRIES = 3;

function sleep(ms) {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

async function fetchWithRetry(problem) {
  const url = `https://yukicoder.me/api/v1/problems/${problem.ProblemId}/html`;
  let lastError;
  for (let attempt = 0; attempt < RETRIES; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { "User-Agent": "yukicoder-ko-corpus-downloader" },
        cache: "no-store",
      });
      if (response.ok) {
        return { status: response.status, html: await response.text() };
      }
      if (response.status === 404) {
        return { status: response.status, html: "" };
      }
      throw new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
      await sleep(500 * (attempt + 1));
    }
  }
  throw lastError;
}

await mkdir(OUTPUT, { recursive: true });
const indexResponse = await fetch("https://yukicoder.me/api/v1/problems", {
  headers: { "User-Agent": "yukicoder-ko-corpus-downloader" },
  cache: "no-store",
});
if (!indexResponse.ok) {
  throw new Error(`Problem index returned ${indexResponse.status}`);
}
const problems = await indexResponse.json();
await writeFile(
  INDEX_PATH,
  `${JSON.stringify({ fetchedAt: new Date().toISOString(), problems }, null, 2)}\n`,
);

let cursor = 0;
let completed = 0;
let failures = [];
async function worker(workerNumber) {
  while (true) {
    const problem = problems[cursor++];
    if (!problem) return;
    const outputPath = join(OUTPUT, `${problem.No}.html`);
    try {
      await access(outputPath);
      completed += 1;
      if (completed % 100 === 0 || completed === problems.length) {
        console.log(
          `${completed}/${problems.length} complete; ${failures.length} failures`,
        );
      }
      continue;
    } catch {
      // Missing files are fetched below; existing complete files are resumable.
    }
    try {
      const result = await fetchWithRetry(problem);
      if (result.status === 404) {
        failures.push({
          ...problem,
          reason: "404",
          url: `https://yukicoder.me/api/v1/problems/${problem.ProblemId}/html`,
        });
      } else {
        const temporaryPath = `${outputPath}.part`;
        await writeFile(temporaryPath, result.html);
        await rename(temporaryPath, outputPath);
      }
    } catch (error) {
      failures.push({ ...problem, reason: String(error) });
    }
    completed += 1;
    if (completed % 100 === 0 || completed === problems.length) {
      console.log(
        `${completed}/${problems.length} complete; ${failures.length} failures`,
      );
    }
    await sleep(DELAY_MS);
  }
}

await Promise.all(
  Array.from({ length: CONCURRENCY }, (_, index) => worker(index)),
);
await writeFile(
  join(OUTPUT, "failures.json"),
  `${JSON.stringify(failures, null, 2)}\n`,
);
console.log(
  `Downloaded ${problems.length - failures.length}/${problems.length}; failures written to ${join(OUTPUT, "failures.json")}`,
);
