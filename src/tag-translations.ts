import { z } from "translation-core/validation";
import {
  translateTextNode,
  type TranslationHistory,
} from "translation-core/fixed-translations";

export const tagTranslationsSchema = z.strictObject({
  locale: z.literal("ko"),
  tags: z
    .array(
      z.strictObject({
        source: z.string().min(1),
        target: z.string().min(1),
        reviewStatus: z.enum(["unreviewed", "approved"]),
        problemCount: z.number().int().nonnegative(),
        solvedAcKey: z.string().min(1).optional(),
      }),
    )
    .refine(
      (tags) => new Set(tags.map((tag) => tag.source)).size === tags.length,
      "Duplicate source tag",
    ),
});
export type TagTranslation = z.infer<
  typeof tagTranslationsSchema
>["tags"][number];

// Match the original tag identity in the URL; only its visible text is translated.
export class TagTranslator {
  private readonly tags: Map<string, TagTranslation>;
  constructor(tags: TagTranslation[]) {
    this.tags = new Map(tags.map((tag) => [tag.source, tag]));
  }

  apply(document: Document, history: TranslationHistory) {
    for (const link of document.querySelectorAll<HTMLAnchorElement>(
      "#content a[href]",
    )) {
      let url: URL;
      try {
        url = new URL(link.getAttribute("href")!, "https://yukicoder.me");
      } catch {
        continue;
      }
      if (url.origin !== "https://yukicoder.me" || url.pathname !== "/problems")
        continue;
      const source = url.searchParams.get("tags");
      const tag = source === null ? undefined : this.tags.get(source);
      if (!tag) continue;
      for (const node of link.childNodes) {
        if (node.nodeType !== 3) continue;
        translateTextNode(
          node as Text,
          { selector: "", source: tag.source, target: tag.target },
          history,
        );
        if (link.closest("#tags_tbody")) {
          translateTextNode(
            node as Text,
            {
              selector: "",
              source: `${tag.source} ({count})`,
              target: `${tag.target} ({count})`,
              variables: { count: "[0-9]+" },
            },
            history,
          );
        }
      }
    }
  }
}
