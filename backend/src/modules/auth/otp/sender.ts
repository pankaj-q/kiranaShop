import { config } from '../../../config.js'
import { logger } from '../../../lib/logger.js'

export type OtpSender = {
  readonly name: string
  send(input: { phone: string; code: string }): Promise<{ providerMessageId?: string }>
}

/** Development sender: prints the code to the server log. */
export const consoleSender: OtpSender = {
  name: 'console',
  async send({ phone, code }) {
    logger.info({ phone: redactPhone(phone) }, `OTP code for ${redactPhone(phone)}: ${code}`)
    return {}
  },
}

/** Test-only sender: keeps the last code in memory so tests can read it. */
const memoryCodes = new Map<string, string>()

export const memorySender: OtpSender = {
  name: 'memory',
  async send({ phone, code }) {
    memoryCodes.set(phone, code)
    return { providerMessageId: `memory-${Date.now()}` }
  },
}

export function lastOtpCode(phone: string) {
  return memoryCodes.get(phone) ?? null
}

export function clearOtpCodes() {
  memoryCodes.clear()
}

export function redactPhone(phone: string) {
  if (phone.length <= 4) return '****'
  return `${phone.slice(0, 2)}******${phone.slice(-2)}`
}

/**
 * Pick the configured provider. SMS providers (msg91/fast2sms) are Phase 2 and
 * are treated as not configured until their senders are implemented.
 *
 * Production never allows console/memory senders, so the OTP endpoints return
 * `503 OTP_NOT_CONFIGURED` instead of silently printing codes to logs.
 */
export function resolveOtpSender(): OtpSender | null {
  const provider = config.otpProvider

  if (provider === 'memory') {
    return config.isProd ? null : memorySender
  }

  if (provider === 'console') {
    return config.isProd ? null : consoleSender
  }

  return null
}

export const otpSender = resolveOtpSender()

if (!otpSender) {
  logger.warn(
    { provider: config.otpProvider },
    'OTP delivery is not configured; OTP endpoints will return OTP_NOT_CONFIGURED',
  )
}
