import { message } from "./extension-messages";

export function createContentNotices(
  document: Document,
  retryLoad: () => Promise<void>,
) {
  const notices = new Map<
    string,
    { key: Parameters<typeof message>[0]; retry: boolean }
  >();
  const notice = document.createElement("p");
  notice.id = "yukicoder-ko-status";
  notice.setAttribute("role", "status");
  notice.style.cssText = "font:inherit;font-size:0.9em;margin:0.5em 0";
  let noticeText = "";

  function renderNotice() {
    const text = [...notices.values()]
      .map((value) => message(value.key))
      .join(" ");
    const retry = [...notices.values()].some((value) => value.retry);
    const identity = text + retry;
    if (!text) {
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
    const heading = document.querySelector("#content > h3");
    if (heading) heading.after(notice);
    else (document.querySelector("#content") ?? document.body).prepend(notice);
  }
  function notify(
    part: string,
    key: Parameters<typeof message>[0],
    retry: boolean,
  ) {
    notices.set(part, { key, retry });
    renderNotice();
  }
  return {
    notify,
    clear() {
      notices.clear();
      renderNotice();
    },
  };
}
