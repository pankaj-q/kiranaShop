import { createHmac, randomInt, randomUUID, timingSafeEqual } from 'node:crypto'
import { config } from '../../../config.js'
import { prisma } from '../../../db.js'
import { logger } from '../../../lib/logger.js'
import { AppError } from '../../../middleware/error.js'
import {
  createSession,
  normalizePhone,
  toPublicUser,
  upsertCustomer,
} from '../service.js'
import { otpSender, redactPhone } from './sender.js'

const HOUR_MS = 60 * 60 * 1000
const DAY_MS = 24 * HOUR_MS

function assertOtpConfigured() {
  if (!otpSender) {
    throw new AppError(
      503,
      'OTP_NOT_CONFIGURED',
      'OTP abhi available nahi hai. Dukaan par call karein.',
    )
  }
  return otpSender
}

function normalizeAndValidatePhone(rawPhone: string) {
  const phone = normalizePhone(rawPhone)

  if (!/^\d{10,15}$/.test(phone)) {
    throw new AppError(400, 'INVALID_PHONE', 'Sahi mobile number daalein')
  }

  return phone
}

function generateCode() {
  return String(randomInt(0, 1_000_000)).padStart(6, '0')
}

function hashCode(challengeId: string, code: string) {
  return createHmac('sha256', config.otpHashSecret).update(`${challengeId}:${code}`).digest('hex')
}

function hashMatches(expectedHash: string, actualHash: string) {
  const expected = Buffer.from(expectedHash, 'hex')
  const actual = Buffer.from(actualHash, 'hex')
  return expected.length === actual.length && timingSafeEqual(expected, actual)
}

const invalidCodeMessage = 'Code galat ya expire ho gaya. Naya code bhejein.'
const attemptsMessage = 'Bahut attempts ho gaye. Naya code bhejein.'

/**
 * Create a short-lived login challenge and send the code.
 * The response is deliberately identical for new and existing customers so the
 * endpoint cannot be used to check which phone numbers have accounts.
 */
export async function requestLoginOtp(rawPhone: string, requestIp?: string) {
  const sender = assertOtpConfigured()
  const phone = normalizeAndValidatePhone(rawPhone)
  const now = new Date()

  const existing = await prisma.user.findUnique({
    where: { phone },
    select: { role: true },
  })

  if (existing?.role === 'OWNER') {
    throw new AppError(403, 'PHONE_NOT_ALLOWED', 'Yeh number use nahi ho sakta')
  }

  const latest = await prisma.otpChallenge.findFirst({
    where: { phone, purpose: 'CUSTOMER_LOGIN' },
    orderBy: { createdAt: 'desc' },
    select: { createdAt: true },
  })

  if (latest && now.getTime() - latest.createdAt.getTime() < config.otpResendCooldownSeconds * 1000) {
    throw new AppError(429, 'RATE_LIMITED', 'Code abhi bheja gaya hai. Thodi der baad try karein.')
  }

  const [hourly, daily, global] = await Promise.all([
    prisma.otpChallenge.count({
      where: { phone, createdAt: { gte: new Date(now.getTime() - HOUR_MS) } },
    }),
    prisma.otpChallenge.count({
      where: { phone, createdAt: { gte: new Date(now.getTime() - DAY_MS) } },
    }),
    prisma.otpChallenge.count({
      where: { createdAt: { gte: new Date(now.getTime() - DAY_MS) } },
    }),
  ])

  if (hourly >= config.otpMaxPerPhoneHour || daily >= config.otpMaxPerPhoneDay) {
    throw new AppError(429, 'RATE_LIMITED', 'Bahut zyada codes maange gaye. Thodi der baad try karein.')
  }

  if (global >= config.otpGlobalDailyCap) {
    logger.warn({ global, cap: config.otpGlobalDailyCap }, 'global OTP daily cap reached')
    throw new AppError(503, 'OTP_SEND_FAILED', 'OTP service abhi busy hai. Dukaan par call karein.')
  }

  // A new code replaces any older unused challenge for this phone.
  await prisma.otpChallenge.updateMany({
    where: { phone, purpose: 'CUSTOMER_LOGIN', consumedAt: null },
    data: { consumedAt: now },
  })

  const id = randomUUID()
  const code = generateCode()

  await prisma.otpChallenge.create({
    data: {
      id,
      phone,
      codeHash: hashCode(id, code),
      purpose: 'CUSTOMER_LOGIN',
      maxAttempts: config.otpMaxAttempts,
      expiresAt: new Date(now.getTime() + config.otpTtlSeconds * 1000),
      requestIp: requestIp?.slice(0, 64),
      provider: sender.name,
    },
  })

  try {
    const result = await sender.send({ phone, code })

    if (result.providerMessageId) {
      await prisma.otpChallenge
        .update({ where: { id }, data: { providerMessageId: result.providerMessageId } })
        .catch(() => undefined)
    }
  } catch (error) {
    logger.error({ err: error, phone: redactPhone(phone) }, 'OTP send failed')
    await prisma.otpChallenge.delete({ where: { id } }).catch(() => undefined)
    throw new AppError(503, 'OTP_SEND_FAILED', 'Code nahi bhej paye. Thodi der baad try karein.')
  }

  return {
    sent: true,
    expiresInSeconds: config.otpTtlSeconds,
    retryAfterSeconds: config.otpResendCooldownSeconds,
  }
}

/** Verify the latest challenge, create/restore the customer and start a session. */
export async function verifyLoginOtp(rawPhone: string, code: string, name?: string) {
  assertOtpConfigured()
  const phone = normalizeAndValidatePhone(rawPhone)
  const now = new Date()

  const challenge = await prisma.otpChallenge.findFirst({
    where: {
      phone,
      purpose: 'CUSTOMER_LOGIN',
      consumedAt: null,
      expiresAt: { gt: now },
    },
    orderBy: { createdAt: 'desc' },
  })

  if (!challenge) {
    throw new AppError(400, 'OTP_INVALID', invalidCodeMessage)
  }

  if (challenge.attempts >= challenge.maxAttempts) {
    throw new AppError(429, 'OTP_ATTEMPTS_EXCEEDED', attemptsMessage)
  }

  if (!hashMatches(hashCode(challenge.id, code), challenge.codeHash)) {
    // Increment first so parallel guesses cannot exceed the attempt limit.
    const claimed = await prisma.otpChallenge.updateMany({
      where: {
        id: challenge.id,
        consumedAt: null,
        expiresAt: { gt: now },
        attempts: { lt: challenge.maxAttempts },
      },
      data: { attempts: { increment: 1 } },
    })

    if (claimed.count === 0) {
      throw new AppError(429, 'OTP_ATTEMPTS_EXCEEDED', attemptsMessage)
    }

    const current = await prisma.otpChallenge.findUnique({
      where: { id: challenge.id },
      select: { attempts: true },
    })

    if ((current?.attempts ?? challenge.maxAttempts) >= challenge.maxAttempts) {
      throw new AppError(429, 'OTP_ATTEMPTS_EXCEEDED', attemptsMessage)
    }

    throw new AppError(400, 'OTP_INVALID', 'Code galat hai')
  }

  const existing = await prisma.user.findUnique({
    where: { phone },
    select: { role: true },
  })

  if (existing?.role === 'OWNER') {
    throw new AppError(403, 'PHONE_NOT_ALLOWED', 'Yeh number use nahi ho sakta')
  }

  const trimmedName = name?.trim()

  if (!existing && !trimmedName) {
    throw new AppError(400, 'NAME_REQUIRED', 'Apna naam likhein')
  }

  // Single use: only the first verify of a correct code may consume it.
  const consumed = await prisma.otpChallenge.updateMany({
    where: { id: challenge.id, consumedAt: null, expiresAt: { gt: now } },
    data: { consumedAt: new Date() },
  })

  if (consumed.count === 0) {
    throw new AppError(400, 'OTP_INVALID', invalidCodeMessage)
  }

  const user = await upsertCustomer(phone, trimmedName)
  const session = await createSession(user.id)

  return { ...session, user: toPublicUser(user) }
}
