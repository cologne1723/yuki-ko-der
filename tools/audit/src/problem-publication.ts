import { JSDOM } from "jsdom";
import { verifyProblemRenderMarkup } from "translation-core/problem-render-markup";
import { resolveProblemUrls } from "translation-core/problem-urls";
import type { ProblemRenderProfile } from "translation-core/problem-render-profile";

export interface PublishedRenderMetadata {
  profile?: ProblemRenderProfile;
  sourceUrl: string;
}

/** Add the public review notice without changing editable source or metadata. */
export function labelPublishedProblem(
  html: string,
  render?: PublishedRenderMetadata,
): string {
  const dom = new JSDOM(html);
  try {
    const document = dom.window.document;
    const root = document.querySelector<HTMLElement>(
      "main[data-yukicoder-ko-problem]",
    );
    const heading = root?.querySelector("h3");
    if (!root || !heading)
      throw new Error("Problem translation heading is missing");
    verifyProblemRenderMarkup(root);
    const title = (heading.textContent ?? "")
      .replace(/^\[기계 번역\]\s*/u, "")
      .replace(/\s*\(기계번역입니다\)$/u, "");
    heading.textContent = title;
    document.title = title;
    if (render) {
      // Normalize statement resources before the build adds hosted navigation/assets.
      resolveProblemUrls(root, render.sourceUrl);
      for (const [name, content] of [
        ["yukicoder-ko-math-engine", render.profile?.engine],
        ["yukicoder-ko-math-version", render.profile?.version],
        ["yukicoder-ko-source-url", render.sourceUrl],
      ] as const) {
        document
          .querySelectorAll(`meta[name="${name}"]`)
          .forEach((meta) => meta.remove());
        if (content === undefined) continue;
        const meta = document.createElement("meta");
        meta.name = name;
        meta.content = content;
        document.head.append(meta);
      }
      document.querySelector(".math-render-error")?.remove();
      if (!render.profile) {
        const notice = document.createElement("p");
        notice.className = "math-render-error";
        notice.setAttribute("role", "alert");
        notice.textContent =
          "이 문제의 수식 표시 정보를 아직 수집하지 못했습니다. 수식은 원본 표기로 표시됩니다. ";
        const link = document.createElement("a");
        link.href = render.sourceUrl;
        link.textContent = "일본어 원문 보기";
        notice.append(link);
        root.before(notice);
      }
    }
    root.querySelector(".machine-translation-notice")?.remove();
    if (root.dataset.reviewStatus !== "approved") {
      const notice = document.createElement("p");
      notice.className = "machine-translation-notice";
      notice.textContent = "아래 텍스트는 기계번역 되었습니다";
      heading.before(notice);
    }
    return dom.serialize();
  } finally {
    dom.window.close();
  }
}
