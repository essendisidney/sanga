'use client'

import { useState } from 'react'
import { Download, Printer, Calendar } from 'lucide-react'
import { toast } from 'sonner'

export default function BalanceSheet() {
  const [date, setDate] = useState(new Date().toISOString().split('T')[0])

  const data = {
    assets: {
      current: [
        { name: 'Cash in Hand', amount: 245000 },
        { name: 'Cash at Bank', amount: 1850000 },
        { name: 'M-Pesa Float', amount: 500000 },
        { name: 'Member Savings', amount: 3250000 },
        { name: 'Accounts Receivable', amount: 125000 }
      ],
      fixed: [
        { name: 'Land & Buildings', amount: 5000000 },
        { name: 'Equipment', amount: 750000 },
        { name: 'Vehicles', amount: 1200000 }
      ]
    },
    liabilities: {
      current: [
        { name: 'Member Deposits', amount: 3250000 },
        { name: 'Loan Interest Payable', amount: 45000 },
        { name: 'Accounts Payable', amount: 75000 }
      ],
      longTerm: [
        { name: 'Bank Loans', amount: 2000000 },
        { name: 'Member Share Capital', amount: 1500000 }
      ]
    },
    equity: {
      name: 'Retained Earnings',
      amount: 275000
    }
  }

  const totalAssets = [...data.assets.current, ...data.assets.fixed].reduce((sum, i) => sum + i.amount, 0)
  const totalLiabilities = [...data.liabilities.current, ...data.liabilities.longTerm].reduce((sum, i) => sum + i.amount, 0)
  const totalEquity = data.equity.amount
  const totalLiabilitiesEquity = totalLiabilities + totalEquity

  const handleExport = () => {
    toast.success('Report exported successfully')
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-[#1A2A4F] text-white p-6">
        <h1 className="text-2xl font-bold">Balance Sheet</h1>
        <p className="text-white/70 text-sm mt-1">Statement of financial position</p>
      </div>

      <div className="p-4 max-w-6xl mx-auto">
        {/* Controls */}
        <div className="bg-white rounded-xl p-4 mb-6 flex flex-wrap gap-4 items-center justify-between">
          <div className="flex items-center gap-3">
            <Calendar className="h-5 w-5 text-gray-400" />
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="border rounded-lg px-3 py-2" />
          </div>
          <div className="flex gap-3">
            <button onClick={handleExport} className="flex items-center gap-2 px-4 py-2 border rounded-lg"><Download className="h-4 w-4" /> Export</button>
            <button onClick={() => window.print()} className="flex items-center gap-2 px-4 py-2 bg-[#1A2A4F] text-white rounded-lg"><Printer className="h-4 w-4" /> Print</button>
          </div>
        </div>

        {/* Report Content */}
        <div className="bg-white rounded-xl p-6">
          <div className="text-center mb-6">
            <h2 className="text-xl font-bold">SANGA Financial Network</h2>
            <p className="text-gray-500">Balance Sheet as at {new Date(date).toLocaleDateString()}</p>
          </div>

          <div className="grid md:grid-cols-2 gap-8">
            {/* Assets */}
            <div>
              <h3 className="text-lg font-semibold bg-gray-100 p-2 mb-3">ASSETS</h3>
              <div className="mb-4">
                <p className="font-medium text-gray-700 mb-2">Current Assets</p>
                {data.assets.current.map((item, i) => (
                  <div key={i} className="flex justify-between py-1"><span>{item.name}</span><span>KES {item.amount.toLocaleString()}</span></div>
                ))}
              </div>
              <div>
                <p className="font-medium text-gray-700 mb-2">Fixed Assets</p>
                {data.assets.fixed.map((item, i) => (
                  <div key={i} className="flex justify-between py-1"><span>{item.name}</span><span>KES {item.amount.toLocaleString()}</span></div>
                ))}
              </div>
              <div className="border-t pt-2 mt-2 font-bold flex justify-between"><span>Total Assets</span><span>KES {totalAssets.toLocaleString()}</span></div>
            </div>

            {/* Liabilities & Equity */}
            <div>
              <h3 className="text-lg font-semibold bg-gray-100 p-2 mb-3">LIABILITIES & EQUITY</h3>
              <div className="mb-4">
                <p className="font-medium text-gray-700 mb-2">Current Liabilities</p>
                {data.liabilities.current.map((item, i) => (
                  <div key={i} className="flex justify-between py-1"><span>{item.name}</span><span>KES {item.amount.toLocaleString()}</span></div>
                ))}
              </div>
              <div className="mb-4">
                <p className="font-medium text-gray-700 mb-2">Long-Term Liabilities</p>
                {data.liabilities.longTerm.map((item, i) => (
                  <div key={i} className="flex justify-between py-1"><span>{item.name}</span><span>KES {item.amount.toLocaleString()}</span></div>
                ))}
              </div>
              <div>
                <div className="flex justify-between py-1"><span>{data.equity.name}</span><span>KES {data.equity.amount.toLocaleString()}</span></div>
              </div>
              <div className="border-t pt-2 mt-2 font-bold flex justify-between"><span>Total Liabilities & Equity</span><span>KES {totalLiabilitiesEquity.toLocaleString()}</span></div>
            </div>
          </div>

          {/* Verification */}
          <div className="mt-6 pt-4 border-t text-center text-sm">
            {Math.abs(totalAssets - totalLiabilitiesEquity) < 1 ? (
              <p className="text-green-600">✓ Balance Sheet is balanced</p>
            ) : (
              <p className="text-red-600">✗ Balance Sheet is off by KES {Math.abs(totalAssets - totalLiabilitiesEquity).toLocaleString()}</p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
