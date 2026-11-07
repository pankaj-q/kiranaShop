import type { Request, Response } from 'express'
import { ipKeyGenerator, rateLimit } from 'express-rate-limit'
import type { AuthContext } from './auth.js'

/** Prefer the signed-in customer so one noisy IP cannot affect other users. */
function customerKey(req: Request, res: Response) {
  const auth = res.locals.auth as AuthContext | undefined
  return auth ? `user:${auth.user.id}` : ipKeyGenerator(req.ip ?? 'unknown')
}

const orderMessage = 'Bahut zyada orders bheje gaye. Thodi der baad try karein.'

/** Shared by structured and text-list order creation: 10 new orders per 10 minutes. */
export const orderCreateLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  keyGenerator: customerKey,
  handler: (_req, res) => {
    res.status(429).json({
      error: {
        code: 'RATE_LIMITED',
        message: orderMessage,
        requestId: res.locals.requestId as string | undefined,
      },
    })
  },
})
