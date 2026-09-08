import type { extensionMessageIds } from "./extension-message-ids";
declare const __YUKICODER_EXTENSION_MESSAGES__: Record<
  keyof typeof extensionMessageIds,
  string
>;

export function message(
  key: keyof typeof __YUKICODER_EXTENSION_MESSAGES__,
): string {
  return __YUKICODER_EXTENSION_MESSAGES__[key];
}
