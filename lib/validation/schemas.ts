import { z } from 'zod'

// User registration schema
export const registerSchema = z.object({
  phone: z.string().regex(/^254[0-9]{9}$/, 'Invalid phone number'),
  full_name: z.string().min(3, 'Name too short').max(100, 'Name too long'),
  national_id: z.string().regex(/^[0-9]{8}$/, 'Invalid ID number'),
  email: z.string().email('Invalid email').optional(),
})

// Transaction schema
export const transactionSchema = z.object({
  amount: z.number().min(10, 'Minimum KES 10').max(500000, 'Maximum KES 500,000'),
  type: z.enum(['deposit', 'withdrawal', 'transfer']),
  recipient: z.string().optional(),
})

// Loan application schema
export const loanSchema = z.object({
  amount: z.number().min(1000, 'Minimum KES 1,000').max(1000000, 'Maximum KES 1,000,000'),
  purpose: z.string().min(3, 'Please specify purpose'),
  duration_days: z.number().min(30, 'Minimum 30 days').max(730, 'Maximum 2 years'),
  monthly_income: z.number().min(0).optional(),
})

// Validation middleware
export function validate<T extends z.ZodTypeAny>(schema: T) {
  return async (req: Request) => {
    const body = await req.json()
    const result = schema.safeParse(body)

    if (!result.success) {
      const issues = result.error.issues
      return {
        error: true as const,
        message: issues[0]?.message ?? 'Validation failed',
        details: issues,
      }
    }

    return { error: false as const, data: result.data as z.infer<T> }
  }
}
