/** A correspondence inventory, not a semantic equivalence test. */
export function statementEmphasis(document: Document): string[] {
  const root = document.querySelector(".problem-statement") ?? document.body;
  return [...root.querySelectorAll("b, strong, u")]
    .filter((node) => {
      if (node.closest("pre,code,script,style,nav")) return false;
      // Some statements wrap actual conditions in h5. Keep heading emphasis
      // in this inventory; callers classify section titles versus conditions.
      // Nested styles emphasize the same span once; retain repeated occurrences
      // elsewhere, including notices, tables and sample explanations.
      for (
        let parent = node.parentElement;
        parent && parent !== root;
        parent = parent.parentElement
      )
        if (parent.matches("b,strong,u")) return false;
      return true;
    })
    .map((node) => (node.textContent ?? "").replace(/\s+/gu, " ").trim())
    .filter(Boolean);
}
