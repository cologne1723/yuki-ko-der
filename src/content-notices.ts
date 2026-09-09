import { message } from "./extension-messages";

export function createContentNotices(
  document: Document,
  retryLoad: () => Promise<void>,
) {
  const notices = new Map<string, { text: string; retry: boolean }>();
  const notice = document.createElement("p");
  notice.id = "yukicoder-ko-status";
  notice.setAttribute("role", "status");
  notice.style.cssText = "font:inherit;font-size:0.9em;margin:0.5em 0";
  let noticeText = "";
  let showOriginal: (() => void) | undefined;
  let actionLabel = "원문 보기";

  function renderNotice() {
    const text = [...notices.values()].map((value) => value.text).join(" ");
    const retry = [...notices.values()].some((value) => value.retry);
    const identity = text + retry + Boolean(showOriginal) + actionLabel;
    if (!text && !showOriginal) {
      notice.remove();
      noticeText = "";
      return;
    }
    if (noticeText === identity && notice.isConnected) return;
    noticeText = identity;
    notice.replaceChildren(document.createTextNode(text));
    if (retry) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = message("retry");
      button.style.marginInlineStart = "0.5em";
      button.onclick = () => {
        void retryLoad();
      };
      notice.append(button);
    }
    if (showOriginal) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = actionLabel;
      if (text || retry) button.style.marginInlineStart = "0.5em";
      button.onclick = () => showOriginal?.();
      notice.append(button);
    }
    const heading = document.querySelector("#content > h3");
    if (heading) heading.before(notice);
    else (document.querySelector("#content") ?? document.body).prepend(notice);
  }
  function notify(
    part: string,
    key: Parameters<typeof message>[0],
    retry: boolean,
  ) {
    notices.set(part, { text: message(key), retry });
    renderNotice();
  }
  return {
    notify,
    notifyText(part: string, text: string, retry = false) {
      if (text) notices.set(part, { text, retry });
      else notices.delete(part);
      renderNotice();
    },
    setOriginalAction(action: () => void, label = "원문 보기") {
      showOriginal = action;
      actionLabel = label;
      renderNotice();
    },
    clear() {
      notices.clear();
      showOriginal = undefined;
      renderNotice();
    },
  };
}
