import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { JSDOM } from "jsdom";
import {
  canonicalizeImageDataUris,
  inlineLocalProblemImages,
} from "translation-core/problem-assets-node";
import { preservationErrors } from "translation-core/problem-preservation";

const bytes = Buffer.from("source-image");
const dataUri = `data:image/png;base64,${bytes.toString("base64")}`;
const sourceHtml = `<main><img src="${dataUri}"><img src="https://example.test/remote.png"></main>`;

async function errorsFor(root: string, html: string) {
  const source = new JSDOM(sourceHtml);
  const translated = new JSDOM(html);
  try {
    await inlineLocalProblemImages(translated.window.document, root, 42);
    return preservationErrors(
      source.window.document,
      translated.window.document,
    );
  } finally {
    source.window.close();
    translated.window.close();
  }
}

test("local image preservation compares materialized bytes and order with remote/local mixtures", async () => {
  const root = await mkdtemp(join(tmpdir(), "preservation-local-images-"));
  try {
    await mkdir(join(root, "problem-translations/ko/images/42"), {
      recursive: true,
    });
    await writeFile(
      join(root, "problem-translations/ko/images/42/1.png"),
      bytes,
    );
    const valid = await errorsFor(
      root,
      '<main><img src="../images/42/1.png"><img src="https://example.test/remote.png"></main>',
    );
    assert.equal(
      valid.some((error) => error.includes("img의 src")),
      false,
    );

    await writeFile(
      join(root, "problem-translations/ko/images/42/1.png"),
      "mutated",
    );
    const mutated = await errorsFor(
      root,
      '<main><img src="../images/42/1.png"><img src="https://example.test/remote.png"></main>',
    );
    assert.ok(mutated.some((error) => error.includes("img의 src")));

    await writeFile(
      join(root, "problem-translations/ko/images/42/1.png"),
      bytes,
    );
    const swapped = await errorsFor(
      root,
      '<main><img src="https://example.test/remote.png"><img src="../images/42/1.png"></main>',
    );
    assert.ok(swapped.some((error) => error.includes("img의 src")));

    await assert.rejects(
      errorsFor(
        root,
        '<main><img src="../images/41/1.png"><img src="https://example.test/remote.png"></main>',
      ),
      /Invalid local problem image reference/,
    );
    await assert.rejects(
      errorsFor(
        root,
        '<main><img src="../images/42/missing.png"><img src="https://example.test/remote.png"></main>',
      ),
      /ENOENT/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("CLI image normalization compares decoded bytes, not non-canonical padding bits", () => {
  const canonical = Buffer.from([0xff]).toString("base64");
  const nonCanonical = canonical.replace("/w==", "/x==");
  const dom = new JSDOM(`<img src="data:image/png;base64,${nonCanonical}">`);
  try {
    canonicalizeImageDataUris(dom.window.document);
    assert.equal(
      dom.window.document.querySelector("img")?.getAttribute("src"),
      `data:image/png;base64,${canonical}`,
    );
  } finally {
    dom.window.close();
  }
});
