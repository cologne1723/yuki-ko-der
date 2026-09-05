import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
const R = "/Users/hyea/yukicoder",
  p = `${R}/tmp/problems-source/432.html`;
const src = await readFile(p, "utf8");
let b = src;
for (const [a, z] of [
  ["問題文", "문제 설명"],
  ["入力", "입력"],
  ["出力", "출력"],
  ["サンプル", "예제"],
  [
    "みなさん，数字を使った占いというものをご存知でしょうか?",
    "여러분, 숫자를 사용한 점이라는 것을 알고 계신가요?",
  ],
  ["数字列", "숫자열"],
  ["に対して以下の操作を行います．", "에 대해 다음 조작을 수행합니다."],
  ["の長さを", "의 길이를"],
  ["ならば終了する．", "이면 종료합니다."],
  ["隣り合った2つの数字", "서로 이웃한 두 숫자"],
  ["の和を", "의 합을"],
  [
    "の場合は10の位と1の位を足して置き換える．",
    "인 경우 10의 자리와 1의 자리를 더해 바꿉니다.",
  ],
  ["として置き換える．", "로 바꿉니다."],
  ["の操作に戻る．", "의 조작으로 돌아갑니다."],
  [
    "この操作で得られた1つの数字により運勢が分かるというものです．",
    "이 조작으로 얻은 하나의 숫자로 운세를 알 수 있습니다.",
  ],
  ["例えば，", "예를 들어,"],
  [
    "の場合について操作を行うと数字列Sは以下のように変化します．",
    "에 대해 조작을 수행하면 숫자열 S는 다음과 같이 변합니다.",
  ],
  ["この場合，最終的に得られる数字は", "이 경우 최종적으로 얻는 숫자는"],
  ["となります．", "입니다."],
  [
    "この占いを行うと考えましたが，手計算するのは無理だとすぐに分かりました．",
    "이 점을 해 보려고 했지만 손으로 계산하는 것은 무리라는 것을 곧 알았습니다.",
  ],
  [
    "そこで，数字列$S$が与えられるので占いの結果を求めてください．",
    "그러므로 숫자열 $S$가 주어질 때 점의 결과를 구하세요.",
  ],
  [
    "行目にテストケースの数Tが与えられる．",
    "첫째 줄에 테스트 케이스 수 T가 주어집니다.",
  ],
  [
    "各テストケースは1行からなり，数字列",
    "각 테스트 케이스는 한 줄로 주어지며, 숫자열",
  ],
  ["が与えられる．", "가 주어집니다."],
  ["ここで，", "여기서,"],
  ["は数字列", "는 숫자열"],
  ["の長さを表します．", "의 길이를 나타냅니다."],
  ["入力は次の制約を満たします．", "입력은 다음 제약을 만족합니다."],
  ["各テストケースごとに，数字列", "각 테스트 케이스마다 숫자열"],
  ["の占い結果を1行で出力してください．", "의 점 결과를 한 줄로 출력하세요."],
  ["問題文に書かれている例と同じです．", "문제 설명에 적힌 예와 같습니다."],
  [
    "長さ1の数字列には何も処理する必要はありません．",
    "길이가 1인 숫자열에는 아무 조작도 할 필요가 없습니다.",
  ],
  [
    "九九表の9の段の10の位と1の位の和は必ず9なんですよ．",
    "구구단 9단의 10의 자리와 1의 자리의 합은 항상 9입니다.",
  ],
])
  b = b.split(a).join(z);
const h = createHash("sha256").update(src).digest("hex");
const out = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>[기계 번역] No.432 점 (Easy)</title><style>body { font-family: sans-serif; line-height: 1.6; margin: 2rem auto; max-width: 960px; padding: 0 1rem; } pre { background: #f5f5f5; overflow: auto; padding: 1rem; } .block { margin: 2rem 0; }</style></head><body><main data-yukicoder-ko-problem data-schema-version="1" data-locale="ko" data-problem-no="432" data-problem-id="1104" data-source-title="占い(Easy)" data-review-status="unreviewed" data-source-html-sha256="${h}"><h3>[기계 번역] No.432 점 (Easy)</h3><div class="problem-statement">${b}</div></main></body></html>`;
await writeFile(`${R}/problem-translations/ko/problems/432.html`, out);
