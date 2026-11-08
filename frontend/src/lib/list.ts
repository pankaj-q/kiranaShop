export function splitList(text: string): string[] {
  return text
    .replace(/\s*\baur\b\s*/gi, ', ')
    .split(/[\n,;]+/)
    .map((s) => s.trim())
    .filter(Boolean)
}
