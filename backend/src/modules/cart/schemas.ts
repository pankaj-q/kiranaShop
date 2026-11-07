import { z } from 'zod'

export const priceCartSchema = z.object({
  items: z
    .array(
      z.object({
        productId: z.string().min(1),
        quantity: z.number().int().min(1).max(99),
      }),
    )
    .min(1, 'Cart khali hai')
    .max(50),
})
