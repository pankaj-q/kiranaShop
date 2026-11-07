import { z } from 'zod'

export const ownerLoginSchema = z.object({
  login: z.string().trim().min(3).max(64),
  password: z.string().min(1).max(200),
})

export const customerSessionSchema = z.object({
  name: z.string().trim().min(2, 'Naam likhein').max(60),
  phone: z.string().trim().min(10).max(20),
})
