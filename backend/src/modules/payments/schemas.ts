import { z } from 'zod'

export const paymentStatusSchema = z.enum([
  'UNPAID',
  'AWAITING_VERIFICATION',
  'PAID',
  'PARTIAL',
  'REJECTED',
  'REFUNDED',
])

export const submitUpiPaymentSchema = z.object({
  utrReference: z
    .string()
    .trim()
    .min(6, 'UTR kam se kam 6 characters ka hona chahiye')
    .max(50)
    .regex(/^[A-Za-z0-9]+$/, 'UTR me sirf letters aur numbers chalenge'),
})

export const verifyPaymentSchema = z.object({
  amountPaise: z.number().int().positive().max(10_000_000).optional(),
  note: z.string().trim().max(200).optional(),
})

export const rejectPaymentSchema = z.object({
  note: z.string().trim().max(200).optional(),
})

export const refundPaymentSchema = z.object({
  note: z.string().trim().max(200).optional(),
})

export const payAtShopSchema = z.object({
  amountPaise: z.number().int().positive().max(10_000_000).optional(),
  note: z.string().trim().max(200).optional(),
})

export const listPaymentsQuerySchema = z.object({
  status: paymentStatusSchema.optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
})
