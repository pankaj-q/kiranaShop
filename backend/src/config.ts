import dotenv from 'dotenv'
import { z } from 'zod'

dotenv.config({ quiet: true })

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  APP_ORIGIN: z.url().default('http://localhost:5173'),
  DATABASE_URL: z.string().min(1),
  SESSION_SECRET: z.string().min(16),
  VAPID_PUBLIC_KEY: z.string().optional(),
  VAPID_PRIVATE_KEY: z.string().optional(),
  VAPID_SUBJECT: z.string().optional(),
})

const parsed = envSchema.safeParse(process.env)

if (!parsed.success) {
  console.error('Invalid environment variables:')
  for (const issue of parsed.error.issues) {
    console.error(`  ${issue.path.join('.')}: ${issue.message}`)
  }
  process.exit(1)
}

export const config = Object.freeze({
  env: parsed.data.NODE_ENV,
  isProd: parsed.data.NODE_ENV === 'production',
  port: parsed.data.PORT,
  appOrigin: parsed.data.APP_ORIGIN,
  databaseUrl: parsed.data.DATABASE_URL,
  sessionSecret: parsed.data.SESSION_SECRET,
  vapidPublicKey: parsed.data.VAPID_PUBLIC_KEY || null,
  vapidPrivateKey: parsed.data.VAPID_PRIVATE_KEY || null,
  vapidSubject: parsed.data.VAPID_SUBJECT || 'mailto:owner@majitkirana.example',
})
