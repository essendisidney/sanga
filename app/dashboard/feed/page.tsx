'use client'

import { ArrowLeft } from 'lucide-react'
import { useRouter } from 'next/navigation'
import BottomNav from '@/components/BottomNav'
import { CommunityFeed } from '@/components/GenZ/CommunityFeed'
import { PersonalizedFeed } from '@/components/GenZ/PersonalizedFeed'

/**
 * Community feed page.
 *
 * This is NOT a social network. There are no fake users, no made-up
 * testimonials, no user-generated content, and no product advertisements
 * with specific loan terms. Everything rendered comes from aggregated,
 * anonymized SANGA activity or from admin-curated financial education tips.
 */
export default function FeedPage() {
  const router = useRouter()

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-50 pb-24">
      <div className="sticky top-0 z-20 border-b border-gray-100 bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center gap-3 px-4 py-3 sm:px-6">
          <button
            onClick={() => router.back()}
            aria-label="Back"
            className="rounded-full p-2 transition hover:bg-gray-100"
          >
            <ArrowLeft className="h-5 w-5 text-gray-700" />
          </button>
          <div>
            <h1 className="text-lg font-semibold text-gray-900">Community</h1>
            <p className="text-xs text-gray-500">
              Live stats from your SACCO · updated in real time
            </p>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-2xl space-y-6 px-4 py-5 sm:px-6">
        <PersonalizedFeed />
        <CommunityFeed />
      </div>

      <BottomNav />
    </div>
  )
}
