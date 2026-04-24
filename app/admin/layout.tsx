'use client'

import { useState, useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { motion, AnimatePresence } from 'framer-motion'
import {
  LayoutDashboard,
  Users,
  FileText,
  Coins,
  BarChart3,
  Settings,
  LogOut,
  Menu,
  X,
  Bell,
  User,
  Sparkles,
  Scale,
} from 'lucide-react'

type RoleInfo = {
  user_id: string
  role: 'admin' | 'manager' | 'loan_officer' | 'teller' | 'member' | null
}

const STAFF_ROLES = new Set(['admin', 'manager', 'loan_officer', 'teller'])
const ADMIN_ROLES = new Set(['admin', 'manager'])

const ROLE_LABEL: Record<string, string> = {
  admin: 'Administrator',
  manager: 'Manager',
  loan_officer: 'Loan Officer',
  teller: 'Teller',
  member: 'Member',
}

type NavItem = {
  name: string
  icon: typeof LayoutDashboard
  href: string
  roles?: Set<string>
}

// Only routes that currently exist. Phase 3 will add:
//   Branches, Support, Audit, Approvals.
const navItems: NavItem[] = [
  { name: 'Dashboard', icon: LayoutDashboard, href: '/admin', roles: ADMIN_ROLES },
  { name: 'Members', icon: Users, href: '/admin/members', roles: ADMIN_ROLES },
  { name: 'Loans', icon: FileText, href: '/admin/loans' },
  { name: 'Teller', icon: Coins, href: '/staff/teller' },
  { name: 'Reports', icon: BarChart3, href: '/admin/reports', roles: ADMIN_ROLES },
  { name: 'Loan Rules', icon: Scale, href: '/admin/loan-rules', roles: ADMIN_ROLES },
  { name: 'Settings', icon: Settings, href: '/admin/settings', roles: ADMIN_ROLES },
]

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const supabase = createClient()

  const [role, setRole] = useState<RoleInfo['role']>(null)
  const [checking, setChecking] = useState(true)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [userEmail, setUserEmail] = useState<string>('')
  const [userName, setUserName] = useState<string>('')

  // Auth + role gate
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch('/api/me/role', { cache: 'no-store' })
        if (cancelled) return
        if (res.status === 401) {
          router.replace('/login')
          return
        }
        const data = (await res.json().catch(() => null)) as RoleInfo | null
        if (cancelled) return
        if (!data?.role || !STAFF_ROLES.has(data.role)) {
          toast.error('Staff access required')
          router.replace('/dashboard')
          return
        }
        setRole(data.role)

        const {
          data: { user },
        } = await supabase.auth.getUser()
        if (cancelled) return
        if (user) {
          setUserEmail(user.email ?? '')
          const { data: profile } = await supabase
            .from('users')
            .select('full_name')
            .eq('id', user.id)
            .maybeSingle()
          if (!cancelled) setUserName(profile?.full_name || user.email || '')
        }
      } finally {
        if (!cancelled) setChecking(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [router, supabase])

  // Default sidebar state: open on desktop, closed on mobile
  useEffect(() => {
    const setInitial = () => setSidebarOpen(window.innerWidth >= 1024)
    setInitial()
    window.addEventListener('resize', setInitial)
    return () => window.removeEventListener('resize', setInitial)
  }, [])

  // Auto-close sidebar on route change (mobile)
  useEffect(() => {
    if (typeof window !== 'undefined' && window.innerWidth < 1024) {
      setSidebarOpen(false)
    }
  }, [pathname])

  const handleLogout = async () => {
    await supabase.auth.signOut()
    localStorage.removeItem('sanga_user')
    toast.success('Logged out')
    router.push('/login')
  }

  // While the role gate is checking, render a neutral full-screen loader so
  // no admin chrome leaks to unauthorized users.
  if (checking || !role) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-secondary" />
      </div>
    )
  }

  const visibleNav = navItems.filter((item) => !item.roles || item.roles.has(role))

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      {/* Mobile overlay */}
      <AnimatePresence>
        {sidebarOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setSidebarOpen(false)}
            className="fixed inset-0 z-30 bg-black/40 backdrop-blur-sm lg:hidden"
            aria-hidden
          />
        )}
      </AnimatePresence>

      {/* Sidebar */}
      <motion.aside
        initial={false}
        animate={{ x: sidebarOpen ? 0 : -280 }}
        transition={{ type: 'tween', duration: 0.25 }}
        className="fixed left-0 top-0 z-40 h-screen w-64 bg-white shadow-2xl flex flex-col"
      >
        {/* Logo */}
        <div className="p-6 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-primary to-primary-dark rounded-xl flex items-center justify-center shadow-sm">
              <Sparkles className="h-5 w-5 text-secondary" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-primary font-serif">SANGA</h1>
              <p className="text-xs text-gray-500 tracking-wide">Staff Portal</p>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {visibleNav.map((item) => {
            const isActive =
              pathname === item.href ||
              (item.href !== '/admin' && pathname?.startsWith(item.href + '/')) ||
              (item.href === '/admin' && pathname === '/admin')
            return (
              <button
                key={item.href}
                onClick={() => router.push(item.href)}
                className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl transition-all duration-200 text-sm ${
                  isActive
                    ? 'bg-gradient-to-r from-primary/10 to-secondary/5 text-primary font-semibold'
                    : 'hover:bg-gray-50 text-gray-600'
                }`}
              >
                <item.icon
                  className={`h-5 w-5 shrink-0 ${isActive ? 'text-secondary-dark' : ''}`}
                />
                <span>{item.name}</span>
                {isActive && (
                  <span className="ml-auto w-1.5 h-5 bg-secondary rounded-full" />
                )}
              </button>
            )
          })}
        </nav>

        {/* User */}
        <div className="p-3 border-t border-gray-100">
          <div className="flex items-center gap-3 p-3 rounded-xl bg-gray-50">
            <div className="w-10 h-10 bg-gradient-to-br from-primary to-primary-dark rounded-full flex items-center justify-center shrink-0">
              <User className="h-5 w-5 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate text-gray-900">
                {userName || userEmail || 'Staff'}
              </p>
              <p className="text-xs text-gray-500">{ROLE_LABEL[role] ?? role}</p>
            </div>
            <button
              onClick={handleLogout}
              className="p-2 hover:bg-gray-200 rounded-lg transition"
              aria-label="Log out"
              title="Log out"
            >
              <LogOut className="h-4 w-4 text-gray-500" />
            </button>
          </div>
        </div>
      </motion.aside>

      {/* Main content */}
      <div
        className={`transition-[margin] duration-300 ${sidebarOpen ? 'lg:ml-64' : 'lg:ml-0'}`}
      >
        {/* Top bar */}
        <header className="sticky top-0 z-20 bg-white/80 backdrop-blur-md border-b border-gray-100">
          <div className="flex items-center justify-between px-4 sm:px-6 py-3">
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="p-2 rounded-lg hover:bg-gray-100 transition"
              aria-label={sidebarOpen ? 'Close sidebar' : 'Open sidebar'}
            >
              {sidebarOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>

            <div className="flex items-center gap-2 sm:gap-3">
              <button
                className="relative p-2 rounded-lg hover:bg-gray-100 transition"
                aria-label="Notifications"
                title="Notifications (coming soon)"
              >
                <Bell className="h-5 w-5 text-gray-600" />
              </button>
              <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 bg-gray-100 rounded-full">
                <div className="w-6 h-6 bg-gradient-to-br from-primary to-primary-dark rounded-full flex items-center justify-center">
                  <span className="text-white text-xs font-semibold">
                    {(userName || userEmail || 'S').charAt(0).toUpperCase()}
                  </span>
                </div>
                <span className="text-xs text-gray-700 font-medium max-w-[140px] truncate">
                  {userName || userEmail}
                </span>
              </div>
            </div>
          </div>
        </header>

        {/* Page */}
        <main className="min-h-[calc(100vh-57px)]">
          <motion.div
            key={pathname}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
          >
            {children}
          </motion.div>
        </main>
      </div>
    </div>
  )
}
