import { collectCandidates } from "./detection-candidates.ts";
import {
  closest,
  cssHint,
  exactLocator,
  nearbyContext,
  snapshotLocator,
} from "./detection-locators.ts";
import { HAN, KANA, normalizeText } from "./detection-text.ts";
import {
  Candidate,
  ClassifiedCandidate,
  HeadingContext,
} from "./detection-types.ts";
import type { DictionaryScope } from "./types.ts";

export const CONTENT_SELECTORS = [
  "#content[data-problem-id] > .block",
  ".sample",
  "pre",
  "code",
  ".user-content",
  "#problem-statement",
  ".problem-statement",
  ".problem-description",
  "[data-problem-statement]",
  ".problem-content",
  ".markdown-body",
  "article",
  "main [role=article]",
];

export const INTERFACE_SELECTORS = [
  "nav",
  "header",
  "footer",
  "button",
  "label",
  "select",
  "option",
  "[role=button]",
  "[role=menu]",
  "[role=menuitem]",
  "[role=tab]",
  "[role=alert]",
  "[role=status]",
  ".navbar",
  ".nav",
  ".toast",
  ".notification",
  ".flash",
  ".tooltip",
  ".dropdown-menu",
];

export function classify(
  candidate: Candidate,
  dictionary: DictionaryScope[],
  applicablePages: string[],
  headings: HeadingContext[],
  originals?: WeakMap<Node, Node>,
): Omit<ClassifiedCandidate, "text" | "kind" | "node" | "attribute"> {
  const element =
    candidate.node instanceof Element
      ? candidate.node
      : candidate.node.parentElement!;
  const hanOnly = HAN.test(candidate.text) && !KANA.test(candidate.text);
  const inContent = Boolean(closest(element, CONTENT_SELECTORS));
  const inInterface = Boolean(closest(element, INTERFACE_SELECTORS));
  const matching = dictionary.filter((scope) => {
    if (
      scope.path &&
      !applicablePages.includes(scope.path.replace(/\.json$/u, ""))
    )
      return false;
    if (!scope.attribute && candidate.attribute) return false;
    if (
      scope.attribute &&
      scope.attribute !== candidate.attribute &&
      scope.attribute !== candidate.kind
    )
      return false;
    if (scope.selector) {
      try {
        const scopedElement =
          (originals?.get(element) as Element | undefined) ?? element;
        return (
          scopedElement.matches(scope.selector) ||
          Boolean(scopedElement.closest(scope.selector))
        );
      } catch {
        return false;
      }
    }
    return false;
  });
  // Problem/content containers are protected from broad dictionary selectors. A
  // control inside one still remains an interface candidate.
  if (inContent && !inInterface) {
    return {
      ambiguous: hanOnly,
      category: "content",
      rule: "protected-content-container",
      dictionaryMessageIds: [],
      locator: snapshotLocator(element),
      cssHint: cssHint(element),
      context: nearbyContext(element, headings),
    };
  }
  if (inInterface || matching.length) {
    return {
      ambiguous: hanOnly,
      category: "interface",
      rule: hanOnly
        ? "han-only-ambiguous"
        : matching.length
          ? "known-translation-scope"
          : "interface-structure",
      dictionaryMessageIds: matching.map((scope) => scope.messageId),
      locator: snapshotLocator(element),
      cssHint: cssHint(element),
      context: nearbyContext(element, headings),
    };
  }
  if (inContent)
    return {
      ambiguous: hanOnly,
      category: "content",
      rule: "protected-content-container",
      dictionaryMessageIds: [],
      locator: snapshotLocator(element),
      cssHint: cssHint(element),
      context: nearbyContext(element, headings),
    };
  return {
    ambiguous: hanOnly,
    category: "uncertain",
    rule:
      HAN.test(candidate.text) && !KANA.test(candidate.text)
        ? "han-only-ambiguous"
        : "no-structural-classification",
    dictionaryMessageIds: [],
    locator: snapshotLocator(element),
    cssHint: cssHint(element),
    context: nearbyContext(element, headings),
  };
}

export function classifyCandidates(
  candidates: Candidate[],
  dictionary: DictionaryScope[],
  applicablePages: string[] = [],
  originals?: WeakMap<Node, Node>,
): ClassifiedCandidate[] {
  // Use only visible candidate text in headings, never neighboring form values
  // or arbitrary surrounding prose. This is computed before capture hashing.
  const doc = candidates[0]?.node.ownerDocument;
  const headings = [
    ...(doc?.querySelectorAll("h1,h2,h3,h4,h5,h6") ?? []),
  ].flatMap((element) => {
    const text = normalizeText(
      collectCandidates(element, originals)
        .filter((candidate) => candidate.kind === "text")
        .map((candidate) => candidate.text)
        .join(" "),
    ).slice(0, 160);
    return text ? [{ element, text }] : [];
  });
  return candidates.map((candidate) => ({
    ...candidate,
    ...classify(candidate, dictionary, applicablePages, headings, originals),
    locator: exactLocator(candidate),
  }));
}
