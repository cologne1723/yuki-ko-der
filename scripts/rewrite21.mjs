import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
const R = "/Users/hyea/yukicoder",
  p = `${R}/tmp/problems-source/21.html`;
const src = await readFile(p, "utf8");
let b = src;
const m = [
  ["問題文", "문제 설명"],
  ["入力", "입력"],
  ["出力", "출력"],
  ["サンプル", "예제"],
  [
    "$N$個の数字が与えられるのでこれらを$K(\\geq 3)$個のグループに振り分ける。",
    "숫자 $N$개가 주어지므로 이를 $K(\\geq 3)$개 그룹으로 나눕니다.",
  ],
  [
    "ただし各グループには最低一つ数字が含まれているとする。",
    "단, 각 그룹에는 최소 하나의 숫자가 포함되어야 합니다.",
  ],
  ["ex) 例えば 与えれる数字が", "예) 예를 들어 주어지는 숫자가"],
  ["のような振り分けかたはただしく", "와 같은 분할은 올바르고"],
  ["のような振り分けかたは認められません", "와 같은 분할은 허용되지 않습니다"],
  [
    "グループごとに平均を計算し, それらをもとに 最大の平均 - 最小の平均 を計算し、",
    "그룹마다 평균을 계산하고, 이를 바탕으로 최댓값 평균 - 최솟값 평균을 계산하여,",
  ],
  [
    "最後に小数点以下を切り上げその値を「平均の差」と呼ぶ。",
    "마지막으로 소수점 이하를 올림한 값을 「평균의 차이」라고 부릅니다.",
  ],
  [
    "平均の差を最も大きくするようなグループ分けをしたとき、平均の差はいくつになるか答えよ。",
    "평균의 차이가 최대가 되도록 그룹을 나눌 때, 평균의 차이가 얼마인지 답하세요.",
  ],
  ["行目には", "번째 줄에는"],
  ["が与えられる。", "가 주어집니다."],
  ["行目～", "번째 줄부터"],
  ["には数字", "에는 숫자"],
  ["答えの数値を文字列で出力してください。", "답인 수치를 출력하세요."],
  ["最後に改行してください。", "마지막에 줄바꿈을 출력하세요."],
  ["例えば", "예를 들어"],
  ["のようにグループ分けすると", "와 같이 그룹을 나누면"],
  ["平均は", "평균은"],
  ["なので", "이므로"],
  ["最大の平均 - 最小の平均は", "최댓값 평균 - 최솟값 평균은"],
  ["最後に小数点以下を切り上げて", "마지막으로 소수점 이하를 올림하면"],
];
for (const [a, z] of m) b = b.split(a).join(z);
const h = createHash("sha256").update(src).digest("hex");
const out = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>[기계 번역] No.21 평균의 차이</title></head><body><main data-yukicoder-ko-problem data-schema-version="1" data-locale="ko" data-problem-no="21" data-problem-id="67" data-source-title="平均の差" data-review-status="unreviewed" data-source-html-sha256="${h}"><h3>[기계 번역] No.21 평균의 차이</h3><div class="problem-statement">${b}</div></main></body></html>`;
await writeFile(`${R}/problem-translations/ko/problems/21.html`, out);
