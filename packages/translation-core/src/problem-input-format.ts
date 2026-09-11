import MarkdownIt from "markdown-it";
import { parseProblemFenceInfo } from "./problem-markdown.ts";

// Structural metadata is independent of the authoring language label.
export function formatFenceErrors(body: string): string[] {
  const tokens = new MarkdownIt().parse(body, {});
  const errors: string[] = [];
  let section = "";
  let samplePart = "";
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (token.type === "heading_open") {
      if (token.tag === "h2") {
        section = tokens[i + 1].content;
        samplePart = "";
      } else if (token.tag === "h4") samplePart = tokens[i + 1].content;
    }
    const io =
      section === "입력" ||
      section === "출력" ||
      (section === "예제" && ["입력", "출력"].includes(samplePart));
    if (!io || token.type !== "fence") continue;
    const info = parseProblemFenceInfo(token.info);
    if (!info.code && info.language !== "text")
      errors.push(
        `입출력 코드 블록의 언어 표지는 text여야 합니다 (본문 ${1 + (token.map?.[0] ?? 0)}행).`,
      );
  }
  return errors;
}

// The compiler supplies the section structure for per-line math checks.
export function inputFormatErrors(document: Document): string[] {
  const errors: string[] = [];
  for (const block of document.querySelectorAll(".block")) {
    if (block.querySelector("h4")?.textContent?.trim() !== "입력") continue;
    for (const pre of block.querySelectorAll("pre")) {
      if (pre.closest(".sample")) continue;
      // Explicit source semantics take precedence over an input-section label.
      if (pre.querySelector(":scope > code")) continue;
      const scope = pre.closest(".tex2jax_ignore,.tex2jax_process");
      if (
        scope?.classList.contains("tex2jax_ignore") &&
        !scope.classList.contains("tex2jax_process")
      )
        continue;
      for (const line of (pre.textContent ?? "").split("\n")) {
        const text = line.trim();
        // Literal punctuation and numerical data are not variable expressions.
        if (!/[A-Za-z]/u.test(text)) continue;
        if (!/^\$[^$]+\$$/u.test(text))
          errors.push(
            `설명용 입력 형식은 행 전체를 단일 $...$로 감싸세요: ${text}`,
          );
      }
    }
  }
  return errors;
}
