import { renderProblemMath } from "translation-core/problem-math";

export function renderPreviewMath(root: HTMLElement): void {
  renderProblemMath(root, "html");
}
