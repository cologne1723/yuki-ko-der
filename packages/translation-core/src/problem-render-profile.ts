export interface ProblemRenderProfile {
  engine: "mathjax" | "katex";
  version: string;
}
export const SITE_MATHJAX: ProblemRenderProfile = {
  engine: "mathjax",
  version: "3.2.2",
};
export const SITE_KATEX: ProblemRenderProfile = {
  engine: "katex",
  version: "0.17.0",
};
export function validProblemRenderProfile(
  value: unknown,
): value is ProblemRenderProfile {
  if (!value || typeof value !== "object") return false;
  const profile = value as ProblemRenderProfile;
  return (
    (profile.engine === "mathjax" &&
      profile.version === SITE_MATHJAX.version) ||
    (profile.engine === "katex" && profile.version === SITE_KATEX.version)
  );
}
// Public declarations are authoritative; never infer this from No or Date.
export function detectProblemRenderProfile(
  document: Document,
): ProblemRenderProfile | undefined {
  const profiles: ProblemRenderProfile[] = [];
  for (const script of document.querySelectorAll<HTMLScriptElement>(
    "script[src]",
  )) {
    const src = script.getAttribute("src") ?? "";
    const mathjax = /\/tex-mml-chtml(?:\.min)?\.js(?:[?#]|$)/u.test(src);
    const katex = /\/katex(?:\.min)?\.js(?:[?#]|$)/u.test(src);
    if (
      /\/mathjax@(?:3|3\.2\.2)\/es5\/tex-mml-chtml(?:\.min)?\.js(?:[?#]|$)/u.test(
        src,
      )
    ) {
      profiles.push(SITE_MATHJAX);
    } else if (mathjax) return undefined;
    if (/\/katex@0\.17\.0\/dist\/katex(?:\.min)?\.js(?:[?#]|$)/u.test(src)) {
      profiles.push(SITE_KATEX);
    } else if (katex) return undefined;
  }
  if (profiles.length)
    return profiles.every((profile) => profile.engine === profiles[0].engine)
      ? { ...profiles[0] }
      : undefined;
  const profile = {
    engine: document
      .querySelector('meta[name="yukicoder-ko-math-engine"]')
      ?.getAttribute("content"),
    version: document
      .querySelector('meta[name="yukicoder-ko-math-version"]')
      ?.getAttribute("content"),
  };
  return validProblemRenderProfile(profile) ? profile : undefined;
}
