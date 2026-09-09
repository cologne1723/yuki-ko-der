import { ident, parse, walk } from "css-tree";
import type { TranslationScope } from "./fixed-translations.ts";

// Selector dependencies are parsed once. Relational selectors conservatively
// query the document; ordinary selectors inspect only the changed subtrees.
export class TranslationMutations {
  private attributes = new Set<string>();
  private globalSelectors = new Set<string>();
  private watched = new Set<string>();
  private allAttributes = false;
  private roots = new Set<Element>();
  private ancestors = new Set<Element>();
  private removed = false;

  constructor(private document: Document) {}

  watch(selectors: Iterable<string>, attributes: Iterable<string> = []) {
    for (const name of attributes) this.attributes.add(name);
    for (const selector of selectors) {
      if (this.watched.has(selector)) continue;
      this.watched.add(selector);
      try {
        walk(parse(selector, { context: "selectorList" }), (node) => {
          if (node.type === "IdSelector") this.attributes.add("id");
          if (node.type === "ClassSelector") this.attributes.add("class");
          if (node.type === "AttributeSelector") {
            const name = ident.decode(node.name.name).toLowerCase();
            if (name.includes("|")) this.allAttributes = true;
            else this.attributes.add(name);
          }
          if (
            (node.type === "Combinator" && ["+", "~"].includes(node.name)) ||
            (node.type === "PseudoClassSelector" &&
              !["is", "where", "not", "empty", "root"].includes(node.name)) ||
            node.type === "Raw"
          )
            this.globalSelectors.add(selector);
          if (node.type === "PseudoClassSelector" && node.name === "lang")
            this.attributes.add("lang");
          if (node.type === "PseudoClassSelector" && node.name === "dir")
            this.attributes.add("dir");
          if (node.type === "Raw") this.allAttributes = true;
        });
      } catch {
        this.globalSelectors.add(selector);
        this.allAttributes = true;
      }
    }
  }

  get options(): MutationObserverInit {
    return {
      childList: true,
      characterData: true,
      subtree: true,
      attributes: true,
      ...(!this.allAttributes ? { attributeFilter: [...this.attributes] } : {}),
    };
  }

  add(records: MutationRecord[]) {
    for (const record of records) {
      if (
        record.type === "attributes" &&
        !this.allAttributes &&
        !this.attributes.has(record.attributeName!)
      )
        continue;
      const element =
        record.target.nodeType === 1
          ? (record.target as Element)
          : record.target.parentElement;
      for (let ancestor = element; ancestor; ancestor = ancestor.parentElement)
        this.ancestors.add(ancestor);
      if (record.type === "attributes" && element) this.roots.add(element);
      if (record.type === "childList") {
        this.removed ||= record.removedNodes.length > 0;
        for (const node of record.addedNodes)
          if (node.nodeType === 1) this.roots.add(node as Element);
      }
    }
  }

  take(): { scope: TranslationScope; removed: boolean; changed: boolean } {
    const roots = [...this.roots].filter((root) => root.isConnected);
    const minimalRoots = roots.filter(
      (root) => !roots.some((other) => other !== root && other.contains(root)),
    );
    const ancestors = [...this.ancestors].filter((node) => node.isConnected);
    const removed = this.removed;
    this.roots.clear();
    this.ancestors.clear();
    this.removed = false;
    const document = this.document;
    const globalSelectors = this.globalSelectors;
    return {
      removed,
      changed: roots.length > 0 || ancestors.length > 0,
      scope: {
        querySelectorAll<E extends Element = Element>(selector: string): E[] {
          if (globalSelectors.has(selector))
            return [...document.querySelectorAll<E>(selector)];
          const found = new Set<Element>();
          for (const element of ancestors)
            if (element.matches(selector)) found.add(element);
          for (const root of minimalRoots) {
            if (root.matches(selector)) found.add(root);
            for (const element of root.querySelectorAll(selector))
              found.add(element);
          }
          return [...found].sort((a, b) =>
            a.compareDocumentPosition(b) & 2 ? 1 : -1,
          ) as E[];
        },
      },
    };
  }
}
