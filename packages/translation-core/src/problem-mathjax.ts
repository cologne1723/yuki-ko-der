import { suppliedDirectory } from "./problem-math-environment.ts";
import { mathjax } from "mathjax-full/js/mathjax.js";
import { TeX } from "mathjax-full/js/input/tex.js";
import { MathML } from "mathjax-full/js/input/mathml.js";
import { CHTML } from "mathjax-full/js/output/chtml.js";
import { HTMLAdaptor } from "mathjax-full/js/adaptors/HTMLAdaptor.js";
import type { browserAdaptor } from "mathjax-full/js/adaptors/browserAdaptor.js";
import type { MathDocument } from "mathjax-full/js/core/MathDocument.js";
import { HTMLHandler } from "mathjax-full/js/handlers/html/HTMLHandler.js";
import { AssistiveMmlHandler } from "mathjax-full/js/a11y/assistive-mml.js";
import { SafeHandler } from "mathjax-full/js/ui/safe/SafeHandler.js";
import { AllPackages } from "mathjax-full/js/input/tex/AllPackages.js";
import "mathjax-full/js/input/tex/require/RequireConfiguration.js";
import "mathjax-full/js/input/tex/autoload/AutoloadConfiguration.js";
import { Loader, CONFIG } from "mathjax-full/js/components/loader.js";
import type { ProblemMathOptions } from "./problem-math.ts";
if (suppliedDirectory)
  delete (globalThis as unknown as { __dirname?: string }).__dirname;
const availablePackages = [...AllPackages, "physics", "colorv2", "setoptions"];
Loader.preLoad(...availablePackages.map((name) => `[tex]/${name}`));
CONFIG.require = async () => {
  throw new Error("Unbundled MathJax extension");
};
const allowedPackages = Object.fromEntries(
  availablePackages.map((name) => [
    name,
    !["base", "configmacros", "tagformat", "setoptions"].includes(name),
  ]),
);
// Upstream's autoload registry is shared; serialize jobs but isolate macros.
let pending: Promise<unknown> = Promise.resolve();
class ProblemCHTML extends CHTML<HTMLElement, Text, Document> {
  override styleSheet(document: MathDocument<HTMLElement, Text, Document>) {
    const sheet = super.styleSheet(document);
    sheet.id = "yukicoder-ko-MathJax-CHTML-styles";
    return sheet;
  }
}
class SourceMathML extends MathML<HTMLElement, Text, Document> {
  override findMath(node: HTMLElement) {
    // Assistive MathML is output, not new input on a subsequent render job.
    return super.findMath(node).filter((item) => {
      const start = item.start.node;
      const element =
        start?.nodeType === 1 ? (start as HTMLElement) : start?.parentElement;
      return !element?.closest("mjx-container");
    });
  }
}
export function renderMathJax(
  root: HTMLElement,
  options: ProblemMathOptions,
): Promise<void> {
  const render = pending
    .catch(() => {})
    .then(async () => {
      const document = root.ownerDocument;
      const window = document.defaultView ?? globalThis.window;
      if (!window)
        throw new Error("MathJax rendering requires a document window");
      // MathJax 3's MinHTMLElement types predate strict nullable DOM typings.
      const adaptor = new HTMLAdaptor(window as never) as unknown as ReturnType<
        typeof browserAdaptor
      >;
      const handler = SafeHandler(
        AssistiveMmlHandler(new HTMLHandler(adaptor)),
      );
      const html = handler.create(document, {
        InputJax: [
          new TeX({
            packages: [
              "base",
              "ams",
              "newcommand",
              "noundefined",
              "require",
              "autoload",
              "configmacros",
            ],
            inlineMath: [
              ["$", "$"],
              ["\\(", "\\)"],
            ],
            processEscapes: false,
            require: { allow: allowedPackages, defaultAllow: false },
          }),
          new SourceMathML(),
        ],
        OutputJax: new ProblemCHTML({
          fontURL: options.fontUrl ?? "/mathjax/fonts/woff-v2",
          adaptiveCSS: false,
        }),
        skipHtmlTags: [
          "script",
          "noscript",
          "style",
          "textarea",
          "code",
          "annotation",
          "annotation-xml",
          "mjx-container",
        ],
        includeHtmlTags: { br: "\n", wbr: "", "#comment": "" },
        ignoreHtmlClass: "tex2jax_ignore",
        processHtmlClass: "tex2jax_process",
      });
      html.options.elements = [root];
      await mathjax.handleRetriesFor(() => {
        html.render();
      });
    });
  pending = render;
  return render;
}
