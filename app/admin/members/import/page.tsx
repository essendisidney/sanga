'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import ExcelJS from 'exceljs'
import { ArrowLeft, Upload, Download, FileSpreadsheet, CheckCircle, XCircle } from 'lucide-react'
import { toast } from 'sonner'
import { useRequireAdmin } from '@/lib/hooks/use-require-admin'

const MAX_FILE_BYTES = 5 * 1024 * 1024
const REQUIRED_COLUMNS = ['full_name', 'phone', 'national_id'] as const

interface ImportRow {
  full_name?: string
  phone?: string
  national_id?: string
  email?: string
}

async function parseWorkbook(file: File): Promise<ImportRow[]> {
  const buffer = await file.arrayBuffer()
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(buffer)
  const ws = wb.worksheets[0]
  if (!ws) throw new Error('Workbook has no sheets')

  const headerRow = ws.getRow(1)
  const headers: string[] = []
  headerRow.eachCell({ includeEmpty: false }, (cell, col) => {
    headers[col - 1] = String(cell.value ?? '').trim()
  })

  const rows: ImportRow[] = []
  for (let r = 2; r <= ws.rowCount; r++) {
    const row = ws.getRow(r)
    if (!row.hasValues) continue
    const obj: Record<string, any> = {}
    headers.forEach((h, i) => {
      if (!h) return
      const cell = row.getCell(i + 1)
      // Normalize Excel's various value shapes (numbers, rich text, hyperlinks)
      // to a plain trimmed string before shipping to the server.
      let v: any = cell.value
      if (v && typeof v === 'object') {
        v = (v as any).text ?? (v as any).result ?? (v as any).hyperlink ?? v
      }
      obj[h] = v == null ? undefined : String(v).trim()
    })
    rows.push(obj)
  }
  return rows
}

export default function BulkImportPage() {
  const router = useRouter()
  const roleState = useRequireAdmin()

  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<ImportRow[]>([])
  const [totalRows, setTotalRows] = useState(0)
  const [importing, setImporting] = useState(false)
  const [results, setResults] = useState<any>(null)

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = e.target.files?.[0]
    if (!picked) return

    if (picked.size > MAX_FILE_BYTES) {
      toast.error(`File must be under ${MAX_FILE_BYTES / 1024 / 1024}MB`)
      return
    }

    try {
      const rows = await parseWorkbook(picked)
      if (rows.length === 0) {
        toast.error('Workbook is empty')
        return
      }

      const firstRowKeys = Object.keys(rows[0] || {})
      const missing = REQUIRED_COLUMNS.filter((c) => !firstRowKeys.includes(c))
      if (missing.length > 0) {
        toast.error(
          `Missing required column${missing.length > 1 ? 's' : ''}: ${missing.join(', ')}. Download the template.`
        )
        return
      }

      setFile(picked)
      setTotalRows(rows.length)
      setPreview(rows.slice(0, 10))
      setResults(null)
    } catch (err: any) {
      toast.error(err?.message || 'Could not parse workbook')
    }
  }

  const downloadTemplate = async () => {
    try {
      const wb = new ExcelJS.Workbook()
      const ws = wb.addWorksheet('Members')
      ws.columns = [
        { header: 'full_name', key: 'full_name', width: 28 },
        { header: 'phone', key: 'phone', width: 16 },
        { header: 'national_id', key: 'national_id', width: 14 },
        { header: 'email', key: 'email', width: 28 },
      ]
      ws.addRow({ full_name: 'John Doe', phone: '254712345678', national_id: '12345678', email: 'john@example.com' })

      const buffer = await wb.xlsx.writeBuffer()
      // Anchor-based download instead of window.open — survives popup blockers.
      const blob = new Blob([buffer as ArrayBuffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'member_import_template.xlsx'
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch (err: any) {
      toast.error(err?.message || 'Template download failed')
    }
  }

  const handleImport = async () => {
    if (!file) return

    setImporting(true)
    const formData = new FormData()
    formData.append('file', file)

    try {
      const res = await fetch('/api/admin/members/bulk-import', {
        method: 'POST',
        body: formData,
      })
      const data = await res.json().catch(() => ({}))

      if (!res.ok) {
        throw new Error(data?.error || `Server returned ${res.status}`)
      }
      setResults(data)

      const succeeded = Number(data?.success ?? 0)
      const failed = Number(data?.failed ?? 0)
      if (failed === 0 && succeeded > 0) {
        toast.success(`Imported ${succeeded} member${succeeded === 1 ? '' : 's'}`)
      } else if (succeeded === 0 && failed > 0) {
        toast.error(`All ${failed} row${failed === 1 ? '' : 's'} failed. See errors below.`)
      } else {
        toast.warning(`Imported ${succeeded}, ${failed} failed. See errors below.`)
      }
    } catch (err: any) {
      toast.error(err?.message || 'Import failed')
    } finally {
      setImporting(false)
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
        <h1 className="text-2xl font-bold">Bulk Member Import</h1>
        <p className="text-white/70 text-sm mt-1">Import members from Excel (.xlsx)</p>
      </div>

      <div className="p-6 max-w-4xl mx-auto">
        <div className="bg-white rounded-xl p-6 mb-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-semibold">1. Download Template</h2>
            <button
              onClick={downloadTemplate}
              className="bg-[#D4AF37] text-[#1A2A4F] px-4 py-2 rounded-lg flex items-center gap-2"
            >
              <Download className="h-4 w-4" /> Download Template
            </button>
          </div>
          <p className="text-sm text-gray-500">
            Required columns: <code>full_name</code>, <code>phone</code>, <code>national_id</code>.
            Optional: <code>email</code>.
          </p>
        </div>

        <div className="bg-white rounded-xl p-6 mb-6">
          <h2 className="text-lg font-semibold mb-4">2. Upload File</h2>
          <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
            <FileSpreadsheet className="h-12 w-12 text-gray-400 mx-auto mb-3" />
            <input
              type="file"
              accept=".xlsx"
              onChange={handleFileUpload}
              className="hidden"
              id="file-upload"
            />
            <label
              htmlFor="file-upload"
              className="cursor-pointer bg-[#1A2A4F] text-white px-4 py-2 rounded-lg inline-block"
            >
              Choose File
            </label>
            {file && <p className="mt-2 text-sm text-green-600">{file.name}</p>}
            <p className="mt-2 text-xs text-gray-400">
              Max {MAX_FILE_BYTES / 1024 / 1024}MB. .xlsx only.
            </p>
          </div>
        </div>

        {preview.length > 0 && (
          <div className="bg-white rounded-xl p-6 mb-6">
            <h2 className="text-lg font-semibold mb-4">3. Preview Data</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 py-2 text-left">Name</th>
                    <th className="px-3 py-2 text-left">Phone</th>
                    <th className="px-3 py-2 text-left">ID Number</th>
                    <th className="px-3 py-2 text-left">Email</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.map((row, i) => (
                    <tr key={i} className="border-t">
                      <td className="px-3 py-2">{row.full_name || '—'}</td>
                      <td className="px-3 py-2">{row.phone || '—'}</td>
                      <td className="px-3 py-2">{row.national_id || '—'}</td>
                      <td className="px-3 py-2">{row.email || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {totalRows > preview.length && (
                <p className="text-xs text-gray-400 mt-2">
                  Showing first {preview.length} of {totalRows} rows
                </p>
              )}
            </div>
          </div>
        )}

        {results && (
          <div className="bg-white rounded-xl p-6 mb-6">
            <h2 className="text-lg font-semibold mb-4">Import Results</h2>
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div className="bg-green-50 p-4 rounded-lg text-center">
                <CheckCircle className="h-8 w-8 text-green-500 mx-auto mb-2" />
                <p className="text-2xl font-bold text-green-600">{results.success}</p>
                <p className="text-sm">Successful</p>
              </div>
              <div className="bg-red-50 p-4 rounded-lg text-center">
                <XCircle className="h-8 w-8 text-red-500 mx-auto mb-2" />
                <p className="text-2xl font-bold text-red-600">{results.failed}</p>
                <p className="text-sm">Failed</p>
              </div>
            </div>
            {results.errors?.length > 0 && (
              <div>
                <p className="font-medium mb-2">Errors:</p>
                <div className="bg-red-50 p-3 rounded-lg max-h-40 overflow-auto">
                  {results.errors.map((err: any, i: number) => (
                    <p key={i} className="text-sm text-red-600">
                      Row {err.row}: {err.error}
                    </p>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {file && (
          <button
            onClick={handleImport}
            disabled={importing}
            className="w-full bg-[#D4AF37] text-[#1A2A4F] py-3 rounded-lg font-semibold flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {importing ? 'Importing...' : (
              <>
                <Upload className="h-4 w-4" /> Import Members
              </>
            )}
          </button>
        )}
      </div>
    </div>
  )
}
