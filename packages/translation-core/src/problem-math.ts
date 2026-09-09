import renderMathInElement from "katex/contrib/auto-render";

const TEX_OPTIONS: renderMathInElement.RenderMathInElementOptions = {
  delimiters: [
    { left: "$$", right: "$$", display: true },
    { left: "\\(", right: "\\)", display: false },
    { left: "\\[", right: "\\]", display: true },
    { left: "$", right: "$", display: false },
  ],
  ignoredTags: ["script", "noscript", "style", "textarea", "code"],
  ignoredClasses: ["katex", "yukicoder-ko-sample-data"],
  trust: false,
  throwOnError: false,
  strict: "ignore",
};

export function renderProblemMath(
  root: HTMLElement,
  output: "html" | "htmlAndMathml" = "htmlAndMathml",
): void {
  const options = { ...TEX_OPTIONS, output };
  const samples = [...root.querySelectorAll(".sample pre")];
  for (const pre of samples) pre.classList.add("yukicoder-ko-sample-data");
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
      renderMathInElement(code, options);
  }
  renderMathInElement(root, options);
  for (const pre of samples) {
    pre.classList.remove("yukicoder-ko-sample-data");
    if (!pre.className) pre.removeAttribute("class");
  }
}
