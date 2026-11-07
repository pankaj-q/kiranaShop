import { createHash, randomBytes } from 'node:crypto'
import type { Response } from 'express'
import { config } from '../../config.js'
import { prisma } from '../../db.js'
import { verifyPassword } from '../../lib/password.js'
import { AppError } from '../../middleware/error.js'

export const SESSION_COOKIE = 'mk_session'
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000

export type PublicUser = {
  id: string
  name: string
  phone: string
  role: 'CUSTOMER' | 'OWNER'
}

function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex')
}

function toPublicUser(user: PublicUser): PublicUser {
  return { id: user.id, name: user.name, phone: user.phone, role: user.role }
}

export { toPublicUser }

export function normalizePhone(input: string) {
  const digits = input.replace(/\D/g, '')
  return digits.length === 12 && digits.startsWith('91') ? digits.slice(2) : digits
}

export function setSessionCookie(res: Response, token: string, expiresAt: Date) {
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    // The frontend may live on a different site (Cloudflare Pages + Render API).
    sameSite: config.isProd ? 'none' : 'lax',
    secure: config.isProd,
    expires: expiresAt,
    path: '/',
  })
}

export function clearSessionCookie(res: Response) {
  res.clearCookie(SESSION_COOKIE, {
    httpOnly: true,
    sameSite: config.isProd ? 'none' : 'lax',
    secure: config.isProd,
    path: '/',
  })
}

async function createSession(userId: string) {
  const token = randomBytes(32).toString('base64url')
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS)

  await prisma.session.create({
    data: { userId, tokenHash: hashToken(token), expiresAt },
  })

  return { token, expiresAt }
}

export { createSession }

export async function getSession(token: string) {
  const session = await prisma.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: true },
  })

  if (!session) return null

  if (session.expiresAt.getTime() <= Date.now()) {
    await prisma.session.delete({ where: { id: session.id } }).catch(() => {})
    return null
  }

  return { sessionId: session.id, user: toPublicUser(session.user) }
}

export async function logoutSession(sessionId: string) {
  await prisma.session.delete({ where: { id: sessionId } }).catch(() => {})
}

export async function loginOwner(login: string, password: string) {
  const user = await prisma.user.findUnique({ where: { phone: login } })

  if (!user || user.role !== 'OWNER' || !user.passwordHash || !verifyPassword(password, user.passwordHash)) {
    throw new AppError(401, 'INVALID_CREDENTIALS', 'Login ya password galat hai')
  }

  const session = await createSession(user.id)
  return { ...session, user: toPublicUser(user) }
}

export async function loginCustomer(name: string, rawPhone: string) {
  const phone = normalizePhone(rawPhone)

  if (!/^\d{10,15}$/.test(phone)) {
    throw new AppError(400, 'INVALID_PHONE', 'Sahi mobile number daalein')
  }

  const user = await upsertCustomer(phone, name)
  const session = await createSession(user.id)
  return { ...session, user: toPublicUser(user) }
}

/** Create or update a customer. New customers must supply a name. */
export async function upsertCustomer(phone: string, name?: string) {
  const existing = await prisma.user.findUnique({ where: { phone } })

  if (existing?.role === 'OWNER') {
    throw new AppError(403, 'PHONE_NOT_ALLOWED', 'Yeh number use nahi ho sakta')
  }

  if (existing) {
    if (name && name !== existing.name) {
      return prisma.user.update({ where: { id: existing.id }, data: { name } })
    }
    return existing
  }

  if (!name) {
    throw new AppError(400, 'NAME_REQUIRED', 'Apna naam likhein')
  }

  return prisma.user.create({ data: { name, phone, role: 'CUSTOMER' } })
}
