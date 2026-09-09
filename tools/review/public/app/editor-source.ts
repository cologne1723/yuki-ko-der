import { ExternalChange } from "@uiw/react-codemirror";
import type { EditorView } from "codemirror";

// Save responses may normalize metadata above the cursor. Apply only the
// changed range so CodeMirror can map the selection and viewport through it.
export function applySavedSource(view: EditorView, source: string) {
  const previous = view.state.doc.toString();
  if (previous === source) return;
  let from = 0;
  while (
    from < previous.length &&
    from < source.length &&
    previous[from] === source[from]
  )
    from++;
  let to = previous.length;
  let end = source.length;
  while (to > from && end > from && previous[to - 1] === source[end - 1]) {
    to--;
    end--;
  }
  const changes = view.state.changes({
    from,
    to,
    insert: source.slice(from, end),
  });
  const scroll = view.scrollSnapshot().map(changes);
  view.dispatch({
    changes,
    effects: scroll ? [scroll] : [],
    annotations: ExternalChange.of(true),
  });
}
