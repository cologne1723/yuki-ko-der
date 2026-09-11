// This versions generated PRE/CODE semantics, not authored metadata or review.
export const PROBLEM_RENDER_MARKUP_VERSION = "2";

export function verifyProblemRenderMarkup(
  root: Element,
): "current" | "unversioned" {
  const version = root.getAttribute("data-render-markup-version");
  // Historic authored HTML and old generated HTML are indistinguishable here.
  // Do not claim legacy provenance or rewrite CODE on absence of a marker.
  // A complete republish is required before rolling out the new renderer.
  if (version === null) return "unversioned";
  if (version !== PROBLEM_RENDER_MARKUP_VERSION)
    throw new Error(`Unsupported problem render markup version: ${version}`);
  return "current";
}
