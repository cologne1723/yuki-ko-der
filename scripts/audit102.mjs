import { readFile, writeFile } from "node:fs/promises";
const p = "/Users/hyea/yukicoder/problem-translations/ko/problems/102.html";
let s = await readFile(p, "utf8");
for (const [a, z] of [
  ["무늬（♤♡♢♧）별로", "무늬(♤♡♢♧)별로"],
  [
    "1〜3장뿐입니다（여러 더미에서 한꺼번에 가져갈 수 없습니다）",
    "1~3장뿐입니다(여러 더미에서 한꺼번에 가져갈 수 없습니다)",
  ],
  ["절반（홀수 장이면 올림）", "절반(홀수 장이면 올림)"],
  ["마지막 카드를 가져간 경우", "마지막 카드를 가져간 경우"],
  [
    '승리하는 플레이어 이름（"Taro" 또는 "Jiro"）, 무승부인 경우 "Draw"를 출력하세요.（따옴표는 필요 없습니다。）',
    '승리하는 플레이어 이름("Taro" 또는 "Jiro"), 무승부인 경우 "Draw"를 출력하세요.(따옴표는 필요 없습니다.)',
  ],
  ["선공（타로）", "선공(타로)"],
  ["후공（지로）", "후공(지로)"],
  ["않습니다）", "않습니다)"],
  ["니다（", "니다("],
  ["장）", "장)"],
  ["승리합니다。", "승리합니다."],
])
  s = s.replaceAll(a, z);
await writeFile(p, s);
