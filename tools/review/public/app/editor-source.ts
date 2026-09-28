import { ExternalChange } from "@uiw/react-codemirror";
import type { EditorView } from "codemirror";

// A visible native/IME edit can still be waiting in the DOM observer when an
// external save button runs. CodeMirror flushes pending DOM input before its
// measurement callbacks. Read there instead of snapshotting EditorState early.
export function readEditorSource(view: EditorView): Promise<string> {
  return new Promise((resolve) => {
    view.requestMeasure({
      read: (current) => current.state.doc.toString(),
      write: (source) => resolve(source),
    });
  });
}

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
  // CodeMirror maps its own viewport anchor through this change. A snapshot
  // would queue a later scroll and overwrite any scrolling before measurement.
  view.dispatch({
    changes,
    annotations: ExternalChange.of(true),
  });
}
