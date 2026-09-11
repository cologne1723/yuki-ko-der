import { renderProblemMath } from "translation-core/problem-math";
import type { ProblemRenderProfile } from "translation-core/problem-render-profile";

export async function renderPreviewMath(
  root: HTMLElement,
  profile: ProblemRenderProfile,
  options: { fontUrl?: string } = {},
): Promise<void> {
  // Both review languages use the original page's renderer and accessibility output.
  await renderProblemMath(root, profile, options);
}
