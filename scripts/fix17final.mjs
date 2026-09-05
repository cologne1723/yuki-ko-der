import { readFile, writeFile } from "node:fs/promises";
const p = "/Users/hyea/yukicoder/problem-translations/ko/problems/17.html";
let s = await readFile(p, "utf8");
s = s.replace(
  "다른\\(2\\)개의지점に체류할 수 있다고 보장됩니다。",
  "서로 다른 \\(2\\)개의 지점에 체류할 수 있다고 보장됩니다.",
);
await writeFile(p, s);
