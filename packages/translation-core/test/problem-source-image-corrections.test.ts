import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { JSDOM } from "jsdom";
import { correctSourceImageMime } from "../src/problem-source-corrections-node.ts";

test("3272 MIME typo correction is source-bound and preserves PNG bytes", () => {
  const html = readFileSync("data/problems-source/3272.html", "utf8");
  const dom = new JSDOM(html);
  try {
    const images = [...dom.window.document.querySelectorAll("img")];
    const before = images.map((image) => image.getAttribute("src")!);
    correctSourceImageMime(3273, html, dom.window.document);
    assert.deepEqual(
      images.map((image) => image.getAttribute("src")),
      before,
    );
    correctSourceImageMime(3272, html + "\n", dom.window.document);
    assert.deepEqual(
      images.map((image) => image.getAttribute("src")),
      before,
    );
    correctSourceImageMime(3272, html, dom.window.document);
    assert.equal(images[0].getAttribute("src"), before[0]);
    assert.equal(
      images[1].getAttribute("src"),
      before[1].replace("data:imrage/png;", "data:image/png;"),
    );
    assert.deepEqual(
      Buffer.from(images[1].getAttribute("src")!.split(",")[1], "base64"),
      Buffer.from(before[1].split(",")[1], "base64"),
    );
  } finally {
    dom.window.close();
  }
});

test("3272 MIME correction refuses missing/duplicate candidates and non-PNG data", () => {
  const html = readFileSync("data/problems-source/3272.html", "utf8");
  for (const [markup, message] of [
    ["<img>", /count mismatch/],
    [
      '<img src="data:imrage/png;base64,AA=="><img src="data:imrage/png;base64,AA==">',
      /count mismatch/,
    ],
    ['<img src="data:imrage/png;base64,AA==">', /not PNG/],
  ] as const) {
    const dom = new JSDOM(markup);
    try {
      assert.throws(
        () => correctSourceImageMime(3272, html, dom.window.document),
        message,
      );
    } finally {
      dom.window.close();
    }
  }
});
