/**
 * Provider-agnostic LLM adapter.
 *
 * The chat route talks to this interface only. Swap a provider by
 * adding a new adapter that returns the same shape; no route code
 * changes.
 *
 * Current implementations:
 *   - openai   (default, gpt-4o-mini)
 *
 * Configuration (env):
 *   LLM_PROVIDER           openai (default)
 *   LLM_MODEL              gpt-4o-mini (default)
 *   OPENAI_API_KEY         required for the openai adapter
 *
 * Rough pricing for gpt-4o-mini at time of writing:
 *   input  ~ $0.15 / 1M tokens
 *   output ~ $0.60 / 1M tokens
 *
 * We return cost in USD micros so downstream code can stay in integers.
 */

export type ChatMessage = {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export type LlmResult = {
  content: string
  tokens_in: number
  tokens_out: number
  cost_micros: number
  provider: string
  model: string
}

export class LlmNotConfiguredError extends Error {
  constructor(msg = 'LLM provider is not configured') {
    super(msg)
    this.name = 'LlmNotConfiguredError'
  }
}

export class LlmProviderError extends Error {
  status: number
  constructor(msg: string, status = 502) {
    super(msg)
    this.name = 'LlmProviderError'
    this.status = status
  }
}

export interface LlmAdapter {
  readonly provider: string
  readonly model: string
  chat(messages: ChatMessage[], opts?: { maxTokens?: number }): Promise<LlmResult>
}

const DEFAULT_PROVIDER =
  (process.env.LLM_PROVIDER || 'openai').toLowerCase()
const DEFAULT_MODEL = process.env.LLM_MODEL || 'gpt-4o-mini'

// Pricing table in USD per 1M tokens. If model isn't listed, we return
// cost=0 but still record token counts; admin dashboards will still
// show usage even if we can't price it.
const PRICING: Record<string, { input: number; output: number }> = {
  'gpt-4o-mini': { input: 0.15, output: 0.6 },
  'gpt-4o': { input: 2.5, output: 10 },
}

function costMicros(model: string, tokensIn: number, tokensOut: number): number {
  const row = PRICING[model]
  if (!row) return 0
  // cost in USD = (tokensIn/1M * input) + (tokensOut/1M * output)
  const usd = (tokensIn / 1_000_000) * row.input + (tokensOut / 1_000_000) * row.output
  return Math.round(usd * 1_000_000) // micros
}

class OpenAIAdapter implements LlmAdapter {
  readonly provider = 'openai'
  readonly model = DEFAULT_MODEL
  private apiKey: string

  constructor() {
    const key = process.env.OPENAI_API_KEY
    if (!key) throw new LlmNotConfiguredError('OPENAI_API_KEY not set')
    this.apiKey = key
  }

  async chat(
    messages: ChatMessage[],
    opts: { maxTokens?: number } = {},
  ): Promise<LlmResult> {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this.model,
        messages,
        max_tokens: opts.maxTokens ?? 300,
        temperature: 0.3,
      }),
    })

    if (!res.ok) {
      const body = await res.text().catch(() => '')
      throw new LlmProviderError(
        `OpenAI ${res.status}: ${body.slice(0, 200)}`,
        res.status,
      )
    }

    const payload = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>
      usage?: {
        prompt_tokens?: number
        completion_tokens?: number
      }
    }

    const content = payload.choices?.[0]?.message?.content ?? ''
    const tokens_in = payload.usage?.prompt_tokens ?? 0
    const tokens_out = payload.usage?.completion_tokens ?? 0

    return {
      content,
      tokens_in,
      tokens_out,
      cost_micros: costMicros(this.model, tokens_in, tokens_out),
      provider: this.provider,
      model: this.model,
    }
  }
}

let cached: LlmAdapter | null = null

export function getLlm(): LlmAdapter {
  if (cached) return cached
  if (DEFAULT_PROVIDER === 'openai') {
    cached = new OpenAIAdapter()
    return cached
  }
  throw new LlmNotConfiguredError(`unsupported LLM provider: ${DEFAULT_PROVIDER}`)
}

// Safe accessor — returns null if not configured rather than throwing.
export function tryGetLlm(): LlmAdapter | null {
  try {
    return getLlm()
  } catch (e) {
    if (e instanceof LlmNotConfiguredError) return null
    throw e
  }
}
