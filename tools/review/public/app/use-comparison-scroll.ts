import { useEffect, useRef } from "react";
import { mapHeadingScroll } from "../scroll-sync.ts";

export function useComparisonScroll(
  sync: boolean,
  left?: Document,
  right?: Document,
) {
  const locked = useRef(false);
  useEffect(() => {
    if (!sync || !left || !right) return;
    const a = left,
      b = right;
    let frame = 0;
    const anchors = (doc: Document) => {
      const end = Math.max(
        0,
        (doc.scrollingElement?.scrollHeight ?? 0) -
          (doc.scrollingElement?.clientHeight ?? 0),
      );
      return [
        0,
        ...[...doc.querySelectorAll<HTMLElement>("h4,h5")].map((element) =>
          Math.max(
            0,
            Math.min(
              end,
              element.getBoundingClientRect().top +
                (doc.scrollingElement?.scrollTop ?? 0),
            ),
          ),
        ),
        end,
      ];
    };
    const move = (source: Document, target: Document) => {
      if (
        locked.current ||
        !source.scrollingElement ||
        !target.scrollingElement
      )
        return;
      locked.current = true;
      target.scrollingElement.scrollTop = mapHeadingScroll(
        source.scrollingElement.scrollTop,
        anchors(source),
        anchors(target),
      );
      frame = requestAnimationFrame(() => {
        locked.current = false;
      });
    };
    const fromLeft = () => move(a, b),
      fromRight = () => move(b, a);
    a.addEventListener("scroll", fromLeft, true);
    b.addEventListener("scroll", fromRight, true);
    return () => {
      a.removeEventListener("scroll", fromLeft, true);
      b.removeEventListener("scroll", fromRight, true);
      cancelAnimationFrame(frame);
      locked.current = false;
    };
  }, [sync, left, right]);
}
