import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
const root = "/Users/hyea/yukicoder";
const info = {
  22: {
    id: 68,
    srcTitle: "括弧の対応",
    title: "괄호의 대응",
    ps: [
      `<p>Orino는 텍스트에서 괄호가 대응하는 위치를 찾는 프로그램을 작성하려고 합니다.<br /><br />괄호의 대응이란,<br /><br />1. 주어진 문자열에서 「(」 바로 뒤에 「)」가 오는 문자가 있으면, 문자열에서 그 두 문자를 삭제합니다.<br />2. 삭제한 문자로 새로운 문자열을 만들고 1.의 처리를 반복하여 문자열이 빌 때까지 반복합니다.<br /><br />처음 주어진 문자열에서 (i)번째 문자와 함께 삭제되는 (j)번째 대응 문자가 「괄호의 대응」입니다.<br /><br />「(」와 「)」만으로 구성된 (N)문자 문자열과<br />정수 (K (1 \leq K \leq N))가 주어집니다.<br /><br />이때 (K)번째 문자에 대응하는 문자의 위치를 구하세요.<br /><br /><br />주어지는 문자열의 모든 문자에는 괄호의 대응이 존재한다고 보장됩니다.</p>`,
      `<p>첫째 줄에 문자 수를 나타내는 (N (1 \leq N \leq 10000))과 지정한 문자의 번호 (K (1 \leq K \leq N))가 공백으로 구분되어 주어집니다.<br />둘째 줄에 실제 문자를 나타내는 문자열이 주어집니다. 이 문자열은 「(」 또는 「)」로만 이루어졌음이 보장됩니다.</p>`,
      `<p>답인 정수값을 마지막 줄바꿈과 함께 출력하세요.<br />마지막에 줄바꿈을 출력하세요.</p>`,
      `<p>「(())」 문자열의 (4)번째 문자는 「)」입니다. 이때 대응하는 문자는 (1)번째 「(」입니다.</p>`,
      `<p>「(((())()())) 」이라는 문자열의 (2)번째 문자는 「(」입니다. 이때 대응하는 문자는 (11)번째 「)」입니다.</p>`,
      `<p></p>`,
    ],
  },
  23: {
    id: 33,
    srcTitle: "技の選択",
    title: "기술의 선택",
    ps: [
      `<p>체력의 초기값이 H인 적을 쓰러뜨리고 싶습니다.<br />적은 체력이 0 이하가 되면 쓰러뜨릴 수 있습니다.<br />공격 방법에는 일반 공격과 필살기의 두 가지가 있습니다.<br />일반 공격은 한 번의 공격으로 A의 피해를 줍니다.<br />일반 공격은 반드시 명중합니다.<br />필살기는 한 번의 공격으로 D의 피해를 줍니다.<br />단, 필살기가 명중할 확률은 2/3입니다.<br />필살기는 1/3 확률로 피해가 0입니다.<br />최종적으로 적을 쓰러뜨릴 때까지 공격 횟수의 기댓값을<br />최소화하도록 공격을 선택합니다.<br />적을 쓰러뜨릴 때까지 공격 횟수의 기댓값은 얼마입니까?</p>`,
      `<p>한 줄에 적의 체력 H, 일반 공격의 피해량 A, 필살기의 피해량 D가 공백으로 구분되어 주어집니다.<br />$1 \le H,A,D \le 10000 $</p>`,
      `<p>답을 소수로 출력하세요. 오차는 절대 오차와 상대 오차 모두 0.01까지 허용됩니다.</p>`,
      `<p>일반 공격 한 번으로 확실하게 적을 쓰러뜨릴 수 있습니다.</p>`,
      `<p>필살기를 사용하지 않고 일반 공격 네 번으로 쓰러뜨릴 수 있습니다.<br />최단으로는 필살기 세 번으로도 쓰러뜨릴 수 있지만, 명중률이 2/3이므로 필살기만 사용하는 공격의 기댓값은 4.5회가 됩니다.<br />일반 공격을 0회 하고, 남은 HP38에서 필살기만 사용할 때의 기댓값은 4.5회입니다. (합계 4.5회)<br />일반 공격을 1회 하고, 남은 HP28에서 필살기만 사용할 때의 기댓값은 3회입니다. (합계 4회)<br />일반 공격을 2회 하고, 남은 HP18에서 필살기만 사용해도 기댓값은 3회입니다. (합계 5회)<br />일반 공격을 3회 하고, 남은 HP8에서 필살기만 사용해도 기댓값은 1.5회입니다. (합계 4.5회)<br />이때 기댓값이 가장 작은 것은 4회입니다.</p>`,
      `<p>일반 공격과 필살기를 모두 사용하면 기댓값 4.5회로 쓰러뜨릴 수 있습니다.</p>`,
    ],
  },
  24: {
    id: 69,
    srcTitle: "数当てゲーム",
    title: "숫자 맞히기 게임",
    ps: [
      `<p>타로 군과 지로 군은 게임을 하고 있습니다.<br /><br />먼저 지로 군은 (0)부터 (9)까지의 숫자 중 하나를 마음속으로 생각합니다.<br /><br />타로 군은 (0)부터 (9)까지의 중복되지 않는 숫자 중 (4)개를 지로 군에게 제시하고,<br />지로 군은 마음속으로 생각한 숫자가 제시된 (4)개의 숫자 안에 있으면 YES,<br />없으면 NO라고 대답합니다.<br />이것을 (1)턴으로 하고, 다음 턴에도 타로 군은 (4)개의 숫자를 제시하는 일을 반복합니다.<br />이전에 제시한 숫자와 같은 숫자를 제시해도 됩니다.<br /><br />입력으로 타로 군이 제시한 숫자와 지로 군의 답이 주어지므로,<br />지로 군이 생각했을 숫자를 출력하세요.<br />출력할 숫자가 반드시 하나로 확정되는 입력이 주어집니다.</p>`,
      `<p>첫째 줄에 턴 수를 나타내는 (N (2 \leq N \leq 6))이 주어집니다.<br />이후 (N)개 줄에 타로 군이 제시한 (4)개의 숫자 (A_i,B_i,C_i,D_i (0 \leq A_i,B_i,C_i,D_i \leq 9, 1 \leq i \leq N))와<br />지로 군의 답 문자열 (R_i) ((YES) 또는 (NO))가 공백으로 구분되어 주어집니다.<br />((A_i,B_i,C_i,D_i)는 서로 다릅니다)</p>`,
      `<p>지로 군이 생각했을 숫자를 출력하세요.<br />마지막에 줄바꿈을 출력하세요.</p>`,
      `<p>(0)부터 (8)까지에 포함되지 않으므로 남은 (9)가 답입니다.</p>`,
      `<p>(1,2,3,4)와 (4,5,6,7) 중 중복되는 숫자는 (4)뿐이므로 답이 확정됩니다.</p>`,
      `<p></p>`,
    ],
  },
};
for (const [no, x] of Object.entries(info)) {
  let source = await readFile(`${root}/tmp/problems-source/${no}.html`, "utf8");
  const originalParagraphs = [...source.matchAll(/<p>[\s\S]*?<\/p>/g)].map(
    (m) => m[0],
  );
  let i = 0,
    sample = 0;
  source = source.replace(
    /<h4 class="shadow">[^<]*<\/h4>/g,
    () =>
      `<h4 class="shadow">${["문제 설명", "입력", "출력", "예제"][i++]}</h4>`,
  );
  source = source.replace(
    /<h5 class="underline">[^<]*<\/h5>/g,
    () => `<h5 class="underline">예제 ${++sample}</h5>`,
  );
  source = source
    .replaceAll("<h6>入力</h6>", "<h6>입력</h6>")
    .replaceAll("<h6>出力</h6>", "<h6>출력</h6>");
  let pi = 0;
  source = source.replace(/<p>[\s\S]*?<\/p>/g, () => {
    let translated = x.ps[pi],
      original = originalParagraphs[pi++];
    for (const token of [
      ...original.matchAll(/\\\([^\n]*?\\\)|\$[^\n]*?\$/g),
    ].map((m) => m[0])) {
      const inner = token.startsWith("$")
        ? token.slice(1, -1)
        : token.slice(2, -2);
      const bare = token.startsWith("$") ? `$${inner}$` : `(${inner})`;
      translated = translated.replace(bare, token);
    }
    return translated;
  });
  const hash = createHash("sha256")
    .update(source /* placeholder replaced below */)
    .digest("hex");
  const original = await readFile(
    `${root}/tmp/problems-source/${no}.html`,
    "utf8",
  );
  const originalHash = createHash("sha256").update(original).digest("hex");
  const body = source;
  const out = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>[기계 번역]No.${no} ${x.title}</title><style>body { font-family: sans-serif; line-height: 1.6; margin: 2rem auto; max-width: 960px; padding: 0 1rem; } pre { background: #f5f5f5; overflow: auto; padding: 1rem; } .block { margin: 2rem 0; }</style></head><body><main data-yukicoder-ko-problem data-schema-version="1" data-locale="ko" data-problem-no="${no}" data-problem-id="${x.id}" data-source-title="${x.srcTitle}" data-source-html-sha256="${originalHash}"><h3>[기계 번역]No.${no} ${x.title}</h3><div class="problem-statement">${body}</div></main></body></html>`;
  await writeFile(`${root}/problem-translations/ko/problems/${no}.html`, out);
}
