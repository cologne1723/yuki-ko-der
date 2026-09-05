import { readFile, writeFile } from "node:fs/promises";
const p = "/Users/hyea/yukicoder/problem-translations/ko/problems/52.html";
let s = await readFile(p, "utf8");
s = s
  .replace("文字列Sが与えられる。", "문자열 S가 주어집니다.")
  .replace(
    "文字列Sの「先頭」または「末尾」から１文字ずつ文字をとってきて、",
    "문자열 S의 「처음」 또는 「끝」에서 한 글자씩 가져와서,",
  )
  .replace(
    "取った文字列とは別に、取った文字を順番につなげて新たに文字列を作る。",
    "가져온 문자열과는 별도로 가져온 글자를 순서대로 이어 새로운 문자열을 만듭니다.",
  )
  .replace(
    "Sは、文字を取った後の文字列を新たなSとしてSの文字列がなくなるまで繰り返す。",
    "문자를 가져온 뒤의 문자열을 새로운 S로 하여, S의 문자가 없어질 때까지 반복합니다.",
  )
  .replace(
    "この時、新たにできる文字列は何通りの文字列ができるか？",
    "이때 새로 만들 수 있는 문자열은 몇 종류인지 구하세요.",
  );
s = s.replace(
  "Sは小文字のaからzのアルファベットからなる最短1文字最長10文字の文字列",
  "S는 소문자 a부터 z까지의 알파벳으로 이루어진 길이 1 이상 10 이하의 문자열입니다.",
);
s = s
  .replace(
    "できる文字列の数Ansを출력せよ。",
    "만들 수 있는 문자열의 수 Ans를 출력하세요.",
  )
  .replace(
    "最後に改行を忘れないように。",
    "마지막에 줄바꿈하는 것을 잊지 마세요.",
  );
s = s
  .replace(
    "abc、acb、cab、cba の4通りがある。",
    "abc, acb, cab, cba의 4가지가 있습니다.",
  )
  .replace("aab、aba、baa の3通りがある。", "aab, aba, baa의 3가지가 있습니다.")
  .replace(
    "どのようにしても aaaaaaaaaa にしかならない。",
    "어떻게 해도 aaaaaaaaaa만 만들 수 있습니다.",
  );
await writeFile(p, s);
