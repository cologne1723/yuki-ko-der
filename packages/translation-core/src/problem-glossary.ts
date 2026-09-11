import { parse } from "yaml";
import { z } from "zod";
import { JSDOM } from "jsdom";

const schema = z.object({
  version: z.literal(1),
  locale: z.literal("ko"),
  entries: z.array(
    z.object({
      id: z.string(),
      source: z.array(z.string().min(1)),
      preferred: z.string(),
      forbidden: z.array(z.string()),
      kind: z.string(),
      note: z.string(),
    }),
  ),
});

function prose(source: string) {
  const dom = new JSDOM(source);
  dom.window.document
    .querySelectorAll("script,style,pre,code")
    .forEach((e) => e.remove());
  const text = dom.window.document.body.textContent ?? "";
  dom.window.close();
  return text;
}

export function applicableGlossary(yaml: string, source: string) {
  const glossary = schema.parse(parse(yaml));
  const text = prose(source);
  return glossary.entries.filter((e) =>
    [...e.source, e.preferred, ...e.forbidden].some((term) =>
      text.includes(term),
    ),
  );
}

export function glossaryTranslationErrors(
  yaml: string,
  source: string,
  translated: string,
): string[] {
  const text = prose(translated);
  return applicableGlossary(yaml, source).flatMap((entry) => {
    const errors: string[] = [];
    for (const forbidden of entry.forbidden)
      if (text.includes(forbidden))
        errors.push(
          `glossary ${entry.id}: 금지 표기 ${forbidden}; ${entry.preferred} 사용`,
        );
    if (
      ["proper_noun", "term"].includes(entry.kind) &&
      !text.includes(entry.preferred)
    )
      errors.push(`glossary ${entry.id}: 표준 표기 ${entry.preferred} 누락`);
    return errors;
  });
}
