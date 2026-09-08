import { isJapaneseCandidate } from "./detection-text.ts";
import { Candidate } from "./detection-types.ts";
import type { TextKind } from "./types.ts";

export function isVisible(
  node: Node,
  originals?: WeakMap<Node, Node>,
): boolean {
  const original = originals?.get(node) ?? node;
  let element =
    original.nodeType === 1 ? (original as Element) : original.parentElement;
  if (
    !element ||
    element.closest(
      "textarea,[contenteditable]:not([contenteditable=false]),input[type=password]",
    )
  )
    return false;
  const view = element.ownerDocument.defaultView;
  for (; element; element = element.parentElement) {
    const style = view?.getComputedStyle(element);
    if (
      element.hasAttribute("hidden") ||
      style?.display === "none" ||
      style?.visibility === "hidden" ||
      style?.visibility === "collapse" ||
      style?.opacity === "0" ||
      style?.contentVisibility === "hidden"
    )
      return false;
    if (
      element.tagName === "DETAILS" &&
      !element.hasAttribute("open") &&
      !element.querySelector(":scope > summary")?.contains(original)
    )
      return false;
  }
  return true;
}

export function collectCandidates(
  root: Document | Element,
  originals?: WeakMap<Node, Node>,
  visibility?: Map<Element, boolean>,
): Candidate[] {
  const visible = (node: Node) => {
    const result = isVisible(node, originals);
    const original = originals?.get(node) ?? node;
    const element =
      original.nodeType === 1 ? (original as Element) : original.parentElement;
    if (element) visibility?.set(element, result);
    return result;
  };
  const candidates: Candidate[] = [];
  const owner = root.nodeType === 9 ? (root as Document) : root.ownerDocument;
  const walker = owner!.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node: Node | null;
  while ((node = walker.nextNode())) {
    const text = node.textContent ?? "";
    const parent = node.parentElement;
    if (
      !text ||
      !parent ||
      ["SCRIPT", "STYLE", "NOSCRIPT", "TEMPLATE"].includes(parent.tagName)
    )
      continue;
    if (isJapaneseCandidate(text) && visible(node))
      candidates.push({ text, kind: "text", node: node as Text });
  }
  const elements =
    root.nodeType === 9
      ? root.querySelectorAll("*")
      : [root as Element, ...root.querySelectorAll("*")];
  for (const element of elements) {
    const attrs: Array<[TextKind, string]> = [
      ["title", "title"],
      ["alt", "alt"],
      ["aria-label", "aria-label"],
      ["placeholder", "placeholder"],
    ];
    for (const [kind, attr] of attrs) {
      const value = element.getAttribute(attr) ?? "";
      if (value && isJapaneseCandidate(value) && visible(element))
        candidates.push({ text: value, kind, node: element, attribute: attr });
    }
    if (
      element instanceof HTMLButtonElement ||
      element.matches(
        "button,[role=button],input[type=button],input[type=submit],input[type=reset]",
      )
    ) {
      const attribute = element.tagName === "INPUT" ? "value" : undefined;
      const value = attribute
        ? (element.getAttribute(attribute) ?? "")
        : (element.textContent ?? "");
      if (value && isJapaneseCandidate(value) && visible(element)) {
        // An aggregate locator resolves the entire button text. When part of
        // that text is hidden, retain its visible text-node observations only.
        const textNodes = owner!.createTreeWalker(
          element,
          NodeFilter.SHOW_TEXT,
        );
        let child: Node | null;
        let fullyVisible = true;
        while ((child = textNodes.nextNode()))
          if (child.textContent?.trim() && !visible(child))
            fullyVisible = false;
        if (fullyVisible)
          candidates.push({
            text: value,
            kind: "button-label",
            node: element,
            attribute,
          });
      }
    }
  }
  return candidates;
}
