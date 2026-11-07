import { z } from 'zod'

const timeSchema = z
  .string()
  .trim()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Time HH:MM me hona chahiye')

const upiIdSchema = z
  .union([
    z.literal('').transform(() => null),
    z.null(),
    z
      .string()
      .trim()
      .max(100)
      .regex(/^[\w.\-]{2,}@[A-Za-z]{2,}$/, 'UPI ID galat lag raha hai (jaise shop@upi)'),
  ])

export const updateSettingsSchema = z
  .object({
    storeName: z.string().trim().min(1).max(80).optional(),
    address: z.string().trim().min(1).max(200).optional(),
    phone: z.string().trim().max(20).optional(),
    openTime: timeSchema.optional(),
    closeTime: timeSchema.optional(),
    manualClosed: z.boolean().optional(),
    upiId: upiIdSchema.optional(),
    pickupNote: z.union([z.string().trim().max(200), z.null()]).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, 'Kam se kam ek field bhejein')
