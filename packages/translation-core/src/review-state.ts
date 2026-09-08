import { JSDOM } from "jsdom";
import { sampleWarnings } from "./problem-samples.ts";
export type ReviewStatus = "unreviewed" | "approved";
const MACHINE_LABEL = "[기계 번역]";
export class ReviewError extends Error {
  constructor(
    message: string,
    readonly statusCode = 400,
  ) {
    super(message);
  }
}

// Kept as an alias for the review UI and CLI callers.
export { sampleWarnings as structuralWarnings };

export function parseReviewState(html: string): {
  koreanTitle: string;
  machineTranslated: boolean;
  reviewStatus: ReviewStatus;
} {
  const dom = new JSDOM(html);
  try {
    const document = dom.window.document;
    const root = document.querySelector<HTMLElement>(
      "main[data-yukicoder-ko-problem]",
    );
    const pageTitle =
      document.querySelector("title")?.textContent?.trim() ?? "";
    const heading =
      root?.querySelector(":scope > h3")?.textContent?.trim() ?? "";
    const reviewStatus = root?.dataset.reviewStatus;
    if (!root || !heading || !pageTitle) {
      throw new ReviewError(
        "Korean translation title or main element is missing",
      );
    }
    if (reviewStatus !== "unreviewed" && reviewStatus !== "approved") {
      throw new ReviewError(
        "Problem review status must be unreviewed or approved",
      );
    }
    if (
      pageTitle.includes("(!)") ||
      heading.includes("(!)") ||
      pageTitle.includes("📝") ||
      heading.includes("📝")
    ) {
      throw new ReviewError("Problem HTML still uses a draft marker");
    }
    if ((html.match(/\(!\)|📝/gu) ?? []).length > 0) {
      throw new ReviewError(
        "Problem HTML may not use the fixed-UI draft marker",
      );
    }
    const pageIsMachine = pageTitle.startsWith(MACHINE_LABEL);
    const headingIsMachine = heading.startsWith(MACHINE_LABEL);
    if (pageIsMachine !== headingIsMachine) {
      throw new ReviewError(
        "Machine-translation labels must match in title and h3",
      );
    }
    if (reviewStatus === "approved" && pageIsMachine) {
      throw new ReviewError(
        "Approved translations cannot retain the machine label",
      );
    }
    const machineLabelCount = (html.match(/\[기계 번역\]/gu) ?? []).length;
    if (machineLabelCount !== (pageIsMachine ? 2 : 0)) {
      throw new ReviewError("Machine labels may appear only in title and h3");
    }
    if ((html.match(/\bdata-review-status=/gu) ?? []).length !== 1) {
      throw new ReviewError(
        "Problem HTML must contain exactly one review status",
      );
    }
    return {
      koreanTitle: heading
        .replace(/^\[기계 번역\]\s*/u, "")
        .replace(/^No\.\d+\s*/u, ""),
      machineTranslated: pageIsMachine,
      reviewStatus,
    };
  } finally {
    dom.window.close();
  }
}

export function setReviewStatus(
  html: string,
  reviewStatus: ReviewStatus,
): string {
  const dom = new JSDOM(html, { includeNodeLocations: true });
  try {
    const root = dom.window.document.querySelector(
      "main[data-yukicoder-ko-problem]",
    );
    const location = (root && dom.nodeLocation(root)) as
      | {
          startTag?: { endOffset: number };
          attrs?: Record<string, { startOffset: number; endOffset: number }>;
        }
      | undefined;
    if (!location?.startTag)
      throw new ReviewError("Problem translation main element is missing");
    const attribute = location.attrs?.["data-review-status"];
    const from = attribute?.startOffset ?? location.startTag.endOffset - 1;
    const to = attribute?.endOffset ?? from;
    return (
      html.slice(0, from) +
      `${attribute ? "" : " "}data-review-status="${reviewStatus}"` +
      html.slice(to)
    );
  } finally {
    dom.window.close();
  }
}

export function removeMachineLabel(html: string): string {
  const dom = new JSDOM(html, { includeNodeLocations: true });
  try {
    const edits: { from: number; to: number; value: string }[] = [];
    for (const element of [
      dom.window.document.querySelector("title"),
      dom.window.document.querySelector("main[data-yukicoder-ko-problem] > h3"),
    ]) {
      if (!element) continue;
      const node = element.firstChild;
      if (!node || node.nodeType !== 3) continue;
      const location = dom.nodeLocation(node);
      if (!location) continue;
      const raw = html.slice(location.startOffset, location.endOffset);
      const value = raw.replace(/^(\s*)\[기계 번역\]\s*/u, "$1");
      if (value !== raw)
        edits.push({
          from: location.startOffset,
          to: location.endOffset,
          value,
        });
    }
    for (const edit of edits.sort((a, b) => b.from - a.from))
      html = html.slice(0, edit.from) + edit.value + html.slice(edit.to);
    return html;
  } finally {
    dom.window.close();
  }
}
