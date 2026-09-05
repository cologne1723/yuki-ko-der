import fs from "node:fs";
const source = fs.readFileSync("tmp/problems-source/13.html", "utf8");
const body = source
  .replaceAll("問題文", "문제 설명")
  .replaceAll("入力", "입력")
  .replaceAll("出力", "출력")
  .replaceAll("サンプル", "예제")
  .replaceAll(
    "kevinはとあるゲームをしている。",
    "kevin은 어떤 게임을 하고 있습니다.",
  )
  .replaceAll(
    "横\\(W\\)縦\\(H\\)個のマスで構成されるフィールドが与えられる。",
    "가로 \\(W\\), 세로 \\(H\\)개의 칸으로 구성된 필드가 주어집니다.",
  )
  .replaceAll(
    "最初にあるマスを選択し、上下左右の同じ数字のみ辿れ、任意の場所で離す事ができる。",
    "처음에 한 칸을 선택하고, 상하좌우로 같은 숫자만 따라가며 원하는 위치에서 손을 뗄 수 있습니다.",
  )
  .replaceAll(
    "この時、同じ数字のみをたどって、囲みができたら高得点になるゲームである。",
    "이때 같은 숫자만 따라가서, 둘러싸기가 만들어지면 높은 점수를 얻는 게임입니다.",
  )
  .replaceAll(
    "囲みとは、辿ったマスの順番に線をつないだ時に、\\(K( \\geq 4)\\)角形ができていることである。",
    "둘러싸기란 따라간 칸을 순서대로 선으로 이었을 때, \\(K( \\geq 4)\\)각형이 만들어지는 것입니다.",
  )
  .replaceAll(
    "フィールドが与えられた時に囲みができるかどうか判定してください。",
    "필드가 주어졌을 때 둘러싸기를 할 수 있는지 판정하세요.",
  )
  .replaceAll("囲みが出来る場合", "둘러싸기가 가능하면")
  .replaceAll("出来ない場合は", "불가능하면")
  .replaceAll("を出力してください。", "을 출력하세요.")
  .replaceAll("最後に改行してください。", "마지막에 줄바꿈을 출력하세요.")
  .replaceAll("\\(1\\)行目には 横を表す", "\\(1\\)번째 줄에는 가로를 나타내는")
  .replaceAll("と縦を表す", "와 세로를 나타내는")
  .replaceAll(
    "数値が半角スペース区切りで与えられる。",
    "수치가 공백으로 구분되어 주어집니다.",
  )
  .replaceAll(
    "数値が半角スペース区切りで与えられます。",
    "수치가 공백으로 구분되어 주어집니다.",
  )
  .replaceAll(
    "\\(2\\)行目以降には、各行\\(i\\)列目\\(j\\)行目を表す数値",
    "\\(2\\)번째 줄 이후에는 각 줄의 \\(i\\)열, \\(j\\)행을 나타내는 수치",
  )
  .replaceAll(
    "左下で\\(1\\)をうまくたどると、4角形ができます。",
    "왼쪽 아래에서 \\(1\\)을 잘 따라가면 4각형이 만들어집니다.",
  )
  .replaceAll(
    "\\(2\\)で凸の8角形ができる。",
    "\\(2\\)로 볼록한 8각형을 만들 수 있습니다.",
  )
  .replaceAll(
    "このフィールドでは囲みが出来ない。",
    "이 필드에서는 둘러싸기를 할 수 없습니다.",
  );
// The heading replacements above intentionally run first; finish the remaining
// inflected phrases without touching formulas or sample data.
const fixedBody = body
  .replaceAll("(possible) 불가능하면", "(possible) 불가능하면")
  .replaceAll("impossible を출력してください。", "impossible을 출력하세요.")
  .replaceAll(
    "possible または impossible を출력してください。",
    "possible 또는 impossible을 출력하세요.",
  )
  .replaceAll("または", "또는")
  .replaceAll("を출력してください。", "을 출력하세요.")
  .replaceAll(
    ")が半角スペース区切りで与えられる。",
    ")가 공백으로 구분되어 주어집니다.",
  )
  .replaceAll(
    ")が半角スペース区切りで与えられます。",
    ")가 공백으로 구분되어 주어집니다.",
  );
const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>[기계 번역] No.13 둘러싸고 싶어!</title></head><body><main data-yukicoder-ko-problem data-schema-version="1" data-locale="ko" data-problem-no="13" data-problem-id="37" data-source-title="囲みたい！" data-source-html-sha256="9a9e1de45924624753e7c5162d9fff0f6e0f296d5bdfa4c9a00edfe6273e6ea2" data-review-status="unreviewed"><h3>[기계 번역] No.13 둘러싸고 싶어!</h3><div class="problem-statement">${fixedBody}</div></div></main></body></html>`;
fs.writeFileSync("problem-translations/ko/problems/13.html", html);
