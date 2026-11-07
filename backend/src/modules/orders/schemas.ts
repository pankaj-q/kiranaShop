import { z } from 'zod'
import { cartItemSchema } from '../cart/schemas.js'

export const orderStatusSchema = z.enum([
  'PLACED',
  'ACCEPTED',
  'PREPARING',
  'READY_FOR_PICKUP',
  'COMPLETED',
  'REJECTED',
  'CANCELLED',
])

export const createOrderSchema = z.object({
  items: z.array(cartItemSchema).min(1, 'Cart khali hai').max(50),
  customerNote: z.string().trim().max(300).optional(),
  idempotencyKey: z.string().trim().min(8).max(100).optional(),
})

export const updateItemsSchema = z.object({
  items: z.array(cartItemSchema).min(1, 'Cart khali hai').max(50),
})

export const cancelOrderSchema = z.object({
  note: z.string().trim().max(200).optional(),
})

export const listOrdersQuerySchema = z.object({
  status: orderStatusSchema.optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
})

export const updateStatusSchema = z.object({
  status: orderStatusSchema,
  note: z.string().trim().max(200).optional(),
})
