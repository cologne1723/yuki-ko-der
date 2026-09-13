import assert from "node:assert/strict";
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { extractProblemImages } from "../src/extract-problem-images.ts";

test("extract-problem-images decodes line-wrapped base64 without changing image bytes", async () => {
  const root = await mkdtemp(join(tmpdir(), "extract-problem-images-wrap-"));
  try {
    await mkdir(join(root, "data/problems-source"), { recursive: true });
    await mkdir(join(root, "problem-translations/ko/problems"), {
      recursive: true,
    });
    const data = "data:image/png;base64,iVBO\nRw==";
    await writeFile(
      join(root, "data/problems-source/42.html"),
      `<img src="${data}">`,
    );
    await writeFile(
      join(root, "problem-translations/ko/problems/42.mdx"),
      `![x](${data})`,
    );
    await extractProblemImages(root, 42);
    assert.deepEqual(
      await readFile(join(root, "problem-translations/ko/images/42/1.png")),
      Buffer.from([137, 80, 78, 71]),
    );
    assert.equal(
      await readFile(
        join(root, "problem-translations/ko/problems/42.mdx"),
        "utf8",
      ),
      "![x](../images/42/1.png)",
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("extract-problem-images writes numbered assets and only replaces MDX references", async () => {
  const root = await mkdtemp(join(tmpdir(), "extract-problem-images-"));
  try {
    await mkdir(join(root, "data/problems-source"), { recursive: true });
    await mkdir(join(root, "problem-translations/ko/problems"), {
      recursive: true,
    });
    const data = `data:image/png;base64,${Buffer.from("png").toString("base64")}`;
    await writeFile(
      join(root, "data/problems-source/42.html"),
      `<img src="${data}">`,
    );
    await writeFile(
      join(root, "problem-translations/ko/problems/42.mdx"),
      `![x](${data})\nplain ${data}\n`,
    );
    assert.deepEqual(await extractProblemImages(root, 42), {
      problemNo: 42,
      images: 1,
      changed: true,
    });
    assert.equal(
      await readFile(
        join(root, "problem-translations/ko/problems/42.mdx"),
        "utf8",
      ),
      "![x](../images/42/1.png)\nplain ../images/42/1.png\n",
    );
    assert.deepEqual(
      await readFile(join(root, "problem-translations/ko/images/42/1.png")),
      Buffer.from("png"),
    );
    await assert.rejects(
      extractProblemImages(root, 42),
      /overwrite existing image/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("extract-problem-images stops when source base64 is not represented in MDX", async () => {
  const root = await mkdtemp(join(tmpdir(), "extract-problem-images-"));
  try {
    await mkdir(join(root, "data/problems-source"), { recursive: true });
    await mkdir(join(root, "problem-translations/ko/problems"), {
      recursive: true,
    });
    const data = `data:image/gif;base64,${Buffer.from("gif").toString("base64")}`;
    await writeFile(
      join(root, "data/problems-source/43.html"),
      `<img src="${data}">`,
    );
    await writeFile(
      join(root, "problem-translations/ko/problems/43.mdx"),
      "no image\n",
    );
    await assert.rejects(extractProblemImages(root, 43), /absent from the MDX/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("extract-problem-images supports SVG and deduplicates repeated source data URLs", async () => {
  const root = await mkdtemp(join(tmpdir(), "extract-problem-images-"));
  try {
    await mkdir(join(root, "data/problems-source"), { recursive: true });
    await mkdir(join(root, "problem-translations/ko/problems"), {
      recursive: true,
    });
    const data = `data:image/svg+xml;base64,${Buffer.from("<svg/>").toString("base64")}`;
    await writeFile(
      join(root, "data/problems-source/44.html"),
      `<img src="${data}"><img src="${data}">`,
    );
    await writeFile(
      join(root, "problem-translations/ko/problems/44.mdx"),
      `${data}\n${data}\n`,
    );
    assert.deepEqual(await extractProblemImages(root, 44), {
      problemNo: 44,
      images: 1,
      changed: true,
    });
    assert.equal(
      (
        await readFile(
          join(root, "problem-translations/ko/problems/44.mdx"),
          "utf8",
        )
      ).match(/\.svg/g)?.length,
      2,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("extract-problem-images rejects unsupported inline image MIME and symlinked output", async () => {
  const root = await mkdtemp(join(tmpdir(), "extract-problem-images-"));
  try {
    await mkdir(join(root, "data/problems-source"), { recursive: true });
    await mkdir(join(root, "problem-translations/ko/problems"), {
      recursive: true,
    });
    const avif = `data:image/avif;base64,${Buffer.from("avif").toString("base64")}`;
    await writeFile(
      join(root, "data/problems-source/45.html"),
      `<img src="${avif}">`,
    );
    await writeFile(
      join(root, "problem-translations/ko/problems/45.mdx"),
      avif,
    );
    await assert.rejects(
      extractProblemImages(root, 45),
      /Unsupported or malformed inline image MIME/,
    );

    const outside = await mkdtemp(
      join(tmpdir(), "extract-problem-images-outside-"),
    );
    await mkdir(join(root, "problem-translations/ko"), { recursive: true });
    await symlink(outside, join(root, "problem-translations/ko/images"));
    const png = `data:image/png;base64,${Buffer.from("png").toString("base64")}`;
    await writeFile(
      join(root, "data/problems-source/46.html"),
      `<img src="${png}">`,
    );
    await writeFile(join(root, "problem-translations/ko/problems/46.mdx"), png);
    await assert.rejects(extractProblemImages(root, 46), /symlink/);
    await rm(outside, { recursive: true, force: true });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
