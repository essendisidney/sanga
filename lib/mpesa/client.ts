import 'server-only'

// Daraja STK Push client. Server-only — never import from a client component
// or anything that could be bundled for the browser; consumer key/secret and
// the passkey would leak.
//
// We avoid axios on purpose: this module makes two HTTP calls and Node 18+
// has fetch built-in. Adding axios just for this is dead weight.

interface MpesaConfig {
  consumerKey: string
  consumerSecret: string
  passkey: string
  shortcode: string
  environment: 'sandbox' | 'production'
  callbackUrl: string
}

interface StkPushRequest {
  phone: string
  amount: number
  accountRef: string
  transactionDesc: string
}

interface StkPushResponse {
  MerchantRequestID: string
  CheckoutRequestID: string
  ResponseCode: string
  ResponseDescription: string
  CustomerMessage: string
}

export class MpesaConfigError extends Error {
  constructor(missing: string[]) {
    super(`M-Pesa not configured: missing ${missing.join(', ')}`)
    this.name = 'MpesaConfigError'
  }
}

export class MpesaClient {
  private config: MpesaConfig
  private accessToken: string | null = null
  // Daraja access tokens live ~3600s. Refresh at 55min to be safe.
  private tokenExpiresAt: number = 0

  constructor() {
    const missing: string[] = []
    if (!process.env.MPESA_CONSUMER_KEY) missing.push('MPESA_CONSUMER_KEY')
    if (!process.env.MPESA_CONSUMER_SECRET) missing.push('MPESA_CONSUMER_SECRET')
    if (!process.env.MPESA_PASSKEY) missing.push('MPESA_PASSKEY')
    if (!process.env.MPESA_SHORTCODE) missing.push('MPESA_SHORTCODE')
    if (!process.env.MPESA_STK_CALLBACK_URL) missing.push('MPESA_STK_CALLBACK_URL')
    if (missing.length) throw new MpesaConfigError(missing)

    this.config = {
      consumerKey: process.env.MPESA_CONSUMER_KEY!,
      consumerSecret: process.env.MPESA_CONSUMER_SECRET!,
      passkey: process.env.MPESA_PASSKEY!,
      shortcode: process.env.MPESA_SHORTCODE!,
      environment:
        (process.env.MPESA_ENVIRONMENT as 'sandbox' | 'production') ||
        'sandbox',
      callbackUrl: process.env.MPESA_STK_CALLBACK_URL!,
    }
  }

  private get baseUrl(): string {
    return this.config.environment === 'production'
      ? 'https://api.safaricom.co.ke'
      : 'https://sandbox.safaricom.co.ke'
  }

  private async getAccessToken(): Promise<string> {
    if (this.accessToken && Date.now() < this.tokenExpiresAt) {
      return this.accessToken
    }

    const auth = Buffer.from(
      `${this.config.consumerKey}:${this.config.consumerSecret}`
    ).toString('base64')

    const res = await fetch(
      `${this.baseUrl}/oauth/v1/generate?grant_type=client_credentials`,
      { headers: { Authorization: `Basic ${auth}` }, cache: 'no-store' }
    )

    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(`M-Pesa auth failed (${res.status}): ${text || res.statusText}`)
    }

    const data = (await res.json()) as { access_token?: string }
    if (!data.access_token) {
      throw new Error('M-Pesa auth response missing access_token')
    }

    this.accessToken = data.access_token
    this.tokenExpiresAt = Date.now() + 55 * 60 * 1000
    return this.accessToken
  }

  // 254XXXXXXXXX — strips +, leading 0, leading 254, then re-adds 254.
  // Throws if the resulting subscriber number isn't 9 digits (Safaricom
  // rejects malformed numbers with vague errors, so we fail loudly here).
  static formatPhone(phone: string): string {
    let cleaned = phone.replace(/\D/g, '')
    if (cleaned.startsWith('254')) cleaned = cleaned.substring(3)
    else if (cleaned.startsWith('0')) cleaned = cleaned.substring(1)
    if (cleaned.length !== 9) {
      throw new Error(
        `Invalid phone number: expected 9 subscriber digits, got ${cleaned.length}`
      )
    }
    return `254${cleaned}`
  }

  private timestamp(): string {
    const d = new Date()
    const pad = (n: number) => String(n).padStart(2, '0')
    return (
      `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}` +
      `${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
    )
  }

  private password(timestamp: string): string {
    return Buffer.from(
      `${this.config.shortcode}${this.config.passkey}${timestamp}`
    ).toString('base64')
  }

  async stkPush(request: StkPushRequest): Promise<StkPushResponse> {
    const token = await this.getAccessToken()
    const ts = this.timestamp()
    const formattedPhone = MpesaClient.formatPhone(request.phone)

    // Daraja caps AccountReference at 12 chars and TransactionDesc at 13.
    const payload = {
      BusinessShortCode: this.config.shortcode,
      Password: this.password(ts),
      Timestamp: ts,
      TransactionType: 'CustomerPayBillOnline',
      Amount: Math.round(request.amount),
      PartyA: formattedPhone,
      PartyB: this.config.shortcode,
      PhoneNumber: formattedPhone,
      CallBackURL: this.config.callbackUrl,
      AccountReference: request.accountRef.slice(0, 12),
      TransactionDesc: request.transactionDesc.slice(0, 13),
    }

    const res = await fetch(
      `${this.baseUrl}/mpesa/stkpush/v1/processrequest`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
        cache: 'no-store',
      }
    )

    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>
    if (!res.ok || data.ResponseCode !== '0') {
      const errMsg =
        (data.errorMessage as string) ||
        (data.ResponseDescription as string) ||
        `STK Push failed (${res.status})`
      throw new Error(errMsg)
    }

    return data as unknown as StkPushResponse
  }

  async queryStatus(checkoutRequestId: string): Promise<{
    ResultCode: string
    ResultDesc: string
    [key: string]: unknown
  }> {
    const token = await this.getAccessToken()
    const ts = this.timestamp()

    const payload = {
      BusinessShortCode: this.config.shortcode,
      Password: this.password(ts),
      Timestamp: ts,
      CheckoutRequestID: checkoutRequestId,
    }

    const res = await fetch(
      `${this.baseUrl}/mpesa/stkpushquery/v1/query`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
        cache: 'no-store',
      }
    )

    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>
    if (!res.ok) {
      throw new Error((data.errorMessage as string) || 'Failed to query status')
    }
    return data as { ResultCode: string; ResultDesc: string }
  }
}

let mpesaInstance: MpesaClient | null = null

export function getMpesaClient(): MpesaClient {
  if (!mpesaInstance) mpesaInstance = new MpesaClient()
  return mpesaInstance
}

// Returns null instead of throwing when env is unset — useful for routes
// that want to degrade gracefully when M-Pesa isn't configured (e.g. in
// preview deploys without Daraja credentials).
export function tryGetMpesaClient(): MpesaClient | null {
  try {
    return getMpesaClient()
  } catch (e) {
    if (e instanceof MpesaConfigError) return null
    throw e
  }
}
