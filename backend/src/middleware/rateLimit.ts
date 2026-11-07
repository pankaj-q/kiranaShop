import type { Request, Response } from 'express'
import { ipKeyGenerator, rateLimit } from 'express-rate-limit'
import type { AuthContext } from './auth.js'

/** Prefer the signed-in customer so one noisy IP cannot affect other users. */
function customerKey(req: Request, res: Response) {
  const auth = res.locals.auth as AuthContext | undefined
  return auth ? `user:${auth.user.id}` : ipKeyGenerator(req.ip ?? 'unknown')
}

const orderMessage = 'Bahut zyada orders bheje gaye. Thodi der baad try karein.'

function rateLimitHandler(message: string) {
  return (_req: Request, res: Response) => {
    res.status(429).json({
      error: {
        code: 'RATE_LIMITED',
        message,
        requestId: res.locals.requestId as string | undefined,
      },
    })
  }
}

/** Shared by structured and text-list order creation: 10 new orders per 10 minutes. */
export const orderCreateLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  keyGenerator: customerKey,
  handler: rateLimitHandler(orderMessage),
})

const otpMessage = 'Bahut zyada OTP requests. Thodi der baad try karein.'

function ipKey(req: Request) {
  return ipKeyGenerator(req.ip ?? 'unknown')
}

/** Per-IP guard for requesting codes: 30 per hour. */
export const otpRequestLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  keyGenerator: ipKey,
  handler: rateLimitHandler(otpMessage),
})

/** Per-IP guard for verification guesses: 30 per 15 minutes. */
export const otpVerifyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  keyGenerator: ipKey,
  handler: rateLimitHandler(otpMessage),
})
