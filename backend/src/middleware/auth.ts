import type { RequestHandler, Response } from 'express'
import { SESSION_COOKIE, getSession, type PublicUser } from '../modules/auth/service.js'
import { AppError } from './error.js'

export type AuthContext = {
  sessionId: string
  user: PublicUser
}

export const attachUser: RequestHandler = async (req, res, next) => {
  const token = req.cookies?.[SESSION_COOKIE]

  if (typeof token !== 'string' || !token) return next()

  const auth = await getSession(token)
  if (auth) res.locals.auth = auth
  next()
}

export function getAuth(res: Response): AuthContext {
  const auth = res.locals.auth as AuthContext | undefined
  if (!auth) throw new AppError(401, 'UNAUTHORIZED', 'Login karna zaroori hai')
  return auth
}

export const requireOwner: RequestHandler = (_req, res, next) => {
  const auth = res.locals.auth as AuthContext | undefined

  if (!auth) return next(new AppError(401, 'UNAUTHORIZED', 'Login karna zaroori hai'))
  if (auth.user.role !== 'OWNER') return next(new AppError(403, 'FORBIDDEN', 'Sirf owner access kar sakta hai'))

  next()
}

export const requireCustomer: RequestHandler = (_req, res, next) => {
  const auth = res.locals.auth as AuthContext | undefined

  if (!auth) return next(new AppError(401, 'UNAUTHORIZED', 'Login karna zaroori hai'))
  if (auth.user.role !== 'CUSTOMER') return next(new AppError(403, 'FORBIDDEN', 'Customer access only'))

  next()
}
