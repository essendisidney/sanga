'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import ExcelJS from 'exceljs'
import { ArrowLeft, Download, FileText, Users, TrendingUp } from 'lucide-react'
import { toast } from 'sonner'
import { useRequireAdmin } from '@/lib/hooks/use-require-admin'

type ReportType = 'transactions' | 'members' | 'loans'

export default function ExportReportsPage() {
  const router = useRouter()
  const roleState = useRequireAdmin()

  const [loading, setLoading] = useState(false)
  const [dateRange, setDateRange] = useState({ start: '', end: '' })
  const [reportType, setReportType] = useState<ReportType>('transactions')

  const exportToExcel = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ type: reportType })
      if (dateRange.start) params.set('start', dateRange.start)
      if (dateRange.end) params.set('end', dateRange.end)

      const res = await fetch(`/api/reports/export?${params.toString()}`)
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body?.error || `Request failed (${res.status})`)
      }
      const payload = await res.json()
      const rows: any[] = payload?.data || []

      if (rows.length === 0) {
        toast.error('No rows match the selected filters')
        return
      }

      const wb = new ExcelJS.Workbook()
      const ws = wb.addWorksheet(reportType)
      const headers = Object.keys(rows[0])
      ws.columns = headers.map((h) => ({ header: h, key: h, width: 18 }))
      ws.addRows(rows)
      ws.getRow(1).font = { bold: true }

      const buffer = await wb.xlsx.writeBuffer()
      const blob = new Blob([buffer as ArrayBuffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${reportType}_report_${new Date().toISOString().split('T')[0]}.xlsx`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)

      toast.success(`Exported ${rows.length} row${rows.length === 1 ? '' : 's'}`)
    } catch (e: any) {
      toast.error(e?.message || 'Export failed')
    } finally {
      setLoading(false)
    }
  }

  if (roleState !== 'allowed') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <p className="text-gray-500">
          {roleState === 'loading' ? 'Checking access...' : 'Redirecting...'}
        </p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-[#1A2A4F] text-white p-6">
        <button onClick={() => router.back()} className="text-white/70 mb-2 flex items-center gap-1">
          <ArrowLeft className="h-4 w-4" /> Back
        </button>
        <h1 className="text-2xl font-bold">Export Reports</h1>
        <p className="text-white/70 text-sm mt-1">Export data to Excel</p>
      </div>

      <div className="p-6 max-w-2xl mx-auto">
        <div className="bg-white rounded-xl p-6 space-y-6">
          <div>
            <label className="block text-sm font-medium mb-2">Report Type</label>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setReportType('transactions')}
                className={`p-4 border rounded-lg text-left ${reportType === 'transactions' ? 'border-[#D4AF37] bg-[#D4AF37]/10' : ''}`}
              >
                <FileText className="h-5 w-5 mb-2" />
                <p className="font-medium">Transactions</p>
                <p className="text-xs text-gray-500">All member transactions</p>
              </button>
              <button
                onClick={() => setReportType('members')}
                className={`p-4 border rounded-lg text-left ${reportType === 'members' ? 'border-[#D4AF37] bg-[#D4AF37]/10' : ''}`}
              >
                <Users className="h-5 w-5 mb-2" />
                <p className="font-medium">Members</p>
                <p className="text-xs text-gray-500">Member list</p>
              </button>
              <button
                onClick={() => setReportType('loans')}
                className={`p-4 border rounded-lg text-left ${reportType === 'loans' ? 'border-[#D4AF37] bg-[#D4AF37]/10' : ''}`}
              >
                <TrendingUp className="h-5 w-5 mb-2" />
                <p className="font-medium">Loans</p>
                <p className="text-xs text-gray-500">Loan applications</p>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-2">Start Date</label>
              <input
                type="date"
                value={dateRange.start}
                max={dateRange.end || undefined}
                onChange={(e) => setDateRange({ ...dateRange, start: e.target.value })}
                className="w-full p-2 border rounded-lg"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">End Date</label>
              <input
                type="date"
                value={dateRange.end}
                min={dateRange.start || undefined}
                onChange={(e) => setDateRange({ ...dateRange, end: e.target.value })}
                className="w-full p-2 border rounded-lg"
              />
            </div>
          </div>

          <button
            onClick={exportToExcel}
            disabled={loading}
            className="w-full bg-[#D4AF37] text-[#1A2A4F] py-3 rounded-lg font-semibold flex items-center justify-center gap-2 disabled:opacity-50"
          >
            <Download className="h-4 w-4" /> {loading ? 'Exporting...' : 'Export to Excel'}
          </button>
        </div>
      </div>
    </div>
  )
}
