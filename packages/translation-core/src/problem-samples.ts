// Only sample input/output is invariant across translations. Prose, headings,
// formulas, filenames, and the surrounding layout may be edited freely.
interface Sample {
  name: string;
  file: string;
  values: string[];
}

interface SampleValue {
  value: string;
  sample: Sample;
  index: number;
}

export function samplePreText(pre: Element): string {
  const text = (node: Node): string => {
    if (node.nodeType === 3 || node.nodeType === 4) return node.nodeValue ?? "";
    if (node.nodeType === 1 && (node as Element).tagName === "BR") return "\n";
    return Array.from(node.childNodes).map(text).join("");
  };
  let payload = text(pre);
  // Some source tables wrap explicit CODE payloads in decorative $~$ padding
  // (No. 3237), or indent CODE/BR/CODE lines (No. 2965). Only discard text
  // outside those explicit payloads when every other node is known layout.
  if (pre.tagName === "TD") {
    const nodes = [...pre.childNodes];
    const codes = nodes.filter(
      (node) => node.nodeType === 1 && (node as Element).tagName === "CODE",
    );
    if (
      codes.length > 0 &&
      codes.slice(1).every((code) => {
        let previous = code.previousSibling;
        while (previous?.nodeType === 3) previous = previous.previousSibling;
        return (
          previous?.nodeType === 1 && (previous as Element).tagName === "BR"
        );
      }) &&
      nodes.every((node) =>
        node.nodeType === 3
          ? !node.textContent?.replace(/\$~\$/gu, "").trim()
          : node.nodeType === 1 &&
            /^(?:CODE|BR)$/u.test((node as Element).tagName),
      )
    )
      payload = nodes
        .filter((node) => node.nodeType === 1)
        .map(text)
        .join("");
  }
  const value = payload.replace(/\r\n?/g, "\n").replace(/\n$/, "");
  // Bare numeric math in table cells is presentation, unlike literal PRE/CODE
  // payloads. Never evaluate arbitrary TeX or normalize data whitespace.
  if (
    pre.tagName === "TD" &&
    !pre.querySelector("pre,code") &&
    /^(?:[?!] )?(?:\$-?\d+\$|-?\d+)(?: (?:\$-?\d+\$|-?\d+))*$/u.test(value)
  )
    return value.replace(/\$(-?\d+)\$/gu, "$1");
  return value;
}

function tableSampleCells(sample: Element): Set<Element> {
  const cells = new Set<Element>();
  for (const table of [
    ...(sample.matches("table") ? [sample] : []),
    ...sample.querySelectorAll("table"),
  ]) {
    if (table.closest(".sample") !== sample.closest(".sample")) continue;
    const rows = [...table.querySelectorAll("tr")].filter(
      (row) => row.closest("table") === table,
    );
    // Spanning layouts require explicit support, not guessed column indices.
    if (
      rows.some((row) =>
        [...row.children].some((cell) =>
          ["colspan", "rowspan"].some(
            (key) => Number(cell.getAttribute(key) ?? 1) !== 1,
          ),
        ),
      )
    )
      continue;
    const header = rows.find((row) => row.querySelector(":scope > th"));
    if (!header) continue;
    const columns = [...header.children].flatMap((cell, index) =>
      /^(?:(?:Player|플레이어)\s+[A-Z]\s+|(?:Alice|Bob)\s*(?:の|의)\s*|(?:プログラム側の|ジャッジ側の|プログラムによる|ジャッジから与えられる|プログラムからの|プログラムの))?(?:入力|出力|입력|출력|input|output)$/iu.test(
        (cell.textContent ?? "").replace(/\$~\$/gu, "").trim(),
      )
        ? [index]
        : [],
    );
    for (const row of rows.slice(rows.indexOf(header) + 1)) {
      if (row.children.length !== header.children.length) continue;
      for (const index of columns) {
        const cell = row.children[index];
        if (
          cell.tagName === "TD" &&
          (cell.textContent?.trim() || cell.querySelector("pre,code"))
        )
          cells.add(cell);
      }
    }
  }
  return cells;
}

function sampleNodes(sample: Element, headings = false): Element[] {
  const cells = tableSampleCells(sample);
  return [...sample.querySelectorAll(headings ? "h6,pre,td" : "pre,td")].filter(
    (node) =>
      node.closest(".sample") === sample &&
      (cells.has(node) ||
        (node.tagName !== "TD" && !cells.has(node.closest("td")!))),
  );
}

// Headed sample input/output is data; a later unheaded pre may be explanatory
// prose or a worked trace. Legacy unheaded samples retain the previous behavior.
export function sampleDataPres(sample: Element): Element[] {
  const nodes = sampleNodes(sample, true);
  if (!nodes.some((node) => node.tagName === "H6"))
    return nodes.filter((node) => node.tagName !== "H6");
  let pending = false;
  let inputHeading = false;
  const outputOnly =
    [...sample.ownerDocument.querySelectorAll("p")].some(
      (paragraph) =>
        /\boutput-only\b/iu.test(paragraph.textContent ?? "") &&
        /入力は与えられません|입력은 주어지지 않습니다/u.test(
          paragraph.textContent ?? "",
        ),
    ) ||
    [...sample.ownerDocument.querySelectorAll(".block")].some(
      (block) =>
        /^(?:入力|입력)$/u.test(
          block.querySelector(":scope > h4")?.textContent?.trim() ?? "",
        ) &&
        [...block.querySelectorAll(":scope > p")].some((p) =>
          /^(?:入力は与えられません。|입력은 주어지지 않습니다\.)/u.test(
            p.textContent?.trim() ?? "",
          ),
        ),
    );
  return nodes.filter((node) => {
    if (node.tagName === "TD") return true;
    if (node.tagName === "H6") {
      inputHeading = /^(?:入力|입력|input)$/iu.test(
        node.textContent?.trim() ?? "",
      );
      // These are source-observed IO labels, including interactive/multilingual
      // statements. Match heading text only; never normalize the sample bytes.
      pending =
        /^(?:\u202e)?(?:(?:入力|出力)(?:例)?[0-9０-９]*|定数|返すべき値|입력|출력|입력과 답변|출력과 질문|저지의 출력|input|output|回答プログラムの出力|応答プログラムの出力|提出プログラムの出力|ジャッジプログラムの出力|ジャッジの出力|входные данные|выходные данные|invoer|เอาต์พุต)$/iu.test(
          node.textContent?.trim() ?? "",
        );
      return false;
    }
    const data = pending;
    pending = false;
    // Only a literally empty input placeholder in an explicitly input-free
    // output-only statement is layout. Blank-line data and empty outputs stay.
    if (outputOnly && inputHeading && node.childNodes.length === 0)
      return false;
    return data;
  });
}

// Some source statements use paragraph labels instead of .sample wrappers.
// Require the explicit sample section, numbered label, and adjacent IO label;
// do not infer examples from arbitrary PRE elements elsewhere in the statement.
function paragraphSamples(
  block: Element,
): (Omit<Sample, "values"> & { elements: Element[] })[] {
  if (!block.matches(".block"))
    return [...block.querySelectorAll(".block")].flatMap(paragraphSamples);
  if (
    !/^(?:サンプル|入出力例|出力例)$/u.test(
      block.querySelector(":scope > h4, :scope > h5")?.textContent?.trim() ??
        "",
    )
  )
    return [];
  const result: (Omit<Sample, "values"> & { elements: Element[] })[] = [];
  const adjacentIO = (container: Element): Element[] =>
    [...container.querySelectorAll(":scope > pre")].filter((pre) => {
      const heading = pre.previousElementSibling;
      return (
        heading?.matches("h6") &&
        /^(?:入力|出力)$/u.test(heading.textContent?.trim() ?? "")
      );
    });
  // Observed legacy layouts: an unnumbered h5 sample section, or numbered
  // my-sample wrappers. Require explicit IO headings, never arbitrary PREs.
  for (const wrapper of block.querySelectorAll(":scope > .my-sample")) {
    const name =
      wrapper.querySelector(":scope > h5")?.textContent?.trim() ?? "";
    if (!/^サンプル\s*[0-9]+$/u.test(name)) continue;
    const elements = [
      ...wrapper.querySelectorAll(":scope > .paragraph"),
    ].flatMap(adjacentIO);
    if (elements.length)
      result.push({
        name,
        file: wrapper.getAttribute("data-file") ?? "",
        elements,
      });
  }
  if (block.querySelector(":scope > h5")?.textContent?.trim() === "サンプル") {
    const elements = adjacentIO(block);
    if (elements.length) result.push({ name: "サンプル", file: "", elements });
  }
  let current: (typeof result)[number] | undefined;
  for (const node of block.children) {
    if (
      node.matches("p,h5") &&
      /^サンプル\s*[0-9]+$/u.test(node.textContent?.trim() ?? "")
    ) {
      current = { name: node.textContent!.trim(), file: "", elements: [] };
      result.push(current);
    } else if (
      current &&
      node.matches("pre") &&
      node.previousElementSibling?.matches("p") &&
      /^(?:(?:Alice|Bob)の)?(?:入力|出力)$/u.test(
        node.previousElementSibling.textContent?.trim() ?? "",
      )
    ) {
      current.elements.push(node);
    } else if (
      current &&
      node.matches(".paragraph") &&
      !node.closest(".sample")
    ) {
      for (const pre of node.querySelectorAll(":scope > pre")) {
        const heading = pre.previousElementSibling;
        if (
          heading?.matches("h6") &&
          /^(?:入力|出力)$/u.test(heading.textContent?.trim() ?? "")
        )
          current.elements.push(pre);
      }
    }
  }
  if (!result.length && !block.querySelector(".sample")) {
    for (const table of block.querySelectorAll("table")) {
      if (table.closest(".block") !== block || table.closest("table table"))
        continue;
      const elements = [...tableSampleCells(table)];
      if (elements.length)
        result.push({ name: "サンプル", file: "", elements });
    }
  }
  // This explicit output-example section may deliberately demonstrate an
  // invalid answer (No. 3177). Preserve its data without judging correctness.
  if (
    !result.length &&
    !block.querySelector(".sample") &&
    block.querySelector(":scope > h4")?.textContent?.trim() === "出力例"
  ) {
    const elements = [...block.querySelectorAll(":scope > pre")];
    if (elements.length) result.push({ name: "出力例", file: "", elements });
  }
  // No. 5003 labels each interactive output with a text-node turn number.
  // Require that explicit adjacent label; unrelated worked PREs are not IO.
  if (
    !result.length &&
    !block.querySelector(".sample") &&
    block.querySelector(":scope > h4")?.textContent?.trim() === "サンプル"
  ) {
    const elements = [...block.querySelectorAll(":scope > pre")].filter(
      (pre) => {
        let label = "";
        for (
          let node = pre.previousSibling;
          node;
          node = node.previousSibling
        ) {
          if (node.nodeType === 3) label = (node.textContent ?? "") + label;
          else if (node.nodeType !== 1 || (node as Element).tagName !== "BR")
            break;
        }
        return /ターン[0-9]+:\s*$/u.test(label);
      },
    );
    if (elements.length) result.push({ name: "サンプル", file: "", elements });
  }
  return result.filter((sample) => sample.elements.length > 0);
}

function collectSamples(blocks: Element[], ioOnly = false): Sample[] {
  return blocks.flatMap((block) =>
    [
      ...(block.matches(".sample") ? [block] : []),
      ...block.querySelectorAll(".sample"),
    ]
      // Mobile branding uses .sample too, but has no sample label or data.
      .filter(
        (sample) =>
          sample.hasAttribute("data-file") || sample.querySelector("h5,pre,td"),
      )
      .map((sample) => ({
        name: sample.querySelector("h5")?.textContent?.trim() ?? "",
        file: sample.getAttribute("data-file") ?? "",
        values: (ioOnly ? sampleDataPres(sample) : sampleNodes(sample))
          .filter((pre) => pre.closest(".sample") === sample)
          .map((pre) => samplePreText(pre)),
      }))
      .concat(
        paragraphSamples(block).map(({ name, file, elements }) => ({
          name,
          file,
          values: elements.map(samplePreText),
        })),
      ),
  );
}

function collectValues(samples: Sample[]): SampleValue[] {
  return samples.flatMap((sample) =>
    sample.values.map((value, index) => ({ value, sample, index })),
  );
}

// A translation may label an originally unheaded alternative output as IO.
// Accept it only at its original position with unchanged data. Every headed
// source IO remains mandatory; unheaded worked prose may still be translated.
function isInlineAlternativeOutput(node: Element): boolean {
  // No. 3068 explicitly identifies this standalone CODE as another accepted
  // output. Do not infer IO from arbitrary inline code or worked explanations.
  const paragraph = node.parentElement;
  if (
    node.tagName !== "CODE" ||
    !node.closest(".sample") ||
    node.closest("pre,td") ||
    paragraph?.tagName !== "P" ||
    paragraph.children.length !== 1
  )
    return false;
  const siblings = [...paragraph.childNodes];
  const index = siblings.indexOf(node);
  const text = (nodes: Node[]) =>
    nodes
      .map((item) => item.textContent ?? "")
      .join("")
      .trim();
  return (
    /^このほか[，、,]$/u.test(text(siblings.slice(0, index))) &&
    /^という出力を行った場合にも正解となります[。．]$/u.test(
      text(siblings.slice(index + 1)),
    )
  );
}

function matchesPromotedSourceBlocks(
  sourceBlocks: Element[],
  translatedValues: SampleValue[],
): boolean {
  const required = new Set(sampleDataElements(sourceBlocks));
  const candidates = sourceBlocks.flatMap((block) =>
    [...block.querySelectorAll("pre,td,code")].filter(
      (node) =>
        required.has(node) ||
        isInlineAlternativeOutput(node) ||
        (node.tagName === "PRE" &&
          node.closest(".sample") &&
          !required.has(node.closest("td")!)),
    ),
  );
  let positions = new Set([0]);
  for (const pre of candidates) {
    const next = required.has(pre) ? new Set<number>() : new Set(positions);
    const value = samplePreText(pre);
    for (const position of positions) {
      if (translatedValues[position]?.value === value) next.add(position + 1);
    }
    positions = next;
    if (!positions.size) return false;
  }
  return positions.has(translatedValues.length);
}

// Publication/runtime digest contract: ordered raw IO, excluding worked prose.
export function sampleDataElements(blocks: Element[]): Element[] {
  return blocks.flatMap((block) =>
    [
      ...(block.matches(".sample") ? [block] : []),
      ...block.querySelectorAll(".sample"),
    ]
      .flatMap(sampleDataPres)
      .concat(paragraphSamples(block).flatMap((sample) => sample.elements)),
  );
}

export function sampleDataValues(blocks: Element[]): string[] {
  return sampleDataElements(blocks).map(samplePreText);
}

export function sampleFileNames(blocks: Element[]): string[] {
  return collectSamples(blocks).map((sample) => sample.file);
}

function sampleIdentity(before?: Sample, after?: Sample): string {
  const describe = (value?: string) => (value ? JSON.stringify(value) : "없음");
  return [
    `예제 이름: 원문 ${describe(before?.name)} / 번역문 ${describe(after?.name)}`,
    `파일 이름: 원문 ${describe(before?.file)} / 번역문 ${describe(after?.file)}`,
  ].join("\n");
}

function missingSampleFix(
  sample: Sample,
  index: number,
  sourceFormat?: "mdx" | "html",
): string {
  const instructions: string[] = [
    "수정 방법: 예제가 이미 있다면 예제 구분 표기를 확인하세요. 없다면 예제와 원문의 입출력 코드 블록을 같은 순서로 추가하세요.",
  ];
  if (sourceFormat !== "html") {
    instructions.push(
      `MDX 예제 제목 형식: ### 예제 ${index + 1} {file=${JSON.stringify(sample.file)}}`,
      '제목의 문구는 바꿀 수 있지만 {file="…"} 표기는 필요합니다. 입력·출력은 이 제목 아래의 코드 블록에 두세요.',
    );
    if (!sample.file)
      instructions.push('원문에 파일 이름이 없으므로 {file=""}를 사용하세요.');
  }
  if (sourceFormat !== "mdx") {
    instructions.push(
      'HTML에서는 예제 제목과 입출력 <pre>를 <div class="sample"> 안에 넣으세요.',
    );
  }
  return instructions.join("\n");
}

export function sampleWarnings(
  sourceBlocks: Element[],
  translatedBlocks: Element[],
  sourceFormat?: "mdx" | "html",
  ioOnly = false,
): string[] {
  const source = collectSamples(sourceBlocks, ioOnly);
  const translated = collectSamples(translatedBlocks, ioOnly);
  // A missing sample wrapper is a structural authoring error. Report it with
  // the format-specific repair instructions before comparing the invariant IO
  // stream. Once both sides contain samples, their wrapper grouping and names
  // are intentionally free to change.
  if (source.length === 0 || translated.length === 0) {
    const warnings: string[] = [];
    for (
      let index = 0;
      index < Math.max(source.length, translated.length);
      index++
    ) {
      const before = source[index];
      const after = translated[index];
      if (before && after) continue;
      warnings.push(
        [
          before
            ? `예제 ${index + 1}을 번역문에서 찾을 수 없습니다. 예제 내용이 있어도 구분 표기가 빠지면 인식되지 않습니다.`
            : `예제 ${index + 1}이 원문에 없습니다.`,
          sampleIdentity(before, after),
          `원문: ${JSON.stringify(before?.values ?? null)} / 번역문: ${JSON.stringify(after?.values ?? null)}`,
          before
            ? missingSampleFix(before, index, sourceFormat)
            : "수정 방법: 원문의 예제 순서와 개수를 확인하고, 번역문에 중복으로 추가한 예제라면 해당 예제 블록을 제거하세요.",
        ].join("\n"),
      );
    }
    if (warnings.length) return warnings;
  }
  const sourceValues = collectValues(source);
  const translatedValues = collectValues(translated);
  // Fully unheaded legacy samples may mix submitted code and actual IO.
  // Labeling only actual IO is safe when every original block, including the
  // explanatory code, still matches in order. Never allow omission or edits.
  const legacySamples = sourceBlocks.flatMap((block) => [
    ...(block.matches(".sample") ? [block] : []),
    ...block.querySelectorAll(".sample"),
  ]);
  if (
    ioOnly &&
    legacySamples.length > 0 &&
    legacySamples.every((sample) => !sample.querySelector("h6"))
  ) {
    const before = collectValues(collectSamples(sourceBlocks));
    const after = collectValues(collectSamples(translatedBlocks));
    if (
      before.length === after.length &&
      before.every((item, index) => item.value === after[index].value)
    )
      return [];
  }
  const warnings: string[] = [];
  for (
    let index = 0;
    index < Math.max(sourceValues.length, translatedValues.length);
    index++
  ) {
    const before = sourceValues[index];
    const after = translatedValues[index];
    if (!before || !after) {
      const beforeSample = before?.sample;
      const afterSample = after?.sample;
      const sampleNumber = beforeSample
        ? source.indexOf(beforeSample) + 1
        : afterSample
          ? translated.indexOf(afterSample) + 1
          : index + 1;
      warnings.push(
        [
          before
            ? `예제 ${sampleNumber} 입출력 ${before.index + 1}을 번역문에서 찾을 수 없습니다. 원문: ${JSON.stringify(before.value)} / 번역문: null. 예제 내용이 있어도 구분 표기가 빠지면 인식되지 않습니다.`
            : `예제 ${sampleNumber} 입출력 ${after?.index === undefined ? 1 : after.index + 1}이 원문에 없습니다. 원문: null / 번역문: ${JSON.stringify(after?.value ?? null)}.`,
          sampleIdentity(beforeSample, afterSample),
          `원문: ${JSON.stringify(before?.value ?? null)} / 번역문: ${JSON.stringify(after?.value ?? null)}`,
          before
            ? missingSampleFix(beforeSample!, sampleNumber - 1, sourceFormat)
            : "수정 방법: 원문의 예제 입출력 순서와 개수를 확인하고, 번역문에 중복으로 추가한 예제라면 해당 예제 블록을 제거하세요.",
        ].join("\n"),
      );
      continue;
    }
    if (before.value !== after.value) {
      warnings.push(
        [
          `예제 ${source.indexOf(before.sample) + 1} 입출력 ${before.index + 1}이 다릅니다. 원문: ${JSON.stringify(before.value)} / 번역문: ${JSON.stringify(after.value)}`,
          sampleIdentity(before.sample, after.sample),
          `수정 방법: 이 예제의 ${before.index + 1}번째 입출력 코드 블록을 찾아 원문 값 ${JSON.stringify(before.value)}을 그대로 넣으세요. 공백, 줄바꿈과 입력·출력 순서를 유지하세요.`,
          sourceFormat === "mdx"
            ? `MDX 예제 위치: ${missingSampleFix(before.sample, source.indexOf(before.sample), sourceFormat)}`
            : "",
        ]
          .filter(Boolean)
          .join("\n"),
      );
    }
  }
  if (
    ioOnly &&
    warnings.length &&
    matchesPromotedSourceBlocks(sourceBlocks, translatedValues)
  )
    return [];
  return warnings;
}
