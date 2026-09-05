import {
  applyTranslations,
  translatedValue,
  type TranslationEntry,
} from "../src/fixed-translations.ts";
interface Dictionary {
  file: string;
  revision: string;
  entries: TranslationEntry[];
}
const get = <T extends HTMLElement>(id: string) =>
  document.getElementById(id) as T;
const search = get<HTMLInputElement>("search");
const dictionaries = get<HTMLSelectElement>("dictionary");
const filter = get<HTMLSelectElement>("status");
const pages = get<HTMLSelectElement>("page");
const target = get<HTMLTextAreaElement>("target");
const original = get<HTMLTextAreaElement>("source");
const japanese = get<HTMLIFrameElement>("japanese");
const korean = get<HTMLIFrameElement>("korean");
let data: Dictionary[] = [];
let selected: { dictionary: Dictionary; index: number } | undefined;
let pageHtml = "";
let saved = "";
let busy = false;
let pageRequest = 0;
let matchIndex = 0;
let matchCount = 0;
const recentChanges = new Map<string, { before: string; after: string }>();
const selectedKey = () =>
  selected ? `${selected.dictionary.file}:${selected.index}` : "";
const sidebarToggle = get<HTMLButtonElement>("sidebar-toggle");
function setSidebar(collapsed: boolean) {
  get("glossary-sidebar").hidden = collapsed;
  get("layout").classList.toggle("sidebar-collapsed", collapsed);
  sidebarToggle.setAttribute("aria-expanded", String(!collapsed));
  sidebarToggle.textContent = collapsed ? "목록 펼치기" : "목록 접기";
  localStorage.setItem("ui-review-sidebar-collapsed", String(collapsed));
}
setSidebar(localStorage.getItem("ui-review-sidebar-collapsed") === "true");
sidebarToggle.onclick = () => setSidebar(!get("glossary-sidebar").hidden);
function changeSummary() {
  const box = get("change-summary");
  const recent = recentChanges.get(selectedKey());
  const change = dirty() ? { before: saved, after: target.value } : recent;
  box.hidden = !change;
  box.replaceChildren();
  if (!change) return;
  const heading = document.createElement("strong");
  heading.textContent = dirty()
    ? "수정 중 · 아직 저장하지 않았습니다"
    : "이번 검수에서 저장한 변경";
  box.append(heading);
  for (const [label, value] of [
    ["수정 전", change.before],
    ["수정 후", change.after],
  ]) {
    const line = document.createElement("p");
    line.textContent = `${label}: ${value}`;
    box.append(line);
  }
}
function locate(step = 0, reveal = true) {
  if (!matchCount) return;
  matchIndex = (matchIndex + step + matchCount) % matchCount;
  if (reveal) korean.scrollIntoView?.({ block: "start", behavior: "smooth" });
  for (const frame of [japanese, korean]) {
    frame.contentDocument
      ?.querySelectorAll("[data-review-match]")
      [matchIndex]?.scrollIntoView?.({ block: "center" });
  }
  get("matches").textContent =
    `선택한 항목의 ${matchCount}개 위치 중 ${matchIndex + 1}번째입니다. 속성 번역은 입력란·도움말·접근성 이름에 적용됩니다.`;
}
get("locate").onclick = () => locate();
get("match-previous").onclick = () => locate(-1);
get("match-next").onclick = () => locate(1);
const clean = (value: string) => value.replace(/^📝 /u, "");
const dirty = () => target.value !== saved;
async function api(path: string, init?: RequestInit) {
  const response = await fetch(path, init);
  const body = await response.json();
  if (!response.ok)
    throw new Error(body.error ?? "요청을 처리하지 못했습니다.");
  return body;
}
function notice(message: string) {
  get("notice").textContent = message;
}
function canLeave() {
  return (
    !busy && (!dirty() || confirm("저장하지 않은 수정 내용을 버리시겠습니까?"))
  );
}
function visibleEntries() {
  return data
    .flatMap((dictionary) =>
      dictionary.entries.map((entry, index) => ({ dictionary, entry, index })),
    )
    .filter(({ dictionary, entry }) => {
      const draft = entry.target.startsWith("📝 ");
      return (
        (!dictionaries.value || dictionary.file === dictionaries.value) &&
        (filter.value !== "draft" || draft) &&
        (filter.value !== "approved" || !draft) &&
        [entry.source, entry.target, entry.selector, dictionary.file]
          .join(" ")
          .toLowerCase()
          .includes(search.value.toLowerCase())
      );
    });
}
function nextDraft() {
  const entries = visibleEntries();
  const current = entries.findIndex(
    (item) =>
      item.dictionary === selected?.dictionary && item.index === selected.index,
  );
  const following = [
    ...entries.slice(current + 1),
    ...entries.slice(0, current < 0 ? 0 : current),
  ];
  return following.find((item) => item.entry.target.startsWith("📝 "));
}
function moveEntry(step: number) {
  if (!canLeave()) return;
  const entries = visibleEntries();
  const current = entries.findIndex(
    (item) =>
      item.dictionary === selected?.dictionary && item.index === selected.index,
  );
  const item = entries[current + step];
  if (item) {
    select(item.dictionary, item.index);
    target.focus({ preventScroll: true });
  }
}
get("entry-previous").onclick = () => moveEntry(-1);
get("entry-next").onclick = () => moveEntry(1);
get("japanese-toggle").onclick = () => {
  const pane = get("japanese-pane");
  pane.hidden = !pane.hidden;
  get("previews").classList.toggle("show-japanese", !pane.hidden);
  get("japanese-toggle").setAttribute("aria-expanded", String(!pane.hidden));
  get("japanese-toggle").textContent = pane.hidden
    ? "일본어 원문 함께 보기"
    : "일본어 원문 접기";
};
function list() {
  const container = get("entries");
  container.replaceChildren();
  let count = 0;
  for (const dictionary of data) {
    if (dictionaries.value && dictionary.file !== dictionaries.value) continue;
    dictionary.entries.forEach((entry, index) => {
      const draft = entry.target.startsWith("📝 ");
      if (
        (filter.value === "draft" && !draft) ||
        (filter.value === "approved" && draft)
      )
        return;
      if (
        ![entry.source, entry.target, entry.selector, dictionary.file]
          .join(" ")
          .toLowerCase()
          .includes(search.value.toLowerCase())
      )
        return;
      count++;
      const button = document.createElement("button");
      button.classList.toggle(
        "active",
        selected?.dictionary === dictionary && selected.index === index,
      );
      button.dataset.reviewStatus = draft ? "draft" : "approved";
      button.textContent = clean(entry.target);
      if (recentChanges.has(`${dictionary.file}:${index}`)) {
        const changed = document.createElement("span");
        changed.className = "changed-tag";
        changed.textContent = "수정됨";
        button.append(changed);
      }
      const detail = document.createElement("small");
      detail.textContent = `${draft ? "미검수" : "검수 완료"} · ${entry.source}`;
      button.append(detail);
      button.onclick = () => {
        if (canLeave()) select(dictionary, index);
      };
      container.append(button);
    });
  }
  const drafts = data
    .flatMap((d) => d.entries)
    .filter((e) => e.target.startsWith("📝 ")).length;
  get("summary").textContent = `${count}개 표시 · 전체 미검수 ${drafts}개`;
}
function select(dictionary: Dictionary, index: number, keepPage = false) {
  matchIndex = 0;
  selected = { dictionary, index };
  const entry = dictionary.entries[index];
  saved = clean(entry.target);
  target.value = saved;
  original.value = entry.source;
  get("title").textContent = `${dictionary.file} · ${index + 1}번 항목`;
  get("badge").textContent = entry.target.startsWith("📝 ")
    ? "미검수"
    : "검수 완료";
  get("context").textContent =
    `${entry.selector}${entry.attribute ? ` · 속성: ${entry.attribute}` : " · 본문 텍스트"}`;
  get("variables").textContent = entry.variables
    ? `이름 있는 변수: ${JSON.stringify(entry.variables)}`
    : "";
  get("dirty").textContent = "";
  notice("");
  changeSummary();
  list();
  const preferred = dictionary.file.replace(/\.json$/u, ".html");
  if (
    !keepPage &&
    [...pages.options].some((o) => o.value === preferred) &&
    pages.value !== preferred
  ) {
    pages.value = preferred;
    void loadPage();
  } else preview();
}
function preview() {
  try {
    renderPreview();
  } catch (error) {
    get("matches").textContent =
      `미리보기를 표시할 수 없습니다: ${String(error)}`;
  }
}
function renderPreview() {
  if (!selected || !pageHtml) return;
  const { dictionary, index } = selected;
  const entry = { ...dictionary.entries[index], target: target.value };
  const ja = new DOMParser().parseFromString(pageHtml, "text/html");
  const ko = new DOMParser().parseFromString(pageHtml, "text/html");
  const activeDictionaries = [
    ...data.filter(
      (d) =>
        ["common.json", "shared.json"].includes(d.file) && d !== dictionary,
    ),
    dictionary,
  ];
  const active = activeDictionaries.flatMap((d) =>
    d.entries.map((e, i) => ({ dictionary: d, index: i, entry: e })),
  );
  const frameStyle = `
    [data-review-status="draft"] { outline: 2px dashed #ba6500 !important; outline-offset: 2px !important; }
    [data-review-status="approved"] { outline: 2px solid #21804c !important; outline-offset: 2px !important; }
    [data-review-match] { outline: 4px solid #3457d5 !important; outline-offset: 3px !important; background-color: #eaf0ff !important; }
    [data-review-entry] { cursor: pointer !important; }
    #review-location-label { position: fixed; top: 8px; right: 8px; z-index: 2147483647; padding: 8px 12px; background: #203d9b; color: white; border-radius: 6px; font: 13px/1.5 sans-serif; pointer-events: none; }
  `;
  for (const doc of [ja, ko]) {
    const style = doc.createElement("style");
    style.textContent = frameStyle;
    doc.head.append(style);
    for (const item of active) {
      for (const el of doc.querySelectorAll(item.entry.selector)) {
        const values = item.entry.attribute
          ? [el.getAttribute(item.entry.attribute)]
          : [...el.childNodes]
              .filter((n) => n.nodeType === 3)
              .map((n) => n.nodeValue);
        if (
          !values.some(
            (value) =>
              value !== null &&
              translatedValue(value, item.entry) !== undefined,
          )
        )
          continue;
        const isSelected =
          item.dictionary === dictionary && item.index === index;
        // Keep the selected entry visible when multiple rules affect one element.
        if (el.hasAttribute("data-review-match") && !isSelected) continue;
        el.setAttribute(
          "data-review-status",
          item.entry.target.startsWith("📝 ") ? "draft" : "approved",
        );
        el.setAttribute(
          "data-review-entry",
          `${item.dictionary.file}:${item.index}`,
        );
        if (isSelected) el.setAttribute("data-review-match", "true");
      }
    }
    const label = doc.createElement("div");
    label.id = "review-location-label";
    label.textContent = `파랑: 선택한 항목 · ${dictionary.entries[index].target.startsWith("📝 ") ? "미검수" : "검수 완료"}${dirty() ? " · 수정 중" : recentChanges.has(selectedKey()) ? " · 수정 저장됨" : ""}`;
    doc.body.append(label);
  }
  applyTranslations(
    ko,
    active.map((item) =>
      item.dictionary === dictionary && item.index === index
        ? entry
        : item.entry,
    ),
  );
  matchCount = ja.querySelectorAll("[data-review-match]").length;
  matchIndex = matchCount ? Math.min(matchIndex, matchCount - 1) : 0;
  for (const id of ["locate", "match-previous", "match-next"])
    get<HTMLButtonElement>(id).disabled = matchCount === 0;
  get("matches").textContent = matchCount
    ? `선택한 항목이 ${matchCount}곳에 표시됩니다. ‘수정 위치 보기’를 누르면 해당 위치로 이동합니다.`
    : "이 페이지에는 선택한 항목과 정확히 일치하는 문구가 없습니다. 다른 저장된 페이지를 선택하세요. 로그인 상태나 페이지 내용에 따라 표시 여부가 달라집니다.";
  for (const [frame, doc] of [
    [japanese, ja],
    [korean, ko],
  ] as const) {
    frame.onload = () => {
      const document = frame.contentDocument;
      document?.addEventListener("click", (event) => {
        event.preventDefault();
        const el = event.target as Element;
        const key = el
          .closest?.("[data-review-entry]")
          ?.getAttribute("data-review-entry");
        if (!key || !canLeave()) return;
        const [file, position] = key.split(":");
        const dictionary = data.find((d) => d.file === file);
        if (dictionary) select(dictionary, Number(position), true);
      });
      document?.addEventListener("submit", (event) => event.preventDefault());
      locate(0, false);
    };
    frame.srcdoc = `<!doctype html>${doc.documentElement.outerHTML}`;
  }
}
async function loadPage() {
  const request = ++pageRequest;
  pageHtml = "";
  matchCount = 0;
  matchIndex = 0;
  for (const id of ["locate", "match-previous", "match-next"])
    get<HTMLButtonElement>(id).disabled = true;
  japanese.srcdoc = "";
  korean.srcdoc = "";
  if (!pages.value) {
    get("matches").textContent =
      "저장된 페이지가 없습니다. tmp/pages/에 일본어 HTML 파일을 추가하면 미리보기를 볼 수 있습니다.";
    return;
  }
  try {
    const result = await api(
      `/api/ui-pages/${encodeURIComponent(pages.value)}`,
    );
    if (request !== pageRequest) return;
    pageHtml = result.html;
    preview();
  } catch (error) {
    if (request === pageRequest) notice(String(error));
  }
}
async function save(action: string) {
  if (!selected || busy) return;
  const following = action === "approve" ? nextDraft() : undefined;
  busy = true;
  target.disabled = true;
  const buttons = ["save", "approve", "unapprove"].map((id) =>
    get<HTMLButtonElement>(id),
  );
  buttons.forEach((b) => (b.disabled = true));
  try {
    const { dictionary, index } = selected;
    const result = await api(`/api/ui/${dictionary.file}/${index}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        target: target.value,
        revision: dictionary.revision,
        action,
      }),
    });
    if (saved !== clean(result.entry.target))
      recentChanges.set(selectedKey(), {
        before: saved,
        after: clean(result.entry.target),
      });
    dictionary.revision = result.revision;
    dictionary.entries[index] = result.entry;
    if (following) {
      select(following.dictionary, following.index);
      notice("승인했습니다. 다음 미검수 항목으로 이동했습니다.");
    } else {
      select(dictionary, index, true);
      notice(
        action === "approve"
          ? "승인했습니다. 현재 필터에 남은 미검수 항목이 없습니다."
          : action === "unapprove"
            ? "미검수로 변경했습니다."
            : action === "unapprove"
              ? "미검수로 변경했습니다."
              : "저장했습니다. 검수 상태는 그대로 유지됩니다.",
      );
    }
  } catch (error) {
    notice(String(error));
  } finally {
    busy = false;
    target.disabled = false;
    target.focus({ preventScroll: true });
    buttons.forEach((b) => (b.disabled = false));
  }
}
search.oninput = list;
dictionaries.onchange = list;
filter.onchange = list;
pages.onchange = () => void loadPage();
target.oninput = () => {
  get("dirty").textContent = dirty() ? "저장하지 않은 수정 내용" : "";
  changeSummary();
  preview();
};
for (const action of ["save", "approve", "unapprove"])
  get(action).onclick = () => void save(action);
window.addEventListener("beforeunload", (event) => {
  if (dirty() || busy) event.preventDefault();
});
document.addEventListener("keydown", (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
    event.preventDefault();
    void save("approve");
    return;
  }
  if ((event.ctrlKey || event.metaKey) && event.key === "s") {
    event.preventDefault();
    void save("save");
  }
});
async function start() {
  try {
    const result = await api("/api/ui");
    data = result.dictionaries;
    dictionaries.add(new Option("전체 사전", ""));
    data.forEach((d) => dictionaries.add(new Option(d.file, d.file)));
    result.pages.forEach((name: string) => pages.add(new Option(name, name)));
    if (data[0]?.entries.length) select(data[0], 0);
    list();
    await loadPage();
  } catch (error) {
    notice(String(error));
  }
}
void start();
