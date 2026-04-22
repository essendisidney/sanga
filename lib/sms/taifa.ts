/**
 * Taifa Mobile SMS client — creda-style.
 *
 * Uses api.taifamobile.co.ke/sms/sendsms with a simple api-key header and
 * plain JSON body. No AES encryption and no cert bypass — that was the old
 * sms.taifamobile.co.ke/clientapi/ endpoint which serves an expired cert.
 */

export class TaifaMobile {
  private apiKey: string
  private senderName: string
  private endpoint: string

  constructor() {
    this.apiKey = (process.env.TAIFA_API_KEY ?? '').trim()
    this.senderName = (
      process.env.TAIFA_SENDER_ID ??
      process.env.TAIFA_SERVICE_NAME ??
      'SIDNET'
    ).trim()
    this.endpoint = 'https://api.taifamobile.co.ke/sms/sendsms'

    if (!this.apiKey) {
      throw new Error('TAIFA_API_KEY is not set')
    }
  }

  /**
   * Normalise any shape of KE mobile number to `+254...`.
   *  07XXXXXXXX   → +2547XXXXXXXX
   *  01XXXXXXXX   → +2541XXXXXXXX
   *  7XXXXXXXX    → +2547XXXXXXXX
   *  254XXXXXXXXX → +254XXXXXXXXX
   *  +254...      → unchanged
   */
  private formatPhoneNumber(phone: string): string {
    let mobile = phone.replace(/[\s\-()]/g, '')
    if (!mobile.startsWith('+')) {
      if (mobile.startsWith('07')) mobile = '254' + mobile.slice(1)
      if (mobile.startsWith('01')) mobile = '254' + mobile.slice(1)
      if (mobile.startsWith('7') && mobile.length === 9) {
        mobile = '254' + mobile
      }
      if (!mobile.startsWith('254')) mobile = '254' + mobile
      mobile = '+' + mobile
    }
    return mobile
  }

  async sendSMS(phone: string, message: string): Promise<void> {
    const mobile = this.formatPhoneNumber(phone)

    console.log('[Taifa] sending to:', mobile, 'sender:', this.senderName)

    const res = await fetch(this.endpoint, {
      method: 'POST',
      headers: {
        'api-key': this.apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        mobile,
        response_type: 'json',
        sender_name: this.senderName,
        service_id: 0,
        message,
      }),
    })

    const text = await res.text()
    console.log('[Taifa] response:', text)

    let row: { status_code?: string; status_desc?: string; mobile_number?: string }
    try {
      const parsed = JSON.parse(text) as unknown
      row = (Array.isArray(parsed) ? parsed[0] : parsed) as typeof row
    } catch {
      throw new Error('Bad response from Taifa')
    }

    if (row?.status_code === '1000') {
      console.log('[Taifa] delivered to:', row.mobile_number)
      return
    }

    throw new Error(`Taifa ${row?.status_code}: ${row?.status_desc}`)
  }

  async sendOTP(
    phone: string,
    otp: string,
    expiryMinutes: number = 5
  ): Promise<void> {
    const message = `Your Sanga verification code is: ${otp}. Valid for ${expiryMinutes} minutes. DO NOT share with anyone.`
    return this.sendSMS(phone, message)
  }
}

let taifaInstance: TaifaMobile | null = null

export function getTaifaMobile(): TaifaMobile {
  if (!taifaInstance) {
    taifaInstance = new TaifaMobile()
  }
  return taifaInstance
}
