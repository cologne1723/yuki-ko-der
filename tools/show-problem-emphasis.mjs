import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";
import { compileProblemMarkdown } from "translation-core/problem-markdown";
import { statementEmphasis } from "../packages/translation-core/src/problem-emphasis.ts";
const args = process.argv.slice(2).filter((arg) => arg !== "--");
if (args.length !== 1 || !/^\d+$/.test(args[0])) {
  console.error(
    "Usage: node --import tsx tools/show-problem-emphasis.mjs NUMBER",
  );
  process.exit(2);
}
const no = args[0],
  windows = [];
try {
  const source = new JSDOM(
    readFileSync(
      new URL(`../data/problems-source/${no}.html`, import.meta.url),
      "utf8",
    ),
  );
  windows.push(source.window);
  const target = new JSDOM(
    compileProblemMarkdown(
      readFileSync(
        new URL(
          `../problem-translations/ko/problems/${no}.mdx`,
          import.meta.url,
        ),
        "utf8",
      ),
    ),
  );
  windows.push(target.window);
  const before = statementEmphasis(source.window.document),
    after = statementEmphasis(target.window.document);
  console.log(
    JSON.stringify(
      {
        problemNo: Number(no),
        source: before.map((text, i) => ({ occurrence: i + 1, text })),
        translation: after.map((text, i) => ({ occurrence: i + 1, text })),
      },
      null,
      2,
    ),
  );
  console.log(
    "Inventory only: match meanings individually; equal counts do not prove preservation.",
  );
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  for (const window of windows) window.close();
}
