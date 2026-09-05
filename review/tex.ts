import renderMathInElement from "katex/contrib/auto-render";

const TEX_OPTIONS: renderMathInElement.RenderMathInElementOptions = {
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
  renderMathInElement(root, TEX_OPTIONS);
}
