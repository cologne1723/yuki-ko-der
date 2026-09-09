// Some statements put a sample or a leading Note outside their section blocks.
// Restrict the leading range to the site's Note heading and prose, so navigation
// and problem controls before the statement can never become replacement targets.
export function sourceStatementBlocks(root: Element): Element[] {
  const blocks = [
    ...root.querySelectorAll(":scope > .block, :scope > .sample"),
  ];
  const leading: Element[] = [];
  for (
    let element = blocks[0]?.previousElementSibling;
    element;
    element = element.previousElementSibling
  ) {
    if (
      element.matches("h4.shadow") &&
      element.textContent?.trim() === "Note"
    ) {
      return [element, ...leading, ...blocks];
    }
    if (
      !element.matches("p, ul, ol, pre, blockquote, table, br") ||
      element.querySelector("button, input, select, textarea, form")
    )
      break;
    leading.unshift(element);
  }
  return blocks;
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
  return { root, title, blocks };
}
