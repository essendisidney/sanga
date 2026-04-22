'use client'

import { useEffect, useState } from 'react'
import { Download } from 'lucide-react'

/**
 * Chrome/Android-only "install this app" prompt.
 *
 * Listens for `beforeinstallprompt`, which the browser fires once it decides
 * the site is installable. We stash the event, show our own banner, and let
 * the user trigger the native install sheet via `prompt()` on click.
 *
 * iOS Safari never fires this event — users must install via the Share menu,
 * which is what <InstallInstructions /> covers.
 */

type BeforeInstallPromptEvent = Event & {
  prompt: () => void
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export default function PWAInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null)
  const [showPrompt, setShowPrompt] = useState(false)

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault()
      setDeferredPrompt(e as BeforeInstallPromptEvent)
      setShowPrompt(true)
    }

    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  const handleInstall = () => {
    if (!deferredPrompt) return
    deferredPrompt.prompt()
    deferredPrompt.userChoice.then((result) => {
      if (result.outcome === 'accepted') {
        console.log('User accepted install')
      }
      setDeferredPrompt(null)
      setShowPrompt(false)
    })
  }

  if (!showPrompt) return null

  return (
    <div className="fixed bottom-20 left-4 right-4 z-50 bg-[#1A2A4F] text-white rounded-xl p-4 shadow-lg animate-slide-up">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-[#D4AF37] rounded-lg flex items-center justify-center">
            <span className="text-[#1A2A4F] font-bold">S</span>
          </div>
          <div>
            <p className="font-semibold">Install SANGA App</p>
            <p className="text-xs opacity-80">Get faster access to your finances</p>
          </div>
        </div>
        <button
          onClick={handleInstall}
          className="bg-[#D4AF37] text-[#1A2A4F] px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-2"
        >
          <Download className="h-4 w-4" /> Install
        </button>
      </div>
    </div>
  )
}
