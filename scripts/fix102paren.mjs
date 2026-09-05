import { readFile, writeFile } from "node:fs/promises";
const p = "/Users/hyea/yukicoder/problem-translations/ko/problems/102.html";
let s = await readFile(p, "utf8");
s = s.replaceAll("（", "(").replaceAll("）", ")");
await writeFile(p, s);
