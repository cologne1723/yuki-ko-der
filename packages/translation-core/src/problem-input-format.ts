import MarkdownIt from "markdown-it";
import { parseProblemFenceInfo } from "./problem-markdown.ts";

// Only unambiguous math templates. Count rows, allowing separate alternative
// blocks to merge. This does not compare row contents or literal data.
export function missingOutputFormatErrors(
  before: Document,
  after: Document,
): string[] {
  return missingMathFormatErrors(before, after, "出力", "출력");
}

export function missingInputFormatErrors(
  before: Document,
  after: Document,
): string[] {
  return missingMathFormatErrors(before, after, "入力", "입력");
}

function missingMathFormatErrors(
  before: Document,
  after: Document,
  sourceHeading: string,
  targetHeading: string,
): string[] {
  const templates = (document: Document, heading: string) =>
    Array.from(document.querySelectorAll(".block"))
      .flatMap((block) => {
        const section = block.querySelector(":scope > h4")?.textContent?.trim();
        return Array.from(block.querySelectorAll("pre")).filter((pre) => {
          let role = section;
          if (section === "出力") {
            // Some sources put the judge's incoming response under Output.
            // Require an explicit adjacent judge-response/input sentence.
            let context = "";
            for (
              let node = pre.previousSibling;
              node;
              node = node.previousSibling
            ) {
              if (
                node.nodeType === 1 &&
                /^(?:PRE|H[1-6])$/.test((node as Element).tagName)
              )
                break;
              context = (node.textContent ?? "") + context;
              if (context.length > 500) break;
            }
            if (
              /ジャッジ側の答え[^。]*以下の入力が与えられます|ジャッジ側からクエリーに対する答えが以下の様に与えられます/u.test(
                context,
              )
            )
              role = "入力";
          }
          return role === heading;
        });
      })
      .filter((pre) => {
        if (pre.closest(".sample") || pre.querySelector("code")) return false;
        const text = (pre.textContent ?? "").trim();
        // Some sources put literal answers in math delimiters too.
        if (
          !/[A-Za-z\u0370-\u03ff]/u.test(
            text.replace(
              /\b(?:YES|NO|Yes|No|yes|no|true|false|True|False|NaN)\b/gu,
              "",
            ),
          )
        )
          return false;
        const lines = text.split("\n");
        return (
          lines.length > 0 &&
          lines.every((line) =>
            /^(?:(?:\$[^$\n]+\$|\.{3}|…|:)\s*)+$/u.test(line.trim()),
          )
        );
      });
  const rowCount = (document: Document, heading: string) =>
    templates(document, heading).reduce(
      (count, pre) =>
        count +
        (pre.textContent ?? "")
          .trim()
          // Three standalone dot rows are one vertical omission marker.
          // Explicit variable rows and literal sample data are untouched.
          .replace(/^\s*\$\.\$\s*\n\s*\$\.\$\s*\n\s*\$\.\$\s*$/gm, "$\\vdots$")
          .split("\n").length,
      0,
    );
  const expected = rowCount(before, sourceHeading);
  const actual = rowCount(after, targetHeading);
  if (actual < expected)
    return [
      "설명용 " +
        targetHeading +
        " 형식 행 누락: 원문 " +
        expected +
        "개, 번역 " +
        actual +
        "개. 원문의 해당 절에서 형식 블록을 복원하세요.",
    ];
  // Row counts cannot detect p_1 being silently replaced by generic p_i.
  // Protect only explicit numeric subscripts; other notation still needs review.
  const indexed = (document: Document, heading: string) =>
    new Set(
      templates(document, heading).flatMap((pre) =>
        [
          ...(pre.textContent ?? "")
            .replace(/\\,/g, "")
            .matchAll(
              /(?<![A-Za-z\\])([A-Za-z\u0370-\u03ff]|\\[A-Za-z]+)_(?:\{(\d+)\}|(\d))/gu,
            ),
        ].map((match) => `${match[1]}_${match[2] ?? match[3]}`),
      ),
    );
  const present = indexed(after, targetHeading);
  const original = indexed(before, sourceHeading);
  const missing = [...original].filter((value) => {
    const family = value.slice(0, value.lastIndexOf("_"));
    // Only families with an evidenced first (0/1) element are protected.
    // Isolated indices can be source typos, e.g. first row x_1 y_2.
    return (
      (original.has(`${family}_0`) || original.has(`${family}_1`)) &&
      !present.has(value)
    );
  });
  return missing.length
    ? [`설명용 ${targetHeading} 형식의 명시 첨자 누락: ${missing.join(", ")}`]
    : [];
}

// Deliberately narrow: reject recurring, unambiguous prose quantities, not
// every Korean word containing a numeral syllable (e.g. 모두, 두려움).
export function proseQuantityErrors(body: string): string[] {
  const errors: string[] = [];
  for (const token of new MarkdownIt().parse(body, {})) {
    if (token.type !== "inline") continue;
    for (const child of token.children ?? []) {
      if (child.type !== "text") continue;
      const quantities =
        /(?<![가-힣])(?:첫째|둘째|셋째|넷째|(?:첫|두|세|네) 번째|(?:한|두|세|네|다섯|여섯) (?:번|줄|개|명|자리|입력|파일|예|변|대|수열|조건|구간|장|글자|걸음|(?:정수|방향|방법|다중집합|이동|칸|공원)(?=$|[\s.,!?]|으로|이라|부터|까지|[만을은는에의이가와과도])|면(?=$|[\s.,!?]|으로|이라|[만을은에의이과]))|둘 다|하나(?=씩|를|만|의|로|$|[\s.,!?]))/gu;
      for (const match of child.content.matchAll(quantities))
        errors.push(
          `본문 수량·순번을 수식으로 쓰세요 (본문 ${1 + (token.map?.[0] ?? 0)}행): ${match[0]}`,
        );
      // A case reference in prose is not an example heading or literal IO.
      for (const match of child.content
        .replace(/\$[^$\n]*\$/g, "")
        .matchAll(
          /(?<![가-힣])(?:테스트\s+케이스|케이스)\s+\d+(?=$|[가-힣\s.,:;!?])/gu,
        ))
        errors.push(
          `본문 테스트 케이스 번호를 수식으로 쓰세요 (본문 ${1 + (token.map?.[0] ?? 0)}행): ${match[0]}`,
        );
      // Examples' explanatory prose is not sample data. Keep this scoped to
      // recurring units; dates, problem identifiers and code are not quantities.
      for (const match of child.content.matchAll(
        /(?<![A-Za-z0-9])\d+(?:km|cm|mm|kg|ms|행)(?=$|[가-힣\s.,!?])/gu,
      ))
        errors.push(
          `본문 단위 앞 수량을 수식으로 쓰세요 (본문 ${1 + (token.map?.[0] ?? 0)}행): ${match[0]}`,
        );
    }
  }
  return errors;
}

// Structural metadata is independent of the authoring language label.
export function formatFenceErrors(body: string): string[] {
  const tokens = new MarkdownIt().parse(body, {});
  const errors: string[] = [];
  let section = "";
  let samplePart = "";
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (token.type === "heading_open") {
      if (token.tag === "h2") {
        section = tokens[i + 1].content;
        samplePart = "";
      } else if (token.tag === "h4") samplePart = tokens[i + 1].content;
    }
    const io =
      section === "입력" ||
      section === "출력" ||
      (section === "예제" && ["입력", "출력"].includes(samplePart));
    if (!io || token.type !== "fence") continue;
    const info = parseProblemFenceInfo(token.info);
    if (!info.code && info.language !== "text")
      errors.push(
        `입출력 코드 블록의 언어 표지는 text여야 합니다 (본문 ${1 + (token.map?.[0] ?? 0)}행).`,
      );
  }
  return errors;
}

// The compiler supplies the section structure for per-line math checks.
export function inputFormatErrors(document: Document): string[] {
  const errors: string[] = [];
  for (const block of document.querySelectorAll(".block")) {
    const section = block.querySelector("h4")?.textContent?.trim();
    if (section !== "입력" && section !== "출력") continue;
    for (const pre of block.querySelectorAll("pre")) {
      if (pre.closest(".sample")) continue;
      // Explicit source semantics take precedence over an input-section label.
      if (pre.querySelector(":scope > code")) continue;
      const scope = pre.closest(".tex2jax_ignore,.tex2jax_process");
      if (
        scope?.classList.contains("tex2jax_ignore") &&
        !scope.classList.contains("tex2jax_process")
      )
        continue;
      // A protocol response must be explicitly identified as literal nearby;
      // bare T/F can otherwise be input variables.
      const literalCodes = Array.from(
        pre.previousElementSibling?.querySelectorAll("code") ?? [],
      ).filter((code) => !code.closest("pre"));
      for (const line of (pre.textContent ?? "").split("\n")) {
        const text = line.trim();
        // Output includes arbitrary literal answers. Only explicitly math-marked
        // templates are checked here; bare literal strings stay untouched.
        if (section === "출력" && !text.startsWith("$")) continue;
        if (
          /^(?:T|F|Yes|No|NaN|Invalid|! (?:Yes|No|NaN|WIN|LOSE))$/u.test(
            text,
          ) &&
          literalCodes.some((code) => code.textContent === text)
        )
          continue;
        // Literal punctuation and numerical data are not variable expressions.
        if (!/[A-Za-z]/u.test(text)) continue;
        if (!/^\$[^$]+\$$/u.test(text))
          errors.push(
            `설명용 ${section} 형식은 행 전체를 단일 $...$로 감싸세요: ${text}`,
          );
      }
    }
  }
  return errors;
}
