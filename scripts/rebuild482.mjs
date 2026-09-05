import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
const R = "/Users/hyea/yukicoder",
  p = `${R}/tmp/problems-source/482.html`;
const src = await readFile(p, "utf8");
let b = src;
for (const [a, z] of [
  ["問題文", "문제 설명"],
  ["入力", "입력"],
  ["出力", "출력"],
  ["サンプル", "예제"],
  ["人がいて", "명이 있고"],
  ["それぞれ", "각각"],
  ["までの番号が振られています", "까지 번호가 붙어 있습니다"],
  ["最初", "처음"],
  ["人", "사람"],
  ["自分の魂", "자신의 영혼"],
  ["宿っていました", "깃들어 있었습니다"],
  ["任意の異なる", "서로 다른 임의의"],
  ["を選んで", "를 선택해"],
  ["魂を入れ替える操作ができます", "영혼을 바꾸는 조작을 할 수 있습니다"],
  ["何度かこの操作を行いました", "이 조작을 여러 번 했습니다"],
  ["現在", "현재"],
  ["ここで", "여기서"],
  ["あと", "더"],
  ["回行ったら", "회 수행하면"],
  ["気づきました", "깨달았습니다"],
  ["すべての人について", "모든 사람에 대해"],
  ["最初の状態に戻したいです", "처음 상태로 되돌리고 싶습니다"],
  ["ちょうど", "정확히"],
  ["使い切りたいです", "모두 사용하고 싶습니다"],
  ["判定してください", "판정하세요"],
  ["注意してください", "주의하세요"],
  ["が与えられます", "가 주어집니다"],
  ["現在の魂の状態が与えられます", "현재 영혼의 상태가 주어집니다"],
  ["意味します", "의미합니다"],
  ["保証されます", "보장됩니다"],
  [
    "収まらないことがあるので注意してください",
    "들어가지 않을 수 있으므로 주의하세요",
  ],
  ["できるとき", "할 수 있을 때"],
  ["できないとき", "할 수 없을 때"],
  ["出力してください", "출력하세요"],
  ["最後に改行してください", "마지막에 줄바꿈을 출력하세요"],
  ["行目", "번째 줄"],
  ["ちょうど $1$ 回の操作を行います", "정확히 $1$번 조작합니다"],
  ["例えば", "예를 들어"],
  ["となるので", "가 되므로"],
  ["操作は", "조작은"],
  ["必要があります", "필요합니다"],
])
  b = b.split(a).join(z);
const h = createHash("sha256").update(src).digest("hex");
const out = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>[기계 번역] No.482 당신의 이름은</title><style>body { font-family: sans-serif; line-height: 1.6; margin: 2rem auto; max-width: 960px; padding: 0 1rem; } pre { background: #f5f5f5; overflow: auto; padding: 1rem; } .block { margin: 2rem 0; }</style></head><body><main data-yukicoder-ko-problem data-schema-version="1" data-locale="ko" data-problem-no="482" data-problem-id="1330" data-source-title="あなたの名は" data-review-status="unreviewed" data-source-html-sha256="${h}"><h3>[기계 번역] No.482 당신의 이름은</h3><div class="problem-statement">${b}</div></main></body></html>`;
await writeFile(`${R}/problem-translations/ko/problems/482.html`, out);
