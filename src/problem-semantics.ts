export function createProblemSemantics(Node: typeof globalThis.Node) {
  const FORMULA_PATTERN =
    /\\\(([\s\S]*?)\\\)|\\\[([\s\S]*?)\\\]|\$\$([\s\S]*?)\$\$|\$(?!\$)([^$\n]+?)\$/gu;

  function normalizeText(value: string) {
    return value.replace(/\s+/gu, " ").trim();
  }

  function canonicalFormula(source: string, display: boolean) {
    const ungrouped = normalizeText(source).replaceAll("\\,", "");
    const normalized = ungrouped === "Yi" ? "Y_i" : ungrouped;
    return display ? `\\[${normalized}\\]` : `\\(${normalized}\\)`;
  }

  function canonicalMatchedFormula(
    inlineParentheses: string | undefined,
    displayBrackets: string | undefined,
    displayDollars: string | undefined,
    inlineDollars: string | undefined,
  ) {
    const display =
      displayBrackets !== undefined || displayDollars !== undefined;
    return canonicalFormula(
      inlineParentheses ??
        displayBrackets ??
        displayDollars ??
        inlineDollars ??
        "",
      display,
    );
  }

  function formulaSource(element: Element, display = false) {
    const annotation = element.querySelector(
      "annotation[encoding='application/x-tex']",
    );
    return annotation
      ? canonicalFormula(annotation.textContent ?? "", display)
      : undefined;
  }

  function canonicalizeFormulaWhitespace(value: string) {
    return value.replace(
      FORMULA_PATTERN,
      (
        match,
        inlineParentheses,
        displayBrackets,
        displayDollars,
        inlineDollars,
      ) =>
        canonicalMatchedFormula(
          inlineParentheses,
          displayBrackets,
          displayDollars,
          inlineDollars,
        ),
    );
  }

  function shouldIgnoreRuntimeElement(element: Element) {
    if (element.matches("script, style, .copy-sample-input")) {
      return true;
    }

    const sample = element.closest(".sample[data-file]");
    return Boolean(
      sample &&
      element.tagName === "SPAN" &&
      element.parentElement?.matches("h5") &&
      normalizeText(element.textContent ?? "") ===
        `(${sample.getAttribute("data-file")})`,
    );
  }

  function sortedAttributes(element: Element) {
    return [...element.attributes]
      .map(({ name, value }) => [name, value])
      .sort(([left], [right]) => left.localeCompare(right));
  }

  type SemanticNode =
    ["inline", string] | ["element", string, string[][], SemanticNode[]];
  function semanticNode(
    input: Node,
    inPreformattedElement = false,
  ): SemanticNode | undefined {
    const node = input as Element & Text;
    if (node.nodeType === Node.TEXT_NODE) {
      const value = inPreformattedElement
        ? (node.nodeValue ?? "").replace(/\r\n?/gu, "\n")
        : (node.nodeValue ?? "");
      return value ? ["inline", value] : undefined;
    }

    if (
      node.nodeType !== Node.ELEMENT_NODE ||
      shouldIgnoreRuntimeElement(node)
    ) {
      return undefined;
    }

    if (node.classList.contains("katex-display")) {
      const formula = node.querySelector(".katex");
      return [
        "inline",
        formula
          ? (formulaSource(formula, true) ?? node.textContent ?? "")
          : (node.textContent ?? ""),
      ];
    }
    if (node.classList.contains("katex")) {
      return ["inline", formulaSource(node) ?? node.textContent ?? ""];
    }

    const tag = node.tagName.toLowerCase();
    const preformatted =
      inPreformattedElement || tag === "pre" || tag === "code";
    const children: SemanticNode[] = [];
    for (const child of node.childNodes) {
      const semanticChild = semanticNode(child, preformatted);
      if (!semanticChild) {
        continue;
      }
      const previous = children.at(-1);
      if (previous?.[0] === "inline" && semanticChild[0] === "inline") {
        previous[1] += semanticChild[1];
      } else {
        children.push(semanticChild);
      }
    }

    for (let index = children.length - 1; index >= 0; index -= 1) {
      if (children[index][0] !== "inline" || preformatted) {
        continue;
      }
      children[index][1] = canonicalizeFormulaWhitespace(
        normalizeText(children[index][1]),
      );
      if (!children[index][1]) {
        children.splice(index, 1);
      }
    }
    return ["element", tag, sortedAttributes(node), children];
  }

  function semanticStatement(elements: Element[]) {
    return JSON.stringify(elements.map((element) => semanticNode(element)));
  }

  return { semanticStatement, canonicalFormula };
}
