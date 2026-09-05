declare global {
  var YUKICODER_KO_CONFIG:
    Readonly<{ problemTranslationBaseUrl: string }> | undefined;
}

globalThis.YUKICODER_KO_CONFIG = Object.freeze({
  // GitHub Pages publishes the compiled problem HTML from this repository.
  problemTranslationBaseUrl: "https://cologne1723.github.io/yuki-ko-der/",
});

export {};
