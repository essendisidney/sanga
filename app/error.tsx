'use client'

import { useEffect } from 'react'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('App error:', error)
  }, [error])

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
        <h1 className="text-xl font-bold text-gray-900">Something went wrong</h1>
        <p className="text-sm text-gray-600 mt-2">
          Please try again. If this keeps happening, refresh the page.
        </p>
        <button
          onClick={reset}
          className="mt-5 w-full bg-[#1A2A4F] text-white py-3 rounded-lg font-semibold hover:bg-[#243B66] transition-all"
        >
          Retry
        </button>
        <button
          onClick={() => window.location.reload()}
          className="mt-3 w-full bg-gray-100 text-gray-900 py-3 rounded-lg font-semibold hover:bg-gray-200 transition-all"
        >
          Reload
        </button>
      </div>
    </div>
  )
}

