'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { ArrowLeft, ArrowDownLeft, ArrowUpRight, Send, Download, Calendar } from 'lucide-react'
import { toast } from 'sonner'

interface Transaction {
  id: string
  type: string
  amount: number
  description: string | null
  created_at: string
}

function defaultRange() {
  const end = new Date()
  const start = new Date()
  start.setDate(start.getDate() - 30)
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  }
}

export default function TransactionsPage() {
  const router = useRouter()
  const supabase = createClient()

  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(true)
  const [downloading, setDownloading] = useState(false)
  const [range, setRange] = useState(defaultRange())

  const load = useCallback(async () => {
    setLoading(true)
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      router.replace('/login')
      return
    }
    const { data, error } = await supabase
      .from('transactions')
      .select('id, type, amount, description, created_at')
      .eq('user_id', user.id)
      .gte('created_at', range.start)
      .lte('created_at', `${range.end}T23:59:59.999Z`)
      .order('created_at', { ascending: false })
      .limit(500)

    if (error) {
      toast.error(error.message || 'Failed to load transactions')
      setTransactions([])
    } else {
      setTransactions((data || []) as Transaction[])
    }
    setLoading(false)
  }, [supabase, router, range.start, range.end])

  useEffect(() => {
    load()
  }, [load])

  const downloadStatement = async () => {
    setDownloading(true)
    try {
      const res = await fetch('/api/statements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ startDate: range.start, endDate: range.end }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body?.error || `Failed (${res.status})`)
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `statement_${range.start}_${range.end}.pdf`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
      toast.success('Statement downloaded')
    } catch (e: any) {
      toast.error(e?.message || 'Download failed')
    } finally {
      setDownloading(false)
    }
  }

  const icon = (type: string) => {
    const credits = new Set(['deposit', 'interest', 'dividend', 'loan_disbursement'])
    const debits = new Set(['withdrawal', 'loan_repayment', 'fee'])
    if (credits.has(type)) return <ArrowDownLeft className="h-4 w-4 text-green-600" />
    if (debits.has(type)) return <ArrowUpRight className="h-4 w-4 text-red-600" />
    return <Send className="h-4 w-4 text-blue-600" />
  }

  const colour = (type: string) => {
    const credits = new Set(['deposit', 'interest', 'dividend', 'loan_disbursement'])
    if (credits.has(type)) return 'bg-green-100'
    if (type === 'withdrawal' || type === 'fee' || type === 'loan_repayment') return 'bg-red-100'
    return 'bg-blue-100'
  }

  const sign = (type: string) => {
    const credits = new Set(['deposit', 'interest', 'dividend', 'loan_disbursement'])
    if (credits.has(type)) return { prefix: '+', cls: 'text-green-600' }
    return { prefix: '-', cls: 'text-red-600' }
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      <div className="bg-white border-b px-4 py-4 flex items-center gap-4 sticky top-0 z-10">
        <button onClick={() => router.back()} aria-label="Back">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h1 className="text-xl font-bold flex-1">Transactions</h1>
        <button
          onClick={downloadStatement}
          disabled={downloading || loading}
          className="flex items-center gap-1 text-sm bg-[#D4AF37] text-[#1A2A4F] px-3 py-1.5 rounded-lg font-medium disabled:opacity-50"
        >
          <Download className="h-4 w-4" /> {downloading ? '...' : 'PDF'}
        </button>
      </div>

      <div className="max-w-md mx-auto px-4 py-4">
        <div className="bg-white rounded-xl p-4 mb-4">
          <div className="flex items-center gap-2 mb-3 text-sm text-gray-600">
            <Calendar className="h-4 w-4" /> Date range
          </div>
          <div className="grid grid-cols-2 gap-2">
            <input
              type="date"
              value={range.start}
              max={range.end}
              onChange={(e) => setRange((r) => ({ ...r, start: e.target.value }))}
              className="p-2 border rounded-lg text-sm"
            />
            <input
              type="date"
              value={range.end}
              min={range.start}
              onChange={(e) => setRange((r) => ({ ...r, end: e.target.value }))}
              className="p-2 border rounded-lg text-sm"
            />
          </div>
        </div>

        {loading ? (
          <div className="text-center text-gray-400 py-10">Loading...</div>
        ) : transactions.length === 0 ? (
          <div className="bg-white rounded-xl p-8 text-center text-gray-500">
            No transactions in this period.
          </div>
        ) : (
          transactions.map((tx) => {
            const { prefix, cls } = sign(tx.type)
            return (
              <div
                key={tx.id}
                className="bg-white rounded-xl p-4 mb-3 flex justify-between items-center"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className={`p-2 rounded-lg ${colour(tx.type)}`}>{icon(tx.type)}</div>
                  <div className="min-w-0">
                    <p className="font-medium truncate">{tx.description || tx.type}</p>
                    <p className="text-xs text-gray-400">
                      {new Date(tx.created_at).toLocaleDateString()}
                    </p>
                  </div>
                </div>
                <p className={`font-semibold whitespace-nowrap ${cls}`}>
                  {prefix} KES {Number(tx.amount || 0).toLocaleString()}
                </p>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
