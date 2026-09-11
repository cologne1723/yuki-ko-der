import { TagTranslator, type TagTranslation } from "./tag-translations.ts";
declare const __YUKICODER_TAG_TRANSLATIONS__: TagTranslation[];
import {
  applyTranslations,
  TranslationHistory,
  type TranslationScope,
} from "translation-core/fixed-translations";
import { TranslationMutations } from "translation-core/translation-mutations";
import { type ProblemCatalog } from "translation-core/problem-catalog";
import { sourceStatementBlocks } from "translation-core/problem-document";
import { createContentNotices } from "./content-notices.ts";
import { createContentResources } from "./content-resources.ts";
import type { CatalogResult } from "./problem-catalog";
import type { ProblemOutcome, SourceVerification } from "./problem-engine";
import {
  ProblemTitleTranslator,
  problemTitleSelectors,
  type ProblemTitleTranslation,
} from "./problem-titles";

declare const __YUKICODER_PROBLEM_TITLES__: ProblemTitleTranslation[];
declare global {
  var yukicoderProblemTranslations:
    | {
        translateProblem(
          shouldApply?: () => boolean,
          catalog?: ProblemCatalog,
          options?: { refresh?: boolean; retryVerification?: boolean },
        ): Promise<ProblemOutcome>;
        restoreProblem(): void;
      }
    | undefined;
}

(() => {
  const api = globalThis.browser ?? globalThis.chrome;
  const runtime = api?.runtime;
  if (!runtime || !document.body) return;

  const { loadTranslations, loadCatalog } = createContentResources(runtime);

  const history = new TranslationHistory();
  const tagTranslator = new TagTranslator(__YUKICODER_TAG_TRANSLATIONS__);
  const titleHistory = new TranslationHistory();
  let problemTitles = new ProblemTitleTranslator([]);
  let titlesReady = false;
  let pageTitleEnabled = true;
  let globallyEnabled = false;
  let settingsReady = false;
  let settingsRevision = 0;
  let revision = 0;
  let problemRevision = 0;
  let suspended = false;
  let entries: Awaited<ReturnType<typeof loadTranslations>> | undefined;
  let uiLoading: ReturnType<typeof loadTranslations> | undefined;
  let catalogLoading: Promise<CatalogResult> | undefined;
  let retrySource: (() => Promise<void>) | undefined;
  let retryLoading: Promise<void> | undefined;
  let checkProblem: (() => void) | undefined;
  const notices = createContentNotices(document, (parts) => {
    if (parts.every((part) => part === "ui" || part === "source")) {
      if (retryLoading) return retryLoading;
      const current = revision;
      const request = Promise.all([
        parts.includes("ui")
          ? loadUi(
              () => current === revision && globallyEnabled && !suspended,
              true,
            )
          : undefined,
        parts.includes("source") ? retrySource?.() : undefined,
      ]).then(() => {});
      retryLoading = request;
      void request.finally(() => {
        if (retryLoading === request) retryLoading = undefined;
      });
      return request;
    }
    return restart(true);
  });
  function restorePageTitle() {
    pageTitleEnabled = false;
    titleHistory.restoreWithin(
      document.querySelectorAll("title, #content > h3"),
    );
  }
  function titleScope(scope: TranslationScope): TranslationScope {
    return {
      querySelectorAll<E extends Element = Element>(selector: string): E[] {
        return [...scope.querySelectorAll<E>(selector)].filter(
          (element) =>
            pageTitleEnabled || !element.closest("title, #content > h3"),
        );
      },
    };
  }
  const { notify } = notices;
  const mutations = new TranslationMutations(document);
  mutations.watch(
    [...problemTitleSelectors, "#content a[href]", "#tags_tbody"],
    ["value"],
  );
  let scheduled: ReturnType<typeof setTimeout> | undefined;
  function applyReadyTranslations(full = true) {
    if (!globallyEnabled || !settingsReady || suspended) return;
    mutations.add(observer.takeRecords());
    observer.disconnect();
    clearTimeout(scheduled);
    scheduled = undefined;
    const pending = mutations.take();
    try {
      if (pending.removed) {
        history.restoreDetached();
        titleHistory.restoreDetached();
      }
      if (!full && !pending.changed) return;
      const scope = full ? document : pending.scope;
      if (entries) applyTranslations(document, entries, history, scope);
      tagTranslator.apply(document, history, scope);
      if (titlesReady)
        problemTitles.apply(document, titleHistory, titleScope(scope));
    } finally {
      observer.observe(document.documentElement, mutations.options);
      checkProblem?.();
    }
  }
  function stopObserving() {
    observer.disconnect();
    clearTimeout(scheduled);
    scheduled = undefined;
    mutations.take();
  }
  const observer = new MutationObserver((records) => {
    mutations.add(records);
    if (scheduled !== undefined || !globallyEnabled || suspended) return;
    // Yield to the browser and combine mutations from the same task.
    scheduled = setTimeout(() => {
      scheduled = undefined;
      applyReadyTranslations(false);
    }, 0);
  });

  async function loadUi(live: () => boolean, renew = false) {
    if (renew) uiLoading = undefined;
    const request = (uiLoading ??= loadTranslations());
    try {
      const value = await request;
      if (!live() || uiLoading !== request) return;
      entries = value;
      mutations.watch(
        value.map((entry) => entry.selector),
        value.flatMap((entry) => (entry.attribute ? [entry.attribute] : [])),
      );
      notices.notifyText("ui", "");
      applyReadyTranslations();
    } catch (error) {
      if (!live() || uiLoading !== request) return;
      uiLoading = undefined;
      console.warn("[yukicoder-ko] UI translation failed", error);
      notify("ui", "uiLoadFailed", true);
    }
  }

  async function render(renew: boolean) {
    const current = ++revision;
    const currentProblem = ++problemRevision;
    const isProblemPage = /^\/problems\/no\/\d+\/?$/u.test(location.pathname);
    const live = () =>
      current === revision && globallyEnabled && settingsReady && !suspended;
    const problemLive = () => live() && currentProblem === problemRevision;
    checkProblem = undefined;
    retrySource = undefined;
    retryLoading = undefined;
    stopObserving();
    titlesReady = false;
    pageTitleEnabled = true;
    titleHistory.restore();
    globalThis.yukicoderProblemTranslations?.restoreProblem();
    history.restore();
    notices.clear();
    if (!live()) return;
    const showOriginal = () => {
      problemRevision++;
      checkProblem = undefined;
      retrySource = undefined;
      retryLoading = undefined;
      globalThis.yukicoderProblemTranslations?.restoreProblem();
      restorePageTitle();
      notices.notifyText("source", "");
      notices.notifyText("problem", "일본어 원문입니다");
      notices.setOriginalAction(() => {
        void render(false);
      }, "한국어 번역 보기");
    };
    if (isProblemPage) {
      notices.setOriginalAction(showOriginal);
      notices.notifyText("problem", "문제 번역을 불러오고 있습니다.");
    }
    if (renew) {
      uiLoading = undefined;
      catalogLoading = undefined;
    }
    observer.observe(document.documentElement, mutations.options);
    const uiTask = loadUi(live);
    catalogLoading ??= loadCatalog();
    const problemTask = catalogLoading
      .then(async (result) => {
        if (!live()) return;
        problemTitles = new ProblemTitleTranslator(
          result.catalog?.entries ?? __YUKICODER_PROBLEM_TITLES__,
        );
        titlesReady = true;
        applyReadyTranslations();
        if (!isProblemPage || !problemLive()) return;
        let applying = false;
        let generation = 0;
        let applied: Extract<ProblemOutcome, { status: "applied" }> | undefined;
        let attemptedTargets: Element[] = [];
        const targets = () => {
          const content = document.querySelector("#content[data-problem-id]");
          const title = content?.querySelector(":scope > h3");
          const blocks = content ? sourceStatementBlocks(content) : [];
          return content && title && blocks.length
            ? [content, title, ...blocks]
            : [];
        };
        const check = () => {
          if (!problemLive() || applying) return;
          if (applied && (!applied.isApplied || applied.isApplied())) return;
          const currentTargets = targets();
          // A site rebuild may remove and insert its statement in separate tasks.
          if (!currentTargets.length) return;
          if (
            !applied &&
            currentTargets.length === attemptedTargets.length &&
            currentTargets.every(
              (node, index) => node === attemptedTargets[index],
            )
          )
            return;
          void translateBody(false);
        };
        const translateBody = async (refresh: boolean) => {
          if (!problemLive() || applying) return;
          applying = true;
          const attempt = ++generation;
          const attemptLive = () => problemLive() && attempt === generation;
          attemptedTargets = targets();
          applied = undefined;
          retrySource = undefined;
          retryLoading = undefined;
          pageTitleEnabled = true;
          notices.setOriginalAction(showOriginal);
          notices.notifyText("source", "");
          notices.notifyText("problem", "문제 번역을 불러오고 있습니다.");
          try {
            const outcome =
              await globalThis.yukicoderProblemTranslations?.translateProblem(
                attemptLive,
                result.catalog,
                { refresh },
              );
            if (!attemptLive()) return;
            if (outcome?.status !== "applied") {
              restorePageTitle();
              notices.setOriginalAction(undefined);
              notices.notifyText("problem", "");
            }
            if (outcome?.status === "failed") {
              console.warn(
                "[yukicoder-ko] Problem translation was not applied",
                outcome.detail,
              );
              notify(
                "problem",
                outcome.reason === "network"
                  ? "problemLoadFailed"
                  : "problemVerificationFailed",
                outcome.reason === "network",
              );
            }
            if (outcome?.status === "applied") {
              applied = outcome;
              notices.notifyText("problem", "한국어 번역본 입니다.");
              let verificationRevision = 0;
              const reportVerification = (result: SourceVerification) => {
                if (!attemptLive() || result.status === "cancelled") return;
                const warning =
                  result.status === "changed" ||
                  result.status === "unavailable";
                notices.notifyText(
                  "problem",
                  warning ? "" : "한국어 번역본 입니다.",
                );
                notices.notifyText(
                  "source",
                  result.status === "changed"
                    ? "번역 시점과 문제가 달라졌습니다. 원문을 확인해 주세요."
                    : result.status === "unavailable"
                      ? "원문 변경 여부를 확인하지 못했습니다. 원문을 확인해 주세요."
                      : "",
                  result.status === "unavailable",
                );
              };
              const watchVerification = async (
                verification?: Promise<SourceVerification>,
              ) => {
                const currentVerification = ++verificationRevision;
                if (!verification) return;
                try {
                  const result = await verification;
                  if (currentVerification === verificationRevision)
                    reportVerification(result);
                } catch {
                  if (currentVerification === verificationRevision)
                    reportVerification({ status: "unavailable" });
                }
              };
              retrySource = async () => {
                if (!attemptLive()) return;
                try {
                  const retried =
                    await globalThis.yukicoderProblemTranslations?.translateProblem(
                      attemptLive,
                      result.catalog,
                      { retryVerification: true },
                    );
                  if (!attemptLive() || retried?.status === "cancelled") return;
                  if (retried?.status === "applied")
                    await watchVerification(retried.verification);
                  else reportVerification({ status: "unavailable" });
                } catch {
                  reportVerification({ status: "unavailable" });
                }
              };
              void watchVerification(outcome.verification);
            } else if (outcome?.status === "unavailable") {
              notices.notifyText(
                "problem",
                "이 문제의 번역이 없어 원문을 표시합니다.",
              );
            }
            applyReadyTranslations();
          } catch (error) {
            if (!attemptLive()) return;
            console.warn("[yukicoder-ko] Problem translation failed", error);
            restorePageTitle();
            notices.setOriginalAction(undefined);
            notify("problem", "problemLoadFailed", true);
          } finally {
            applying = false;
            if (attemptLive()) check();
          }
        };
        checkProblem = check;
        await translateBody(renew);
      })
      .catch((error) => {
        if (!problemLive()) return;
        console.warn("[yukicoder-ko] Problem translation failed", error);
        if (isProblemPage) {
          restorePageTitle();
          notices.setOriginalAction(undefined);
          notify("problem", "problemLoadFailed", true);
        }
      });
    await Promise.all([uiTask, problemTask]);
  }
  async function restart(renew = false) {
    if (!settingsReady) {
      const before = settingsRevision;
      try {
        const settings = await api?.storage?.local.get("translationEnabled");
        if (before !== settingsRevision) return;
        globallyEnabled = settings?.translationEnabled !== false;
        settingsReady = true;
      } catch (error) {
        if (before !== settingsRevision) return;
        console.warn("[yukicoder-ko] Could not load settings", error);
        notify("settings", "settingsFailed", true);
        return;
      }
    }
    await render(renew);
  }
  api?.storage?.onChanged?.addListener((changes, area) => {
    if (area !== "local" || !("translationEnabled" in changes)) return;
    settingsRevision++;
    globallyEnabled = changes.translationEnabled.newValue !== false;
    settingsReady = true;
    if (!suspended) void render(false);
  });
  window.addEventListener("pagehide", () => {
    suspended = true;
    settingsRevision++;
    revision++;
    stopObserving();
  });
  window.addEventListener("pageshow", (event) => {
    if (!event.persisted) return;
    suspended = false;
    settingsReady = false;
    void render(false).then(() => restart(true));
  });
  void restart();
})();
