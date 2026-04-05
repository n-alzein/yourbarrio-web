"use client";

import { useEffect, useMemo, useRef } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import Link from "@tiptap/extension-link";
import {
  descriptionToEditableHtml,
  stripHtmlToText,
} from "@/lib/listingDescription";

const BUTTON_BASE =
  "rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition disabled:opacity-50";

function ToolButton({ onClick, active = false, disabled = false, label }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`${BUTTON_BASE} ${
        active
          ? "border-purple-300/80 bg-purple-500/30 text-white"
          : "border-white/20 bg-white/5 text-white/80 hover:bg-white/10"
      }`}
      aria-label={label}
    >
      {label}
    </button>
  );
}

export default function RichTextDescriptionEditor({
  value,
  onChange,
  label = "Description",
  helpText = "",
  error = "",
  minHeight = 180,
  placeholder = "Describe your listing",
}) {
  const lastValueRef = useRef(value || "");
  const debounceRef = useRef(null);

  const initialContent = useMemo(
    () => descriptionToEditableHtml(value || ""),
    [value]
  );

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
      }),
      Underline,
      Link.configure({
        openOnClick: false,
        autolink: false,
        HTMLAttributes: {
          rel: "noopener noreferrer",
          target: "_blank",
        },
      }),
    ],
    content: initialContent,
    editorProps: {
      attributes: {
        class:
          "yb-rich-editor prose prose-invert max-w-none px-4 py-3 text-sm text-white focus:outline-none",
        "aria-label": label,
      },
    },
    onUpdate: ({ editor: currentEditor }) => {
      const html = currentEditor.getHTML();
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
      debounceRef.current = setTimeout(() => {
        lastValueRef.current = html;
        onChange?.(html);
      }, 120);
    },
  });

  useEffect(() => {
    if (!editor) return;
    const normalized = descriptionToEditableHtml(value || "");
    if (normalized === lastValueRef.current) return;

    const currentHtml = editor.getHTML();
    if (currentHtml !== normalized) {
      editor.commands.setContent(normalized || "", false);
      lastValueRef.current = normalized;
    }
  }, [editor, value]);

  useEffect(
    () => () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    },
    []
  );

  const plainTextLength = editor ? stripHtmlToText(editor.getHTML()).length : 0;

  const setLink = () => {
    if (!editor) return;
    const previousUrl = editor.getAttributes("link").href || "";
    const nextUrl = window.prompt("Enter URL", previousUrl);

    if (nextUrl === null) return;
    if (nextUrl === "") {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }

    editor
      .chain()
      .focus()
      .extendMarkRange("link")
      .setLink({ href: nextUrl.trim() })
      .run();
  };

  return (
    <div>
      <label className="text-sm font-semibold text-white/80">{label}</label>
      <div className="mt-2 rounded-xl border border-white/15 bg-white/5">
        <div className="flex flex-wrap gap-2 border-b border-white/10 px-3 py-2">
          <ToolButton
            label="B"
            onClick={() => editor?.chain().focus().toggleBold().run()}
            active={editor?.isActive("bold")}
            disabled={!editor?.can().chain().focus().toggleBold().run()}
          />
          <ToolButton
            label="I"
            onClick={() => editor?.chain().focus().toggleItalic().run()}
            active={editor?.isActive("italic")}
            disabled={!editor?.can().chain().focus().toggleItalic().run()}
          />
          <ToolButton
            label="U"
            onClick={() => editor?.chain().focus().toggleUnderline().run()}
            active={editor?.isActive("underline")}
          />
          <ToolButton
            label="H2"
            onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}
            active={editor?.isActive("heading", { level: 2 })}
          />
          <ToolButton
            label="H3"
            onClick={() => editor?.chain().focus().toggleHeading({ level: 3 }).run()}
            active={editor?.isActive("heading", { level: 3 })}
          />
          <ToolButton
            label="• List"
            onClick={() => editor?.chain().focus().toggleBulletList().run()}
            active={editor?.isActive("bulletList")}
          />
          <ToolButton
            label="1. List"
            onClick={() => editor?.chain().focus().toggleOrderedList().run()}
            active={editor?.isActive("orderedList")}
          />
          <ToolButton
            label="Quote"
            onClick={() => editor?.chain().focus().toggleBlockquote().run()}
            active={editor?.isActive("blockquote")}
          />
          <ToolButton label="Link" onClick={setLink} active={editor?.isActive("link")} />
          <ToolButton
            label="Undo"
            onClick={() => editor?.chain().focus().undo().run()}
            disabled={!editor?.can().chain().focus().undo().run()}
          />
          <ToolButton
            label="Redo"
            onClick={() => editor?.chain().focus().redo().run()}
            disabled={!editor?.can().chain().focus().redo().run()}
          />
          <ToolButton
            label="Clear"
            onClick={() =>
              editor
                ?.chain()
                .focus()
                .clearNodes()
                .unsetAllMarks()
                .run()
            }
          />
        </div>

        <div className="relative">
          <EditorContent editor={editor} style={{ minHeight }} />
          {!editor?.getText().trim() ? (
            <p className="pointer-events-none absolute left-4 top-3 text-sm text-white/35">
              {placeholder}
            </p>
          ) : null}
        </div>
      </div>

      <div className="mt-2 flex items-center justify-between gap-3">
        <p className="text-xs text-white/50">{helpText}</p>
        <p className="text-xs text-white/45">{plainTextLength} chars</p>
      </div>

      {error ? <p className="mt-2 text-xs text-red-200">{error}</p> : null}
    </div>
  );
}
