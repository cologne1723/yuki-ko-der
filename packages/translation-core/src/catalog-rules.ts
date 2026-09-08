import type { TranslationVariable } from "./fixed-translations.ts";
import { escapeRegExp } from "./text-utils.ts";
import type {
  Catalog,
  Message,
  Usage,
  UsageDictionary,
} from "./translation-catalog.ts";
const PLACEHOLDER_PATTERN = /\{([A-Za-z][A-Za-z0-9_]*)\}/gu;
function placeholderNames(value: string): string[] {
  return [...value.matchAll(PLACEHOLDER_PATTERN)].map((match) => match[1]);
}
export function validateVariables(
  source: string,
  target: string,
  variables: Record<string, TranslationVariable> | undefined,
  context: string,
): void {
  const sourceNames = placeholderNames(source).sort();
  const targetNames = placeholderNames(target).sort();
  if (JSON.stringify(sourceNames) !== JSON.stringify(targetNames))
    throw new Error(`Placeholder names differ: ${context}`);
  if (!variables) {
    if (sourceNames.length)
      throw new Error(`Missing variable definitions: ${context}`);
    return;
  }
  const names = Object.keys(variables).sort();
  if (JSON.stringify(names) !== JSON.stringify([...new Set(sourceNames)]))
    throw new Error(
      `Variable definitions do not match placeholders: ${context}`,
    );
  for (const [name, variable] of Object.entries(variables)) {
    const pattern = typeof variable === "string" ? variable : variable.pattern;
    try {
      new RegExp(pattern, "u");
    } catch {
      throw new Error(`Invalid variable pattern: ${context}: ${name}`);
    }
  }
  let expression = "^";
  let sourceIndex = 0;
  for (const placeholder of source.matchAll(PLACEHOLDER_PATTERN)) {
    const [token, name] = placeholder;
    const variable = variables[name];
    const pattern = typeof variable === "string" ? variable : variable.pattern;
    expression += escapeRegExp(source.slice(sourceIndex, placeholder.index));
    expression += `(?<${name}>${pattern})`;
    sourceIndex = placeholder.index + token.length;
  }
  expression += `${escapeRegExp(source.slice(sourceIndex))}$`;
  try {
    new RegExp(expression, "u");
  } catch {
    throw new Error(`Invalid combined translation pattern: ${context}`);
  }
}

export function messageTarget(
  message: Message,
  usage: Usage,
  context: string,
): string {
  if (usage.variant === undefined) return message.target;
  if (
    !Number.isSafeInteger(usage.variant) ||
    usage.variant < 0 ||
    !Array.isArray(message.alternatives) ||
    typeof message.alternatives[usage.variant]?.target !== "string"
  )
    throw new Error(`Invalid translation variant: ${context}`);
  return message.alternatives[usage.variant].target;
}

export function validateCatalogData(
  catalog: Catalog,
  dictionaries: Record<string, UsageDictionary>,
) {
  const ids = new Set<string>();
  const meanings = new Set<string>();
  const used = new Set<string>();
  for (const m of catalog.messages) {
    if (ids.has(m.id)) throw new Error(`Duplicate message ID: ${m.id}`);
    ids.add(m.id);
    const key = JSON.stringify([
      m.source.replace(/\s+/gu, " ").trim(),
      m.meaning ?? "",
    ]);
    if (meanings.has(key))
      throw new Error(`Duplicate translation meaning: ${m.source}`);
    meanings.add(key);
    if (
      typeof m.source !== "string" ||
      typeof m.target !== "string" ||
      !m.source ||
      !m.target
    )
      throw new Error(`Empty message: ${m.id}`);
    validateVariables(m.source, m.target, m.variables, m.id);
    for (const [index, variant] of (m.alternatives ?? []).entries()) {
      const target = variant?.target;
      if (typeof target !== "string" || !target)
        throw new Error(`Empty translation variant: ${m.id}: ${index}`);
      validateVariables(
        m.source,
        target,
        m.variables,
        `${m.id}: variant ${index}`,
      );
    }
  }
  for (const [file, d] of Object.entries(dictionaries))
    for (const u of d.translations) {
      if (!("ref" in u) || "source" in u || "target" in u)
        throw new Error(`Inline translation forbidden: ${file}`);
      if (!ids.has(u.ref))
        throw new Error(`Unknown reference: ${file}: ${u.ref}`);
      const message = catalog.messages.find((item) => item.id === u.ref)!;
      messageTarget(message, u, `${file}: ${u.ref}`);
      used.add(u.ref);
    }
  for (const id of ids)
    if (!used.has(id)) throw new Error(`Unused message: ${id}`);
}
