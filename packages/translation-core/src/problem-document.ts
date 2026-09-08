// Some canonical statements place a sample beside their section blocks.
// Include it in validation and replacement so no visible sample is overlooked.
export function sourceStatementBlocks(root: Element): Element[] {
  return [...root.querySelectorAll(":scope > .block, :scope > .sample")];
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
  const blocks = statement
    ? [...statement.querySelectorAll(":scope > .block")]
    : [];
  if (
    !root ||
    !title ||
    title.children.length > 0 ||
    blocks.length === 0 ||
    root.dataset.schemaVersion !== "1" ||
    root.dataset.locale !== "ko" ||
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
