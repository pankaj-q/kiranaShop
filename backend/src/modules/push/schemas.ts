import { z } from 'zod'

export const pushSubscriptionSchema = z.object({
  endpoint: z.url('Push endpoint galat hai'),
  keys: z.object({
    p256dh: z.string().min(10),
    auth: z.string().min(10),
  }),
})

export const pushUnsubscribeSchema = z.object({
  endpoint: z.url('Push endpoint galat hai'),
})
