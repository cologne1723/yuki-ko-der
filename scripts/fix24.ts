import { readFile, writeFile } from "node:fs/promises";
const p = "/Users/hyea/yukicoder/problem-translations/ko/problems/24.html";
let s = await readFile(p, "utf8");
s = s.replace(
  "숫자 중 하나를 마음속으로 생각합니다.",
  "숫자 중 \\(1\\)개를 마음속으로 생각합니다.",
);
await writeFile(p, s);
