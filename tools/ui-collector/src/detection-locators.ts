import { Candidate, HeadingContext } from "./detection-types.ts";

export function closest(element: Element, selectors: string[]): Element | null {
  for (const selector of selectors) {
    if (element.closest(selector)) return element.closest(selector);
  }
  return null;
}

export function cssHint(element: Element): string {
  const escape = (value: string) => CSS.escape(value);
  const id = element.getAttribute("id");
  if (id && /^[A-Za-z][\w-]*$/u.test(id)) return `#${escape(id)}`;
  const classes = [...element.classList]
    .filter((value) => /^[A-Za-z][\w-]*$/u.test(value))
    .slice(0, 2);
  const base = element.tagName.toLowerCase();
  return classes.length
    ? `${base}.${classes.map((value) => escape(value)).join(".")}`
    : base;
}

export function snapshotLocator(
  element: Element,
  root: Element | Document = element.ownerDocument,
): string {
  const parts: string[] = [];
  let current: Element | null = element;
  while (current && current !== root && current.parentElement) {
    const siblings = [...current.parentElement.children].filter(
      (child) => child.tagName === current!.tagName,
    );
    const index = siblings.indexOf(current) + 1;
    parts.unshift(`${current.tagName.toLowerCase()}[${index}]`);
    current = current.parentElement;
  }
  return parts.length ? `/${parts.join("/")}` : "/";
}

export function nearbyContext(
  element: Element,
  headings: HeadingContext[],
): string | undefined {
  const sections = "section,article,nav,aside,main,header,footer";
  const section = element.closest(sections) ?? element.ownerDocument.body;
  return headings.findLast(
    (heading) =>
      (heading.element.closest(sections) ??
        heading.element.ownerDocument.body) === section &&
      !heading.element.contains(element) &&
      // DOCUMENT_POSITION_FOLLOWING: the observation follows this heading.
      Boolean(heading.element.compareDocumentPosition(element) & 4),
  )?.text;
}

export function exactLocator(candidate: Candidate): string {
  const element =
    candidate.node.nodeType === 1
      ? (candidate.node as Element)
      : candidate.node.parentElement!;
  const id = element.getAttribute("data-collector-node");
  const base =
    id === null
      ? "/html[1]" + snapshotLocator(element)
      : `//*[@data-collector-node="${id}"]`;
  if (candidate.attribute) return `${base}/@${candidate.attribute}`;
  if (candidate.node.nodeType === 3) {
    const nodes = [...element.childNodes].filter((n) => n.nodeType === 3);
    return `${base}/text()[${nodes.indexOf(candidate.node as ChildNode) + 1}]`;
  }
  return base;
}
