export type TranslationVariable =
  | string
  | {
      pattern: string;
      values?: Record<string, string>;
    };

export interface TranslationEntry {
  selector: string;
  source: string;
  target: string;
  attribute?: string;
  preserveBoundaryWhitespace?: boolean;
  variables?: Record<string, TranslationVariable>;
}

export interface TranslationDictionary {
  translations: TranslationEntry[];
}

const PLACEHOLDER_PATTERN = /\{([A-Za-z][A-Za-z0-9_]*)\}/gu;

export function normalizeTranslationText(value: string): string {
  return value.replace(/\s+/gu, " ").trim();
}

function escapeRegularExpression(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
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
      throw new Error(`Missing captured translation variable: ${name}`);
    }
    const variable = variables[name];
    return typeof variable === "object"
      ? (variable.values?.[captured] ?? captured)
      : captured;
  });
}

export function translatedValue(
  value: string,
  entry: TranslationEntry,
): string | undefined {
  const key = normalizeTranslationText(value);
  const source = normalizeTranslationText(entry.source);
  const target = entry.target.replace(/^📝 /u, "");
  return entry.variables
    ? translateTemplate(key, source, target, entry.variables)
    : key === source
      ? target
      : undefined;
}

export function translateTextNode(
  node: Text,
  entry: TranslationEntry,
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
  return true;
}

export function translateElementAttribute(
  element: Element,
  entry: TranslationEntry,
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
  element.setAttribute(entry.attribute, translated);
  return true;
}

export function applyTranslationEntry(
  document: Document,
  entry: TranslationEntry,
): void {
  for (const element of document.querySelectorAll(entry.selector)) {
    if (entry.attribute !== undefined) {
      translateElementAttribute(element, entry);
      continue;
    }
    for (const node of element.childNodes) {
      if (node.nodeType === 3) {
        translateTextNode(node as Text, entry);
      }
    }
  }
}

export function applyTranslations(
  document: Document,
  translations: TranslationEntry[],
): void {
  translations.forEach((entry) => applyTranslationEntry(document, entry));
}
