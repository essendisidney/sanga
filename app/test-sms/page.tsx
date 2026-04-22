'use client'

import { useState } from 'react'
import { toast } from 'sonner'

type ApiResult = Record<string, unknown> | { error: string }

export default function TestSMSPage() {
  const [phone, setPhone] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<ApiResult | null>(null)

  const testSendSMS = async () => {
    if (!phone) {
      toast.error('Enter phone number')
      return
    }

    setLoading(true)
    setResult(null)

    try {
      const response = await fetch('/api/sms/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone,
          message: message || 'Test message from Sanga API',
        }),
      })

      const data = (await response.json()) as ApiResult & {
        success?: boolean
        error?: string
      }
      setResult(data)

      if (data.success) {
        toast.success('SMS sent successfully!')
      } else {
        toast.error(data.error || 'Failed to send')
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      toast.error('Network error')
      setResult({ error: msg })
    } finally {
      setLoading(false)
    }
  }

  const testSendOTP = async () => {
    if (!phone) {
      toast.error('Enter phone number')
      return
    }

    setLoading(true)
    setResult(null)

    try {
      const response = await fetch('/api/sms/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone }),
      })

      const data = (await response.json()) as ApiResult & {
        success?: boolean
        error?: string
      }
      setResult(data)

      if (data.success) {
        toast.success('OTP sent! Check your phone')
      } else {
        toast.error(data.error || 'Failed to send')
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      toast.error('Network error')
      setResult({ error: msg })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-md mx-auto">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">SMS Test Tool</h1>

        <div className="bg-white rounded-xl shadow-sm p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Phone Number
            </label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="0712345678 or 254712345678"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg"
            />
            <p className="text-xs text-gray-500 mt-1">
              Enter number with 0 (0712345678) or 254 (254712345678)
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Message (optional)
            </label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Test message..."
              rows={3}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg"
            />
          </div>

          <div className="flex gap-3">
            <button
              onClick={testSendSMS}
              disabled={loading}
              className="flex-1 bg-blue-600 text-white py-2 rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? 'Sending...' : 'Send SMS'}
            </button>
            <button
              onClick={testSendOTP}
              disabled={loading}
              className="flex-1 bg-green-600 text-white py-2 rounded-lg font-semibold hover:bg-green-700 disabled:opacity-50"
            >
              {loading ? 'Sending...' : 'Send OTP'}
            </button>
          </div>

          {result && (
            <div className="mt-4 p-4 bg-gray-100 rounded-lg">
              <p className="font-medium text-gray-700 mb-2">Response:</p>
              <pre className="text-xs overflow-auto">
                {JSON.stringify(result, null, 2)}
              </pre>
            </div>
          )}
        </div>

        <div className="mt-6 text-sm text-gray-500">
          <p className="font-medium mb-2">Test with different formats:</p>
          <ul className="list-disc list-inside space-y-1">
            <li>0712345678 (with leading 0)</li>
            <li>254712345678 (with 254)</li>
            <li>712345678 (without prefix)</li>
          </ul>
        </div>
      </div>
    </div>
  )
}
