import { NextResponse } from 'next/server'

export class AppError extends Error {
  statusCode: number
  code: string
  
  constructor(message: string, statusCode: number = 500, code: string = 'INTERNAL_ERROR') {
    super(message)
    this.statusCode = statusCode
    this.code = code
  }
}

export class ValidationError extends AppError {
  constructor(message: string) {
    super(message, 400, 'VALIDATION_ERROR')
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string) {
    super(`${resource} not found`, 404, 'NOT_FOUND')
  }
}

export class UnauthorizedError extends AppError {
  constructor(message: string = 'Unauthorized') {
    super(message, 401, 'UNAUTHORIZED')
  }
}

export class InsufficientFundsError extends AppError {
  constructor() {
    super('Insufficient funds', 402, 'INSUFFICIENT_FUNDS')
  }
}

export function handleError(error: unknown) {
  console.error('Error:', error)
  
  if (error instanceof AppError) {
    return NextResponse.json(
      { error: error.message, code: error.code },
      { status: error.statusCode }
    )
  }
  
  // Log unexpected errors
  console.error('Unhandled error:', error)
  
  return NextResponse.json(
    { error: 'An unexpected error occurred', code: 'INTERNAL_ERROR' },
    { status: 500 }
  )
}
