import renderMathInElement from "katex/contrib/auto-render";
import {
  validProblemRenderProfile,
  type ProblemRenderProfile,
} from "./problem-render-profile.ts";
export interface ProblemMathOptions {
  fontUrl?: string;
}
const TEX_OPTIONS: renderMathInElement.RenderMathInElementOptions = {
  delimiters: [
    { left: "$$", right: "$$", display: true },
    { left: "$", right: "$", display: false },
    { left: "\\(", right: "\\)", display: false },
    { left: "\\[", right: "\\]", display: true },
  ],
  ignoredTags: ["script", "noscript", "style", "textarea", "code", "option"],
  ignoredClasses: ["tex2jax_ignore"],
};

export async function renderProblemMath(
  root: HTMLElement,
  profile: ProblemRenderProfile,
  options: ProblemMathOptions = {},
): Promise<void> {
  if (!validProblemRenderProfile(profile))
    throw new Error(
      "Site math rendering configuration is unavailable or unsupported",
    );
  if (profile.engine === "katex") {
    if (
      root.closest(".tex2jax_ignore") ||
      TEX_OPTIONS.ignoredTags?.some((tag) => tag === root.tagName.toLowerCase())
    )
      return;
    renderMathInElement(root, { ...TEX_OPTIONS });
    return;
  }
  const { renderMathJax } = await import("./problem-mathjax.ts");
  await renderMathJax(root, options);
}
