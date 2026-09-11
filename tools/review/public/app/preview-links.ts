/** Parent-owned listeners work in a sandboxed srcdoc without enabling scripts. */
export function bindPreviewLinks(
  doc: Document,
  sourceUrl = doc.baseURI,
): () => void {
  const navigate = (event: MouseEvent) => {
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.ctrlKey ||
      event.metaKey ||
      event.altKey ||
      event.shiftKey
    )
      return;
    const target = event.target as Element | null;
    const link = target?.closest?.("a[href]");
    if (!link) return;
    const href = link.getAttribute("href")!;
    if (!href.includes("#")) return;
    let url: URL;
    try {
      url = new URL(href, sourceUrl);
    } catch {
      return;
    }
    const page = new URL(sourceUrl);
    if (
      !href.startsWith("#") &&
      (url.origin !== page.origin ||
        url.pathname !== page.pathname ||
        url.search !== page.search)
    )
      return;
    event.preventDefault();
    let id: string;
    try {
      id = decodeURIComponent(url.hash.slice(1));
    } catch {
      return;
    }
    const anchor = doc.getElementById(id) ?? doc.getElementsByName(id)[0];
    if (anchor) {
      anchor.scrollIntoView();
    } else if (!id || id === "top") {
      const scrolling = doc.scrollingElement ?? doc.documentElement;
      scrolling.scrollTop = 0;
      return;
    }
  };
  doc.addEventListener("click", navigate);
  return () => doc.removeEventListener("click", navigate);
}
