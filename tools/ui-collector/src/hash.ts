export { sha256Hex as sha256 } from "translation-core/sha256";

export function stableHashInput(parts: string[]): string {
  return parts.map((part) => `${part.length}:${part}`).join("|");
}
