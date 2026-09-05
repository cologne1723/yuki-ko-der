import { readFile, writeFile } from "node:fs/promises";
const a = "/Users/hyea/yukicoder/tmp/problems-source/232.html",
  b = "/Users/hyea/yukicoder/problem-translations/ko/problems/232.html";
const src = await readFile(a, "utf8");
let out = await readFile(b, "utf8");
const pre = [...src.matchAll(/<pre>([\s\S]*?)<\/pre>/g)].map((m) => m[1]);
let i = 0;
out = out.replace(/<pre>[\s\S]*?<\/pre>/g, () => `<pre>${pre[i++]}</pre>`);
out = out
  .replaceAll(">\n            \\leq", "> \\leq")
  .replace("[기계 번역] No.232", "[기계 번역]No.232");
await writeFile(b, out);
