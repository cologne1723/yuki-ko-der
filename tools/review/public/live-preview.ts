import {
  translatedValue,
  type TranslationEntry,
} from "translation-core/fixed-translations";
export interface Binding {
  path: number[];
  original: string;
  entry: TranslationEntry;
}
export function captureBindings(
  doc: Document,
  entries: TranslationEntry[],
): Binding[] {
  const bindings: Binding[] = [];
  const seen = new Map<Node, Set<string>>();
  for (const entry of entries)
    for (const element of doc.querySelectorAll(entry.selector)) {
      const nodes = entry.attribute
        ? [element]
        : [...element.childNodes].filter((n) => n.nodeType === 3);
      for (const node of nodes) {
        const original = entry.attribute
          ? element.getAttribute(entry.attribute)
          : node.nodeValue;
        if (original === null || translatedValue(original, entry) === undefined)
          continue;
        const attribute = entry.attribute ?? "";
        if (seen.get(node)?.has(attribute)) continue;
        if (!seen.has(node)) seen.set(node, new Set());
        seen.get(node)!.add(attribute);
        const path: number[] = [];
        let current: Node = node;
        while (current !== doc.documentElement && current.parentNode) {
          path.unshift(
            Array.prototype.indexOf.call(
              current.parentNode.childNodes,
              current,
            ),
          );
          current = current.parentNode;
        }
        if (current === doc.documentElement)
          bindings.push({ path, original, entry });
      }
    }
  return bindings;
}
export function updateBindings(
  doc: Document,
  bindings: Binding[],
  target: string,
) {
  for (const binding of bindings) {
    let node: Node | undefined = doc.documentElement;
    for (const index of binding.path) node = node?.childNodes[index];
    if (!node) continue;
    const value = translatedValue(binding.original, {
      ...binding.entry,
      target,
    });
    if (value === undefined) continue;
    if (binding.entry.attribute)
      (node as Element).setAttribute(binding.entry.attribute, value);
    else
      node.nodeValue =
        binding.entry.preserveBoundaryWhitespace === false
          ? value
          : `${binding.original.match(/^\s*/u)?.[0] ?? ""}${value}${binding.original.match(/\s*$/u)?.[0] ?? ""}`;
  }
}
