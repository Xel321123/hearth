/** Parse "#tag"-style input ("milk #dairy, #x #x") → unique lowercase tags. */
export function parseTags(input: string): string[] {
  const seen = new Set<string>();
  for (const raw of input.split(/[\s,]+/)) {
    const tag = raw.trim().replace(/^#+/, "").toLowerCase();
    if (tag && !seen.has(tag)) seen.add(tag);
  }
  return [...seen];
}

/** Render tags as input text ("#a #b"). */
export function tagsToInput(tags: string[]): string {
  return tags.map((t) => `#${t}`).join(" ");
}

/** Normalize a possibly-raw array (e.g. pasted "a, #b") to clean tags. */
export function normalizeTags(tags: string[]): string[] {
  return parseTags(tags.join(" "));
}

export const TAG_HINT = "letters, digits, _ or - · no spaces";
