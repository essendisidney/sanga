/**
 * Best-effort PII scrubber for messages sent to/from the LLM.
 *
 * NOT a security boundary — it's defence-in-depth so that if a model
 * provider ever leaks logs we haven't shipped the member's phone/email/
 * national ID to them in plaintext. Overly aggressive on purpose:
 * better to replace a legitimate 7-digit number with [REDACTED] than
 * to leak an ID.
 *
 * We scrub both directions:
 *   - user → LLM: to keep PII out of provider logs
 *   - LLM → user: to avoid echoing back anything that slipped through
 */

type Replacement = { pattern: RegExp; token: string }

const PATTERNS: Replacement[] = [
  // Kenyan phone numbers (with or without +, country code, or leading 0)
  { pattern: /(\+?254|0)\s*[17]\d{8}/g, token: '[PHONE]' },
  // International phone-ish (8+ digit numbers next to each other)
  { pattern: /(?:\+\d[\d\s-]{7,}\d)/g, token: '[PHONE]' },
  // Email
  { pattern: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, token: '[EMAIL]' },
  // Kenyan national ID (7–8 digits standalone)
  { pattern: /\b\d{7,8}\b/g, token: '[ID]' },
  // Card-like (13–19 digits, often in groups of 4)
  { pattern: /\b(?:\d[ -]*?){13,19}\b/g, token: '[CARD]' },
]

export function scrub(input: string): string {
  if (!input) return input
  let out = input
  for (const { pattern, token } of PATTERNS) {
    out = out.replace(pattern, token)
  }
  return out
}

export function scrubAll<T extends { content: string }>(messages: T[]): T[] {
  return messages.map((m) => ({ ...m, content: scrub(m.content) }))
}
