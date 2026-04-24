import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  handleError,
  UnauthorizedError,
  ValidationError,
  AppError,
} from '@/lib/errors/handlers'
import {
  getLlm,
  tryGetLlm,
  LlmNotConfiguredError,
  LlmProviderError,
  type ChatMessage,
} from '@/lib/ai/llm-adapter'
import { SANGA_SYSTEM_PROMPT } from '@/lib/ai/system-prompt'
import { scrub } from '@/lib/ai/pii-guard'

const MAX_INPUT_CHARS = 1000
const HISTORY_WINDOW = 8 // last N messages sent to the LLM as context

/**
 * POST /api/chat
 *
 * Body: { message: string }
 *
 * Flow:
 *   1. Authenticate.
 *   2. Validate + scrub user message.
 *   3. Enforce per-user daily quota (enforce_chat_quota RPC, atomic).
 *   4. Load or create the user's conversation row.
 *   5. Persist the user message.
 *   6. Build windowed context (system + recent scrubbed history).
 *   7. Call the LLM provider.
 *   8. Persist assistant message and record token usage.
 *   9. Return assistant content to the client.
 *
 * If the LLM provider isn't configured (no OPENAI_API_KEY), we return
 * a 503 with a clear message so the UI can render "assistant is offline"
 * instead of crashing.
 */
export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) throw new UnauthorizedError()

    let body: { message?: string } = {}
    try {
      body = await request.json()
    } catch {
      throw new ValidationError('invalid JSON body')
    }

    const message = String(body?.message ?? '').trim()
    if (!message) throw new ValidationError('message is required')
    if (message.length > MAX_INPUT_CHARS) {
      throw new ValidationError(
        `message too long (max ${MAX_INPUT_CHARS} characters)`,
      )
    }

    // Fail fast if the provider isn't configured
    const llmCheck = tryGetLlm()
    if (!llmCheck) {
      return NextResponse.json(
        {
          error:
            'The assistant is not configured on this deployment. Ask an admin to set OPENAI_API_KEY.',
          code: 'ASSISTANT_UNAVAILABLE',
        },
        { status: 503 },
      )
    }

    // Quota (atomic). Uses the user's own session so RLS applies to the
    // usage row; caps are shared across the same user across devices.
    const { data: quotaData, error: quotaErr } = await supabase.rpc(
      'enforce_chat_quota',
      { p_user_id: user.id },
    )
    if (quotaErr) throw new AppError(quotaErr.message, 500, 'QUOTA_ERROR')

    const quota = Array.isArray(quotaData) ? quotaData[0] : quotaData
    if (!quota?.allowed) {
      const reason = quota?.reason ?? 'quota_exceeded'
      return NextResponse.json(
        {
          error:
            reason === 'daily_request_limit'
              ? 'Daily message limit reached. Try again tomorrow.'
              : 'Daily cost limit reached for the assistant. Try again tomorrow.',
          code: reason.toUpperCase(),
        },
        { status: 429 },
      )
    }

    // Find-or-create conversation
    const admin = createAdminClient()
    let conversationId: string | null = null
    {
      const existing = await admin
        .from('chat_conversations')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle()
      if (existing.data?.id) {
        conversationId = existing.data.id
      } else {
        const created = await admin
          .from('chat_conversations')
          .insert({ user_id: user.id })
          .select('id')
          .single()
        if (created.error) {
          throw new AppError(created.error.message, 500, 'CONVERSATION_ERROR')
        }
        conversationId = created.data.id
      }
    }

    // Load last N messages for context (oldest-first)
    const historyRes = await admin
      .from('chat_messages')
      .select('role, content')
      .eq('conversation_id', conversationId!)
      .order('created_at', { ascending: false })
      .limit(HISTORY_WINDOW)

    const history = (historyRes.data ?? []).reverse() as ChatMessage[]

    // Persist the user message before calling the LLM, so even if the
    // provider times out we have a record of what was asked.
    const scrubbedUser = scrub(message)
    const userInsert = await admin
      .from('chat_messages')
      .insert({
        conversation_id: conversationId,
        user_id: user.id,
        role: 'user',
        content: message, // keep original for the user's own record
      })
      .select('id')
      .single()
    if (userInsert.error) {
      throw new AppError(userInsert.error.message, 500, 'MESSAGE_WRITE_ERROR')
    }

    // Build LLM payload: system + scrubbed history + scrubbed new user turn
    const payload: ChatMessage[] = [
      { role: 'system', content: SANGA_SYSTEM_PROMPT },
      ...history.map((m) => ({ role: m.role, content: scrub(m.content) })),
      { role: 'user', content: scrubbedUser },
    ]

    let llmResult
    try {
      llmResult = await getLlm().chat(payload, { maxTokens: 350 })
    } catch (e) {
      if (e instanceof LlmNotConfiguredError) {
        return NextResponse.json(
          {
            error: 'The assistant is not configured on this deployment.',
            code: 'ASSISTANT_UNAVAILABLE',
          },
          { status: 503 },
        )
      }
      if (e instanceof LlmProviderError) {
        return NextResponse.json(
          {
            error:
              e.status === 429
                ? 'The assistant is busy. Please try again in a moment.'
                : 'The assistant had a temporary error. Please try again.',
            code: 'PROVIDER_ERROR',
          },
          { status: 502 },
        )
      }
      throw e
    }

    const assistantContent = scrub(llmResult.content).trim()

    // Record usage + store assistant message
    await Promise.all([
      admin.rpc('record_chat_usage', {
        p_user_id: user.id,
        p_tokens_in: llmResult.tokens_in,
        p_tokens_out: llmResult.tokens_out,
        p_cost_micros: llmResult.cost_micros,
      }),
      admin.from('chat_messages').insert({
        conversation_id: conversationId,
        user_id: user.id,
        role: 'assistant',
        content: assistantContent,
        tokens_in: llmResult.tokens_in,
        tokens_out: llmResult.tokens_out,
        cost_micros: llmResult.cost_micros,
        provider: llmResult.provider,
        model: llmResult.model,
      }),
      admin
        .from('chat_conversations')
        .update({ updated_at: new Date().toISOString() })
        .eq('id', conversationId),
    ])

    return NextResponse.json({
      success: true,
      reply: assistantContent,
      usage: {
        tokens_in: llmResult.tokens_in,
        tokens_out: llmResult.tokens_out,
      },
    })
  } catch (error) {
    return handleError(error)
  }
}
