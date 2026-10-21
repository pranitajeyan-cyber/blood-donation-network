/* eslint-disable no-control-regex */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const PHONE_RE = /^[0-9]{10}$/
const PASSWORD_MIN = 8

export function validateEmail(v: string) {
  if (!v.trim()) return 'Enter your email'
  if (!EMAIL_RE.test(v.trim())) return 'Enter a valid email'
  return null
}

export function validatePhone(v: string) {
  if (!v.trim()) return 'Enter a phone number'
  if (!PHONE_RE.test(v.trim())) return 'Use 10 digits, no spaces or +'
  return null
}

export function validatePassword(v: string) {
  if (!v) return 'Enter a password'
  if (v.length < PASSWORD_MIN) return `At least ${PASSWORD_MIN} characters`
  return null
}

export function validateName(v: string) {
  if (!v.trim()) return 'Enter your name'
  if (v.trim().length < 2) return 'At least 2 characters'
  return null
}

export function validateRequired(v: string, label = 'This field') {
  if (!v.trim()) return `${label} is required`
  return null
}
