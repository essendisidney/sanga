'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export async function login(phone: string, otp: string) {
  const supabase = await createClient()
  
  // Verify OTP (you'll implement this)
  const { data, error } = await supabase.auth.verifyOtp({
    phone: `+${phone}`,
    token: otp,
    type: 'sms'
  })
  
  if (error) {
    return { error: error.message }
  }
  
  return { success: true }
}

export async function logout() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect('/login')
}

export async function getUser() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user
}
