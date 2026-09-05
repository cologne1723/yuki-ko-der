import { readFile, writeFile } from "node:fs/promises";
const p = "/Users/hyea/yukicoder/problem-translations/ko/problems/232.html";
let s = await readFile(p, "utf8");
s = s
  .replace("\\$1\\$번째", "${DOLLAR}1${DOLLAR}번째")
  .replace("첫째 줄에", "${DOLLAR}1${DOLLAR}번째 줄에")
  .replace("$0<br />\n            \\leq B", "$0 \\leq B")
  .replaceAll("${DOLLAR}", "$");
await writeFile(p, s);
