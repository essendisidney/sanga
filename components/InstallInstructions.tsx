'use client'

import { useState, useEffect } from 'react'
import { X, Smartphone, Apple } from 'lucide-react'

export default function InstallInstructions() {
  const [show, setShow] = useState(false)
  const [platform, setPlatform] = useState<'ios' | 'android' | 'other'>('other')

  useEffect(() => {
    const hasSeen = localStorage.getItem('pwa-instructions-seen')
    if (!hasSeen) {
      setTimeout(() => setShow(true), 2000)
    }

    const ua = navigator.userAgent
    if (/iPhone|iPad|iPod/.test(ua)) setPlatform('ios')
    else if (/Android/.test(ua)) setPlatform('android')
  }, [])

  const handleDismiss = () => {
    localStorage.setItem('pwa-instructions-seen', 'true')
    setShow(false)
  }

  if (!show) return null

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-sm w-full p-6">
        <div className="flex justify-between items-start mb-4">
          <h3 className="text-lg font-semibold">Install SANGA App</h3>
          <button onClick={handleDismiss}><X className="h-5 w-5 text-gray-400" /></button>
        </div>

        <div className="space-y-4">
          {platform === 'ios' && (
            <div className="bg-gray-50 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2"><Apple className="h-5 w-5" /><span className="font-medium">iPhone/iPad</span></div>
              <ol className="text-sm text-gray-600 space-y-2 list-decimal list-inside">
                <li>Tap the Share button <span className="bg-gray-200 px-2 py-0.5 rounded">⎔</span></li>
                <li>Scroll down and tap <strong>&quot;Add to Home Screen&quot;</strong></li>
                <li>Tap <strong>&quot;Add&quot;</strong> in the top right</li>
              </ol>
            </div>
          )}

          {platform === 'android' && (
            <div className="bg-gray-50 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2"><Smartphone className="h-5 w-5" /><span className="font-medium">Android</span></div>
              <ol className="text-sm text-gray-600 space-y-2 list-decimal list-inside">
                <li>Tap the menu button <span className="bg-gray-200 px-2 py-0.5 rounded">⋮</span></li>
                <li>Tap <strong>&quot;Install App&quot;</strong> or <strong>&quot;Add to Home Screen&quot;</strong></li>
                <li>Tap <strong>&quot;Install&quot;</strong> to confirm</li>
              </ol>
            </div>
          )}

          <button
            onClick={handleDismiss}
            className="w-full bg-[#1A2A4F] text-white py-2 rounded-lg mt-2"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  )
}
