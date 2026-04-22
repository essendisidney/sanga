'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Phone, Mail, MessageCircle, Headphones, HelpCircle, ChevronRight } from 'lucide-react'
import { toast } from 'sonner'
import BottomNav from '@/components/BottomNav'

export default function SupportPage() {
  const router = useRouter()
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)

  const faqs = [{ q: 'How do I deposit money?', a: 'Go to Services → Deposit → Enter amount → Follow M-Pesa instructions' },
    { q: 'How long does loan approval take?', a: 'Loan applications are reviewed within 24-48 hours' },
    { q: 'What is my credit score based on?', a: 'Based on your repayment history and savings behavior' }]

  const handleSend = async () => { if (!message) return toast.error('Enter message'); setSending(true); await new Promise(r => setTimeout(r, 1000)); toast.success('Message sent!'); setMessage(''); setSending(false) }

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      <div className="bg-white border-b px-4 py-4 flex items-center gap-4 sticky top-0"><button onClick={() => router.back()}><ArrowLeft className="h-5 w-5" /></button><h1 className="text-xl font-bold">Support</h1></div>
      <div className="max-w-md mx-auto p-4">
        <div className="grid grid-cols-2 gap-4 mb-8">
          <div className="bg-white rounded-xl p-4 text-center shadow-sm"><Phone className="h-8 w-8 text-blue-600 mx-auto mb-2" /><p className="font-medium">Call Us</p><p className="text-xs text-gray-500">0700 123 456</p></div>
          <div className="bg-white rounded-xl p-4 text-center shadow-sm"><Mail className="h-8 w-8 text-blue-600 mx-auto mb-2" /><p className="font-medium">Email</p><p className="text-xs text-gray-500">support@sanga.africa</p></div>
          <div className="bg-white rounded-xl p-4 text-center shadow-sm"><MessageCircle className="h-8 w-8 text-green-600 mx-auto mb-2" /><p className="font-medium">WhatsApp</p><p className="text-xs text-gray-500">+254 700 123 456</p></div>
          <div className="bg-white rounded-xl p-4 text-center shadow-sm"><Headphones className="h-8 w-8 text-purple-600 mx-auto mb-2" /><p className="font-medium">Live Chat</p><p className="text-xs text-gray-500">Mon-Fri 8am-5pm</p></div>
        </div>
        <div className="mb-8"><h2 className="font-semibold mb-4 flex items-center gap-2"><HelpCircle className="h-5 w-5" />FAQs</h2>
          {faqs.map((f, i) => (<details key={i} className="bg-white rounded-xl shadow-sm mb-2"><summary className="p-4 cursor-pointer list-none flex justify-between"><span>{f.q}</span><ChevronRight className="h-4 w-4" /></summary><div className="px-4 pb-4 text-sm text-gray-600 border-t pt-3">{f.a}</div></details>))}</div>
        <div className="bg-white rounded-xl p-6"><h2 className="font-semibold mb-4">Send us a message</h2><textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={4} className="w-full p-3 border rounded-lg resize-none" placeholder="Describe your issue..." />
          <button onClick={handleSend} disabled={sending} className="w-full mt-4 bg-[#1A2A4F] text-white py-3 rounded-lg">{sending ? 'Sending...' : 'Send Message'}</button></div>
      </div>
      <BottomNav />
    </div>
  )
}
