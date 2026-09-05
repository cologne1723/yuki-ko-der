import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
const R = "/Users/hyea/yukicoder",
  p = `${R}/tmp/problems-source/462.html`;
const src = await readFile(p, "utf8");
let b = src;
for (const [a, z] of [
  ["問題文", "문제 설명"],
  ["入力", "입력"],
  ["出力", "출력"],
  ["サンプル", "예제"],
  ["吝嗇家", "구두쇠"],
  ["新しく出来たコンピュータ", "새로 만들어진 컴퓨터"],
  ["このコンピュータ", "이 컴퓨터"],
  ["表せる", "나타낼 수 있는"],
  ["表せません", "나타낼 수 없습니다"],
  ["今、この", "이제 이"],
  ["求めるプログラムを作成してください", "구하는 프로그램을 작성하세요"],
  ["出力してください", "출력하세요"],
  ["注意してください", "주의하세요"],
  ["の2通りの数列が考えられます", "두 가지 수열을 생각할 수 있습니다"],
  ["存在しません", "존재하지 않습니다"],
  ["なので、", "이므로,"],
  ["全ての数列を考えます", "모든 수열을 생각합니다"],
])
  b = b.split(a).join(z);
const h = createHash("sha256").update(src).digest("hex");
const out = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>[기계 번역] No.462 6일을 모르는 컴퓨터</title><style>body { font-family: sans-serif; line-height: 1.6; margin: 2rem auto; max-width: 960px; padding: 0 1rem; } pre { background: #f5f5f5; overflow: auto; padding: 1rem; } .block { margin: 2rem 0; }</style></head><body><main data-yukicoder-ko-problem data-schema-version="1" data-locale="ko" data-problem-no="462" data-problem-id="1389" data-source-title="6日知らずのコンピュータ" data-review-status="unreviewed" data-source-html-sha256="${h}"><h3>[기계 번역] No.462 6일을 모르는 컴퓨터</h3><div class="problem-statement">${b}</div></main></body></html>`;
await writeFile(`${R}/problem-translations/ko/problems/462.html`, out);
