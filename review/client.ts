import { basicSetup, EditorView } from "codemirror";
import { html } from "@codemirror/lang-html";
import { markdown } from "@codemirror/lang-markdown";
import { Compartment } from "@codemirror/state";
import { compileProblemMarkdown } from "../src/problem-markdown.ts";
import { mapHeadingScroll } from "./scroll-sync.ts";
import { renderPreviewMath } from "./tex.ts";

type ReviewStatus = "unreviewed" | "approved";

interface ProblemSummary {
  problemNo: number;
  japaneseTitle: string;
  koreanTitle: string;
  reviewStatus: ReviewStatus;
  machineTranslated: boolean;
}

interface ProblemReview extends ProblemSummary {
  japaneseHtml: string;
  koreanSource: string;
  koreanHtml: string;
  sourceFormat: "html" | "mdx";
  revision: string;
  validationWarnings: string[];
}

const FRAME_STYLE = `
  html { color: #202a3d; background: #fff; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
  body { box-sizing: border-box; max-width: 900px; margin: 0 auto; padding: 22px 24px 80px; font-size: 13px; line-height: 1.75; }
  h3 { margin: 0 0 20px; font-size: 19px; }
  main[data-yukicoder-ko-problem] > h3 { display: none; }
  h4 { margin: 24px 0 10px; padding: 7px 10px; border-left: 4px solid #5574df; background: #f0f3fb; font-size: 14px; }
  h5 { margin: 20px 0 8px; font-size: 13px; }
  h6 { margin: 13px 0 5px; font-size: 12px; }
  p { margin: 8px 0; }
  pre { overflow: auto; border: 1px solid #e0e4ed; border-radius: 5px; padding: 10px; background: #f7f8fa; font: 12px/1.5 "SFMono-Regular", Consolas, monospace; white-space: pre-wrap; }
  table { border-collapse: collapse; }
  td, th { border: 1px solid #d9dee8; padding: 5px 8px; }
  img { max-width: 100%; }
  a { color: #3155d9; }
  .katex-display { overflow-x: auto; overflow-y: hidden; padding: 2px 0; }
`;

function element<T extends HTMLElement>(id: string): T {
  const selected = document.getElementById(id);
  if (!selected) throw new Error(`Missing review UI element: ${id}`);
  return selected as T;
}

const listElement = element<HTMLElement>("problem-list");
const searchElement = element<HTMLInputElement>("search");
const summaryElement = element<HTMLElement>("summary");
const titleElement = element<HTMLElement>("problem-title");
const japaneseTitleElement = element<HTMLElement>("japanese-title");
const statusBadge = element<HTMLElement>("status-badge");
const dirtyBadge = element<HTMLElement>("dirty-badge");
const notice = element<HTMLElement>("notice");
const sourceFormat = element<HTMLElement>("source-format");
const sourceViewToggle = element<HTMLButtonElement>("source-view-toggle");
const japanesePreview = element<HTMLIFrameElement>("japanese-preview");
const koreanPreview = element<HTMLIFrameElement>("korean-preview");
const saveButton = element<HTMLButtonElement>("save");
const approveButton = element<HTMLButtonElement>("approve");
const unapproveButton = element<HTMLButtonElement>("unapprove");
const previousButton = element<HTMLButtonElement>("previous");
const nextButton = element<HTMLButtonElement>("next");
const scrollSyncButton = element<HTMLButtonElement>("scroll-sync");
const appShell = element<HTMLElement>("app-shell");
const problemSidebar = element<HTMLElement>("problem-sidebar");
const sidebarResizer = element<HTMLElement>("sidebar-resizer");
const reviewGrid = element<HTMLElement>("review-grid");
const japanesePane = element<HTMLElement>("japanese-pane");
const koreanPane = element<HTMLElement>("korean-pane");
const japanesePaneToggle = element<HTMLButtonElement>("japanese-pane-toggle");
const koreanPaneToggle = element<HTMLButtonElement>("korean-pane-toggle");

let problems: ProblemSummary[] = [];
let selected: ProblemReview | undefined;
let activeFilter: "all" | ReviewStatus = "all";
let previewTimer: number | undefined;
let changingDocument = false;
let busy = false;
let sourceView: "source" | "compiled" = "source";
let mdxDraft = "";
let pendingJapaneseScrollTop: number | undefined;
let pendingKoreanScrollTop: number | undefined;
let scrollSyncEnabled =
  localStorage.getItem("review-scroll-sync-enabled") === "true";

function storedDismissedWarnings(): string[] {
  try {
    const value = JSON.parse(
      localStorage.getItem("review-dismissed-warnings") ?? "[]",
    ) as unknown;
    return Array.isArray(value)
      ? value.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return [];
  }
}

const dismissedWarnings = new Set(storedDismissedWarnings());

const editorLanguage = new Compartment();
const editorEditable = new Compartment();
const editor = new EditorView({
  parent: element("editor"),
  extensions: [
    basicSetup,
    editorLanguage.of(markdown()),
    editorEditable.of(EditorView.editable.of(true)),
    EditorView.lineWrapping,
    EditorView.updateListener.of((update) => {
      if (!changingDocument && update.docChanged) {
        if (sourceView === "source") mdxDraft = update.state.doc.toString();
        updateDirtyState();
        window.clearTimeout(previewTimer);
        previewTimer = window.setTimeout(updateKoreanPreview, 180);
      }
    }),
  ],
});

function editorText(): string {
  return editor.state.doc.toString();
}

function setEditorText(value: string): void {
  changingDocument = true;
  editor.dispatch({
    changes: { from: 0, to: editor.state.doc.length, insert: value },
  });
  changingDocument = false;
}

function configureEditor(format: "html" | "mdx", editable: boolean): void {
  editor.dispatch({
    effects: [
      editorLanguage.reconfigure(format === "mdx" ? markdown() : html()),
      editorEditable.reconfigure(EditorView.editable.of(editable)),
    ],
  });
}

function editableSource(): string {
  return sourceView === "compiled" ? mdxDraft : editorText();
}

function isDirty(): boolean {
  return selected !== undefined && editableSource() !== selected.koreanSource;
}

function updateDirtyState(): void {
  dirtyBadge.classList.toggle("hidden", !isDirty());
  unapproveButton.disabled = busy || isDirty();
}

function wrapPreview(htmlSource: string, language: "ja" | "ko"): string {
  const style = `<link rel="stylesheet" href="/katex/katex.min.css"><style>${FRAME_STYLE}</style>`;
  if (/<!doctype|<html\b/iu.test(htmlSource)) {
    const withStyle = /<\/head>/iu.test(htmlSource)
      ? htmlSource.replace(/<\/head>/iu, `${style}</head>`)
      : htmlSource.replace(/<body\b/iu, `${style}<body`);
    return withStyle;
  }
  return `<!doctype html><html lang="${language}"><head><meta charset="utf-8">${style}</head><body>${htmlSource}</body></html>`;
}

function preparePreview(frame: HTMLIFrameElement): void {
  const body = frame.contentDocument?.body;
  if (body) renderPreviewMath(body);
  connectScrollSync();
  if (frame === japanesePreview && pendingJapaneseScrollTop !== undefined) {
    const scrollTop = pendingJapaneseScrollTop;
    pendingJapaneseScrollTop = undefined;
    window.requestAnimationFrame(() => {
      japanesePreview.contentWindow?.scrollTo({ top: scrollTop });
    });
  }
  if (frame === koreanPreview && pendingKoreanScrollTop !== undefined) {
    const scrollTop = pendingKoreanScrollTop;
    pendingKoreanScrollTop = undefined;
    window.requestAnimationFrame(() => {
      koreanPreview.contentWindow?.scrollTo({ top: scrollTop });
    });
  }
}

function replaceKoreanPreviewDocument(htmlSource: string): boolean {
  const previewDocument = koreanPreview.contentDocument;
  const previewWindow = koreanPreview.contentWindow;
  if (!previewDocument?.head || !previewDocument.body || !previewWindow) {
    return false;
  }

  const scrollTop = previewWindow.scrollY;
  const replacement = new DOMParser().parseFromString(
    wrapPreview(htmlSource, "ko"),
    "text/html",
  );
  previewDocument.documentElement.lang = "ko";
  previewDocument.head.replaceChildren(
    ...[...replacement.head.childNodes].map((node) =>
      previewDocument.importNode(node, true),
    ),
  );
  previewDocument.body.replaceChildren(
    ...[...replacement.body.childNodes].map((node) =>
      previewDocument.importNode(node, true),
    ),
  );
  renderPreviewMath(previewDocument.body);
  connectScrollSync();
  previewWindow.scrollTo({ top: scrollTop });
  window.requestAnimationFrame(() => {
    previewWindow.scrollTo({ top: scrollTop });
  });
  return true;
}

function updateKoreanPreview(preserveScroll = true): void {
  pendingKoreanScrollTop = preserveScroll
    ? koreanPreview.contentWindow?.scrollY
    : undefined;
  try {
    const htmlSource =
      selected?.sourceFormat === "mdx"
        ? compileProblemMarkdown(editableSource())
        : editableSource();
    if (preserveScroll && replaceKoreanPreviewDocument(htmlSource)) {
      pendingKoreanScrollTop = undefined;
      return;
    }
    koreanPreview.srcdoc = wrapPreview(htmlSource, "ko");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const escaped = message
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;");
    koreanPreview.srcdoc = wrapPreview(
      `<h3>Markdown 미리보기 오류</h3><pre>${escaped}</pre>`,
      "ko",
    );
  }
}

function connectScrollSync(): void {
  const japaneseWindow = japanesePreview.contentWindow;
  const koreanWindow = koreanPreview.contentWindow;
  if (!japaneseWindow || !koreanWindow) return;
  japaneseWindow.onscroll = null;
  koreanWindow.onscroll = null;
  if (!scrollSyncEnabled) return;
  let syncing = false;

  const anchors = (browserWindow: Window): number[] => {
    const root = browserWindow.document.documentElement;
    const maximum = Math.max(0, root.scrollHeight - browserWindow.innerHeight);
    const headings = [
      ...browserWindow.document.querySelectorAll<HTMLElement>("h4, h5, h6"),
    ].map((heading) =>
      Math.min(
        maximum,
        Math.max(
          0,
          heading.getBoundingClientRect().top + browserWindow.scrollY,
        ),
      ),
    );
    return [0, ...headings, maximum];
  };

  const synchronize = (source: Window, target: Window) => {
    if (syncing) return;
    const sourceAnchors = anchors(source);
    const targetAnchors = anchors(target);
    if (sourceAnchors.length !== targetAnchors.length) return;
    syncing = true;
    target.scrollTo({
      top: mapHeadingScroll(source.scrollY, sourceAnchors, targetAnchors),
    });
    window.requestAnimationFrame(() => {
      syncing = false;
    });
  };
  japaneseWindow.onscroll = () => synchronize(japaneseWindow, koreanWindow);
  koreanWindow.onscroll = () => synchronize(koreanWindow, japaneseWindow);
}

function setScrollSync(enabled: boolean): void {
  scrollSyncEnabled = enabled;
  scrollSyncButton.setAttribute("aria-pressed", String(enabled));
  scrollSyncButton.textContent = `스크롤 동기화: ${enabled ? "켬" : "끔"}`;
  scrollSyncButton.classList.toggle("active", enabled);
  localStorage.setItem("review-scroll-sync-enabled", String(enabled));
  connectScrollSync();
}

japanesePreview.addEventListener("load", () => preparePreview(japanesePreview));
koreanPreview.addEventListener("load", () => preparePreview(koreanPreview));

function setPreviewCollapsed(
  language: "japanese" | "korean",
  collapsed: boolean,
): void {
  const pane = language === "japanese" ? japanesePane : koreanPane;
  const toggle =
    language === "japanese" ? japanesePaneToggle : koreanPaneToggle;
  const label = language === "japanese" ? "원문" : "번역";
  pane.classList.toggle("collapsed", collapsed);
  reviewGrid.classList.toggle(`${language}-collapsed`, collapsed);
  toggle.setAttribute("aria-pressed", String(!collapsed));
  toggle.setAttribute(
    "aria-label",
    `${label} 미리보기 ${collapsed ? "표시" : "숨기기"}`,
  );
  toggle.title = `${label} 미리보기 ${collapsed ? "표시" : "숨기기"}`;
  toggle.textContent = `${label}: ${collapsed ? "숨김" : "표시"}`;
  toggle.classList.toggle("active", !collapsed);
  localStorage.setItem(`review-${language}-collapsed`, String(collapsed));
}

function setSidebarWidth(width: number): void {
  const requested = Number.isFinite(width) ? width : 280;
  const normalized =
    requested < 100 ? 0 : Math.min(520, Math.max(120, requested));
  appShell.style.setProperty("--sidebar-width", `${normalized}px`);
  appShell.classList.toggle("sidebar-hidden", normalized === 0);
  problemSidebar.setAttribute("aria-hidden", String(normalized === 0));
  sidebarResizer.setAttribute("aria-valuenow", String(normalized));
  localStorage.setItem("review-sidebar-width", String(normalized));
}

japanesePaneToggle.addEventListener("click", () => {
  setPreviewCollapsed(
    "japanese",
    !japanesePane.classList.contains("collapsed"),
  );
});
koreanPaneToggle.addEventListener("click", () => {
  setPreviewCollapsed("korean", !koreanPane.classList.contains("collapsed"));
});
sidebarResizer.addEventListener("pointerdown", (event) => {
  sidebarResizer.setPointerCapture(event.pointerId);
  sidebarResizer.classList.add("dragging");
});
sidebarResizer.addEventListener("pointermove", (event) => {
  if (!sidebarResizer.hasPointerCapture(event.pointerId)) return;
  setSidebarWidth(event.clientX - appShell.getBoundingClientRect().left);
});
sidebarResizer.addEventListener("pointerup", (event) => {
  if (sidebarResizer.hasPointerCapture(event.pointerId)) {
    sidebarResizer.releasePointerCapture(event.pointerId);
  }
  sidebarResizer.classList.remove("dragging");
});
sidebarResizer.addEventListener("dblclick", () => setSidebarWidth(280));
sidebarResizer.addEventListener("keydown", (event) => {
  const current = Number(sidebarResizer.getAttribute("aria-valuenow"));
  const next =
    event.key === "ArrowLeft"
      ? current - 20
      : event.key === "ArrowRight"
        ? current + 20
        : event.key === "Home"
          ? 0
          : event.key === "End"
            ? 520
            : undefined;
  if (next === undefined) return;
  event.preventDefault();
  setSidebarWidth(next);
});

setSidebarWidth(Number(localStorage.getItem("review-sidebar-width") ?? 280));
setPreviewCollapsed(
  "japanese",
  localStorage.getItem("review-japanese-collapsed") === "true",
);
scrollSyncButton.addEventListener("click", () => {
  setScrollSync(!scrollSyncEnabled);
});
setScrollSync(scrollSyncEnabled);
setPreviewCollapsed(
  "korean",
  localStorage.getItem("review-korean-collapsed") === "true",
);

function showNotice(
  message: string,
  kind: "success" | "warning" | "error" = "success",
  dismissKey?: string,
): void {
  notice.className = `notice ${kind}${kind === "warning" ? " collapsed" : ""}`;
  const content = document.createElement("div");
  content.className = "notice-content";
  content.textContent = message;
  notice.replaceChildren(content);
  if (kind === "warning" && dismissKey) {
    const controls = document.createElement("div");
    controls.className = "notice-controls";
    const count = message.match(/검증 경고 \((\d+)건\)/u)?.[1] ?? "";
    const summary = document.createElement("strong");
    summary.textContent = `검증 경고${count ? ` ${count}건` : ""}`;
    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "notice-toggle";
    toggle.textContent = "내용 보기";
    toggle.addEventListener("click", () => {
      const collapsed = notice.classList.toggle("collapsed");
      toggle.textContent = collapsed ? "내용 보기" : "경고 접기";
    });
    const dismiss = document.createElement("button");
    dismiss.type = "button";
    dismiss.className = "notice-dismiss";
    dismiss.textContent = "이 경고 숨기기";
    dismiss.addEventListener("click", () => {
      dismissedWarnings.add(dismissKey);
      const retained = [...dismissedWarnings].slice(-50);
      localStorage.setItem(
        "review-dismissed-warnings",
        JSON.stringify(retained),
      );
      notice.className = "notice hidden";
    });
    controls.append(summary, toggle, dismiss);
    notice.prepend(controls);
  }
}

function warningMessage(prefix?: string): string | undefined {
  if (!selected?.validationWarnings.length) return prefix;
  const details = selected.validationWarnings
    .map((warning) => `• ${warning}`)
    .join("\n");
  return [
    prefix,
    `검증 경고 (${selected.validationWarnings.length}건)`,
    details,
  ]
    .filter(Boolean)
    .join("\n\n");
}

function warningKey(): string | undefined {
  if (!selected?.validationWarnings.length) return undefined;
  let fingerprint = 2_166_136_261;
  for (const character of selected.validationWarnings.join("\n")) {
    fingerprint ^= character.codePointAt(0) ?? 0;
    fingerprint = Math.imul(fingerprint, 16_777_619);
  }
  return `${selected.problemNo}:${selected.validationWarnings.length}:${(fingerprint >>> 0).toString(36)}`;
}

function warningsAreDismissed(): boolean {
  const key = warningKey();
  return key !== undefined && dismissedWarnings.has(key);
}

function showValidationWarnings(): void {
  if (warningsAreDismissed()) return;
  const message = warningMessage();
  const key = warningKey();
  if (message && key) showNotice(message, "warning", key);
}

function clearNotice(): void {
  notice.textContent = "";
  notice.className = "notice hidden";
}

async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...options,
    headers: options?.body
      ? { "content-type": "application/json", ...options.headers }
      : options?.headers,
  });
  const body = (await response.json()) as T & { error?: string };
  if (!response.ok)
    throw new Error(body.error ?? `Request failed (${response.status})`);
  return body;
}

function filteredProblems(): ProblemSummary[] {
  const query = searchElement.value.trim().toLocaleLowerCase("ko");
  return problems.filter((problem) => {
    const matchesStatus =
      activeFilter === "all" || problem.reviewStatus === activeFilter;
    const text =
      `${problem.problemNo} ${problem.japaneseTitle} ${problem.koreanTitle}`.toLocaleLowerCase(
        "ko",
      );
    return matchesStatus && (!query || text.includes(query));
  });
}

function renderList(): void {
  const visible = filteredProblems();
  const approved = problems.filter(
    (problem) => problem.reviewStatus === "approved",
  ).length;
  summaryElement.textContent = `${visible.length}개 표시 · ${approved}/${problems.length} 승인`;
  listElement.replaceChildren(
    ...visible.map((problem) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `problem-item ${problem.reviewStatus}${selected?.problemNo === problem.problemNo ? " active" : ""}`;
      const dot = document.createElement("span");
      dot.className = "status-dot";
      const labels = document.createElement("span");
      const korean = document.createElement("strong");
      korean.textContent = `No.${problem.problemNo} ${problem.koreanTitle}`;
      const japanese = document.createElement("span");
      japanese.textContent = problem.japaneseTitle;
      labels.append(korean, japanese);
      button.append(dot, labels);
      button.addEventListener(
        "click",
        () => void selectProblem(problem.problemNo),
      );
      return button;
    }),
  );
}

function replaceSummary(problem: ProblemSummary): void {
  const index = problems.findIndex(
    (item) => item.problemNo === problem.problemNo,
  );
  if (index >= 0) problems[index] = problem;
}

function updateSourceViewControls(): void {
  if (!selected) return;
  const isMdx = selected.sourceFormat === "mdx";
  sourceViewToggle.classList.toggle("hidden", !isMdx);
  sourceViewToggle.textContent =
    sourceView === "compiled" ? "MDX 편집" : "HTML 보기";
  sourceFormat.textContent = isMdx
    ? sourceView === "compiled"
      ? "생성된 HTML · 읽기 전용"
      : "MDX · Ctrl/⌘ + S"
    : "HTML · Ctrl/⌘ + S";
}

function loadEditor(problem: ProblemReview): void {
  sourceView = "source";
  mdxDraft = problem.koreanSource;
  setEditorText(problem.koreanSource);
  configureEditor(problem.sourceFormat, true);
  updateSourceViewControls();
}

function toggleSourceView(): void {
  if (!selected || selected.sourceFormat !== "mdx") return;
  clearNotice();
  if (sourceView === "source") {
    mdxDraft = editorText();
    try {
      setEditorText(compileProblemMarkdown(mdxDraft));
    } catch (error) {
      showNotice(
        error instanceof Error ? error.message : String(error),
        "error",
      );
      return;
    }
    sourceView = "compiled";
    configureEditor("html", false);
  } else {
    sourceView = "source";
    setEditorText(mdxDraft);
    configureEditor("mdx", true);
  }
  updateSourceViewControls();
  updateDirtyState();
  updateKoreanPreview();
}

function renderSelected(preservePreviewScroll = false): void {
  if (!selected) return;
  titleElement.textContent = `No.${selected.problemNo} ${selected.koreanTitle}`;
  japaneseTitleElement.textContent = selected.japaneseTitle;
  updateSourceViewControls();
  statusBadge.textContent =
    selected.reviewStatus === "approved" ? "승인됨" : "미검수";
  statusBadge.className = `status-badge ${selected.reviewStatus}`;
  unapproveButton.classList.toggle(
    "hidden",
    selected.reviewStatus !== "approved",
  );
  approveButton.classList.toggle(
    "hidden",
    selected.reviewStatus === "approved",
  );
  pendingJapaneseScrollTop = preservePreviewScroll
    ? japanesePreview.contentWindow?.scrollY
    : undefined;
  japanesePreview.srcdoc = wrapPreview(selected.japaneseHtml, "ja");
  updateKoreanPreview(preservePreviewScroll);
  updateDirtyState();
  renderList();
  updateNavigation();
  showValidationWarnings();
}

function confirmDiscard(): boolean {
  return !isDirty() || window.confirm("저장하지 않은 변경사항을 버릴까요?");
}

async function selectProblem(problemNo: number): Promise<void> {
  if (selected?.problemNo === problemNo || !confirmDiscard()) return;
  clearNotice();
  setBusy(true);
  try {
    selected = await api<ProblemReview>(`/api/problems/${problemNo}`);
    loadEditor(selected);
    const url = new URL(window.location.href);
    url.searchParams.set("problem", String(problemNo));
    history.replaceState(null, "", url);
    renderSelected(false);
  } catch (error) {
    showNotice(error instanceof Error ? error.message : String(error), "error");
  } finally {
    setBusy(false);
  }
}

function setBusy(value: boolean): void {
  busy = value;
  saveButton.disabled = value || !selected;
  approveButton.disabled = value || !selected;
  unapproveButton.disabled = value || !selected || isDirty();
  previousButton.disabled = value || !selected;
  nextButton.disabled = value || !selected;
  if (!value) updateNavigation();
}

async function write(action: "save" | "approve" | "unapprove"): Promise<void> {
  if (!selected || busy) return;
  clearNotice();
  setBusy(true);
  try {
    const suffix = action === "save" ? "" : `/${action}`;
    const updated = await api<ProblemReview>(
      `/api/problems/${selected.problemNo}${suffix}`,
      {
        method: action === "save" ? "PUT" : "POST",
        body: JSON.stringify({
          html: editableSource(),
          revision: selected.revision,
        }),
      },
    );
    selected = updated;
    replaceSummary(updated);
    loadEditor(updated);
    renderSelected(true);
    const success =
      action === "approve"
        ? "번역을 승인했습니다."
        : action === "unapprove"
          ? "승인을 취소했습니다."
          : "번역 소스를 저장했습니다.";
    const message = warningMessage(success);
    const key = warningKey();
    if (message && key && !warningsAreDismissed()) {
      showNotice(message, "warning", key);
    } else {
      showNotice(success);
    }
  } catch (error) {
    showNotice(error instanceof Error ? error.message : String(error), "error");
  } finally {
    setBusy(false);
  }
}

function selectedPosition(): number {
  return selected
    ? problems.findIndex((problem) => problem.problemNo === selected?.problemNo)
    : -1;
}

function updateNavigation(): void {
  const position = selectedPosition();
  previousButton.disabled = busy || position <= 0;
  nextButton.disabled = busy || position < 0 || position >= problems.length - 1;
}

async function move(offset: number): Promise<void> {
  const target = problems[selectedPosition() + offset];
  if (target) await selectProblem(target.problemNo);
}

searchElement.addEventListener("input", renderList);
for (const button of document.querySelectorAll<HTMLButtonElement>(".filter")) {
  button.addEventListener("click", () => {
    activeFilter = button.dataset.filter as "all" | ReviewStatus;
    document
      .querySelectorAll(".filter")
      .forEach((item) => item.classList.remove("active"));
    button.classList.add("active");
    renderList();
  });
}
saveButton.addEventListener("click", () => void write("save"));
approveButton.addEventListener("click", () => void write("approve"));
unapproveButton.addEventListener("click", () => void write("unapprove"));
sourceViewToggle.addEventListener("click", toggleSourceView);
previousButton.addEventListener("click", () => void move(-1));
nextButton.addEventListener("click", () => void move(1));
window.addEventListener("keydown", (event) => {
  if (
    (event.ctrlKey || event.metaKey) &&
    event.key.toLocaleLowerCase() === "s"
  ) {
    event.preventDefault();
    void write("save");
  }
});
window.addEventListener("beforeunload", (event) => {
  if (isDirty()) event.preventDefault();
});

async function start(): Promise<void> {
  setBusy(true);
  try {
    const response = await api<{ problems: ProblemSummary[] }>("/api/problems");
    problems = response.problems;
    renderList();
    const requested = Number(
      new URL(window.location.href).searchParams.get("problem"),
    );
    const initial = problems.some((problem) => problem.problemNo === requested)
      ? requested
      : problems[0]?.problemNo;
    if (initial !== undefined) await selectProblem(initial);
  } catch (error) {
    showNotice(error instanceof Error ? error.message : String(error), "error");
  } finally {
    setBusy(false);
  }
}

void start();
