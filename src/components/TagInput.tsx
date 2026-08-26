import { useState } from "react";
import { normalizeTags, parseTags } from "../lib/tags";

/** Inline #tag chips + input. Enter/space/comma commits; backspace removes last. */
export function TagInput({
  value,
  onChange,
  suggestions = [],
  placeholder = "#tags",
}: {
  value: string[];
  onChange: (tags: string[]) => void;
  suggestions?: string[];
  placeholder?: string;
}) {
  const [text, setText] = useState("");

  const commit = () => {
    const parsed = parseTags(text);
    if (parsed.length === 0) return;
    onChange(normalizeTags([...value, ...parsed]));
    setText("");
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800/60 px-3 py-2 focus-within:border-indigo-500">
      {value.map((tag) => (
        <span
          key={tag}
          className="inline-flex items-center gap-1 rounded-full bg-indigo-500/20 px-2 py-0.5 text-xs font-medium text-indigo-300"
        >
          #{tag}
          <button
            type="button"
            onClick={() => onChange(value.filter((t) => t !== tag))}
            aria-label={`Remove #${tag}`}
            className="text-indigo-400/70 hover:text-indigo-200"
          >
            ✕
          </button>
        </span>
      ))}
      <input
        className="min-w-[6rem] flex-1 bg-transparent text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === "," || e.key === " ") {
            e.preventDefault();
            commit();
          } else if (e.key === "Backspace" && text === "" && value.length > 0) {
            onChange(value.slice(0, -1));
          }
        }}
        onBlur={commit}
        placeholder={value.length === 0 ? placeholder : ""}
        list="hearth-tag-suggestions"
        aria-label="Tags"
      />
      <datalist id="hearth-tag-suggestions">
        {suggestions.filter((s) => !value.includes(s)).map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>
    </div>
  );
}
