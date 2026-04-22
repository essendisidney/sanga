'use client'

import { useRouter } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'

export default function TermsPage() {
  const router = useRouter()

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-100">
        <div className="px-4 py-4 flex items-center gap-4">
          <button onClick={() => router.back()} className="p-1">
            <ArrowLeft className="h-5 w-5 text-gray-600" />
          </button>
          <h1 className="text-xl font-bold text-gray-900">Terms of Service</h1>
        </div>
      </div>

      <div className="p-4 max-w-2xl mx-auto">
        <div className="bg-white rounded-xl shadow-sm p-6">
          <div className="flex items-center gap-2 mb-6">
            <div className="w-8 h-8 bg-[#1A2A4F] rounded-lg flex items-center justify-center">
              <span className="text-white text-xs font-bold">S</span>
            </div>
            <span className="text-lg font-bold text-[#1A2A4F]">SANGA™</span>
          </div>

          <h2 className="text-lg font-semibold text-gray-900 mb-4">1. Introduction</h2>
          <p className="text-gray-600 text-sm mb-4">
            Welcome to SANGA™ (&quot;Connecting Africa&apos;s Wealth&quot;). By using our platform, you agree to these terms.
            SANGA™ is a trademark of Sanga Financial Network Ltd, registered in Kenya and Africa.
          </p>

          <h2 className="text-lg font-semibold text-gray-900 mb-4">2. Your Account</h2>
          <p className="text-gray-600 text-sm mb-4">
            You must be a member of a SANGA™-connected SACCO to use our services.
            You are responsible for maintaining the security of your account.
          </p>

          <h2 className="text-lg font-semibold text-gray-900 mb-4">3. Transactions</h2>
          <p className="text-gray-600 text-sm mb-4">
            All transactions are final and subject to verification.
            SANGA™ uses M-Pesa for payment processing and Taifa Mobile for SMS notifications.
          </p>

          <h2 className="text-lg font-semibold text-gray-900 mb-4">4. Fees</h2>
          <p className="text-gray-600 text-sm mb-4">
            Transaction fees are disclosed before each transaction.
            SANGA™ may change fees with 30 days notice.
          </p>

          <h2 className="text-lg font-semibold text-gray-900 mb-4">5. Trademark Notice</h2>
          <p className="text-gray-600 text-sm mb-4">
            SANGA™ and the SANGA logo are trademarks of Sanga Financial Network Ltd.
            Unauthorized use is prohibited.
          </p>

          <div className="border-t border-gray-100 pt-4 mt-4">
            <p className="text-xs text-gray-400 text-center">
              © {new Date().getFullYear()} Sanga Financial Network Ltd. All rights reserved.
              <br />
              SANGA™ is a registered trademark. Connecting Africa&apos;s Wealth™
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
