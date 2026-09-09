import { escapeRegExp as escapeRegularExpression } from "./text-utils.ts";
import type {
  translationDictionarySchema,
  translationEntrySchema,
  translationVariableSchema,
} from "./translation-schema.ts";
import type { z } from "./validation.ts";
export type TranslationVariable = z.infer<typeof translationVariableSchema>;
export type TranslationEntry = z.infer<typeof translationEntrySchema>;
export type TranslationDictionary = z.infer<typeof translationDictionarySchema>;

export interface TranslationScope {
  querySelectorAll<E extends Element = Element>(selector: string): Iterable<E>;
}

// Keep the original nodes and values, including site-owned event handlers.
export class TranslationHistory {
  private changes = new Map<
    Node,
    Map<string, { before: string; after: string }>
  >();

  record(node: Node, key: string, before: string, after: string) {
    const entries = this.changes.get(node) ?? new Map();
    const previous = entries.get(key);
    entries.set(key, {
      before: previous?.after === before ? previous.before : before,
      after,
    });
    this.changes.set(node, entries);
  }

  restoreDetached() {
    this.restoreWhere((node) => !node.isConnected);
  }

  restoreWithin(roots: Iterable<Node>) {
    const containers = [...roots];
    this.restoreWhere((node) => containers.some((root) => root.contains(node)));
  }

  restore() {
    this.restoreWhere(() => true);
  }

  private restoreWhere(include: (node: Node) => boolean) {
    for (const [node, entries] of this.changes) {
      if (!include(node)) continue;
      for (const [key, { before, after }] of entries) {
        if (key === "") {
          if (node.nodeValue === after) node.nodeValue = before;
        } else if ((node as Element).getAttribute(key) === after) {
          (node as Element).setAttribute(key, before);
        }
      }
      this.changes.delete(node);
    }
  }
}

const PLACEHOLDER_PATTERN = /\{([A-Za-z][A-Za-z0-9_]*)\}/gu;

export function normalizeTranslationText(value: string): string {
  return value.replace(/\s+/gu, " ").trim();
}

export function translateTemplate(
  value: string,
  source: string,
  target: string,
  variables: Record<string, TranslationVariable>,
): string | undefined {
  let sourceIndex = 0;
  let regularExpression = "^";

  for (const placeholder of source.matchAll(PLACEHOLDER_PATTERN)) {
    const [token, name] = placeholder;
    const variable = variables[name];
    const variablePattern =
      typeof variable === "string" ? variable : variable?.pattern;

    if (variablePattern === undefined) {
      throw new Error(`Missing pattern for translation variable: ${name}`);
    }

    regularExpression += escapeRegularExpression(
      source.slice(sourceIndex, placeholder.index),
    );
    regularExpression += `(?<${name}>${variablePattern})`;
    sourceIndex = (placeholder.index ?? 0) + token.length;
  }

  regularExpression += escapeRegularExpression(source.slice(sourceIndex));
  const match = value.match(new RegExp(`${regularExpression}$`, "u"));
  if (!match) return undefined;

  return target.replace(PLACEHOLDER_PATTERN, (_token, name: string) => {
    const captured = match.groups?.[name];
    if (captured === undefined) {
      // Keep authoring previews usable while a target is being edited. Build
      // validation rejects unknown or missing placeholders; runtime matching
      // should preserve an incomplete token instead of breaking the page.
      return _token;
    }
    const variable = variables[name];
    if (
      typeof variable === "object" &&
      variable.values &&
      Object.prototype.hasOwnProperty.call(variable.values, captured)
    ) {
      return variable.values[captured] as string;
    }
    return captured;
  });
}

export function translatedValue(
  value: string,
  entry: TranslationEntry,
): string | undefined {
  const key = normalizeTranslationText(value);
  const source = normalizeTranslationText(entry.source);
  const target = entry.target;
  return entry.variables
    ? translateTemplate(key, source, target, entry.variables)
    : key === source
      ? target
      : undefined;
}

export function translateTextNode(
  node: Text,
  entry: TranslationEntry,
  history?: TranslationHistory,
): boolean {
  const original = node.nodeValue ?? "";
  const translated = translatedValue(original, entry);
  if (
    translated === undefined ||
    translated === normalizeTranslationText(original)
  ) {
    return false;
  }

  if (entry.preserveBoundaryWhitespace === false) {
    node.nodeValue = translated;
  } else {
    const leadingWhitespace = original.match(/^\s*/u)?.[0] ?? "";
    const trailingWhitespace = original.match(/\s*$/u)?.[0] ?? "";
    node.nodeValue = `${leadingWhitespace}${translated}${trailingWhitespace}`;
  }
  history?.record(node, "", original, node.nodeValue ?? "");
  return true;
}

export function translateElementAttribute(
  element: Element,
  entry: TranslationEntry,
  history?: TranslationHistory,
): boolean {
  if (entry.attribute === undefined) return false;
  const original = element.getAttribute(entry.attribute);
  if (original === null) return false;
  const translated = translatedValue(original, entry);
  if (
    translated === undefined ||
    translated === normalizeTranslationText(original)
  ) {
    return false;
  }
  history?.record(element, entry.attribute, original, translated);
  element.setAttribute(entry.attribute, translated);
  return true;
}

export function applyTranslationEntry(
  document: Document,
  entry: TranslationEntry,
  history?: TranslationHistory,
  scope: TranslationScope = document,
): void {
  for (const element of scope.querySelectorAll(entry.selector)) {
    if (entry.attribute !== undefined) {
      translateElementAttribute(element, entry, history);
      continue;
    }
    for (const node of element.childNodes) {
      if (node.nodeType === 3) {
        translateTextNode(node as Text, entry, history);
      }
    }
  }
}

export function applyTranslations(
  document: Document,
  translations: TranslationEntry[],
  history?: TranslationHistory,
  scope: TranslationScope = document,
): void {
  translations.forEach((entry) =>
    applyTranslationEntry(document, entry, history, scope),
  );
}
