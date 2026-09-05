import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
const R = "/Users/hyea/yukicoder",
  T = {
    52: ["10", "よくある文字列の問題", "흔한 문자열 문제"],
    53: ["80", "悪の漸化式", "악의 점화식"],
    54: ["41", "Happy Hallowe'en", "Happy Hallowe'en"],
    55: [
      "83",
      "正方形を描くだけの簡単なお仕事です。",
      "정사각형을 그리기만 하는 간단한 일입니다.",
    ],
    56: ["111", "消費税", "소비세"],
    57: ["82", "ミリオンダイス", "밀리언 주사위"],
    58: ["79", "イカサマなサイコロ", "사기 주사위"],
    59: ["98", "鉄道の旅", "철도 여행"],
    60: ["123", "魔法少女", "마법소녀"],
    61: ["113", "リベリオン", "리벨리온"],
  };
await mkdir(`${R}/problem-translations/ko/problems`, { recursive: true });
for (const [no, [id, jtitle, ktitle]] of Object.entries(T)) {
  const src = await readFile(`${R}/tmp/problems-source/${no}.html`, "utf8");
  const hash = createHash("sha256").update(src).digest("hex");
  let b = src
    .replaceAll("問題文", "문제 설명")
    .replaceAll("入力", "입력")
    .replaceAll("出力", "출력")
    .replaceAll("サンプル", "예제")
    .replace(
      /<h5 class="underline">예제(\d+)<\/h5>/g,
      '<h5 class="underline">예제 $1</h5>',
    );
  const out = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>[기계 번역]No.${no} ${ktitle}</title><style>body { font-family: sans-serif; line-height: 1.6; margin: 2rem auto; max-width: 960px; padding: 0 1rem; } pre { background: #f5f5f5; overflow: auto; padding: 1rem; } .block { margin: 2rem 0; }</style></head><body><main data-yukicoder-ko-problem data-schema-version="1" data-locale="ko" data-problem-no="${no}" data-problem-id="${id}" data-source-title="${jtitle}" data-source-html-sha256="${hash}"><h3>[기계 번역]No.${no} ${ktitle}</h3><div class="problem-statement">${b}</div></main></body></html>`;
  await writeFile(`${R}/problem-translations/ko/problems/${no}.html`, out);
}
