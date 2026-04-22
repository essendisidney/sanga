'use client'

import Link from 'next/link'
import { ArrowRight, Users, Zap, Shield } from 'lucide-react'

export default function HomePage() {
  return (
    <div className="min-h-screen bg-white">
      {/* Navigation Bar */}
      <nav className="bg-white border-b border-gray-100 sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-[#1A2A4F] rounded-lg flex items-center justify-center">
                <span className="text-white text-sm font-bold">S</span>
              </div>
              <span className="text-xl font-bold text-[#1A2A4F]">SANGA™</span>
            </div>
            <div className="hidden md:flex gap-6">
              <a href="#features" className="text-gray-600 hover:text-[#D4AF37]">Features</a>
              <a href="#about" className="text-gray-600 hover:text-[#D4AF37]">About</a>
              <a href="#contact" className="text-gray-600 hover:text-[#D4AF37]">Contact</a>
            </div>
            <Link
              href="/login"
              className="bg-[#1A2A4F] text-white px-5 py-2 rounded-lg text-sm font-semibold hover:bg-[#243B66] transition-all"
            >
              Login
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <div className="bg-gradient-to-br from-[#1A2A4F] to-[#243B66] text-white">
        <div className="container mx-auto px-4 py-16 md:py-24">
          <div className="max-w-3xl mx-auto text-center">
            {/* SANGA Logo Large */}
            <div className="inline-flex items-center justify-center mb-6">
              <div className="w-16 h-16 bg-white/10 rounded-2xl flex items-center justify-center mr-3">
                <div className="text-center">
                  <div className="flex justify-center gap-1 mb-1">
                    <div className="w-2 h-2 bg-[#D4AF37] rounded-full"></div>
                    <div className="w-2 h-2 bg-[#D4AF37] rounded-full"></div>
                  </div>
                  <div className="flex justify-center gap-1">
                    <div className="w-2 h-2 bg-[#D4AF37] rounded-full"></div>
                    <div className="w-2 h-2 bg-[#D4AF37] rounded-full"></div>
                  </div>
                </div>
              </div>
              <div className="text-left">
                <div className="text-3xl md:text-4xl font-bold tracking-tight">SANGA™</div>
                <div className="text-xs text-[#D4AF37] tracking-wider">CONNECTING AFRICA&apos;S WEALTH™</div>
              </div>
            </div>

            <h1 className="text-3xl md:text-5xl font-bold mb-4">
              Connecting Africa&apos;s Wealth
            </h1>
            <p className="text-lg md:text-xl text-white/80 mb-6 max-w-2xl mx-auto">
              The unified financial network connecting African SACCOs and their members.
              Stronger together.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link
                href="/login"
                className="bg-[#D4AF37] text-[#1A2A4F] px-8 py-3 rounded-lg font-semibold hover:bg-[#E6C248] transition-all inline-flex items-center justify-center gap-2"
              >
                Get Started <ArrowRight className="h-4 w-4" />
              </Link>
              <a
                href="#features"
                className="border-2 border-white/30 text-white px-8 py-3 rounded-lg font-semibold hover:bg-white/10 transition-all inline-flex items-center justify-center"
              >
                Learn More
              </a>
            </div>
          </div>
        </div>
      </div>

      {/* Features Section */}
      <div id="features" className="py-16 md:py-24 bg-gray-50">
        <div className="container mx-auto px-4">
          <h2 className="text-3xl md:text-4xl font-bold text-center text-gray-900 mb-4">
            Why Choose <span className="text-[#D4AF37]">SANGA™</span>?
          </h2>
          <p className="text-center text-gray-600 mb-12 max-w-2xl mx-auto">
            The most trusted financial network for African SACCOs and their members
          </p>

          <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
            {/* Feature 1 */}
            <div className="bg-white rounded-xl p-6 shadow-sm text-center hover:shadow-md transition-shadow">
              <div className="w-14 h-14 bg-[#1A2A4F]/10 rounded-xl flex items-center justify-center mx-auto mb-4">
                <Users className="h-7 w-7 text-[#1A2A4F]" />
              </div>
              <h3 className="text-xl font-semibold mb-2 text-gray-900">Unified Network</h3>
              <p className="text-gray-600 text-sm">
                Connect with SACCOs across Africa. One membership, unlimited access.
              </p>
            </div>

            {/* Feature 2 */}
            <div className="bg-white rounded-xl p-6 shadow-sm text-center hover:shadow-md transition-shadow">
              <div className="w-14 h-14 bg-[#1A2A4F]/10 rounded-xl flex items-center justify-center mx-auto mb-4">
                <Zap className="h-7 w-7 text-[#1A2A4F]" />
              </div>
              <h3 className="text-xl font-semibold mb-2 text-gray-900">Instant Transfers</h3>
              <p className="text-gray-600 text-sm">
                Send and receive money instantly between any SANGA™-connected SACCO.
              </p>
            </div>

            {/* Feature 3 */}
            <div className="bg-white rounded-xl p-6 shadow-sm text-center hover:shadow-md transition-shadow">
              <div className="w-14 h-14 bg-[#1A2A4F]/10 rounded-xl flex items-center justify-center mx-auto mb-4">
                <Shield className="h-7 w-7 text-[#1A2A4F]" />
              </div>
              <h3 className="text-xl font-semibold mb-2 text-gray-900">Secure & Trusted</h3>
              <p className="text-gray-600 text-sm">
                Bank-grade security with transparent, member-owned governance.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Statistics Section */}
      <div className="py-16 bg-white">
        <div className="container mx-auto px-4">
          <div className="grid md:grid-cols-4 gap-8 max-w-4xl mx-auto text-center">
            <div>
              <p className="text-3xl md:text-4xl font-bold text-[#D4AF37]">50+</p>
              <p className="text-gray-600 text-sm mt-1">Connected SACCOs</p>
            </div>
            <div>
              <p className="text-3xl md:text-4xl font-bold text-[#D4AF37]">100K+</p>
              <p className="text-gray-600 text-sm mt-1">Active Members</p>
            </div>
            <div>
              <p className="text-3xl md:text-4xl font-bold text-[#D4AF37]">KES 5B+</p>
              <p className="text-gray-600 text-sm mt-1">Total Savings</p>
            </div>
            <div>
              <p className="text-3xl md:text-4xl font-bold text-[#D4AF37]">99.9%</p>
              <p className="text-gray-600 text-sm mt-1">Uptime</p>
            </div>
          </div>
        </div>
      </div>

      {/* How It Works Section */}
      <div className="py-16 bg-gray-50">
        <div className="container mx-auto px-4">
          <h2 className="text-3xl md:text-4xl font-bold text-center text-gray-900 mb-12">
            How <span className="text-[#D4AF37]">SANGA™</span> Works
          </h2>
          <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
            <div className="text-center">
              <div className="w-16 h-16 bg-[#1A2A4F] rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-white text-xl font-bold">1</span>
              </div>
              <h3 className="text-lg font-semibold mb-2">Join a SACCO</h3>
              <p className="text-gray-600 text-sm">Become a member of any SANGA™-connected SACCO</p>
            </div>
            <div className="text-center">
              <div className="w-16 h-16 bg-[#1A2A4F] rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-white text-xl font-bold">2</span>
              </div>
              <h3 className="text-lg font-semibold mb-2">Download App</h3>
              <p className="text-gray-600 text-sm">Access your account on mobile or web</p>
            </div>
            <div className="text-center">
              <div className="w-16 h-16 bg-[#1A2A4F] rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-white text-xl font-bold">3</span>
              </div>
              <h3 className="text-lg font-semibold mb-2">Start Transacting</h3>
              <p className="text-gray-600 text-sm">Save, borrow, and transfer across the network</p>
            </div>
          </div>
        </div>
      </div>

      {/* Testimonials Section */}
      <div className="py-16 bg-white">
        <div className="container mx-auto px-4">
          <h2 className="text-3xl md:text-4xl font-bold text-center text-gray-900 mb-12">
            Trusted by Members Across <span className="text-[#D4AF37]">Africa</span>
          </h2>
          <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
            <div className="bg-gray-50 rounded-xl p-6">
              <div className="flex items-center gap-1 mb-3">
                {[...Array(5)].map((_, i) => (
                  <span key={i} className="text-[#D4AF37]">★</span>
                ))}
              </div>
              <p className="text-gray-600 text-sm mb-4">
                &quot;SANGA™ has transformed how our SACCO operates. Cross-SACCO transfers are instant and fees are minimal.&quot;
              </p>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-[#1A2A4F] rounded-full flex items-center justify-center">
                  <span className="text-white text-xs font-bold">JM</span>
                </div>
                <div>
                  <p className="font-semibold text-gray-900 text-sm">John Mwangi</p>
                  <p className="text-xs text-gray-500">Member, Nairobi SACCO</p>
                </div>
              </div>
            </div>
            <div className="bg-gray-50 rounded-xl p-6">
              <div className="flex items-center gap-1 mb-3">
                {[...Array(5)].map((_, i) => (
                  <span key={i} className="text-[#D4AF37]">★</span>
                ))}
              </div>
              <p className="text-gray-600 text-sm mb-4">
                &quot;Finally, a platform that understands African SACCOs. The credit scoring feature is a game-changer.&quot;
              </p>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-[#1A2A4F] rounded-full flex items-center justify-center">
                  <span className="text-white text-xs font-bold">SO</span>
                </div>
                <div>
                  <p className="font-semibold text-gray-900 text-sm">Sarah Omondi</p>
                  <p className="text-xs text-gray-500">Treasurer, Kisumu SACCO</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* CTA Section */}
      <div className="py-16 bg-gradient-to-r from-[#1A2A4F] to-[#243B66] text-white">
        <div className="container mx-auto px-4 text-center">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            Ready to Join <span className="text-[#D4AF37]">SANGA™</span>?
          </h2>
          <p className="text-lg mb-8 opacity-90 max-w-2xl mx-auto">
            Connect your SACCO to Africa&apos;s fastest-growing financial network.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/login"
              className="bg-[#D4AF37] text-[#1A2A4F] px-8 py-3 rounded-lg font-semibold hover:bg-[#E6C248] transition-all inline-flex items-center justify-center gap-2"
            >
              Get Started <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/contact"
              className="border-2 border-white/30 text-white px-8 py-3 rounded-lg font-semibold hover:bg-white/10 transition-all inline-flex items-center justify-center"
            >
              Contact Sales
            </Link>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="bg-gray-900 text-white py-12">
        <div className="container mx-auto px-4">
          <div className="grid md:grid-cols-4 gap-8 mb-8">
            <div>
              <div className="flex items-center gap-2 mb-4">
                <div className="w-8 h-8 bg-[#D4AF37] rounded-lg flex items-center justify-center">
                  <span className="text-[#1A2A4F] text-sm font-bold">S</span>
                </div>
                <span className="text-lg font-bold">SANGA™</span>
              </div>
              <p className="text-gray-400 text-sm">
                Connecting Africa&apos;s Wealth™
              </p>
              <p className="text-gray-500 text-xs mt-2">
                © {new Date().getFullYear()} Sanga Financial Network Ltd
              </p>
            </div>
            <div>
              <h4 className="font-semibold mb-3">Product</h4>
              <ul className="space-y-2 text-sm text-gray-400">
                <li><a href="#features" className="hover:text-[#D4AF37]">Features</a></li>
                <li><a href="#" className="hover:text-[#D4AF37]">Pricing</a></li>
                <li><a href="#" className="hover:text-[#D4AF37]">Security</a></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold mb-3">Company</h4>
              <ul className="space-y-2 text-sm text-gray-400">
                <li><a href="#" className="hover:text-[#D4AF37]">About</a></li>
                <li><a href="#" className="hover:text-[#D4AF37]">Blog</a></li>
                <li><a href="/terms" className="hover:text-[#D4AF37]">Terms</a></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold mb-3">Support</h4>
              <ul className="space-y-2 text-sm text-gray-400">
                <li><a href="#" className="hover:text-[#D4AF37]">Help Center</a></li>
                <li><a href="#" className="hover:text-[#D4AF37]">Contact</a></li>
                <li><a href="#" className="hover:text-[#D4AF37]">Status</a></li>
              </ul>
            </div>
          </div>
          <div className="border-t border-gray-800 pt-8 text-center text-xs text-gray-500">
            <p>SANGA™ is a registered trademark of Sanga Financial Network Ltd.</p>
            <p className="mt-1">Connecting Africa&apos;s Wealth™</p>
          </div>
        </div>
      </footer>
    </div>
  )
}
