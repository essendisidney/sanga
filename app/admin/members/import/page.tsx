'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Upload, Download, FileSpreadsheet, CheckCircle, XCircle } from 'lucide-react'
import { toast } from 'sonner'
import * as XLSX from 'xlsx'

export default function BulkImportPage() {
  const router = useRouter()
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<any[]>([])
  const [totalRows, setTotalRows] = useState(0)
  const [importing, setImporting] = useState(false)
  const [results, setResults] = useState<any>(null)

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setFile(file)
    const reader = new FileReader()
    reader.onload = (evt) => {
      const data = new Uint8Array(evt.target?.result as ArrayBuffer)
      const workbook = XLSX.read(data, { type: 'array' })
      const sheet = workbook.Sheets[workbook.SheetNames[0]!]
      const json = XLSX.utils.sheet_to_json<any>(sheet!)
      setTotalRows(json.length)
      setPreview(json.slice(0, 10))
    }
    reader.readAsArrayBuffer(file)
  }

  const downloadTemplate = () => {
    const template = [
      { full_name: 'John Doe', phone: '254712345678', national_id: '12345678', email: 'john@example.com' }
    ]
    const ws = XLSX.utils.json_to_sheet(template)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Members')
    XLSX.writeFile(wb, 'member_import_template.xlsx')
  }

  const handleImport = async () => {
    if (!file) return

    setImporting(true)
    const formData = new FormData()
    formData.append('file', file)

    try {
      const res = await fetch('/api/admin/members/bulk-import', {
        method: 'POST',
        body: formData
      })
      const data = await res.json()
      setResults(data)
      toast.success(`Imported ${data.success} members, ${data.failed} failed`)
    } catch {
      toast.error('Import failed')
    } finally {
      setImporting(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-[#1A2A4F] text-white p-6">
        <button onClick={() => router.back()} className="text-white/70 mb-2 flex items-center gap-1">
          <ArrowLeft className="h-4 w-4" /> Back
        </button>
        <h1 className="text-2xl font-bold">Bulk Member Import</h1>
        <p className="text-white/70 text-sm mt-1">Import members from Excel/CSV</p>
      </div>

      <div className="p-6 max-w-4xl mx-auto">
        <div className="bg-white rounded-xl p-6 mb-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-semibold">1. Download Template</h2>
            <button onClick={downloadTemplate} className="bg-[#D4AF37] text-[#1A2A4F] px-4 py-2 rounded-lg flex items-center gap-2">
              <Download className="h-4 w-4" /> Download Template
            </button>
          </div>
          <p className="text-sm text-gray-500">Download the Excel template and fill with member data</p>
        </div>

        <div className="bg-white rounded-xl p-6 mb-6">
          <h2 className="text-lg font-semibold mb-4">2. Upload File</h2>
          <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
            <FileSpreadsheet className="h-12 w-12 text-gray-400 mx-auto mb-3" />
            <input
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={handleFileUpload}
              className="hidden"
              id="file-upload"
            />
            <label htmlFor="file-upload" className="cursor-pointer bg-[#1A2A4F] text-white px-4 py-2 rounded-lg inline-block">
              Choose File
            </label>
            {file && <p className="mt-2 text-sm text-green-600">{file.name}</p>}
          </div>
        </div>

        {preview.length > 0 && (
          <div className="bg-white rounded-xl p-6 mb-6">
            <h2 className="text-lg font-semibold mb-4">3. Preview Data</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr><th className="px-3 py-2">Name</th><th className="px-3 py-2">Phone</th><th className="px-3 py-2">ID Number</th></tr>
                </thead>
                <tbody>
                  {preview.map((row, i) => (
                    <tr key={i} className="border-t">
                      <td className="px-3 py-2">{row.full_name}</td>
                      <td className="px-3 py-2">{row.phone}</td>
                      <td className="px-3 py-2">{row.national_id}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {totalRows > preview.length && (
                <p className="text-xs text-gray-400 mt-2">Showing first {preview.length} of {totalRows} rows</p>
              )}
            </div>
          </div>
        )}

        {results && (
          <div className="bg-white rounded-xl p-6 mb-6">
            <h2 className="text-lg font-semibold mb-4">Import Results</h2>
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div className="bg-green-50 p-4 rounded-lg text-center"><CheckCircle className="h-8 w-8 text-green-500 mx-auto mb-2" />
                <p className="text-2xl font-bold text-green-600">{results.success}</p><p className="text-sm">Successful</p></div>
              <div className="bg-red-50 p-4 rounded-lg text-center"><XCircle className="h-8 w-8 text-red-500 mx-auto mb-2" />
                <p className="text-2xl font-bold text-red-600">{results.failed}</p><p className="text-sm">Failed</p></div>
            </div>
            {results.errors?.length > 0 && (
              <div><p className="font-medium mb-2">Errors:</p>
                <div className="bg-red-50 p-3 rounded-lg max-h-40 overflow-auto">
                  {results.errors.map((err: any, i: number) => (<p key={i} className="text-sm text-red-600">Row {err.row}: {err.error}</p>))}
                </div>
              </div>
            )}
          </div>
        )}

        {file && (
          <button onClick={handleImport} disabled={importing} className="w-full bg-[#D4AF37] text-[#1A2A4F] py-3 rounded-lg font-semibold flex items-center justify-center gap-2">
            {importing ? 'Importing...' : <><Upload className="h-4 w-4" /> Import Members</>}
          </button>
        )}
      </div>
    </div>
  )
}
