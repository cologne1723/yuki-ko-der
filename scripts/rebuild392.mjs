import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
const R = "/Users/hyea/yukicoder",
  p = `${R}/tmp/problems-source/392.html`;
const src = await readFile(p, "utf8");
let b = src;
for (const [a, z] of [
  ["問題文", "문제 설명"],
  ["入力", "입력"],
  ["出力", "출력"],
  ["サンプル", "예제"],
  ["バイナリツリー", "이진 트리"],
  [
    "以上の図のように2分木の点に0から規則正しく番号を付与し4094まで番号が付けられているとする。",
    "위 그림처럼 이진 트리의 점에 0부터 규칙적으로 번호를 붙여 4094까지 번호가 붙어 있다고 합시다.",
  ],
  [
    "点0を0段目、点1、２を1段目、点3,4,5,6を２段目としていくと、１１段目の点が全て枝先であり",
    "점 0을 0단계, 점 1, 2를 1단계, 점 3,4,5,6을 2단계로 세면, 11단계의 점은 모두 잎이고",
  ],
  [
    "それ以外の点は全て下段に２つ点を持っている。",
    "그 외의 점은 모두 아래 단계에 두 개의 점을 가지고 있습니다.",
  ],
  ["この木をたどり点0から点", "이 나무를 따라 점 0에서 점"],
  ["へいくルートを答えよ。", "로 가는 경로를 답하세요."],
  ["左下へ行くときは", "왼쪽 아래로 갈 때는"],
  ["右下へ行くときは", "오른쪽 아래로 갈 때는"],
  ["と表示せよ。", "로 표시하세요."],
  ["最初に数字", "처음에 숫자"],
  ["が一行に与えられる。", "가 한 줄에 주어집니다."],
  ["続く", "이후"],
  ["行には各行に", "줄에는 각 줄에"],
  ["が一つずつ与えられるので", "가 하나씩 주어지므로"],
  ["からスタートして", "에서 시작하여"],
  [
    "に到達するためのルートを一行ずつ表示してほしい。",
    "에 도달하기 위한 경로를 한 줄씩 표시하세요.",
  ],
  ["移動するなら", "로 이동한다면"],
  ["例えば", "예를 들어"],
  ["に移動するなら", "로 이동한다면"],
  ["という具合である。", "와 같습니다."],
  ["出力は入力１つ事にルートを一行に", "출력은 입력 하나마다 경로를 한 줄에"],
  ["として表示すること。", "로 표시하세요."],
  ["最後に改行してください。", "마지막에 줄바꿈을 출력하세요."],
  ["も", "도"],
  [
    "図の延長からわかるとおりである。",
    "그림을 연장하면 알 수 있듯이 경로입니다.",
  ],
])
  b = b.split(a).join(z);
const h = createHash("sha256").update(src).digest("hex");
const out = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>[기계 번역] No.392 이진 트리를 따라가라</title><style>body { font-family: sans-serif; line-height: 1.6; margin: 2rem auto; max-width: 960px; padding: 0 1rem; } pre { background: #f5f5f5; overflow: auto; padding: 1rem; } .block { margin: 2rem 0; }</style></head><body><main data-yukicoder-ko-problem data-schema-version="1" data-locale="ko" data-problem-no="392" data-problem-id="1188" data-source-title="2分木をたどれ" data-review-status="unreviewed" data-source-html-sha256="${h}"><h3>[기계 번역] No.392 이진 트리를 따라가라</h3><div class="problem-statement">${b}</div></main></body></html>`;
await writeFile(`${R}/problem-translations/ko/problems/392.html`, out);
