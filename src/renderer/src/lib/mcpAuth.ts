// How den reads an MCP server's authorization state out of whatever wording sbx
// gave it.
//
// Lives here rather than inside McpPage so it can be tested without React. The
// ordering below is load-bearing and quiet to break: "not authorized" contains
// "authorized", so a positive match placed first reports an unauthorized server
// as authorized.

// Auth wording varies by sbx build, so classify loosely rather than matching
// exact strings — and treat "no idea" as its own state instead of guessing.
export function authState(s: string): { label: string; tone: 'ok' | 'warn' | 'none' } {
  const t = (s || '').toLowerCase()
  if (!t) return { label: '', tone: 'none' }
  // "required" on its own is a capability — `sbx mcp inspect` prints
  // `OAuth: required` for a server whether or not you've authorized it.
  if (/^(required|optional|supported|enabled|disabled)$/.test(t)) return { label: '', tone: 'none' }
  if (/expired|invalid|fail|revoked/.test(t)) return { label: 'Reauthorize', tone: 'warn' }
  // Negatives first: "not authorized" and "unauthorized" both contain
  // "authorized", so the positive test below would otherwise claim success for
  // a server that has none.
  if (/not authorized|unauthori[sz]ed|pending|auth(orization)? required|needs|^(no|none|never)$/.test(t)) {
    return { label: 'Not authorized', tone: 'warn' }
  }
  if (/\b(ok|yes)\b|valid|authorized|active|connected/.test(t)) return { label: 'Authorized', tone: 'ok' }
  // Something we don't recognise — show it verbatim rather than swallowing it.
  // Silence is what made an authorized server look like it had never been
  // authorized, so an odd-looking badge is the better failure.
  return { label: s.length > 24 ? `${s.slice(0, 23)}…` : s, tone: 'none' }
}
