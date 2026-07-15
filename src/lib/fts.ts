// Build a safe FTS5 MATCH expression from raw user input.
// Each whitespace token is wrapped as an FTS5 string literal (content inside
// double quotes is treated as literal text, never as operators). Double-quote
// and star chars are stripped so they cannot break out of the literal. Tokens
// are joined with a space (FTS5 implicit AND). Empty/whitespace input -> ''.
export function toFtsQuery(input: string): string {
  return input
    .split(/\s+/)
    .map((t) => t.replace(/["*]/g, ' ').replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .map((t) => `"${t}"`)
    .join(' ')
}
