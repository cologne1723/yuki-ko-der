import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
const R = "/Users/hyea/yukicoder",
  p = `${R}/tmp/problems-source/142.html`;
let b = await readFile(p, "utf8");
const m = [
  ["問題文", "문제 설명"],
  ["入力", "입력"],
  ["出力", "출력"],
  ["サンプル", "예제"],
  ["Warning: 想定解法はC++で実行時間", "Warning: 예상 풀이를 C++로 실행 시간"],
  [
    "言語によっては想定解法と同じ方法ではTLEになる可能性があります。",
    "언어에 따라 예상 풀이와 같은 방법으로는 TLE가 될 가능성이 있습니다.",
  ],
  ["次の操作を行った後，最終的な配列", "다음 조작을 수행한 후 최종 배열"],
  ["を求めてください．", "을 구하세요."],
  ["ただし，配列", "단, 배열"],
  [
    "各要素が偶数か奇数かのみを出力してください。",
    "각 원소가 짝수인지 홀수인지만 출력하세요.",
  ],
  ["ここで，配列", "여기서 배열"],
  ["と書き表します。", "라고 나타냅니다."],
  ["例えば，", "예를 들어,"],
  ["次に", "다음으로"],
  ["個の処理が与えられます．", "개의 처리가 주어집니다."],
  ["各処理は", "각 처리는"],
  ["の組で，次のような操作を行います．", "의 조합이며 다음 조작을 합니다."],
  ["から", "부터"],
  ["までをコピーし", "까지 복사하여"],
  ["とします．", "라고 합니다."],
  ["そして", "그리고"],
  ["各要素に", "각 원소에"],
  ["を足し込みます．つまり，", "를 더합니다. 즉,"],
  ["と代入操作を行います．", "라는 대입 조작을 수행합니다."],
  ["この", "이"],
  ["全て終わった後", "이 모두 끝난 후"],
  ["に対して", "에 대해"],
  ["であれば", "이면"],
  ["奇数であれば", "홀수이면"],
  ["と置き換えてできる", "로 바꾸어 만든"],
  [
    "文字列を出力するプログラムを書いてください．",
    "문자열을 출력하는 프로그램을 작성하세요.",
  ],
  ["行目に", "번째 줄에"],
  ["が与えられる。", "가 주어집니다."],
  ["空白区切りで与えられる。", "공백으로 구분되어 주어집니다."],
  ["は問題制約を満たす値である。", "는 문제의 제약을 만족하는 값입니다."],
  ["答えの文字列を出力してください．", "답 문자열을 출력하세요."],
  [
    "なお，奇数に対応する文字はゼロではなくアルファベットのオー（oddですから！）です．",
    "또한 홀수에 대응하는 문자는 0이 아니라 알파벳 O(odd이기 때문입니다!)입니다.",
  ],
  ["最初に乱数で数列を作ると", "처음 난수로 수열을 만들면"],
  ["となり，", "이 되고,"],
  ["回目の操作の後には，", "번째 조작 후에는,"],
  ["回目の操作の後：", "번째 조작 후:"],
  ["と変化していく．", "로 변화합니다."],
  ["答えは回文だね．やったぁ．", "답은 회문이네요. 신난다."],
  ["答えはやっぱり回文だね．やったね．", "답은 역시 회문이네요. 잘됐습니다."],
  ["サンプル", "예제"],
];
for (const [a, z] of m) b = b.split(a).join(z);
const src = await readFile(p, "utf8"),
  h = createHash("sha256").update(src).digest("hex");
const out = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>[기계 번역]No.142 단순한 배열 조작 구현 문제</title><style>body { font-family: sans-serif; line-height: 1.6; margin: 2rem auto; max-width: 960px; padding: 0 1rem; } pre { background: #f5f5f5; overflow: auto; padding: 1rem; } .block { margin: 2rem 0; }</style></head><body><main data-yukicoder-ko-problem data-schema-version="1" data-locale="ko" data-problem-no="142" data-problem-id="206" data-source-title="単なる配列の操作に関する実装問題" data-source-html-sha256="${h}"><h3>[기계 번역]No.142 단순한 배열 조작 구현 문제</h3><div class="problem-statement">${b}</div></main></body></html>`;
await writeFile(`${R}/problem-translations/ko/problems/142.html`, out);
