import renderMathInElement from "katex/contrib/auto-render";

const statement = document.querySelector<HTMLElement>(".problem-statement");
if (statement) {
  renderMathInElement(statement, {
    delimiters: [
      { left: "$$", right: "$$", display: true },
      { left: "\\(", right: "\\)", display: false },
      { left: "\\[", right: "\\]", display: true },
      { left: "$", right: "$", display: false },
    ],
    ignoredClasses: ["katex"],
    throwOnError: false,
    strict: "ignore",
    trust: false,
  });
}
document.querySelector("[data-back]")?.addEventListener("click", () => {
  if (document.referrer && history.length > 1) history.back();
  else location.assign("../../");
});
