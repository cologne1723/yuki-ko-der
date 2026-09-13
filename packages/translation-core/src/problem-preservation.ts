import katex from "katex";
import delimiterModule from "katex/contrib/auto-render/splitAtDelimiters.ts";
import {
  sampleWarnings,
  sampleDataPres,
  sampleFileNames,
} from "./problem-samples.ts";
import { HTMLDomStrings } from "mathjax-full/js/handlers/html/HTMLDomStrings.js";
import { HTMLAdaptor } from "mathjax-full/js/adaptors/HTMLAdaptor.js";
import type { browserAdaptor } from "mathjax-full/js/adaptors/browserAdaptor.js";
import { FindTeX } from "mathjax-full/js/input/tex/FindTeX.js";
import {
  validProblemRenderProfile,
  type ProblemRenderProfile,
} from "./problem-render-profile.ts";
import { isLocalProblemImageReference } from "./problem-assets.ts";

// KaTeX ships this TS helper in a CommonJS package. tsx and bundlers expose
// different default interop; regression tests cover the installed dependency.
const splitAtDelimiters: typeof delimiterModule =
  typeof delimiterModule === "function"
    ? delimiterModule
    : (delimiterModule as unknown as { default: typeof delimiterModule })
        .default;

const delimiters = [
  { left: "$$", right: "$$", display: true },
  { left: "\\(", right: "\\)", display: false },
  { left: "\\[", right: "\\]", display: true },
  { left: "$", right: "$", display: false },
];

function normalizeFormula(tex: string): string {
  return tex
    .replace(/\\text\{그\s*외\}/gu, String.raw`\text{otherwise}`)
    .replace(/\\,/gu, "")
    .replace(/\s/gu, "");
}

// Explicit parenthesized radix notation is a digit string, not a decimal
// integer. Limit this exemption to the base of this exact MathML subscript.
function hasNonDecimalRadix(number: Element): boolean {
  let base = number;
  while (
    base.parentElement?.localName === "mrow" &&
    base.parentElement.children.length === 1
  )
    base = base.parentElement;
  const subscript = base.parentElement;
  if (subscript?.localName !== "msub" || subscript.children[0] !== base)
    return false;
  const match = subscript.children[1]?.textContent?.match(
    /^\(([2-9]|[12][0-9]|3[0-6])\)$/u,
  );
  if (!match || Number(match[1]) === 10) return false;
  return [...(number.textContent ?? "")].every(
    (digit) => /[0-9]/u.test(digit) && Number(digit) < Number(match[1]),
  );
}

function statementRoot(document: Document): HTMLElement {
  const root = (
    document.querySelector(".problem-statement") ?? document.body
  ).cloneNode(true) as HTMLElement;
  root.querySelectorAll(".sample").forEach((sample) =>
    // Keep the element as a boundary: deleting it could join dollar signs
    // in unrelated text nodes on either side of a sample PRE.
    sampleDataPres(sample).forEach((node) => node.replaceChildren()),
  );
  return root;
}

interface Formula {
  tex: string;
  display: boolean;
}
function katexFormulas(root: HTMLElement): Formula[] {
  const formulas: Formula[] = [];
  const ignored = new Set([
    "script",
    "noscript",
    "style",
    "textarea",
    "code",
    "option",
  ]);
  const visit = (element: Element) => {
    if (
      ignored.has(element.tagName.toLowerCase()) ||
      element.classList.contains("tex2jax_ignore")
    )
      return;
    for (let node = element.firstChild; node;) {
      if (node.nodeType === 3) {
        let text = "";
        do {
          text += node.nodeValue ?? "";
          node = node.nextSibling;
        } while (node?.nodeType === 3);
        formulas.push(
          ...splitAtDelimiters(text, delimiters)
            .filter((part) => part.type === "math")
            .map((part) => ({ tex: part.data, display: !!part.display })),
        );
      } else {
        if (node.nodeType === 1) visit(node as Element);
        node = node.nextSibling;
      }
    }
  };
  visit(root);
  return formulas;
}

function mathjaxFormulas(root: HTMLElement, document: Document): Formula[] {
  if (!document.defaultView)
    throw new Error("MathJax scanning requires a document window");
  const scanner = new HTMLDomStrings<HTMLElement, Text, Document>({
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
  scanner.adaptor = new HTMLAdaptor(
    document.defaultView as never,
  ) as unknown as ReturnType<typeof browserAdaptor>;
  const finder = new FindTeX<HTMLElement, Text, Document>({
    inlineMath: [
      ["$", "$"],
      ["\\(", "\\)"],
    ],
    processEscapes: false,
  });
  return finder
    .findMath(scanner.find(root)[0])
    .filter((item) => item.display !== null)
    .map((item) => ({ tex: item.math, display: !!item.display }));
}

function statementMath(
  document: Document,
  profile?: ProblemRenderProfile,
): Formula[] {
  if (profile && !validProblemRenderProfile(profile))
    throw new Error("Unsupported preservation render profile");
  const root = statementRoot(document);
  if (profile?.engine === "mathjax") return mathjaxFormulas(root, document);
  const katex = katexFormulas(root);
  if (profile) return katex;
  // Without evidence, only compare formulas both engines identify; do not
  // choose an engine by age, problem number, heading, or formula appearance.
  const common = mathjaxFormulas(root, document).map((item) =>
    JSON.stringify(item),
  );
  return katex.filter((item) => {
    const index = common.indexOf(JSON.stringify(item));
    if (index < 0) return false;
    common.splice(index, 1);
    return true;
  });
}

export function statementFormulas(
  document: Document,
  profile?: ProblemRenderProfile,
): string[] {
  return statementMath(document, profile).map((item) => item.tex);
}

// Literal TeX examples inside explicit source ignore scopes are not newly hidden
// mathematics when represented by inline CODE. Keep DOM boundaries and honor
// MathJax's process override; unknown profiles use the narrower shared exemption.
function ignoredSourceLiterals(
  document: Document,
  profile?: ProblemRenderProfile,
): Set<string> {
  const root = statementRoot(document);
  const elements = [root, ...root.querySelectorAll("*")];
  for (const element of elements) {
    let ignored = false;
    for (
      let ancestor: Element | null = element;
      ancestor;
      ancestor = ancestor.parentElement
    ) {
      if (
        profile?.engine !== "katex" &&
        ancestor.classList.contains("tex2jax_process")
      )
        break;
      if (ancestor.classList.contains("tex2jax_ignore")) {
        ignored = true;
        break;
      }
    }
    if (!ignored)
      for (const node of element.childNodes)
        if (node.nodeType === 3) node.nodeValue = "";
  }
  for (const element of elements) element.classList.remove("tex2jax_ignore");
  return new Set(katexFormulas(root).map((item) => normalizeLiteral(item.tex)));
}

function normalizeLiteral(tex: string): string {
  return tex.replace(/\\,/gu, "").replace(/\s/gu, "");
}

export function preservationErrors(
  source: Document,
  translated: Document,
  profile?: ProblemRenderProfile,
  corrections: readonly SourceFormulaCorrection[] = [],
  binaryLiteralFormulas: readonly string[] = [],
): string[] {
  const errors = sampleWarnings([source.body], [translated.body], "mdx", true);
  // Flag an observed Korean ambiguity; never infer or rewrite the intended scope.
  for (const paragraph of translated.querySelectorAll("p, li")) {
    if (paragraph.closest(".sample")) continue;
    const sentence = (paragraph.textContent ?? "").split(/[.!?。]/u)[0];
    if (
      /모든\s+[^.!?。]{1,100}중\s*하나/u.test(sentence) &&
      !/각각|각\s+\S+마다|개별|모두\s+같은/u.test(sentence)
    )
      errors.push(
        "선택 범위가 모호합니다: '모든 … 중 하나'. 원문·예제로 각 대상의 개별 선택인지 모두 같은 선택인지 확인하고 명시하세요.",
      );
  }
  const literalCodes = new Set(
    [...source.querySelectorAll("code")].map((node) => node.textContent),
  );
  const ignoredLiterals = ignoredSourceLiterals(source, profile);
  const inputRows = new Set<string>();
  for (const block of translated.querySelectorAll(".block")) {
    if (block.querySelector("h4")?.textContent?.trim() !== "입력") continue;
    for (const pre of block.querySelectorAll("pre")) {
      for (const row of (pre.textContent ?? "").split("\n")) {
        if (/^\$[^$]+\$$/u.test(row.trim()))
          inputRows.add(
            row
              .trim()
              .slice(1, -1)
              .replace(/\\ /gu, " ")
              .replace(/\s+/gu, " ")
              .trim(),
          );
      }
    }
  }
  for (const code of translated.querySelectorAll("code")) {
    if (code.closest("pre")) continue;
    const value = code.textContent ?? "";
    if (
      /[A-Za-z]/u.test(value) &&
      /\s/u.test(value) &&
      inputRows.has(value.trim()) &&
      !literalCodes.has(value)
    )
      errors.push(
        `설명용 입력 형식을 본문에서 인라인 코드로 반복했습니다: ${value}. 변수 형식은 수식으로 쓰세요.`,
      );
    if (
      /^\$[^$]+\$$/u.test(value) &&
      !literalCodes.has(value) &&
      !ignoredLiterals.has(normalizeLiteral(value.slice(1, -1)))
    )
      errors.push(
        `본문 수식을 인라인 코드로 감쌌습니다: ${value}. 바깥 백틱을 제거하세요.`,
      );
  }
  const order = ["문제 설명", "입력", "제한", "출력", "예제"];
  let previous = -1;
  for (const heading of translated.querySelectorAll(".block > h4")) {
    const label = heading.textContent?.trim() ?? "";
    const rank = order.indexOf(label);
    if (rank < 0) continue; // Preserve optional author notices/background sections.
    if (rank <= previous)
      errors.push(
        `주요 절 순서 오류: ${label}. 문제 설명 → 입력 → 제한 → 출력 → 예제 순서로 두세요.`,
      );
    previous = rank;
  }
  const values = (doc: Document, selector: string, attr: string) =>
    [...doc.querySelectorAll(selector)].map((node) => {
      const value = node.getAttribute(attr) ?? "";
      // Markdown encodes Unicode in absolute HTTP URLs. Compare browser URL
      // serialization, without decoding reserved separators or relative paths.
      if (/^https?:\/\//i.test(value)) {
        try {
          return new URL(value).href;
        } catch {
          return value;
        }
      }
      return value;
    });
  for (const [selector, attr] of [
    ["img", "src"],
    ["a", "href"],
  ]) {
    const originalValues = values(source, selector, attr);
    const translatedValues = values(translated, selector, attr);
    if (JSON.stringify(originalValues) !== JSON.stringify(translatedValues))
      errors.push(`원문과 ${selector}의 ${attr} 또는 순서가 다릅니다.`);
  }
  if (
    JSON.stringify(sampleFileNames([source.body])) !==
    JSON.stringify(sampleFileNames([translated.body]))
  )
    errors.push("원문과 예제의 data-file 또는 순서가 다릅니다.");
  for (const image of translated.querySelectorAll("img[src]")) {
    const src = image.getAttribute("src") ?? "";
    if (src.startsWith("../images/") && !isLocalProblemImageReference(src))
      errors.push(`로컬 문제 이미지 경로가 안전하지 않습니다: ${src}`);
  }
  const math = statementMath(translated, profile);
  const formulas = math.map((item) => item.tex);
  // A diagnostic heuristic, not a TeX parser or an automatic repair: KaTeX
  // accepts lost command names as products of letter variables.
  const sourceFormulas = statementFormulas(source, profile);
  const binaryKey = (formula: string) => formula.replace(/\s/gu, "");
  const sourceNormalized = sourceFormulas.map(binaryKey);
  const translatedNormalized = formulas.map(binaryKey);
  const binaryLiterals = new Set(binaryLiteralFormulas.map(binaryKey));
  for (const formula of binaryLiterals) {
    const count = sourceNormalized.filter((item) => item === formula).length;
    if (count === 0) errors.push("원문 이진 리터럴 근거 불일치: " + formula);
    else if (
      translatedNormalized.filter((item) => item === formula).length !== count
    )
      errors.push("이진 리터럴 수식이 변경되거나 누락되었습니다: " + formula);
  }
  const words = (tex: string) => tex.match(/\\[A-Za-z]+|[A-Za-z]+/gu) ?? [];
  const sourceWords = sourceFormulas.flatMap(words);
  const suspectWords = new Set<string>();
  const bareSource = new Set(
    sourceWords.filter((word) => !word.startsWith("\\")),
  );
  const commands = [
    ...new Set(
      sourceWords
        .filter(
          (word) =>
            word.startsWith("\\") &&
            (word.length >= 4 || word === "\\ge" || word === "\\le"),
        )
        .map((word) => word.slice(1)),
    ),
  ];
  const macros = {};
  for (const { tex: formula, display } of math) {
    if (
      formula.includes("\\\\,") &&
      !sourceFormulas.some((tex) => tex.includes("\\\\,"))
    )
      errors.push(
        "숫자 구분용 쉼표 앞 역슬래시가 두 개입니다. 얇은 공백 명령의 역슬래시는 하나만 저장하세요.",
      );
    for (const word of words(formula)) {
      if (
        !word.startsWith("\\") &&
        !bareSource.has(word) &&
        commands.some((command) =>
          command.length === 2 ? word === command : word.includes(command),
        )
      )
        suspectWords.add(word);
    }
    // Do not rewrite identifiers, leading-zero string data or small tuples.
    const value = formula.trim();
    if (/^-?[1-9]\d{0,2}(?:,\d{3}){2,}$/u.test(value))
      errors.push(
        `정수 서식 확인 필요: ${value}. 수학적 정수는 10\\,000처럼 쓰세요. 날짜·식별자이면 원문을 유지하고 예외를 보고하세요.`,
      );
    if (profile?.engine === "mathjax") continue;
    try {
      const mathml = translated.createElement("div");
      mathml.innerHTML = katex.renderToString(formula, {
        throwOnError: true,
        output: "mathml",
        displayMode: display,
        macros,
        strict: "ignore",
      });
      // Let KaTeX distinguish numeric atoms from commands, identifiers and text.
      for (const number of mathml.querySelectorAll("mn")) {
        if (
          /^[1-9]\d{3,}(?:\.\d+)?$/u.test(number.textContent ?? "") &&
          !hasNonDecimalRadix(number) &&
          !(
            binaryLiterals.has(binaryKey(formula)) &&
            /^[01]+$/u.test(number.textContent ?? "")
          )
        )
          errors.push(
            `정수 서식 확인 필요: ${number.textContent}. 수식 안의 정수도 10\\,000처럼 쓰세요. 날짜·식별자이면 예외를 보고하세요.`,
          );
      }
    } catch (error) {
      // A KaTeX failure is never evidence that MathJax (or an unknown engine)
      // rejects the formula. Unknown-profile parsing above is numeric advice only.
      if (profile?.engine === "katex")
        errors.push(`KaTeX 수식 렌더링 실패: ${String(error)}`);
    }
  }
  // Deliberately narrow normalization: never erase commands or grouping braces.
  if (suspectWords.size)
    errors.push(
      `TeX 역슬래시 누락 의심: ${[...suspectWords].join(", ")}. 원문 수식과 대조하세요. 의도적인 새 변수이면 확인을 요청하세요.`,
    );
  // Matching whole set-bearing formulas prevents unrelated braces masking loss.
  const normalize = normalizeFormula;
  const available = formulas.map(normalize);
  for (const correction of corrections) {
    const count = sourceFormulas.filter(
      (formula) => normalize(formula) === normalize(correction.before),
    ).length;
    if (
      count !== correction.occurrences ||
      !Number.isSafeInteger(correction.occurrences) ||
      correction.occurrences < 1 ||
      corrections.filter(
        (other) => normalize(other.before) === normalize(correction.before),
      ).length !== 1
    )
      errors.push(
        "원문 수식 정정 근거 불일치: " +
          correction.before +
          ". 대상 수식과 출현 횟수를 다시 확인하세요.",
      );
  }
  for (const formula of sourceFormulas) {
    if (!formula.includes("\\{") && !formula.includes("\\}")) continue;
    const correction = corrections.find(
      (item) => normalize(item.before) === normalize(formula),
    );
    const expected = correction?.after ?? formula;
    const index = available.indexOf(normalize(expected));
    if (index < 0) {
      if (correction)
        errors.push("근거 있는 원문 정정 보존 확인 필요: " + expected);
      else
        errors.push(
          `집합 수식 보존 확인 필요: ${formula}. 원문 수식을 유지하세요. 의도적 재구성이면 완료하지 말고 보고하세요.`,
        );
    } else available.splice(index, 1);
  }
  return errors;
}

/** Explicit, occurrence-bound correspondence; this does not waive other checks. */
export interface SourceFormulaCorrection {
  before: string;
  after: string;
  occurrences: number;
}

/** Full checker: synchronous correspondence checks plus the selected engine. */
export async function checkProblemPreservation(
  source: Document,
  translated: Document,
  profile?: ProblemRenderProfile,
  corrections: readonly SourceFormulaCorrection[] = [],
  binaryLiteralFormulas: readonly string[] = [],
): Promise<string[]> {
  const errors = preservationErrors(
    source,
    translated,
    profile,
    corrections,
    binaryLiteralFormulas,
  );
  if (profile?.engine !== "mathjax") return errors;
  const [{ JSDOM }, { renderProblemMath }] = await Promise.all([
    import("jsdom"),
    import("./problem-math.ts"),
  ]);
  // An isolated window keeps renderer styles and DOM mutations out of callers.
  const dom = new JSDOM(statementRoot(translated).outerHTML);
  try {
    await renderProblemMath(dom.window.document.body, profile);
    for (const node of dom.window.document.querySelectorAll("mjx-merror")) {
      errors.push(
        `MathJax 수식 렌더링 실패: ${node.getAttribute("data-mjx-error") ?? node.textContent}`,
      );
    }
    for (const node of dom.window.document.querySelectorAll(
      "mjx-assistive-mml mn",
    )) {
      if (
        /^[1-9]\d{3,}(?:\.\d+)?$/u.test(node.textContent ?? "") &&
        !hasNonDecimalRadix(node)
      )
        errors.push(
          `정수 서식 확인 필요: ${node.textContent}. 수식 안의 정수도 10\\,000처럼 쓰세요. 날짜·식별자이면 예외를 보고하세요.`,
        );
    }
  } finally {
    dom.window.close();
  }
  return errors;
}
