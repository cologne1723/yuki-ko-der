import { renderProblemMath } from "translation-core/problem-math";
import type { ProblemRenderProfile } from "translation-core/problem-render-profile";
import { verifyProblemRenderMarkup } from "translation-core/problem-render-markup";

async function renderPublishedProblem() {
  const root = document.querySelector<HTMLElement>(
    "main[data-yukicoder-ko-problem]",
  );
  const statement = root?.querySelector<HTMLElement>(".problem-statement");
  if (!root || !statement) return;
  try {
    verifyProblemRenderMarkup(root);
    const metadata = (name: string) =>
      document.querySelector<HTMLMetaElement>(`meta[name="${name}"]`)?.content;
    const engine = metadata("yukicoder-ko-math-engine");
    const version = metadata("yukicoder-ko-math-version");
    if (
      (engine !== "mathjax" && engine !== "katex") ||
      !version ||
      !/^\d+\.\d+\.\d+$/u.test(version)
    )
      throw new Error("Published problem render profile is missing or invalid");
    const profile: ProblemRenderProfile = { engine, version };
    // Title definitions and statement formulas share the site's single math scope.
    await renderProblemMath(root, profile, {
      fontUrl: new URL("../../assets/mathjax/fonts/woff-v2", document.baseURI)
        .href,
    });
    statement.dataset.mathRenderStatus = "ready";
  } catch (error) {
    statement.dataset.mathRenderStatus = "error";
    if (!document.querySelector(".math-render-error")) {
      const notice = document.createElement("p");
      notice.setAttribute("role", "alert");
      notice.className = "math-render-error";
      notice.textContent =
        "수식 표시를 완료하지 못했습니다. 일본어 원문을 확인해 주세요.";
      statement.before(notice);
    }
    console.error(error);
  }
}
void renderPublishedProblem();
document.querySelector("[data-back]")?.addEventListener("click", () => {
  if (document.referrer && history.length > 1) history.back();
  else location.assign("../../");
});
