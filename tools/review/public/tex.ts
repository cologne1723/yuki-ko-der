import renderMathInElement from "katex/contrib/auto-render";

const TEX_OPTIONS: renderMathInElement.RenderMathInElementOptions = {
  output: "html",
  delimiters: [
    { left: "$$", right: "$$", display: true },
    { left: "\\(", right: "\\)", display: false },
    { left: "\\[", right: "\\]", display: true },
    { left: "$", right: "$", display: false },
  ],
  ignoredTags: ["script", "noscript", "style", "textarea", "code"],
  throwOnError: false,
  strict: "ignore",
};

export function renderPreviewMath(root: HTMLElement): void {
  // Markdown input formats use pre > code; sample data and actual code stay literal.
  for (const code of root.querySelectorAll<HTMLElement>(".block pre > code")) {
    if (code.closest(".sample")) continue;
    const heading = code
      .closest(".block")
      ?.querySelector("h4")
      ?.textContent?.trim();
    const lines = (code.textContent ?? "")
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    if (
      heading &&
      /^(입력|출력|入力|出力)$/u.test(heading) &&
      lines.length &&
      lines.every((line) => /^\$.+\$$/u.test(line))
    )
      renderMathInElement(code, TEX_OPTIONS);
  }
  renderMathInElement(root, TEX_OPTIONS);
}
