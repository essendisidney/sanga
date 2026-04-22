'use client'

import { useRouter } from 'next/navigation'
import { ArrowLeft, Construction } from 'lucide-react'

type ComingSoonProps = {
  title: string
  description?: string
}

/**
 * Shared placeholder used by every route we haven't built yet (profile,
 * transfer, services, support, contact). Keeps navigation from 404-ing while
 * the real screens are still on the roadmap.
 */
export function ComingSoon({ title, description }: ComingSoonProps) {
  const router = useRouter()

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b px-4 py-4 flex items-center gap-4">
        <button onClick={() => router.back()}>
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h1 className="text-xl font-bold">{title}</h1>
      </div>

      <div className="max-w-md mx-auto px-4 py-16 text-center">
        <div className="w-16 h-16 bg-[#1A2A4F]/10 rounded-full flex items-center justify-center mx-auto mb-6">
          <Construction className="h-7 w-7 text-[#1A2A4F]" />
        </div>
        <h2 className="text-lg font-semibold text-gray-900 mb-2">
          Coming soon
        </h2>
        <p className="text-sm text-gray-500 max-w-xs mx-auto">
          {description ??
            `We're still building this screen. Check back soon.`}
        </p>
        <button
          onClick={() => router.push('/dashboard')}
          className="mt-6 bg-[#1A2A4F] text-white px-5 py-2.5 rounded-lg text-sm font-semibold hover:bg-[#243B66] transition-colors"
        >
          Back to Dashboard
        </button>
      </div>
    </div>
  )
}
