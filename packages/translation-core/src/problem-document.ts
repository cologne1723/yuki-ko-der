import { verifyProblemRenderMarkup } from "./problem-render-markup.ts";

// Section classes are not statement boundaries: authored HTML also contains
// introductory prose, bare text, and wrappers alongside direct sample blocks.
export function sourceStatementNodes(root: Element): ChildNode[] {
  const children = [...root.childNodes];
  const element = (node: Node): node is Element => node.nodeType === 1;
  const section = (node: Node) =>
    element(node) &&
    (node.matches(".block, .sample") ||
      !!node.querySelector(".block, .sample"));
  let nodes: ChildNode[];
  let boundedStatement = false;
  if (root.tagName === "BODY") {
    nodes = children;
    boundedStatement =
      !root.ownerDocument.head.children.length &&
      !root.querySelector(
        "#content, nav, script, form, input, button, textarea, select",
      );
  } else {
    // The live site puts the API statement between its metadata/navigation and
    // submission form. Never include those controls, nor the sign-in/social UI.
    const title = children.findIndex(
      (node) => element(node) && node.matches("h3"),
    );
    const metadata = children.findLastIndex(
      (node) =>
        element(node) &&
        (node.matches(".problem-header-cols") ||
          node.matches(
            "#copy-problem-html-btn, #contest-problem-selector-wrapper",
          ) ||
          !!node.querySelector(
            "#copy-problem-html-btn, #contest-problem-selector-wrapper",
          )),
    );
    const header = Math.max(title, metadata);
    const end = children.findIndex(
      (node, i) =>
        i > header && element(node) && node.matches('form[action*="/submit"]'),
    );
    if (header >= 0 && end > header) {
      nodes = children.slice(header + 1, end);
      const id = root.getAttribute("data-problem-id");
      boundedStatement =
        !!id &&
        /^[1-9]\d*$/u.test(id) &&
        (children[end] as Element).getAttribute("action") ===
          `/problems/${id}/submit`;
    } else {
      // Minimal/legacy pages: only accept authored prose and unmarked wrappers.
      // Rendering staging and unrelated forms cannot supply a section seed.
      const allowed = (node: ChildNode): boolean =>
        !element(node) ||
        node.matches(".block, .sample") ||
        (node.matches(
          "div:not([class]):not([id]), div.tex2jax_ignore, div.katex-ignore, div.alert, p, h3, h4, h5, h6, ul, ol, pre, blockquote, table, br, i, b, strong, a, img, hr, font, marquee, details",
        ) &&
          !node.hasAttribute("data-yukicoder-ko-render-staging") &&
          [
            ...node.querySelectorAll("button, input, select, textarea, form"),
          ].every(
            (control) =>
              control.matches(".copy-sample-input") &&
              !!control.closest(".sample"),
          ));
      const seeds = children.flatMap((node, i) =>
        allowed(node) && section(node) ? [i] : [],
      );
      if (!seeds.length) return [];
      let start = seeds[0];
      let stop = seeds[seeds.length - 1] + 1;
      if (!children.slice(start, stop).every(allowed)) return [];
      while (start > header + 1 && allowed(children[start - 1])) start--;
      while (stop < children.length && allowed(children[stop])) stop++;
      nodes = children.slice(start, stop);
    }
  }
  if (!nodes.some(section) && !boundedStatement) return [];
  if (
    !nodes.some(
      (node) =>
        node.textContent?.trim() ||
        (element(node) &&
          (node.matches("img,svg,math") || node.querySelector("img,svg,math"))),
    )
  )
    return [];
  // Keep a sole transparent wrapper in place (including its node identity).
  const substantive = nodes.filter(
    (node) => element(node) || node.textContent?.trim(),
  );
  if (
    substantive.length === 1 &&
    element(substantive[0]) &&
    substantive[0].tagName === "DIV" &&
    !substantive[0].attributes.length &&
    section(substantive[0])
  ) {
    return sourceStatementNodes(substantive[0]);
  }
  return nodes;
}

export function sourceStatementBlocks(root: Element): Element[] {
  return sourceStatementNodes(root).filter(
    (node): node is Element => node.nodeType === 1,
  );
}

export function parseTranslationDocument(
  html: string,
  problemNo: number,
  pageProblemId: string,
  parseHtml: (html: string) => Document = (html) =>
    new DOMParser().parseFromString(html, "text/html"),
) {
  const parsed = parseHtml(html);
  const root = parsed.querySelector<HTMLElement>(
    "main[data-yukicoder-ko-problem]",
  );
  const title = root?.querySelector<HTMLElement>(":scope > h3");
  const statement = root?.querySelector(":scope > .problem-statement");
  // The statement container also owns introductory paragraphs outside sections.
  const blocks = statement ? [...statement.children] : [];
  if (
    !root ||
    !title ||
    title.children.length > 0 ||
    !blocks.some((block) => block.matches(".block")) ||
    root.dataset.schemaVersion !== "1" ||
    root.dataset.locale !== "ko" ||
    !Number.isSafeInteger(problemNo) ||
    problemNo < 1 ||
    !/^[1-9]\d*$/u.test(pageProblemId) ||
    !Number.isSafeInteger(Number(pageProblemId)) ||
    Number(root.dataset.problemNo) !== problemNo ||
    root.dataset.problemId !== pageProblemId ||
    !root.dataset.sourceTitle ||
    !/^[a-f0-9]{64}$/u.test(root.dataset.sourceHtmlSha256 ?? "")
  ) {
    throw new Error(
      "Problem translation HTML metadata or structure is invalid",
    );
  }
  verifyProblemRenderMarkup(root);
  return { root, title, blocks };
}
