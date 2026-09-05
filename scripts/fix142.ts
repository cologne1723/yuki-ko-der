import { readFile, writeFile } from "node:fs/promises";
const p = "/Users/hyea/yukicoder/problem-translations/ko/problems/142.html";
let s = await readFile(p, "utf8");
s = s
  .replace("$X,Y,Z$", "$X, Y, Z$")
  .replace("네 양의 정수 $S,T,U,V$", "네 양의 정수 $4$개 $S,T,U,V$")
  .replace("첫 번째 조작 후에는,", "첫 번째 조작 후에는,")
  .replace(
    "첫 번째 조작 후에는,<br />$\\qquad A",
    "첫 번째 조작 후에는,<br />$1$번째 조작 후:<br />$\\qquad A",
  );
s = s
  .replace(
    "두 번째 조작 후에는,<br />$\\qquad A",
    "두 번째 조작 후에는,<br />$2$번째 조작 후:<br />$\\qquad A",
  )
  .replace(
    "세 번째 조작 후에는,<br />$\\qquad A",
    "세 번째 조작 후에는,<br />$3$번째 조작 후:<br />$\\qquad A",
  );
await writeFile(p, s);
