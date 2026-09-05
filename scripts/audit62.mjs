import { readFile, writeFile } from "node:fs/promises";
const p = "/Users/hyea/yukicoder/problem-translations/ko/problems/62.html";
let s = await readFile(p, "utf8");
s = s
  .replace(
    'この問題は\n          <a href="http://yukicoder.me/problems/113">No.61 리벨리온</a>\n          の制約強化版になります。',
    '이 문제는\n          <a href="http://yukicoder.me/problems/113">No.61 리벨리온</a>\n          의 제약 강화판입니다.',
  )
  .replace(
    "각 테스트 케이스에서 탄환이 Mami에게 맞는 경우 「Hit」, 맞지 않는\n            경우 「Miss」를 출력하세요. 마지막에 줄바꿈을 출력하세요.",
    "각 테스트 케이스에서 탄환이 Mami에게 맞으면 「Hit」, 맞지 않으면 「Miss」를 출력하세요. 마지막에 줄바꿈을 출력하세요.",
  )
  .replace(
    "각 테스트 케이스에서 탄환이 Mamiに当たる場合は「Hit」当たらない場合は「Miss」を出力せよ。末尾に改行をつけること。",
    "각 테스트 케이스에서 탄환이 Mami에게 맞으면 「Hit」, 맞지 않으면 「Miss」를 출력하세요. 마지막에 줄바꿈을 출력하세요.",
  );
await writeFile(p, s);
