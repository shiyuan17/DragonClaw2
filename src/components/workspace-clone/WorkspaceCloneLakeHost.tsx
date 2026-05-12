import "lakelib/dist/lake.min.css";

import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import * as LakeCodeMirror from "lake-codemirror";
import { Editor as LakeEditor, Toolbar } from "lakelib";

const EDITOR_TOOLBAR_ITEMS = [
  "undo",
  "redo",
  "|",
  "heading",
  "bold",
  "italic",
  "underline",
  "strikethrough",
  "fontColor",
  "|",
  "align",
  "numberedList",
  "bulletedList",
  "blockQuote",
  "hr",
  "table",
  "codeBlock",
];

type LakeWindow = Window & {
  LakeCodeMirror?: typeof LakeCodeMirror;
};

export interface WorkspaceCloneLakeHostHandle {
  getHTML: () => string;
  getValue: () => string;
}

interface WorkspaceCloneLakeHostProps {
  value: string;
  readonly?: boolean;
  placeholder?: string;
  onChange?: (payload: { html: string; value: string }) => void;
}

export const WorkspaceCloneLakeHost = forwardRef<WorkspaceCloneLakeHostHandle, WorkspaceCloneLakeHostProps>(
  function WorkspaceCloneLakeHost({
    value,
    readonly = false,
    placeholder = "",
    onChange,
  }, ref) {
    const editorRootRef = useRef<HTMLDivElement | null>(null);
    const toolbarRootRef = useRef<HTMLDivElement | null>(null);
    const editorRef = useRef<LakeEditor | null>(null);
    const appliedValueRef = useRef(value);

    useImperativeHandle(ref, () => ({
      getHTML: () => editorRef.current?.getHTML() || "",
      getValue: () => editorRef.current?.getValue() || "",
    }), []);

    useEffect(() => {
      (window as LakeWindow).LakeCodeMirror = LakeCodeMirror;
      return () => {
        const nextWindow = window as LakeWindow;
        if (nextWindow.LakeCodeMirror === LakeCodeMirror) {
          delete nextWindow.LakeCodeMirror;
        }
      };
    }, []);

    useEffect(() => {
      const editorRoot = editorRootRef.current;
      if (!editorRoot) {
        return undefined;
      }

      editorRoot.innerHTML = "";
      if (toolbarRootRef.current) {
        toolbarRootRef.current.innerHTML = "";
      }

      const toolbar = !readonly && toolbarRootRef.current
        ? new Toolbar({
            root: toolbarRootRef.current,
            items: EDITOR_TOOLBAR_ITEMS,
          })
        : undefined;

      const editor = new LakeEditor({
        root: editorRoot,
        value,
        readonly,
        placeholder,
        toolbar,
      });
      editor.render();
      appliedValueRef.current = value;

      const handleChange = (nextValue: string) => {
        appliedValueRef.current = nextValue;
        onChange?.({
          html: editor.getHTML(),
          value: nextValue,
        });
      };

      editor.event.on("change", handleChange);
      editorRef.current = editor;

      return () => {
        editor.event.off("change", handleChange);
        editor.unmount();
        editorRef.current = null;
      };
    }, [onChange, placeholder, readonly, value]);

    useEffect(() => {
      const editor = editorRef.current;
      if (!editor || appliedValueRef.current === value) {
        return;
      }

      editor.setValue(value);
      appliedValueRef.current = value;
    }, [value]);

    return (
      <div className={`workspace-clone__lake-host ${readonly ? "is-readonly" : "is-editable"}`}>
        {!readonly ? <div ref={toolbarRootRef} className="workspace-clone__lake-toolbar" /> : null}
        <div ref={editorRootRef} className="workspace-clone__lake-editor" />
      </div>
    );
  },
);
