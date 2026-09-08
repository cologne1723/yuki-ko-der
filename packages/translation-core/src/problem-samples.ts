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
  return text(pre).replace(/\r\n?/g, "\n").replace(/\n$/, "");
}

function collectSamples(blocks: Element[]): Sample[] {
  return blocks.flatMap((block) =>
    [
      ...(block.matches(".sample") ? [block] : []),
      ...block.querySelectorAll(".sample"),
    ].map((sample) => ({
      name: sample.querySelector("h5")?.textContent?.trim() ?? "",
      file: sample.getAttribute("data-file") ?? "",
      values: [...sample.querySelectorAll("pre")]
        .filter((pre) => pre.closest(".sample") === sample)
        .map((pre) => samplePreText(pre)),
    })),
  );
}

function collectValues(samples: Sample[]): SampleValue[] {
  return samples.flatMap((sample) =>
    sample.values.map((value, index) => ({ value, sample, index })),
  );
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
): string[] {
  const source = collectSamples(sourceBlocks);
  const translated = collectSamples(translatedBlocks);
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
  return warnings;
}
