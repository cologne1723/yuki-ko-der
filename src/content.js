(() => {
  "use strict";

  const runtime = globalThis.browser?.runtime ?? globalThis.chrome?.runtime;
  function translateTextNode(node, source, target) {
    const original = node.nodeValue;
    const key = original.trim();

    if (key !== source || target === source) {
      return;
    }

    const leadingWhitespace = original.match(/^\s*/u)?.[0] ?? "";
    const trailingWhitespace = original.match(/\s*$/u)?.[0] ?? "";
    node.nodeValue = `${leadingWhitespace}${target}${trailingWhitespace}`;
  }

  function translateEntry({ selector, source, target }) {
    for (const element of document.querySelectorAll(selector)) {
      for (const node of element.childNodes) {
        if (node.nodeType === Node.TEXT_NODE) {
          translateTextNode(node, source, target);
        }
      }
    }
  }

  async function loadTranslations() {
    const url = runtime.getURL("translations/ko.json");
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Translation dictionary request failed: ${response.status}`);
    }

    const dictionary = await response.json();
    return dictionary.translations;
  }

  async function start() {
    if (!runtime || !document.body) {
      return;
    }

    const translations = await loadTranslations();
    translations.forEach(translateEntry);
  }

  start().catch((error) => {
    console.error("[yukicoder-ko] Translation failed", error);
  });
})();
