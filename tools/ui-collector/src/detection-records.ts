import { normalizeText } from "./detection-text.ts";
import { ClassifiedCandidate } from "./detection-types.ts";
import { sha256 } from "./hash.ts";
import type { Finding, Occurrence, TextKind } from "./types.ts";

export async function findingId(text: string, kind: TextKind): Promise<string> {
  return (await sha256(`${kind}\u0000${normalizeText(text)}`)).slice(0, 32);
}

export async function toFindings(
  classified: ClassifiedCandidate[],
  at: number,
): Promise<Finding[]> {
  const grouped = new Map<string, Finding>();
  for (const item of classified) {
    const id = await findingId(item.text, item.kind);
    const existing = grouped.get(id);
    if (existing) {
      existing.occurrenceCount += 1;
      existing.lastSeenAt = at;
    } else
      grouped.set(id, {
        findingId: id,
        normalizedText: normalizeText(item.text),
        kind: item.kind,
        firstSeenAt: at,
        lastSeenAt: at,
        occurrenceCount: 1,
      });
  }
  return [...grouped.values()];
}

export async function toOccurrences(
  classified: ClassifiedCandidate[],
  captureId: string,
  sessionId: string,
  documentId: string,
  events: string[],
  at: number,
): Promise<Occurrence[]> {
  return Promise.all(
    classified.map(
      async (item, index) =>
        ({
          occurrenceId: `${captureId}-${index}`,
          findingId: await findingId(item.text, item.kind),
          sessionId,
          captureId,
          documentId,
          exactText: item.text,
          kind: item.kind,
          ambiguous: item.ambiguous,
          category: item.category,
          classificationRule: item.rule,
          dictionaryMessageIds: item.dictionaryMessageIds,
          snapshotNodeLocator: item.locator,
          liveCssSelectorHint: item.cssHint,
          nearbyContext: item.context,
          precedingEventIds: events,
          temporalContext: "preceding-observations",
          at,
        }) satisfies Occurrence,
    ),
  );
}
