import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { compileProblemMarkdown } from "translation-core/problem-markdown";
import { writeProblemRenderProfile } from "translation-core/problem-render-profile-files";
import { exportOfflinePublicationData } from "../src/export-offline-publication-data.ts";
import { sha256 } from "../src/operations/source-store.ts";

const source =
  '<div class="block"><div class="sample"><h6>入力</h6><pre>1</pre><h6>出力</h6><pre>2</pre></div></div>';
function markdown(no: number, hidden: boolean, input: string) {
  return `---
schemaVersion: 1
locale: ko
problemNo: ${no}
problemId: ${no + 10}
sourceTitle: Original
sourceHtmlSha256: ${sha256(source)}
humanReview: []
machineReview: unreviewed
visibility: ${!hidden}
title: Fixture
---

## Samples

### Sample 1 {file=""}

#### Input

\`\`\`text
${input}
\`\`\`

#### Output

\`\`\`text
2
\`\`\`
`;
}

for (const format of ["mdx", "html"] as const) {
  test(`offline export excludes hidden ${format} drafts but validates them when made public`, async (t) => {
    const repositoryRoot = await mkdtemp(join(tmpdir(), "offline-export-"));
    t.after(() => rm(repositoryRoot, { recursive: true, force: true }));
    const dataRoot = join(repositoryRoot, "data");
    const translations = join(
      repositoryRoot,
      "problem-translations/ko/problems",
    );
    const originals = join(dataRoot, "problems-source");
    await mkdir(translations, { recursive: true });
    await mkdir(originals, { recursive: true });
    await writeFile(join(translations, "1.mdx"), markdown(1, false, "1"));
    const draft = join(translations, `2.${format}`);
    const writeDraft = (hidden: boolean) => {
      const raw = markdown(2, hidden, "wrong");
      return writeFile(
        draft,
        format === "html" ? compileProblemMarkdown(raw) : raw,
      );
    };
    await writeDraft(true);
    await writeFile(join(originals, "1.html"), source);
    await writeFile(join(originals, "2.html"), source);
    const profile = (no: number) =>
      writeProblemRenderProfile(
        dataRoot,
        no,
        `<title>No.${no} Original - yukicoder</title><script src="https://cdn.jsdelivr.net/npm/katex@0.17.0/dist/katex.min.js"></script><div id="content"><div class="block">Statement</div></div>`,
      );
    await profile(1);
    const options = { repositoryRoot, dataRoot };
    const output = join(
      repositoryRoot,
      "problem-translations/publication-data.json",
    );
    // The hidden draft has both invalid IO and no profile. Neither can block.
    assert.equal(await exportOfflinePublicationData(options), 1);
    const published = await readFile(output, "utf8");
    const { entries } = JSON.parse(published);
    assert.deepEqual(
      entries.map((entry: { problemNo: number }) => entry.problemNo),
      [1],
    );
    assert.equal(
      entries[0].translationSamplesSha256,
      sha256(JSON.stringify(["1", "2"])),
    );
    await profile(2);
    assert.equal(await exportOfflinePublicationData(options), 1);
    await writeDraft(false);
    await assert.rejects(
      exportOfflinePublicationData(options),
      /Sample verification failed for problem 2/,
    );
    assert.equal(await readFile(output, "utf8"), published);
    // Repairing the now-public IO makes it eligible without weakening checks.
    const repaired = markdown(2, false, "1");
    await writeFile(
      draft,
      format === "html" ? compileProblemMarkdown(repaired) : repaired,
    );
    assert.equal(await exportOfflinePublicationData(options), 2);
  });
}
