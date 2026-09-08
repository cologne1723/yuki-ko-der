import { messageTarget } from "./catalog-rules.ts";
import type { catalogSchema, messageSchema } from "./catalog-schema.ts";
import { catalogDataSchema } from "./catalog-schema.ts";
import type {
  TranslationDictionary,
  TranslationEntry,
} from "./fixed-translations.ts";
import type {
  readableDictionarySchema,
  readableUsageSchema,
} from "./translation-schema.ts";
import type { z } from "./validation.ts";
export type Message = z.infer<typeof messageSchema>;
export type TranslationVariant = Pick<Message, "target" | "reviewStatus">;
export type Catalog = z.infer<typeof catalogSchema>;
export type Usage = z.infer<typeof readableUsageSchema>;
export type UsageDictionary = z.infer<typeof readableDictionarySchema>;

const PLACEHOLDER_PATTERN = /\{([A-Za-z][A-Za-z0-9_]*)\}/gu;

type SelectorDocument = Pick<Document, "querySelector">;

function placeholderNames(value: string): string[] {
  return [...value.matchAll(PLACEHOLDER_PATTERN)].map((match) => match[1]);
}

function validateSelector(
  selector: unknown,
  context: string,
  selectorDocument: SelectorDocument | undefined,
): void {
  if (typeof selector !== "string" || !selector.trim())
    throw new Error(`Empty selector: ${context}`);
  if (!selectorDocument)
    throw new Error(`Selector validation requires a DOM document: ${context}`);
  try {
    selectorDocument.querySelector(selector);
  } catch {
    throw new Error(`Invalid selector: ${context}: ${selector}`);
  }
}

export function resolveDictionary(
  dictionary: UsageDictionary,
  catalog: Catalog,
  selectorDocument: SelectorDocument | undefined = globalThis.document,
): TranslationDictionary {
  const messages = new Map(catalog.messages.map((m) => [m.id, m]));
  return {
    translations: dictionary.translations.map((usage) => {
      if (!("ref" in usage)) return usage;
      const message = messages.get(usage.ref);
      if (!message)
        throw new Error(`Unknown translation reference: ${usage.ref}`);
      validateSelector(usage.selector, usage.ref, selectorDocument);
      return {
        selector: usage.selector,
        attribute: usage.attribute as TranslationEntry["attribute"],
        preserveBoundaryWhitespace: usage.preserveBoundaryWhitespace,
        source: message.source,
        target: messageTarget(message, usage, usage.ref),
        reviewStatus:
          (usage.variant === undefined
            ? message
            : message.alternatives?.[usage.variant]
          )?.reviewStatus ?? "unreviewed",
        variables: message.variables,
        messageId: message.id,
        ...(usage.variant === undefined ? {} : { variant: usage.variant }),
      };
    }),
  };
}
export function validateCatalog(
  catalog: Catalog,
  dictionaries: Record<string, UsageDictionary>,
  selectorDocument: SelectorDocument | undefined = globalThis.document,
) {
  const parsed = catalogDataSchema.safeParse({ catalog, dictionaries });
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    if (issue.path.includes("variant"))
      throw new Error(
        `Invalid translation variant: ${issue.path.map(String).join(": ")}`,
      );
    if (issue.path[0] === "dictionaries" && issue.path.includes("ref"))
      throw new Error(`Inline translation forbidden: ${String(issue.path[1])}`);
    throw new Error(issue.message);
  }
  for (const [file, dictionary] of Object.entries(dictionaries))
    for (const usage of dictionary.translations)
      if ("ref" in usage)
        validateSelector(
          usage.selector,
          `${file}: ${usage.ref}`,
          selectorDocument,
        );
}
