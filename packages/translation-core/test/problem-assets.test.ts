import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { JSDOM } from "jsdom";
import {
  findLocalProblemImages,
  inlineLocalProblemImages,
  canonicalizeImageDataUris,
} from "../src/problem-assets-node.ts";
import { isLocalProblemImageReference } from "../src/problem-assets.ts";

test("image data URI comparison ignores surrounding whitespace but preserves bytes and MIME", () => {
  const dom = new JSDOM(
    '<img src=" data:image/png;base64,iVBO\nRw==\n"><img src="data:image/gif;base64,iVBORw=="><img src="data:image/png;base64,iVBOSA=="><img src="data:image/png;base64,invalid!">',
  );
  try {
    canonicalizeImageDataUris(dom.window.document);
    assert.deepEqual(
      [...dom.window.document.querySelectorAll("img")].map((image) =>
        image.getAttribute("src"),
      ),
      [
        "data:image/png;base64,iVBORw==",
        "data:image/gif;base64,iVBORw==",
        "data:image/png;base64,iVBOSA==",
        "data:image/png;base64,invalid!",
      ],
    );
  } finally {
    dom.window.close();
  }
});

test("local problem assets reject traversal, missing files, and wrong problem numbers", async () => {
  assert.equal(isLocalProblemImageReference("../images/42/1.png", 42), true);
  assert.equal(
    isLocalProblemImageReference("../images/42/../secret.png"),
    false,
  );
  const root = await mkdtemp(join(tmpdir(), "problem-assets-"));
  try {
    await mkdir(join(root, "problem-translations/ko/images/42"), {
      recursive: true,
    });
    await writeFile(
      join(root, "problem-translations/ko/images/42/1.png"),
      Buffer.from([137, 80, 78, 71]),
    );
    await writeFile(
      join(root, "problem-translations/ko/images/42/2.svg"),
      "<svg/>",
    );
    const dom = new JSDOM('<main><img src="../images/42/1.png"></main>');
    try {
      const assets = await findLocalProblemImages(
        dom.window.document,
        root,
        42,
      );
      assert.equal(assets[0].sha256.length, 64);
      await inlineLocalProblemImages(dom.window.document, root, 42);
      assert.match(
        dom.window.document.querySelector("img")!.src,
        /^data:image\/png;base64,/u,
      );
      const svgDom = new JSDOM('<main><img src="../images/42/2.svg"></main>');
      try {
        await inlineLocalProblemImages(svgDom.window.document, root, 42);
        assert.match(
          svgDom.window.document.querySelector("img")!.src,
          /^data:image\/svg\+xml;base64,/u,
        );
      } finally {
        svgDom.window.close();
      }
    } finally {
      dom.window.close();
    }
    await assert.rejects(
      findLocalProblemImages(
        new JSDOM('<img src="../images/42/missing.png">').window.document,
        root,
        42,
      ),
      /ENOENT/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
