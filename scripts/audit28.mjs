import { readFile, writeFile } from "node:fs/promises";
const p = "/Users/hyea/yukicoder/problem-translations/ko/problems/28.html";
let s = await readFile(p, "utf8");
s = s
  .replace(
    "는18진수로「1g0」な의로末尾의0의数는1개",
    "는 18진수로 「1g0」이므로 끝의 0 개수는 1개",
  )
  .replace(
    "는3진수로「1100」な의로末尾의0의数는2개",
    "는 3진수로 「1100」이므로 끝의 0 개수는 2개",
  )
  .replace("의組가 주어집니다.", "의 조합이 주어집니다.")
  .replace(
    "개의組ごと에末尾의0의数의最小를計算し각각출력せよ.단,末尾에改줄를개けること.",
    "개 조합마다 끝의 0 개수의 최솟값을 계산해 각각 출력하세요. 단, 끝에 줄바꿈을 붙이세요.",
  );
await writeFile(p, s);
