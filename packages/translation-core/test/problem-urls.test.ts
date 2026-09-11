import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import { resolveProblemUrls } from "../src/problem-urls.ts";
import { sanitizeTranslatedBlocks } from "../src/problem-rendering.ts";

test("SVG data images survive raw and sanitized paths without permitting data navigation or executable attributes", () => {
  const sources = [
    "data:image/svg+xml;base64," +
      Buffer.from(
        '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="10"/>',
      ).toString("base64"),
    "data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%2F%3E",
  ];
  const dom = new JSDOM(
    `<div class="block">${sources.map((src) => `<img src="${src}" onerror="alert(1)">`).join("")}<a href="${sources[0]}">data navigation</a><img id="bad" src="data:text/html,unsafe"><a id="js" href="javascript:alert(1)">script</a><a id="local" href="#target">local</a><img id="relative" src="/images/diagram.png"></div>`,
    { url: "https://yukicoder.me/problems/no/1" },
  );
  try {
    const original = dom.window.document.querySelector(".block")!;
    const sanitized = sanitizeTranslatedBlocks([original], {
      document: dom.window.document,
    })[0];
    resolveProblemUrls(original, dom.window.document.URL);
    for (const block of [original, sanitized]) {
      assert.deepEqual(
        [...block.querySelectorAll("img")]
          .slice(0, 2)
          .map((img) => img.getAttribute("src")),
        sources,
      );
      assert.equal(block.querySelector("a")!.getAttribute("href"), null);
      assert.equal(block.querySelector("#bad")!.getAttribute("src"), null);
      assert.equal(block.querySelector("#js")!.getAttribute("href"), null);
      assert.equal(
        block.querySelector("#local")!.getAttribute("href"),
        "#target",
      );
      assert.equal(
        block.querySelector("#relative")!.getAttribute("src"),
        "https://yukicoder.me/images/diagram.png",
      );
    }
    assert.equal(sanitized.querySelector("[onerror]"), null);
  } finally {
    dom.window.close();
  }
});
