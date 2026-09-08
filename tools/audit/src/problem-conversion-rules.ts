import { samplePreText } from "translation-core/problem-samples";
import TurndownService from "turndown";

function preformatted(element: Element): string {
  const content = samplePreText(element);
  const backticks = Math.max(
    0,
    ...[...content.matchAll(/`+/gu)].map((match) => match[0].length),
  );
  const tildes = Math.max(
    0,
    ...[...content.matchAll(/~+/gu)].map((match) => match[0].length),
  );
  const useBackticks = backticks <= tildes;
  const length = Math.max(useBackticks ? backticks : tildes, 2) + 1;
  const fence = (useBackticks ? "`" : "~").repeat(Math.max(3, length));
  return `${fence}text\n${content}\n${fence}`;
}

const converter = new TurndownService({
  headingStyle: "atx",
  codeBlockStyle: "fenced",
  emDelimiter: "*",
});
converter.addRule("strikethrough", {
  filter: ["s", "del"],
  replacement: (content) => {
    if (content.includes("\n\n"))
      throw new Error("Unsupported block content inside strikethrough");
    return content ? `~~${content}~~` : "";
  },
});
converter.addRule("exact-pre", {
  filter: "pre",
  replacement: (_content, node) =>
    "\n\n" + preformatted(node as unknown as Element) + "\n\n",
});
converter.addRule("sup-sub", {
  filter: ["sup", "sub"],
  replacement: (_content, node) => {
    const text = node.textContent ?? "";
    if (/[{}\\$]/u.test(text) || (node as HTMLElement).children.length)
      throw new Error("Unsupported nested superscript/subscript content");
    return `$${node.nodeName === "SUP" ? "^" : "_"}{\\text{${text}}}$`;
  },
});
converter.addRule("raster-image", {
  filter: "img",
  replacement: (_content, node) => {
    const image = node as HTMLImageElement;
    const src = image.getAttribute("src") ?? "";
    if (!/^(?:https?:|\/|data:image\/(?:png|jpeg|gif|webp);base64,)/u.test(src))
      throw new Error("Unsupported image URL");
    return `![${(image.getAttribute("alt") ?? "").replaceAll("]", "\\]")}](${src.replace(/[()\s]/gu, encodeURIComponent)})`;
  },
});
converter.addRule("table", {
  filter: "table",
  replacement: (_content, node) => {
    const table = node as HTMLTableElement;
    const rows = Array.from(table.querySelectorAll("tr"));
    if (!rows.length) return "";
    const values = rows.map((row) =>
      Array.from(row.children)
        .filter((cell) => ["TH", "TD"].includes(cell.tagName))
        .map((cell) => {
          if (
            Number(cell.getAttribute("rowspan") ?? 1) !== 1 ||
            Number(cell.getAttribute("colspan") ?? 1) !== 1
          )
            throw new Error("Unsupported merged table cell");
          return converter
            .turndown(cell.innerHTML)
            .replaceAll("|", "\\|")
            .replaceAll("\n", " ");
        }),
    );
    if (values.some((row) => row.length !== values[0].length))
      throw new Error("Unsupported irregular table");
    const line = (cells: string[]) => `| ${cells.join(" | ")} |`;
    return `\n\n${[line(values[0]), line(values[0].map(() => "---")), ...values.slice(1).map(line)].join("\n")}\n\n`;
  },
});
const standardEscape = converter.escape.bind(converter);
converter.escape = (text: string) => {
  const formulas =
    /\\\([\s\S]*?\\\)|\\\[[\s\S]*?\\\]|\$\$[\s\S]*?\$\$|\$(?!\s)[^$\n]+?\$/gu;
  let result = "",
    start = 0;
  for (const match of text.matchAll(formulas)) {
    result += standardEscape(text.slice(start, match.index)) + match[0];
    start = match.index + match[0].length;
  }
  return result + standardEscape(text.slice(start));
};
export function renderContent(element: Element): string {
  const supported = new Set(
    "DIV P PRE CODE BLOCKQUOTE UL OL LI HR BR A IMG STRONG B EM I S DEL SUP SUB H4 H5 H6 TABLE THEAD TBODY TFOOT TR TH TD".split(
      " ",
    ),
  );
  for (const node of [element, ...element.querySelectorAll("*")]) {
    if (!supported.has(node.tagName))
      throw new Error(
        `Unsupported conversion construct: <${node.tagName.toLowerCase()}>`,
      );
    if (
      node.tagName === "A" &&
      !/^(?:https?:|\/|#)/u.test(node.getAttribute("href") ?? "")
    )
      throw new Error("Unsupported link URL");
    for (const attribute of node.attributes)
      if (
        /^on/iu.test(attribute.name) ||
        ["style", "srcdoc"].includes(attribute.name)
      )
        throw new Error(`Unsupported conversion attribute: ${attribute.name}`);
  }
  return converter.turndown(element.outerHTML);
}

export function sampleMarkdown(sample: Element): string {
  const heading = sample.querySelector(":scope > h5")?.textContent?.trim();
  const paragraph = sample.querySelector(":scope > .paragraph");
  if (!heading || !paragraph) throw new Error("Sample structure is invalid");
  const content = paragraph.cloneNode(true) as Element;
  for (const label of content.querySelectorAll(":scope > h6")) {
    const heading = content.ownerDocument.createElement("h4");
    heading.append(...label.childNodes);
    label.replaceWith(heading);
  }
  const dataFile = sample.getAttribute("data-file");
  if (dataFile === null) throw new Error("Sample data-file is missing");
  return `### ${heading} {file=${JSON.stringify(dataFile)}}

${renderContent(content)}`;
}
