import {
  highlightTrailingWhitespace,
  useCodeMirror,
  type UseCodeMirror,
} from "@uiw/react-codemirror";
import { EditorState } from "@codemirror/state";
import { useState } from "react";

// CodeMirror owns the live document. Feeding React's copy back through `value`
// lets a delayed passive effect queue an older draft in @uiw's typing latch.
// The hook (unlike the component, which defaults value to "") supports omitting
// value entirely. The parent applies explicit loads/format/save changes instead.
export function SourceEditor({
  label,
  initialSource,
  ...options
}: Omit<UseCodeMirror, "value" | "container" | "initialState"> & {
  label: string;
  initialSource: string;
}) {
  const [initialState] = useState(() => ({
    json: EditorState.create({ doc: initialSource }).toJSON(),
  }));
  const { setContainer } = useCodeMirror({
    ...options,
    extensions: [highlightTrailingWhitespace(), ...(options.extensions ?? [])],
    initialState,
  });
  return <div ref={setContainer} aria-label={label} />;
}
