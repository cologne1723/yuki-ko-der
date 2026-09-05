import { readFile, writeFile } from "node:fs/promises";
const p = "/Users/hyea/yukicoder/problem-translations/ko/problems/352.html";
let s = await readFile(p, "utf8");
s = s.replace(
  'data-problem-id="750"',
  'data-problem-id="750" data-review-status="unreviewed"',
);
await writeFile(p, s);
