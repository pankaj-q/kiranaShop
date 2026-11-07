import { z } from 'zod'

export const ownerLoginSchema = z.object({
  login: z.string().trim().min(3).max(64),
  password: z.string().min(1).max(200),
})

export const customerSessionSchema = z.object({
  name: z.string().trim().min(2, 'Naam likhein').max(60),
  phone: z.string().trim().min(10).max(20),
})

export const otpRequestSchema = z.object({
  phone: z.string().trim().min(10).max(20),
})

export const otpVerifySchema = z.object({
  phone: z.string().trim().min(10).max(20),
  code: z.string().trim().regex(/^\d{6}$/, '6 digit ka code daalein'),
  name: z.string().trim().min(2, 'Naam likhein').max(60).optional(),
})
