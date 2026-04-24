'use client'

import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  MessageCircle,
  X,
  Send,
  Sparkles,
  AlertCircle,
  Bot,
} from 'lucide-react'

/**
 * ChatWidget — floating chat button + slide-in drawer.
 *
 * Lives on the dashboard. Loads message history once on first open, then
 * sends each user turn to /api/chat and appends the assistant's reply.
 * Shows clear error states for:
 *   - 503 (provider not configured) → "assistant is offline"
 *   - 429 (daily quota)              → "try again tomorrow"
 *   - 502 (provider error)           → "temporary issue"
 *
 * No streaming (keeps the code simple and cheap to host). If the user
 * scrolls up in history we don't auto-scroll them back down.
 */

type Msg = {
  id: string
  role: 'user' | 'assistant'
  content: string
  created_at?: string
}

type Status = 'idle' | 'sending' | 'offline'

const STARTER_PROMPTS = [
  'What is a SACCO?',
  'How do I qualify for an instant loan?',
  'How does my shares balance differ from savings?',
]

export function ChatWidget() {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<Msg[]>([])
  const [input, setInput] = useState('')
  const [status, setStatus] = useState<Status>('idle')
  const [error, setError] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)
  const listRef = useRef<HTMLDivElement>(null)
  const stickyBottom = useRef(true)

  useEffect(() => {
    if (!open || loaded) return
    ;(async () => {
      try {
        const res = await fetch('/api/chat/messages', { cache: 'no-store' })
        if (res.ok) {
          const data = await res.json()
          setMessages(data.messages ?? [])
        }
      } finally {
        setLoaded(true)
      }
    })()
  }, [open, loaded])

  useEffect(() => {
    if (!listRef.current) return
    if (stickyBottom.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight
    }
  }, [messages])

  const handleScroll = () => {
    if (!listRef.current) return
    const el = listRef.current
    stickyBottom.current =
      el.scrollHeight - el.scrollTop - el.clientHeight < 40
  }

  const send = async (text: string) => {
    const content = text.trim()
    if (!content || status === 'sending') return
    setInput('')
    setError(null)

    const userMsg: Msg = {
      id: `local-${Date.now()}`,
      role: 'user',
      content,
    }
    setMessages((prev) => [...prev, userMsg])
    setStatus('sending')
    stickyBottom.current = true

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: content }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.status === 503) {
        setStatus('offline')
        setError(
          data?.error ??
            'The assistant is offline on this deployment.',
        )
        return
      }
      if (!res.ok) {
        setError(data?.error ?? 'Could not get a reply. Try again.')
        setStatus('idle')
        return
      }
      setMessages((prev) => [
        ...prev,
        {
          id: `local-${Date.now()}-a`,
          role: 'assistant',
          content: data.reply ?? '',
        },
      ])
      setStatus('idle')
    } catch {
      setError('Network error. Please try again.')
      setStatus('idle')
    }
  }

  return (
    <>
      {/* Floating button */}
      <motion.button
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ delay: 0.4, type: 'spring' }}
        onClick={() => setOpen(true)}
        aria-label="Open chat assistant"
        className="fixed bottom-20 left-4 z-30 flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-primary to-primary-dark text-white shadow-lg transition hover:shadow-xl sm:bottom-6 sm:left-6"
      >
        <MessageCircle className="h-5 w-5" />
        <span className="absolute -top-1 -right-1 flex h-3 w-3">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-secondary opacity-60" />
          <span className="relative inline-flex h-3 w-3 rounded-full bg-secondary" />
        </span>
      </motion.button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm"
          >
            <motion.div
              initial={{ y: '100%', opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: '100%', opacity: 0 }}
              transition={{ type: 'tween', duration: 0.25 }}
              onClick={(e) => e.stopPropagation()}
              className="absolute inset-x-0 bottom-0 flex h-[85vh] flex-col rounded-t-2xl bg-white shadow-2xl sm:inset-auto sm:bottom-6 sm:left-6 sm:h-[calc(100vh-6rem)] sm:max-h-[600px] sm:w-96 sm:rounded-2xl"
            >
              {/* Header */}
              <div className="flex items-center justify-between border-b border-gray-100 p-4">
                <div className="flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-primary to-primary-dark">
                    <Sparkles className="h-4 w-4 text-secondary" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-900">
                      SANGA Assistant
                    </p>
                    <p className="text-[11px] text-gray-500">
                      SACCO questions · not financial advice
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setOpen(false)}
                  aria-label="Close"
                  className="rounded-full p-2 transition hover:bg-gray-100"
                >
                  <X className="h-5 w-5 text-gray-500" />
                </button>
              </div>

              {/* Messages */}
              <div
                ref={listRef}
                onScroll={handleScroll}
                className="flex-1 overflow-y-auto p-4 space-y-3"
              >
                {!loaded ? (
                  <div className="flex h-full items-center justify-center text-sm text-gray-400">
                    Loading…
                  </div>
                ) : messages.length === 0 ? (
                  <div className="space-y-3 py-4">
                    <div className="flex flex-col items-center gap-2 text-center">
                      <Bot className="h-10 w-10 text-gray-300" />
                      <p className="text-sm font-medium text-gray-700">
                        Ask me anything about SANGA
                      </p>
                      <p className="text-xs text-gray-500">
                        Savings, loans, SACCO basics, app help.
                      </p>
                    </div>
                    <div className="space-y-2">
                      {STARTER_PROMPTS.map((p) => (
                        <button
                          key={p}
                          onClick={() => send(p)}
                          className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-left text-xs text-gray-700 transition hover:border-primary/40 hover:bg-primary/5"
                        >
                          {p}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  messages.map((m) => (
                    <div
                      key={m.id}
                      className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
                    >
                      <div
                        className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${
                          m.role === 'user'
                            ? 'bg-primary text-white'
                            : 'bg-gray-100 text-gray-900'
                        }`}
                      >
                        <p className="whitespace-pre-wrap break-words">
                          {m.content}
                        </p>
                      </div>
                    </div>
                  ))
                )}

                {status === 'sending' && (
                  <div className="flex justify-start">
                    <div className="flex items-center gap-1 rounded-2xl bg-gray-100 px-3 py-2 text-sm text-gray-500">
                      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-gray-400" />
                      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-gray-400 [animation-delay:0.2s]" />
                      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-gray-400 [animation-delay:0.4s]" />
                    </div>
                  </div>
                )}

                {error && (
                  <div className="flex items-start gap-2 rounded-xl bg-amber-50 p-2.5 text-xs text-amber-800">
                    <AlertCircle className="h-4 w-4 shrink-0 text-amber-600" />
                    <p>{error}</p>
                  </div>
                )}
              </div>

              {/* Input */}
              <div className="border-t border-gray-100 p-3">
                <form
                  onSubmit={(e) => {
                    e.preventDefault()
                    send(input)
                  }}
                  className="flex items-center gap-2"
                >
                  <input
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder={
                      status === 'offline'
                        ? 'Assistant offline'
                        : 'Ask about SANGA…'
                    }
                    maxLength={1000}
                    disabled={status === 'offline' || status === 'sending'}
                    className="flex-1 rounded-full border border-gray-200 bg-gray-50 px-4 py-2 text-sm outline-none transition focus:border-secondary focus:bg-white focus:ring-1 focus:ring-secondary disabled:opacity-50"
                  />
                  <button
                    type="submit"
                    disabled={
                      !input.trim() ||
                      status === 'sending' ||
                      status === 'offline'
                    }
                    aria-label="Send"
                    className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-white transition hover:bg-primary-dark disabled:opacity-40"
                  >
                    <Send className="h-4 w-4" />
                  </button>
                </form>
                <p className="mt-1.5 text-center text-[10px] text-gray-400">
                  AI replies may be inaccurate. Use the app for account figures.
                </p>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
