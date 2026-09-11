import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { JSDOM } from "jsdom";
import {
  compileProblemMarkdown,
  parseProblemMarkdown,
} from "translation-core/problem-markdown";
import { checkProblemPreservation } from "translation-core/problem-preservation";
import { readProblemRenderProfile } from "translation-core/problem-render-profile-files";
import { defaultDataDirectory, repositoryRoot } from "translation-core/paths";
import { join } from "node:path";
import { glossaryTranslationErrors } from "translation-core/problem-glossary";
import { formatFenceErrors } from "translation-core/problem-input-format";

const numbers = process.argv
  .slice(2)
  .filter((arg) => arg !== "--")
  .flatMap((arg) => arg.split(","));
if (!numbers.length || numbers.some((no) => !/^\d+$/.test(no))) {
  console.error("Usage: pnpm check:translation -- NUMBER[,NUMBER...]");
  process.exit(1);
}
for (const no of numbers) {
  const doms = [];
  try {
    const original = await readFile(
      join(
        defaultDataDirectory(repositoryRoot),
        "problems-source",
        `${no}.html`,
      ),
      "utf8",
    );
    const mdx = await readFile(
      new URL(`../problem-translations/ko/problems/${no}.mdx`, import.meta.url),
      "utf8",
    );
    const before = new JSDOM(original),
      after = new JSDOM(compileProblemMarkdown(mdx));
    doms.push(before, after);
    const profile = await readProblemRenderProfile(
      defaultDataDirectory(repositoryRoot),
      Number(no),
    );
    if (!profile)
      console.warn(
        `${no}: render profile unavailable; engine syntax validation skipped, formula comparisons limited to common DOM scanning results`,
      );
    const errors = await checkProblemPreservation(
      before.window.document,
      after.window.document,
      profile,
    );
    const { metadata, body } = parseProblemMarkdown(mdx);
    errors.push(...formatFenceErrors(body));
    try {
      const glossary = await readFile(
        new URL("../problem-translations/glossary.yaml", import.meta.url),
        "utf8",
      );
      errors.push(
        ...glossaryTranslationErrors(glossary, original, after.serialize()),
      );
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    if (
      metadata.sourceHtmlSha256 !==
      createHash("sha256").update(original).digest("hex")
    )
      errors.push("원문 SHA-256 불일치");
    if (errors.length)
      throw new Error(
        errors
          .map((error) => error.split("\n")[0].split(" 원문:")[0].slice(0, 350))
          .join("\n") +
          `\n수정 방법: data/problems-source/${no}.html의 해당 항목과 저장본을 대조한 뒤 다시 실행하세요.`,
      );
    console.log(
      `${no}: structure/samples/resources/glossary/hash passed; ${profile ? `${profile.engine} math checks passed` : "engine-specific math syntax NOT checked (profile unavailable)"}; meaning still requires review`,
    );
  } catch (error) {
    console.error(`${no}: ${String(error)}`);
    process.exitCode = 1;
  } finally {
    doms.forEach((dom) => dom.window.close());
  }
}
