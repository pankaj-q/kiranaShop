import { Router } from 'express'
import { rateLimit } from 'express-rate-limit'
import { config } from '../../config.js'
import { AppError } from '../../middleware/error.js'
import { getAuth, requireCustomer, requireOwner } from '../../middleware/auth.js'
import { otpRequestLimiter, otpVerifyLimiter } from '../../middleware/rateLimit.js'
import { customerSessionSchema, otpRequestSchema, otpVerifySchema, ownerLoginSchema } from './schemas.js'
import {
  clearSessionCookie,
  loginCustomer,
  loginOwner,
  logoutSession,
  setSessionCookie,
} from './service.js'
import { requestLoginOtp, verifyLoginOtp } from './otp/service.js'

const authLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  handler: (_req, res) => {
    res.status(429).json({
      error: { code: 'RATE_LIMITED', message: 'Bahut zyada attempts. Thodi der baad try karein.' },
    })
  },
})

export const authRoutes = Router()

authRoutes.post('/admin/login', authLimiter, async (req, res) => {
  const body = ownerLoginSchema.parse(req.body)
  const { token, expiresAt, user } = await loginOwner(body.login, body.password)

  setSessionCookie(res, token, expiresAt)
  res.json({ data: { user } })
})

authRoutes.post('/admin/logout', requireOwner, async (_req, res) => {
  await logoutSession(getAuth(res).sessionId)
  clearSessionCookie(res)
  res.json({ data: { ok: true } })
})

authRoutes.get('/admin/me', requireOwner, (_req, res) => {
  res.json({ data: { user: getAuth(res).user } })
})

authRoutes.post('/customer/session', authLimiter, async (req, res) => {
  if (config.isProd) {
    throw new AppError(403, 'OTP_REQUIRED', 'OTP se login karna zaroori hai')
  }

  const body = customerSessionSchema.parse(req.body)
  const { token, expiresAt, user } = await loginCustomer(body.name, body.phone)

  setSessionCookie(res, token, expiresAt)
  res.json({ data: { user } })
})

authRoutes.post('/customer/otp/request', otpRequestLimiter, async (req, res) => {
  const body = otpRequestSchema.parse(req.body)
  res.json({ data: await requestLoginOtp(body.phone, req.ip) })
})

authRoutes.post('/customer/otp/verify', otpVerifyLimiter, async (req, res) => {
  const body = otpVerifySchema.parse(req.body)
  const { token, expiresAt, user } = await verifyLoginOtp(body.phone, body.code, body.name)

  setSessionCookie(res, token, expiresAt)
  res.json({ data: { user } })
})

authRoutes.post('/customer/logout', requireCustomer, async (_req, res) => {
  await logoutSession(getAuth(res).sessionId)
  clearSessionCookie(res)
  res.json({ data: { ok: true } })
})

authRoutes.get('/customer/me', requireCustomer, (_req, res) => {
  res.json({ data: { user: getAuth(res).user } })
})
