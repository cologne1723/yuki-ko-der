import createDOMPurify from "dompurify";
import { renderProblemMath } from "./problem-math.ts";
import {
  detectProblemRenderProfile,
  type ProblemRenderProfile,
} from "./problem-render-profile.ts";
import { resolveProblemUrls } from "./problem-urls.ts";

// The layout comparison is not a security boundary. Remote documents must
// remain inert even when their markup differs from the Japanese statement.
export function sanitizeTranslatedBlocks(
  blocks: Element[],
  options: {
    document?: Document;
    sourceUrl?: string;
  } = {},
): HTMLElement[] {
  const document = options.document ?? globalThis.document;
  const allowedTags = new Set(
    "DIV P SPAN BR WBR HR H1 H2 H3 H4 H5 H6 PRE CODE BLOCKQUOTE UL OL LI TABLE THEAD TBODY TFOOT TR TD TH CAPTION A IMG STRONG B EM I U S DEL SUP SUB RUBY RT RP DETAILS SUMMARY".split(
      " ",
    ),
  );
  const allowedAttributes = new Set(
    "class id data-file href src alt title width height colspan rowspan start type open".split(
      " ",
    ),
  );
  const result = blocks.map((block) => {
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
      }
    }
    resolveProblemUrls(imported, options.sourceUrl ?? document.URL);
    return imported;
  });
  return result;
}

export async function prepareTranslatedBlocks(
  blocks: Element[],
  options: {
    document?: Document;
    profile?: ProblemRenderProfile;
    sourceUrl?: string;
    fontUrl?: string;
    renderHost?: HTMLElement;
  } = {},
): Promise<HTMLElement[]> {
  const document = options.document ?? globalThis.document;
  const profile = options.profile ?? detectProblemRenderProfile(document);
  if (!profile)
    throw new Error(
      "Site math rendering configuration is unavailable or unsupported",
    );
  const result = sanitizeTranslatedBlocks(blocks, options);
  const scope = document.createElement("div");
  scope.append(...result);
  // CHTML measures the surrounding font's x-height. Detached nodes have no
  // computed metrics and silently produce smaller formulas in real browsers.
  const host = options.renderHost ?? document.body;
  if (profile.engine === "mathjax" && host?.isConnected) {
    scope.dataset.yukicoderKoRenderStaging = "";
    scope.setAttribute("aria-hidden", "true");
    scope.setAttribute("inert", "");
    scope.style.cssText =
      "position:absolute;visibility:hidden;pointer-events:none;left:0;top:0";
    scope.style.width = `${host.clientWidth}px`;
    host.append(scope);
  }
  try {
    await renderProblemMath(scope, profile, { fontUrl: options.fontUrl });
  } finally {
    scope.remove();
  }
  return result;
}
