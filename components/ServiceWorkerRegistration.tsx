'use client'

import { useEffect } from 'react'

// Registers /sw.js once the page has loaded.
//
// Disabled in dev because next-dev recompiles aggressively and a SW would
// happily cache and serve stale dev bundles, which is hours of "why does my
// edit not show up". In production we register on every load — registering
// against an existing SW is a no-op so this is idempotent.
//
// We also listen for new versions: when an updated SW is detected, we tell
// it to skipWaiting and reload once it takes control. This avoids the
// classic "user needs to close all tabs for the update to apply" trap.
export default function ServiceWorkerRegistration() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return
    if (typeof window === 'undefined') return
    if (!('serviceWorker' in navigator)) return

    const onLoad = async () => {
      try {
        const reg = await navigator.serviceWorker.register('/sw.js', {
          scope: '/',
        })

        if (reg.waiting) {
          reg.waiting.postMessage({ type: 'SKIP_WAITING' })
        }

        reg.addEventListener('updatefound', () => {
          const installing = reg.installing
          if (!installing) return
          installing.addEventListener('statechange', () => {
            if (
              installing.state === 'installed' &&
              navigator.serviceWorker.controller
            ) {
              installing.postMessage({ type: 'SKIP_WAITING' })
            }
          })
        })

        let reloaded = false
        navigator.serviceWorker.addEventListener('controllerchange', () => {
          if (reloaded) return
          reloaded = true
          window.location.reload()
        })
      } catch (err) {
        console.warn('[sw] registration failed', err)
      }
    }

    if (document.readyState === 'complete') {
      onLoad()
    } else {
      window.addEventListener('load', onLoad, { once: true })
      return () => window.removeEventListener('load', onLoad)
    }
  }, [])

  return null
}
