import type { DictionaryIdentity } from "./types.ts";

declare const __UI_COLLECTOR_DICTIONARY__: DictionaryIdentity | undefined;

// build.ts replaces this generated module with data read from translations/ko*.json.
// The fallback keeps the source usable in isolated tests and never imports the translator.
export const dictionaryIdentity: DictionaryIdentity = {
  hash:
    typeof __UI_COLLECTOR_DICTIONARY__ === "undefined"
      ? "development-dictionary-not-built"
      : __UI_COLLECTOR_DICTIONARY__.hash,
  scopes:
    typeof __UI_COLLECTOR_DICTIONARY__ === "undefined"
      ? []
      : __UI_COLLECTOR_DICTIONARY__.scopes,
};

declare const __UI_COLLECTOR_VERSION__: string | undefined;
export const collectorVersion =
  typeof __UI_COLLECTOR_VERSION__ === "undefined"
    ? "development"
    : __UI_COLLECTOR_VERSION__;
