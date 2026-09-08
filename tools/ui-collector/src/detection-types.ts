import type { FindingCategory, TextKind } from "./types.ts";

export interface Candidate {
  text: string;
  kind: TextKind;
  node: Element | Text;
  attribute?: string;
}

export interface ClassifiedCandidate extends Candidate {
  category: FindingCategory;
  rule: string;
  dictionaryMessageIds: string[];
  locator: string;
  cssHint?: string;
  context?: string;
  ambiguous: boolean;
}

export interface HeadingContext {
  element: Element;
  text: string;
}
