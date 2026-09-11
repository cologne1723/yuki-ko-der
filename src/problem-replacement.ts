import { prepareTranslatedBlocks } from "translation-core/problem-rendering";
import {
  sampleWarnings,
  sampleDataValues,
  sampleDataElements,
  sampleDataPres,
} from "translation-core/problem-samples";
import { sha256Hex } from "translation-core/sha256";
import type { ProblemRenderProfile } from "translation-core/problem-render-profile";

export function createProblemReplacement(
  document: Document,
  _semanticStatement: (blocks: Element[]) => string,
) {
  async function prepareReplacement(
    translation: { title: Element; blocks: Element[] },
    liveTitle: Element,
    liveBlocks: Element[],
    canonicalBlocks: Element[],
    options: {
      profile?: ProblemRenderProfile;
      sourceUrl?: string;
      fontUrl?: string;
      sourceSamplesSha256?: string;
    } = {},
  ) {
    if (options.sourceSamplesSha256) {
      const digest = await sha256Hex(
        new TextEncoder().encode(
          JSON.stringify(sampleDataValues(translation.blocks)),
        ),
      );
      if (digest !== options.sourceSamplesSha256)
        throw new Error(
          "Translated sample data differs from the published source samples",
        );
    } else {
      const warnings = sampleWarnings(
        canonicalBlocks,
        translation.blocks,
        undefined,
        true,
      );
      if (warnings.length) throw new Error(warnings.join("\n"));
    }
    const [importedTitle, ...importedBlocks] = await prepareTranslatedBlocks(
      [translation.title, ...translation.blocks],
      {
        ...options,
        document,
        renderHost: liveTitle.parentElement ?? undefined,
      },
    );
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
    const translatedTitle = [...importedTitle.childNodes];
    const originalParent = liveTitle.parentNode;
    const originalValues = sampleDataElements(liveBlocks);
    const translatedValues = sampleDataElements(importedBlocks);
    const controls = liveBlocks
      .flatMap((block) => [...block.querySelectorAll(".copy-sample-input")])
      .map((control) => {
        const sample = control.closest(".sample");
        const input = sample ? sampleDataPres(sample)[0] : undefined;
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
    let applying = false;
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
        applying = true;
        liveTitle.replaceChildren(...translatedTitle);
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
      } finally {
        applying = false;
      }
    };
    const ownsBlocks = () =>
      anchors.every(
        (anchor) => anchor.isConnected && anchor.parentNode === originalParent,
      ) &&
      importedBlocks.every(
        (block) => block.isConnected && block.parentNode === originalParent,
      ) &&
      [...(originalParent?.childNodes ?? [])]
        .filter(
          (node) => node.nodeType === 1 && (node as Element).matches(".block"),
        )
        .every((node) => importedBlocks.includes(node as HTMLElement));
    apply.isActive = () =>
      liveTitle.isConnected &&
      liveTitle.parentNode === originalParent &&
      ownsBlocks() &&
      translatedTitle.length === liveTitle.childNodes.length &&
      translatedTitle.every((node, i) => liveTitle.childNodes[i] === node);
    apply.restore = () => {
      const restoreBlocks = applying || ownsBlocks();
      for (const { control, parent, nextSibling } of movedControls.splice(0)) {
        parent.insertBefore(
          control,
          nextSibling && nextSibling.parentNode === parent ? nextSibling : null,
        );
      }
      for (const wrapper of copyWrappers.splice(0))
        wrapper.replaceWith(...wrapper.childNodes);
      // Do not overwrite a title the site replaced while translation was active.
      if (
        translatedTitle.length === liveTitle.childNodes.length &&
        translatedTitle.every((node, i) => liveTitle.childNodes[i] === node)
      )
        liveTitle.replaceChildren(...originalTitle);
      importedBlocks.forEach((block) => block.remove());
      anchors.forEach((anchor, index) => {
        if (anchor.parentNode) {
          if (restoreBlocks) anchor.replaceWith(liveBlocks[index]);
          else anchor.remove();
        }
      });
    };
    return apply;
  }

  return prepareReplacement;
}
