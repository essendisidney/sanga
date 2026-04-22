'use client'

import { usePathname, useRouter } from 'next/navigation'
import { Home, FileText, Shield, User } from 'lucide-react'

const items = [
  { label: 'Home', icon: Home, href: '/dashboard' },
  { label: 'Services', icon: FileText, href: '/services' },
  { label: 'Support', icon: Shield, href: '/support' },
  { label: 'Profile', icon: User, href: '/profile' },
]

export default function BottomNav() {
  const router = useRouter()
  const pathname = usePathname()

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-6 py-2 z-20">
      <div className="max-w-md mx-auto flex justify-between items-center">
        {items.map(({ label, icon: Icon, href }) => {
          const active = pathname === href || pathname?.startsWith(`${href}/`)
          return (
            <button
              key={href}
              onClick={() => router.push(href)}
              className={`flex flex-col items-center gap-1 ${active ? 'text-[#D4AF37]' : 'text-gray-500'}`}
            >
              <Icon className="h-5 w-5" />
              <span className="text-xs">{label}</span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}
