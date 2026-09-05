import { readFile, writeFile } from "node:fs/promises";
const p = "/Users/hyea/yukicoder/problem-translations/ko/problems/13.html";
let s = await readFile(p, "utf8");
s = s
  .replaceAll("には 横を表す", "에는 가로를 나타내는")
  .replaceAll("と縦を表す", "과 세로를 나타내는")
  .replaceAll("줄에는", "줄에는");
await writeFile(p, s);
