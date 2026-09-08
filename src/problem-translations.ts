import { createProblemEngine } from "./problem-engine.ts";
const { translateProblem, restoreProblem } = createProblemEngine(
  globalThis as Window & typeof globalThis,
);
globalThis.yukicoderProblemTranslations = Object.freeze({
  translateProblem,
  restoreProblem,
});
