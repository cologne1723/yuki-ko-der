export const JAPANESE = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff]/u;

export const KANA = /[\u3040-\u30ff]/u;

export const HAN = /[\u3400-\u4dbf\u4e00-\u9fff]/u;

export function normalizeText(text: string): string {
  return text.replace(/\s+/gu, " ").trim();
}

export function isJapaneseCandidate(text: string): boolean {
  return JAPANESE.test(text);
}
