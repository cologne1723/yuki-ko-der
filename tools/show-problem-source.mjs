import fs from "node:fs";
import { JSDOM } from "jsdom";

const numbers = process.argv.slice(2);
if (numbers.length === 0 || numbers.some((n) => !/^\d+$/.test(n))) {
  throw new Error(
    "Usage: node tools/show-problem-source.mjs NUMBER [NUMBER ...]",
  );
}
for (const number of numbers) {
  const file = `data/problems-source/${number}.html`;
  const dom = new JSDOM(fs.readFileSync(file, "utf8"));
  let hidden = 0;
  for (const img of dom.window.document.querySelectorAll("img")) {
    if (/^data:/i.test(img.getAttribute("src") ?? "")) {
      img.setAttribute(
        "src",
        `[inline image ${++hidden}: inspect extracted file]`,
      );
    }
  }
  process.stdout.write(
    `SOURCE ${file} (${hidden} inline image payloads hidden)\n`,
  );
  process.stdout.write(dom.serialize() + "\n");
  dom.window.close();
}
