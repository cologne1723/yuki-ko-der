import { readFile, writeFile } from "node:fs/promises";
const p = "/Users/hyea/yukicoder/problem-translations/ko/problems/21.html";
let s = await readFile(p, "utf8");
for (const [a, z] of [
  [
    "\\(N\\)個の数字が与えられるのでこれらを\\(K(\\geq 3)\\)個のグループに振り分ける。",
    "숫자 \\(N\\)개가 주어지므로 이를 \\(K(\\geq 3)\\)개 그룹으로 나눕니다.",
  ],
  ["なら", "라면"],
  [
    "数字\\((1 \\leq n_i \\leq 1000, 1 \\leq i \\leq N)",
    "숫자 \\((1 \\leq n_i \\leq 1000, 1 \\leq i \\leq N)",
  ],
  ["答えの数値を文字列で출력してください。", "답인 수치를 출력하세요."],
])
  s = s.replaceAll(a, z);
await writeFile(p, s);
