import { z } from 'zod'
import { cartItemSchema } from '../cart/schemas.js'

export const orderStatusSchema = z.enum([
  'REQUESTED',
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

export const listTextSchema = z.object({
  listText: z.string().trim().min(1, 'List likhein ya bolein').max(1000),
})

export const requestOrderSchema = listTextSchema.extend({
  customerNote: z.string().trim().max(300).optional(),
  idempotencyKey: z.string().trim().min(8).max(100).optional(),
})

export const quoteItemSchema = z.object({
  productId: z.string().min(1).optional(),
  name: z.string().trim().min(1).max(120).optional(),
  unit: z.string().trim().min(1).max(30).optional(),
  quantity: z.number().int().min(1).max(99).default(1),
  quantityText: z.string().trim().min(1).max(30).optional(),
  pricePaise: z.number().int().positive().max(10_000_000).optional(),
})

export const quoteOrderSchema = z.object({
  items: z.array(quoteItemSchema).min(1, 'Bill me kam se kam ek item chahiye').max(50),
  billNote: z.string().trim().max(300).optional(),
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
