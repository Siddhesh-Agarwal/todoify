import { describe, it, expect } from 'vitest'
import { loginSchema, signupSchema } from './auth'

describe('loginSchema', () => {
  it('accepts a valid email + password', () => {
    expect(loginSchema.safeParse({ email: 'a@b.co', password: 'secret123' }).success).toBe(true)
  })
  it('rejects an invalid email', () => {
    expect(loginSchema.safeParse({ email: 'no', password: 'secret123' }).success).toBe(false)
  })
  it('rejects a short password', () => {
    expect(loginSchema.safeParse({ email: 'a@b.co', password: 'short' }).success).toBe(false)
  })
})

describe('signupSchema', () => {
  it('accepts matching valid name + email + password', () => {
    expect(
      signupSchema.safeParse({ name: 'Test User', email: 'a@b.co', password: 'secret123', confirm: 'secret123' }).success,
    ).toBe(true)
  })
  it('rejects an empty name', () => {
    expect(
      signupSchema.safeParse({ name: '', email: 'a@b.co', password: 'secret123', confirm: 'secret123' }).success,
    ).toBe(false)
  })
  it('rejects mismatched confirm', () => {
    expect(
      signupSchema.safeParse({ name: 'Test User', email: 'a@b.co', password: 'secret123', confirm: 'other' }).success,
    ).toBe(false)
  })
})
