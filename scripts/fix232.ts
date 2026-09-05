import { readFile, writeFile } from "node:fs/promises";
const p = "/Users/hyea/yukicoder/problem-translations/ko/problems/232.html";
let s = await readFile(p, "utf8");
s = s
  .replace(
    "각 줄에는 1문자 또는 2문자 문자열",
    "각 줄에는 $1$문자 또는 $2$문자 문자열",
  )
  .replace("$\\verb|NO|$와 한 줄만", " $\\verb|NO|$와 $1$줄만");
await writeFile(p, s);
