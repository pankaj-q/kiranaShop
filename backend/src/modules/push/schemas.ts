import { z } from 'zod'

const pushEndpointSchema = z
  .url('Push endpoint galat hai')
  .max(500, 'Push endpoint bahut lamba hai')
  .refine((value) => value.startsWith('https://'), 'Push endpoint https hona chahiye')

export const pushSubscriptionSchema = z.object({
  endpoint: pushEndpointSchema,
  keys: z.object({
    p256dh: z.string().min(10),
    auth: z.string().min(10),
  }),
})

export const pushUnsubscribeSchema = z.object({
  endpoint: pushEndpointSchema,
})
