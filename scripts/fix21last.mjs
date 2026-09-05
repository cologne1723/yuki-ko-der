import { readFile, writeFile } from "node:fs/promises";
const p = "/Users/hyea/yukicoder/problem-translations/ko/problems/21.html";
let s = await readFile(p, "utf8");
s = s.replace("最大の平均 - 最小の평균은", "최댓값 평균 - 최솟값 평균은");
await writeFile(p, s);
