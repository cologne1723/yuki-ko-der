import assert from "node:assert/strict";
import { readFile, mkdir, mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { JSDOM } from "jsdom";
import {
  remoteProblemImageSnapshots,
  materializeSourceImageSnapshots,
} from "../src/problem-remote-images-node.ts";
import { inlineLocalProblemImages } from "../src/problem-assets-node.ts";
import { preservationErrors } from "../src/problem-preservation.ts";

test("recorded remote images preserve pinned bytes and source order", async () => {
  for (const no of [5021, 8018, 8069, 3096]) {
    const original = await readFile(`data/problems-source/${no}.html`, "utf8");
    const before = new JSDOM(original),
      after = new JSDOM(original);
    try {
      const records = remoteProblemImageSnapshots.filter(
        (r) => r.problemNo === no,
      );
      for (const img of after.window.document.querySelectorAll("img")) {
        const record = records.find(
          (r) => r.sourceUrl === img.getAttribute("src"),
        )!;
        assert.ok(record);
        img.setAttribute("src", record.reference);
      }
      await materializeSourceImageSnapshots(
        before.window.document,
        original,
        process.cwd(),
        no,
      );
      await inlineLocalProblemImages(after.window.document, process.cwd(), no);
      const imageErrors = () =>
        preservationErrors(
          before.window.document,
          after.window.document,
        ).filter((error) => error.includes("img"));
      assert.deepEqual(imageErrors(), []);
      const images = [...after.window.document.querySelectorAll("img")];
      if (images.length > 1) {
        const first = images[0].getAttribute("src")!;
        images[0].setAttribute("src", images[1].getAttribute("src")!);
        images[1].setAttribute("src", first);
        assert.ok(imageErrors().length > 0);
      }
      after.window.document
        .querySelector("img")!
        .setAttribute("src", "data:image/png;base64,AAAA");
      assert.ok(
        preservationErrors(before.window.document, after.window.document).some(
          (e) => e.includes("img"),
        ),
      );
    } finally {
      before.window.close();
      after.window.close();
    }
  }
});

test("changed source and other problems are not waived; URL/count mismatches reject", async () => {
  const no = 5021,
    original = await readFile(`data/problems-source/${no}.html`, "utf8");
  for (const [source, problem] of [
    [original + "\n", no],
    [original, 42],
  ] as const) {
    const dom = new JSDOM(original);
    try {
      const src = dom.window.document.querySelector("img")!.getAttribute("src");
      await materializeSourceImageSnapshots(
        dom.window.document,
        source,
        process.cwd(),
        problem,
      );
      assert.equal(
        dom.window.document.querySelector("img")!.getAttribute("src"),
        src,
      );
    } finally {
      dom.window.close();
    }
  }
  for (const count of [0, 2]) {
    const dom = new JSDOM(original);
    try {
      const img = dom.window.document.querySelector("img")!;
      if (count === 0) img.remove();
      else img.after(img.cloneNode(true));
      await assert.rejects(
        materializeSourceImageSnapshots(
          dom.window.document,
          original,
          process.cwd(),
          no,
        ),
        /URL\/count mismatch/,
      );
    } finally {
      dom.window.close();
    }
  }
});

test("changed or missing image bytes fail closed", async () => {
  const root = await mkdtemp(join(tmpdir(), "remote-image-snapshot-"));
  const no = 5021,
    original = await readFile(`data/problems-source/${no}.html`, "utf8");
  const dom = new JSDOM(original);
  try {
    await mkdir(join(root, "5021"));
    await assert.rejects(
      materializeSourceImageSnapshots(
        dom.window.document,
        original,
        process.cwd(),
        no,
        { imageRoot: root },
      ),
      /ENOENT/,
    );
    await writeFile(join(root, "5021/1.jpg"), "changed");
    await assert.rejects(
      materializeSourceImageSnapshots(
        dom.window.document,
        original,
        process.cwd(),
        no,
        { imageRoot: root },
      ),
      /SHA-256 mismatch/,
    );
  } finally {
    dom.window.close();
    await rm(root, { recursive: true, force: true });
  }
});
