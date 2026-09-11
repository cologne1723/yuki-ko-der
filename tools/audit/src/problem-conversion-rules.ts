import { problemTexClasses } from "translation-core/problem-markdown";
import TurndownService from "turndown";

export function exactPreText(element: Element): string {
  const text = (node: Node): string => {
    if (node.nodeType === 3 || node.nodeType === 4) return node.nodeValue ?? "";
    if (node.nodeType === 1 && (node as Element).tagName === "BR") return "\n";
    return Array.from(node.childNodes).map(text).join("");
  };
  return text(element).replace(/\r\n?/gu, "\n");
}

export function texClassName(element: Element): string {
  return problemTexClasses
    .filter((name) => element.classList.contains(name))
    .join(" ");
}

function texContainer(content: string, element: Element): string {
  const className = texClassName(element);
  if (className) {
    const length =
      Math.max(
        2,
        ...[...content.matchAll(/^\s*(:{3,})/gmu)].map(
          (match) => match[1].length,
        ),
      ) + 1;
    const fence = ":".repeat(length);
    content = `${fence} ${className}\n\n${content}\n\n${fence}`;
  }
  return content;
}

function preformatted(element: Element): string {
  const content = exactPreText(element);
  const code = element.querySelector(":scope > code");
  if (
    code &&
    (element.childNodes.length !== 1 ||
      [...code.children].some((child) => child.tagName !== "BR"))
  )
    throw new Error("Unsupported mixed pre/code content");
  if (!code && [...element.children].some((child) => child.tagName !== "BR"))
    throw new Error("Unsupported markup inside pre");
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
  const info = [
    "text",
    ...(code ? ['html="code"'] : []),
    ...(texClassName(element) ? [`class="${texClassName(element)}"`] : []),
    ...(code && texClassName(code)
      ? [`code-class="${texClassName(code)}"`]
      : []),
    ...(content && !content.endsWith("\n") ? ['eol="none"'] : []),
  ].join(" ");
  return `${fence}${info}\n${content}${content && !content.endsWith("\n") ? "\n" : ""}${fence}`;
}

const converter = new TurndownService({
  headingStyle: "atx",
  codeBlockStyle: "fenced",
  emDelimiter: "*",
  blankReplacement: (_content, node) => {
    const element = node as unknown as Element;
    if (element.tagName === "PRE") return `\n\n${preformatted(element)}\n\n`;
    if (element.nodeType === 1 && texClassName(element))
      return `\n\n${texContainer("", element)}\n\n`;
    return (node as HTMLElement & { isBlock: boolean }).isBlock ? "\n\n" : "";
  },
});
converter.addRule("tex-scope", {
  filter: (node) =>
    ["DIV", "P"].includes(node.nodeName) &&
    !!texClassName(node as unknown as Element),
  replacement: (content, node) =>
    `\n\n${texContainer(content.trim(), node as unknown as Element)}\n\n`,
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
            .turndown(cell as HTMLElement)
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
    /\\\([\s\S]*?\\\)|\\\[[\s\S]*?\\\]|\$\$[\s\S]*?\$\$|\$[^$]+?\$/gu;
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
      texClassName(node) &&
      !["DIV", "P", "PRE", "CODE"].includes(node.tagName)
    )
      throw new Error(
        `Unsupported TeX scope on <${node.tagName.toLowerCase()}>`,
      );
    if (
      node.tagName === "CODE" &&
      texClassName(node) &&
      node.parentElement?.tagName !== "PRE"
    )
      throw new Error("Unsupported TeX scope on inline code");
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
  // Keep the supplied standards DOM: Turndown's string fallback uses a smaller
  // DOM implementation without classList/children, and reparsing PRE can eat LF.
  const wrapper = element.ownerDocument.createElement("div");
  wrapper.append(element.cloneNode(true));
  return converter.turndown(wrapper);
}

// Fail closed when conversion would lose CODE skipping or explicit TeX scopes.
// Prose whitespace/layout can change, but PRE and CODE text must stay exact.
export function conversionSemantics(element: Element): unknown {
  const scopeText = (node: Node): string =>
    node.nodeType === 3
      ? (node.nodeValue ?? "").replace(/\s+/gu, " ").trim()
      : Array.from(node.childNodes).map(scopeText).filter(Boolean).join(" ");
  const lineage = (node: Element): string[] => {
    const names: string[] = [];
    for (
      let current: Element | null = node;
      current;
      current = current.parentElement
    ) {
      if (texClassName(current)) names.unshift(texClassName(current));
    }
    return names;
  };
  return {
    pre: [...element.querySelectorAll("pre")].map((pre) => ({
      text: exactPreText(pre),
      code: !!pre.querySelector(":scope > code"),
      scope: lineage(pre),
    })),
    code: [...element.querySelectorAll("code")].map((code) => ({
      text: exactPreText(code),
      scope: lineage(code),
    })),
    scopes: [element, ...element.querySelectorAll("*")]
      .filter(texClassName)
      .map((node) => ({
        className: texClassName(node),
        text: scopeText(node),
      })),
  };
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
