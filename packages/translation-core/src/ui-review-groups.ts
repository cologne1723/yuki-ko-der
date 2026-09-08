import type { TranslationEntry } from "./fixed-translations.ts";
export interface ReviewDictionary {
  file: string;
  revision: string;
  entries: TranslationEntry[];
}
export function isContextFragment(source: string): boolean {
  return (
    /^(は|が|を|に|の|で|と|も|へ|または|また|および|されます。|します。|です。|。|、)$/u.test(
      source,
    ) ||
    /^(は|が|を|に|の|で|と|へ|から|まで|され|です|します|さんの)/u.test(source)
  );
}
type Member = {
  dictionary: ReviewDictionary;
  index: number;
  entry: TranslationEntry;
};
const groupCache = new WeakMap<
  ReviewDictionary[],
  {
    revisions: string;
    groups: Map<string, Member[]>;
    entries: Map<string, Member[]>;
  }
>();
export function invalidateReviewGroups(data: ReviewDictionary[]) {
  groupCache.delete(data);
}
export function commonReviewMembers(
  data: ReviewDictionary[],
  file: string,
  index: number,
): Member[] {
  const revisions = data.map((d) => `${d.file}:${d.revision}`).join("|");
  let cached = groupCache.get(data);
  if (!cached || cached.revisions !== revisions) {
    const groups = new Map<string, Member[]>();
    const entries = new Map<string, Member[]>();
    for (const dictionary of data)
      dictionary.entries.forEach((entry, index) => {
        if (!entry.messageId && isContextFragment(entry.source)) return;
        const key = entry.messageId
          ? JSON.stringify([entry.messageId, entry.variant])
          : JSON.stringify([entry.source, entry.variables]);
        let group = groups.get(key);
        if (!group) groups.set(key, (group = []));
        group.push({ dictionary, entry, index });
        entries.set(`${dictionary.file}:${index}`, group);
      });
    cached = { revisions, groups, entries };
    groupCache.set(data, cached);
  }
  return cached.entries.get(`${file}:${index}`) ?? [];
}
