import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { htmlLanguage } from "@codemirror/lang-html";
import { compileProblemMarkdown } from "../src/problem-markdown.ts";

const directory = join(process.cwd(), "problem-translations", "ko", "problems");
const available = new Map<number, string>();
for (const file of await readdir(directory)) {
  const match = file.match(/^(\d+)\.(html|mdx)$/u);
  if (!match) continue;
  const problemNo = Number(match[1]);
  if (available.has(problemNo)) {
    throw new Error(`Problem ${problemNo} has both HTML and MDX sources`);
  }
  available.set(problemNo, file);
}
const files = [...available.values()].sort(
  (a, b) => Number.parseInt(a) - Number.parseInt(b),
);
let failures = 0;

for (const file of files) {
  const fileSource = await readFile(join(directory, file), "utf8");
  const source = file.endsWith(".mdx")
    ? compileProblemMarkdown(fileSource)
    : fileSource;
  const tree = htmlLanguage.parser.parse(source);
  const errors: Array<{ from: number; to: number }> = [];
  tree.iterate({
    enter(node) {
      if (node.type.isError || node.name.includes("⚠")) {
        errors.push({ from: node.from, to: node.to });
      }
    },
  });
  if (errors.length > 0) {
    failures += 1;
    console.error(`${file}: ${errors.length} HTML syntax error(s)`);
  } else {
    console.log(`${file}: valid HTML`);
  }
}

if (failures > 0) {
  console.error(`HTML lint failed for ${failures} file(s)`);
  process.exitCode = 1;
}
