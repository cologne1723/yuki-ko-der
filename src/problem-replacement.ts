import { prepareTranslatedBlocks } from "translation-core/problem-rendering";
import { sampleWarnings } from "translation-core/problem-samples";

export function createProblemReplacement(
  document: Document,
  semanticStatement: (blocks: Element[]) => string,
) {
  function prepareReplacement(
    translation: { title: Element; blocks: Element[] },
    liveTitle: Element,
    liveBlocks: Element[],
    canonicalBlocks: Element[],
  ) {
    if (semanticStatement(canonicalBlocks) !== semanticStatement(liveBlocks)) {
      throw new Error(
        "Displayed problem statement differs from canonical source",
      );
    }
    const warnings = sampleWarnings(canonicalBlocks, translation.blocks);
    if (warnings.length) throw new Error(warnings.join("\n"));
    const importedBlocks = prepareTranslatedBlocks(translation.blocks);
    const renderedWarnings = sampleWarnings(canonicalBlocks, importedBlocks);
    if (renderedWarnings.length) throw new Error(renderedWarnings.join("\n"));
    const anchors = liveBlocks.map(() =>
      document.createComment("yukicoder-ko-original"),
    );
    const movedControls: {
      control: Element;
      parent: Node;
      nextSibling: ChildNode | null;
    }[] = [];

    const copyWrappers: HTMLElement[] = [];
    const originalTitle = [...liveTitle.childNodes];
    const originalValues = liveBlocks.flatMap((block) => [
      ...block.querySelectorAll(".sample pre"),
    ]);
    const translatedValues = importedBlocks.flatMap((block) => [
      ...block.querySelectorAll(".sample pre"),
    ]);
    const controls = liveBlocks
      .flatMap((block) => [...block.querySelectorAll(".copy-sample-input")])
      .map((control) => {
        const input = control.closest(".sample")?.querySelector("pre");
        const translated = input
          ? translatedValues[originalValues.indexOf(input)]
          : undefined;
        if (!translated || !control.parentNode)
          throw new Error("Sample copy input is unavailable");
        return {
          control,
          translated,
          parent: control.parentNode,
          nextSibling: control.nextSibling,
        };
      });
    const apply = () => {
      // Validate before making any writes, so failure cannot overwrite a page
      // the site has replaced since preparation.
      const parent = liveTitle.parentNode;
      if (
        !liveTitle.isConnected ||
        !parent ||
        !liveBlocks.length ||
        liveBlocks.some(
          (block) => !block.isConnected || block.parentNode !== parent,
        )
      )
        throw new Error(
          "Problem page changed before translation could be applied",
        );
      try {
        liveTitle.textContent = translation.title.textContent;
        liveBlocks.forEach((block, index) => block.replaceWith(anchors[index]));
        anchors[0].before(...importedBlocks);
        for (const { control, translated, parent, nextSibling } of controls) {
          movedControls.push({
            control,
            parent,
            nextSibling,
          });
          // The original handler often queries .sample's first pre. Isolate the
          // corresponding input when translated wrappers regroup multiple samples.
          const wrapper = document.createElement("div");
          wrapper.className = "sample yukicoder-ko-copy-input";
          translated.replaceWith(wrapper);
          wrapper.append(translated, control);
          copyWrappers.push(wrapper);
        }
      } catch (error) {
        apply.restore();
        throw error;
      }
    };
    apply.restore = () => {
      for (const { control, parent, nextSibling } of movedControls.splice(0)) {
        parent.insertBefore(
          control,
          nextSibling && nextSibling.parentNode === parent ? nextSibling : null,
        );
      }
      for (const wrapper of copyWrappers.splice(0))
        wrapper.replaceWith(...wrapper.childNodes);
      liveTitle.replaceChildren(...originalTitle);
      importedBlocks.forEach((block) => block.remove());
      anchors.forEach((anchor, index) => {
        if (anchor.parentNode) anchor.replaceWith(liveBlocks[index]);
      });
    };
    return apply;
  }

  return prepareReplacement;
}
