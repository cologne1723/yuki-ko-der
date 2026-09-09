import { renderProblemMath } from "translation-core/problem-math";

const statement = document.querySelector<HTMLElement>(".problem-statement");
if (statement) renderProblemMath(statement);
document.querySelector("[data-back]")?.addEventListener("click", () => {
  if (document.referrer && history.length > 1) history.back();
  else location.assign("../../");
});
