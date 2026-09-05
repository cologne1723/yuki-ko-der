// @ts-nocheck -- DOM tuple types will be tightened independently of this migration.
(() => {
  "use strict";

  const PROBLEM_PATH_PATTERN = /^\/problems\/no\/(\d+)\/?$/u;
  const FORMULA_PATTERN =
    /\\\(([\s\S]*?)\\\)|\\\[([\s\S]*?)\\\]|\$\$([\s\S]*?)\$\$|\$(?!\$)([^$\n]+?)\$/gu;
  const storage = globalThis.browser?.storage ?? globalThis.chrome?.storage;

  function normalizeText(value) {
    return value.replace(/\s+/gu, " ").trim();
  }

  function canonicalFormula(source, display) {
    const ungrouped = normalizeText(source).replaceAll("\\,", "");
    const normalized = ungrouped === "Yi" ? "Y_i" : ungrouped;
    return display ? `\\[${normalized}\\]` : `\\(${normalized}\\)`;
  }

  function canonicalMatchedFormula(
    inlineParentheses,
    displayBrackets,
    displayDollars,
    inlineDollars,
  ) {
    const display =
      displayBrackets !== undefined || displayDollars !== undefined;
    return canonicalFormula(
      inlineParentheses ?? displayBrackets ?? displayDollars ?? inlineDollars,
      display,
    );
  }

  function formulaSource(element, display = false) {
    const annotation = element.querySelector(
      "annotation[encoding='application/x-tex']",
    );
    return annotation
      ? canonicalFormula(annotation.textContent, display)
      : undefined;
  }

  function canonicalizeFormulaWhitespace(value) {
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

  function shouldIgnoreRuntimeElement(element) {
    if (element.matches("script, style, .copy-sample-input")) {
      return true;
    }

    const sample = element.closest(".sample[data-file]");
    return Boolean(
      sample &&
      element.tagName === "SPAN" &&
      element.parentElement?.matches("h5") &&
      normalizeText(element.textContent) === `(${sample.dataset.file})`,
    );
  }

  function sortedAttributes(element) {
    return [...element.attributes]
      .map(({ name, value }) => [name, value])
      .sort(([left], [right]) => left.localeCompare(right));
  }

  function semanticNode(node, inPreformattedElement = false) {
    if (node.nodeType === Node.TEXT_NODE) {
      const value = inPreformattedElement
        ? node.nodeValue.replace(/\r\n?/gu, "\n")
        : node.nodeValue;
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
          ? (formulaSource(formula, true) ?? node.textContent)
          : node.textContent,
      ];
    }
    if (node.classList.contains("katex")) {
      return ["inline", formulaSource(node) ?? node.textContent];
    }

    const tag = node.tagName.toLowerCase();
    const preformatted =
      inPreformattedElement || tag === "pre" || tag === "code";
    const children = [];
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

  function semanticStatement(elements) {
    return JSON.stringify(elements.map((element) => semanticNode(element)));
  }

  function structuralNode(node, inPreformattedElement = false) {
    if (node.nodeType === Node.TEXT_NODE) {
      if (inPreformattedElement) {
        return [
          "pre",
          canonicalizeFormulaWhitespace(
            node.nodeValue.replace(/\r\n?/gu, "\n"),
          ).replace(/\n$/u, ""),
        ];
      }
      const formulas = [...node.nodeValue.matchAll(FORMULA_PATTERN)].map(
        (match) => canonicalMatchedFormula(...match.slice(1, 5)),
      );
      return formulas.length > 0 ? ["formulas", formulas] : undefined;
    }

    if (
      node.nodeType !== Node.ELEMENT_NODE ||
      shouldIgnoreRuntimeElement(node)
    ) {
      return undefined;
    }
    if (node.classList.contains("katex-display")) {
      const formula = node.querySelector(".katex");
      return ["formulas", [formula ? formulaSource(formula, true) : ""]];
    }
    if (node.classList.contains("katex")) {
      return ["formulas", [formulaSource(node) ?? ""]];
    }

    const tag = node.tagName.toLowerCase();
    if (tag === "br") return undefined;
    const preformatted =
      inPreformattedElement || tag === "pre" || tag === "code";
    const children = [];
    for (const child of node.childNodes) {
      const structuralChild = structuralNode(child, preformatted);
      if (!structuralChild) {
        continue;
      }
      const previous = children.at(-1);
      if (previous?.[0] === "formulas" && structuralChild[0] === "formulas") {
        previous[1].push(...structuralChild[1]);
      } else {
        children.push(structuralChild);
      }
    }
    for (const child of children) {
      if (child[0] === "formulas") child[1].sort();
    }
    return ["element", tag, sortedAttributes(node), children];
  }

  function structuralStatement(elements) {
    return JSON.stringify(elements.map((element) => structuralNode(element)));
  }

  function parseHtml(html) {
    return new DOMParser().parseFromString(html, "text/html");
  }

  async function sha256Hex(bytes) {
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    return [...new Uint8Array(digest)]
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
  }

  function storageGet(key) {
    return storage?.local
      ? Promise.resolve(storage.local.get(key)).then((result) => result?.[key])
      : Promise.resolve(undefined);
  }

  function storageSet(key, value) {
    return storage?.local
      ? Promise.resolve(storage.local.set({ [key]: value }))
      : Promise.resolve();
  }

  function parseTranslationDocument(html, problemNo, pageProblemId) {
    const parsed = parseHtml(html);
    const root = parsed.querySelector("main[data-yukicoder-ko-problem]");
    const title = root?.querySelector(":scope > h3");
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

  async function loadTranslationDocument(baseUrl, problemNo, pageProblemId) {
    const normalizedBaseUrl = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
    const url = new URL(`ko/problems/${problemNo}.html`, normalizedBaseUrl)
      .href;
    const cacheKey = `problem-translation-html:ko:${problemNo}`;
    let removed = false;
    try {
      const response = await fetch(url, {
        cache: "no-cache",
        credentials: "omit",
      });
      if (response.status === 404 || response.status === 410) {
        // A removed translation must not continue to display from local cache.
        removed = true;
        await storage?.local?.remove(cacheKey);
        return undefined;
      }
      if (!response.ok) {
        throw new Error(`remote translation HTML returned ${response.status}`);
      }
      const html = await response.text();
      const translation = parseTranslationDocument(
        html,
        problemNo,
        pageProblemId,
      );
      await storageSet(cacheKey, html);
      return translation;
    } catch (error) {
      if (removed) throw error;
      const cached = await storageGet(cacheKey);
      if (cached) {
        return parseTranslationDocument(cached, problemNo, pageProblemId);
      }
      throw error;
    }
  }

  async function verifyCanonicalSource(translation) {
    const { problemId, problemNo, sourceTitle, sourceHtmlSha256 } =
      translation.root.dataset;
    const options = { cache: "no-store", credentials: "omit" };
    const [metadataResponse, htmlResponse] = await Promise.all([
      fetch(new URL(`/api/v1/problems/${problemId}`, location.origin), options),
      fetch(
        new URL(`/api/v1/problems/${problemId}/html`, location.origin),
        options,
      ),
    ]);
    if (!metadataResponse.ok || !htmlResponse.ok) {
      throw new Error("Canonical problem source request failed");
    }

    const [metadata, htmlBytes] = await Promise.all([
      metadataResponse.json(),
      htmlResponse.arrayBuffer(),
    ]);
    if (
      metadata.No !== Number(problemNo) ||
      metadata.ProblemId !== Number(problemId) ||
      metadata.Title !== sourceTitle
    ) {
      throw new Error("Canonical problem metadata changed");
    }
    if ((await sha256Hex(htmlBytes)) !== sourceHtmlSha256) {
      throw new Error("Canonical problem statement changed");
    }
    return new TextDecoder().decode(htmlBytes);
  }

  function collectRenderedFormulas(elements) {
    const formulas = new Map();
    function visit(element) {
      if (element.classList.contains("katex-display")) {
        const katex = element.querySelector(".katex");
        const source = katex && formulaSource(katex, true);
        if (source) {
          formulas.set(source, [
            ...(formulas.get(source) ?? []),
            element.cloneNode(true),
          ]);
        }
        return;
      }
      if (element.classList.contains("katex")) {
        const source = formulaSource(element);
        if (source) {
          formulas.set(source, [
            ...(formulas.get(source) ?? []),
            element.cloneNode(true),
          ]);
        }
        return;
      }
      for (const child of element.children) {
        visit(child);
      }
    }
    elements.forEach(visit);
    return formulas;
  }

  function installRenderedFormulas(blocks, renderedFormulas) {
    const textNodes = [];
    for (const block of blocks) {
      const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
      while (walker.nextNode()) {
        if (!walker.currentNode.parentElement?.closest("pre, code")) {
          textNodes.push(walker.currentNode);
        }
      }
    }

    for (const textNode of textNodes) {
      const matches = [...textNode.nodeValue.matchAll(FORMULA_PATTERN)];
      if (matches.length === 0) {
        continue;
      }
      const fragment = document.createDocumentFragment();
      let sourceIndex = 0;
      for (const match of matches) {
        fragment.append(
          document.createTextNode(
            textNode.nodeValue.slice(sourceIndex, match.index),
          ),
        );
        const source = canonicalMatchedFormula(...match.slice(1, 5));
        const candidates = renderedFormulas.get(source);
        if (!candidates?.length) {
          throw new Error(`Rendered formula is unavailable: ${source}`);
        }
        fragment.append(candidates.shift());
        sourceIndex = match.index + match[0].length;
      }
      fragment.append(
        document.createTextNode(textNode.nodeValue.slice(sourceIndex)),
      );
      textNode.replaceWith(fragment);
    }

    if (
      [...renderedFormulas.values()].some((candidates) => candidates.length > 0)
    ) {
      throw new Error("Translated HTML did not consume every rendered formula");
    }
  }

  function prepareReplacement(
    translation,
    liveTitle,
    liveBlocks,
    canonicalBlocks,
  ) {
    if (semanticStatement(canonicalBlocks) !== semanticStatement(liveBlocks)) {
      throw new Error(
        "Displayed problem statement differs from canonical source",
      );
    }
    if (
      structuralStatement(canonicalBlocks) !==
      structuralStatement(translation.blocks)
    ) {
      throw new Error(
        "Translated HTML changed protected problem structure or data",
      );
    }

    const importedBlocks = translation.blocks.map((block) =>
      document.importNode(block, true),
    );
    const renderedFormulas = collectRenderedFormulas(liveBlocks);
    const canonicalHasFormulas =
      structuralStatement(canonicalBlocks).includes('"formulas"');
    if (canonicalHasFormulas) {
      if (renderedFormulas.size === 0) {
        throw new Error("The live problem formulas have not been rendered");
      }
      installRenderedFormulas(importedBlocks, renderedFormulas);
    }

    return () => {
      liveTitle.textContent = translation.title.textContent;
      liveBlocks.forEach((block, index) =>
        block.replaceWith(importedBlocks[index]),
      );
    };
  }

  async function translateProblem() {
    const pathMatch = location.pathname.match(PROBLEM_PATH_PATTERN);
    const baseUrl =
      globalThis.YUKICODER_KO_CONFIG?.problemTranslationBaseUrl?.trim();
    if (!pathMatch || !baseUrl) {
      return;
    }

    const problemNo = Number(pathMatch[1]);
    const content = document.querySelector("#content[data-problem-id]");
    const liveTitle = content?.querySelector(":scope > h3");
    const pageProblemId = content?.dataset.problemId;
    const liveBlocks = content
      ? [...content.querySelectorAll(":scope > .block")]
      : [];
    if (!pageProblemId || !liveTitle || liveBlocks.length === 0) {
      throw new Error("Problem page structure is unavailable");
    }

    const translation = await loadTranslationDocument(
      baseUrl,
      problemNo,
      pageProblemId,
    );
    if (!translation) return;
    const canonicalHtml = await verifyCanonicalSource(translation);
    const canonicalDocument = parseHtml(canonicalHtml);
    const canonicalBlocks = [
      ...canonicalDocument.body.querySelectorAll(":scope > .block"),
    ];
    const apply = prepareReplacement(
      translation,
      liveTitle,
      liveBlocks,
      canonicalBlocks,
    );
    apply();
  }

  const testApi = {
    canonicalFormula,
    loadTranslationDocument,
    parseHtml,
    parseTranslationDocument,
    prepareReplacement,
    semanticStatement,
    sha256Hex,
    structuralStatement,
  };
  globalThis.yukicoderProblemTranslations = Object.freeze({
    translateProblem,
    testApi,
  });
})();

export {};
