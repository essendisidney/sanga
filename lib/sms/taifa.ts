/**
 * Taifa Mobile SMS client (API v2).
 *
 * POST api.taifamobile.co.ke/v2/sms/sendsms with an `h_api_key` header and a
 * plain JSON body. The old v1 /sms/sendsms endpoint and the
 * sms.taifamobile.co.ke/clientapi/ host are retired.
 */

export const TAIFA_SMS_URL = 'https://api.taifamobile.co.ke/v2/sms/sendsms'

/** Returns null when Taifa accepted the message, otherwise an error message. */
export function taifaRejection(text: string): string | null {
  let row: { status_code?: string | number; status_desc?: string } | undefined
  try {
    const parsed = JSON.parse(text) as unknown
    row = (Array.isArray(parsed) ? parsed[0] : parsed) as typeof row
  } catch {
    return `Bad response from Taifa: ${text.slice(0, 120)}`
  }
  const code = String(row?.status_code ?? '')
  if (code === '1000') return null
  return `Taifa ${code || '?'}: ${row?.status_desc ?? text.slice(0, 120)}`
}

function cleanEnv(value: string | undefined): string {
  return (value ?? '').trim().replace(/^["']|["']$/g, '').trim()
}

export class TaifaMobile {
  private apiKey: string
  private senderName: string
  private endpoint: string

  constructor() {
    this.apiKey = cleanEnv(process.env.TAIFA_API_KEY)
    this.senderName =
      cleanEnv(process.env.TAIFA_SENDER_ID) ||
      cleanEnv(process.env.TAIFA_SERVICE_NAME) ||
      'SIDNET'
    this.endpoint = TAIFA_SMS_URL

    if (!this.apiKey) {
      throw new Error('TAIFA_API_KEY is not set')
    }
  }

  /**
   * Normalise any shape of KE mobile number to `254...` (no plus).
   *  07XXXXXXXX   → 2547XXXXXXXX
   *  01XXXXXXXX   → 2541XXXXXXXX
   *  7XXXXXXXX    → 2547XXXXXXXX
   *  254XXXXXXXXX → unchanged
   *  +254...      → 254...
   */
  private formatPhoneNumber(phone: string): string {
    let mobile = phone.replace(/[\s\-()]/g, '').replace(/^\+/, '')
    if (mobile.startsWith('07')) mobile = '254' + mobile.slice(1)
    if (mobile.startsWith('01')) mobile = '254' + mobile.slice(1)
    if ((mobile.startsWith('7') || mobile.startsWith('1')) && mobile.length === 9) {
      mobile = '254' + mobile
    }
    if (!mobile.startsWith('254')) mobile = '254' + mobile
    return mobile
  }

  async sendSMS(phone: string, message: string): Promise<void> {
    const mobile = this.formatPhoneNumber(phone)

    console.log('[Taifa] sending to:', mobile, 'sender:', this.senderName)

    let text: string
    try {
      const res = await fetch(this.endpoint, {
        method: 'POST',
        headers: {
          h_api_key: this.apiKey,
          'Content-Type': 'application/json',
        },
        signal: AbortSignal.timeout(20_000),
        body: JSON.stringify({
          mobile,
          sender_name: this.senderName,
          message,
          response_type: 'json',
        }),
      })
      text = await res.text()
    } catch (err) {
      const why = err instanceof Error ? err.message : String(err)
      throw new Error(`Taifa unreachable: ${why}`)
    }

    console.log('[Taifa] response:', text)

    const rejection = taifaRejection(text)
    if (rejection) throw new Error(rejection)

    console.log('[Taifa] delivered to:', mobile)
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
