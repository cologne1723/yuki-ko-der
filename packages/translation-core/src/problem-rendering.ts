import createDOMPurify from "dompurify";
import { renderProblemMath } from "./problem-math.ts";

// The layout comparison is not a security boundary. Remote documents must
// remain inert even when their markup differs from the Japanese statement.
export function prepareTranslatedBlocks(blocks: Element[]): HTMLElement[] {
  const allowedTags = new Set(
    "DIV P SPAN BR HR H1 H2 H3 H4 H5 H6 PRE CODE BLOCKQUOTE UL OL LI TABLE THEAD TBODY TFOOT TR TD TH CAPTION A IMG STRONG B EM I U S DEL SUP SUB RUBY RT RP DETAILS SUMMARY".split(
      " ",
    ),
  );
  const allowedAttributes = new Set(
    "class id data-file href src alt title width height colspan rowspan start type open".split(
      " ",
    ),
  );
  return blocks.map((block) => {
    if (
      block.namespaceURI !== "http://www.w3.org/1999/xhtml" ||
      !allowedTags.has(block.tagName)
    ) {
      throw new Error(
        `Translated problem block uses an unsupported root element: <${block.tagName.toLowerCase()}>`,
      );
    }
    const imported = document.importNode(block, true) as HTMLElement;
    const window = document.defaultView;
    if (!window)
      throw new Error("Translation rendering requires a document window");
    const purifier = createDOMPurify(window);
    purifier.sanitize(imported, {
      IN_PLACE: true,
      ALLOWED_TAGS: [...allowedTags].map((tag) => tag.toLowerCase()),
      ALLOWED_ATTR: [...allowedAttributes],
      ALLOW_DATA_ATTR: false,
    });
    for (const element of [imported, ...imported.querySelectorAll("*")]) {
      if (
        element.namespaceURI !== "http://www.w3.org/1999/xhtml" ||
        !allowedTags.has(element.tagName)
      ) {
        element.remove();
        continue;
      }
      for (const attribute of [...element.attributes]) {
        if (!allowedAttributes.has(attribute.name)) {
          element.removeAttribute(attribute.name);
          continue;
        }
        if (attribute.name === "href" || attribute.name === "src") {
          try {
            const url = new URL(attribute.value, "https://yukicoder.me/");
            if (
              attribute.name === "src" &&
              element.tagName === "IMG" &&
              /^data:image\/(?:png|gif|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/u.test(
                attribute.value,
              )
            )
              continue;
            if (!new Set(["https:", "http:"]).has(url.protocol))
              throw new Error("Unsupported URL");
            element.setAttribute(attribute.name, url.href);
          } catch {
            element.removeAttribute(attribute.name);
          }
        }
      }
    }
    renderProblemMath(imported);
    return imported;
  });
}
