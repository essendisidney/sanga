import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { logAudit, AuditAction } from '@/lib/audit'
import { handleError, UnauthorizedError, NotFoundError, ValidationError } from '@/lib/errors/handlers'

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      userId?: string
      productId?: string
      amount?: number
      durationDays?: number
      purpose?: string
      monthlyIncome?: number
      monthlyExpenses?: number
    }

    const {
      userId,
      productId,
      amount = 0,
      durationDays = 0,
      purpose = '',
      monthlyIncome = 0,
      monthlyExpenses = 0,
    } = body

    if (!productId || amount <= 0 || durationDays <= 0) {
      throw new ValidationError('productId, amount (>0), durationDays (>0) required')
    }

    const supabase = await createClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) throw new UnauthorizedError()

    if (userId && userId !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Get product details
    const productRes = await supabase
      .from('loan_products')
      .select('*')
      .eq('id', productId)
      .single()

    if (productRes.error || !productRes.data) {
      throw new NotFoundError('Loan product')
    }

    const product = productRes.data as any

    // Calculate interest
    const interestRate = Number(product.interest_rate ?? 0) / 100
    const monthlyRate = interestRate / 12
    const monthsRaw = durationDays / 30
    const months = Math.max(1, Math.round(monthsRaw))

    let totalInterest = 0
    let totalRepayable = 0

    if (product.interest_method === 'flat_rate') {
      totalInterest = amount * interestRate * months
      totalRepayable = amount + totalInterest
    } else {
      const pow = Math.pow(1 + monthlyRate, months)
      const monthlyPayment =
        monthlyRate === 0 ? amount / months : (amount * monthlyRate * pow) / (pow - 1)
      totalRepayable = monthlyPayment * months
      totalInterest = totalRepayable - amount
    }

    const processingFee = amount * (Number(product.processing_fee ?? 0) / 100)
    const insuranceFee = amount * (Number(product.insurance_fee ?? 0) / 100)
    const totalFees = processingFee + insuranceFee

    const monthlyIncomeSafe = monthlyIncome > 0 ? monthlyIncome : 1
    const debtToIncomeRatio = ((totalRepayable / months) / monthlyIncomeSafe) * 100

    const membership = await supabase
      .from('sacco_memberships')
      .select('sacco_id')
      .eq('user_id', user.id)
      .single()

    const application = await supabase
      .from('loan_applications')
      .insert({
        user_id: user.id,
        sacco_id: membership.data?.sacco_id,
        product_id: productId,
        amount,
        interest_rate_applied: product.interest_rate,
        processing_fee: processingFee,
        insurance_fee: insuranceFee,
        total_fees: totalFees,
        total_interest: totalInterest,
        total_repayable: totalRepayable,
        duration_days: durationDays,
        purpose,
        monthly_income: monthlyIncome,
        monthly_expenses: monthlyExpenses,
        debt_to_income_ratio: debtToIncomeRatio,
        status: 'pending',
      })
      .select()
      .single()

    if (application.error) {
      return NextResponse.json(
        { error: application.error.message },
        { status: 500 }
      )
    }

    // Fire-and-log (don't block user on audit failures)
    logAudit(
      user.id,
      AuditAction.LOAN_APPLY,
      {
        application_id: application.data?.id,
        product_id: productId,
        amount,
        duration_days: durationDays,
      },
      request.headers.get('x-forwarded-for') || undefined,
      request.headers.get('user-agent') || undefined,
    ).catch((e) => console.error('audit log failed:', e))

    return NextResponse.json({
      success: true,
      application: application.data,
      totalRepayable,
      totalInterest,
    })
  } catch (error) {
    return handleError(error)
  }
}
