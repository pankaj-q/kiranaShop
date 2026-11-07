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
  OTP_PROVIDER: z.enum(['console', 'memory', 'msg91', 'fast2sms', 'none']).optional(),
  OTP_TTL_SECONDS: z.coerce.number().int().min(60).max(3600).default(300),
  OTP_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(10).default(5),
  OTP_RESEND_COOLDOWN_SECONDS: z.coerce.number().int().min(0).max(600).default(60),
  OTP_MAX_PER_PHONE_HOUR: z.coerce.number().int().min(1).default(5),
  OTP_MAX_PER_PHONE_DAY: z.coerce.number().int().min(1).default(10),
  OTP_GLOBAL_DAILY_CAP: z.coerce.number().int().min(1).default(500),
  OTP_HASH_SECRET: z.string().min(16).optional(),
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
  isTest: parsed.data.NODE_ENV === 'test',
  port: parsed.data.PORT,
  appOrigin: parsed.data.APP_ORIGIN,
  databaseUrl: parsed.data.DATABASE_URL,
  sessionSecret: parsed.data.SESSION_SECRET,
  vapidPublicKey: parsed.data.VAPID_PUBLIC_KEY || null,
  vapidPrivateKey: parsed.data.VAPID_PRIVATE_KEY || null,
  vapidSubject: parsed.data.VAPID_SUBJECT || 'mailto:owner@majitkirana.example',
  otpProvider:
    parsed.data.OTP_PROVIDER ?? (parsed.data.NODE_ENV === 'production' ? 'none' : 'console'),
  otpHashSecret: parsed.data.OTP_HASH_SECRET || parsed.data.SESSION_SECRET,
  otpTtlSeconds: parsed.data.OTP_TTL_SECONDS,
  otpMaxAttempts: parsed.data.OTP_MAX_ATTEMPTS,
  otpResendCooldownSeconds: parsed.data.OTP_RESEND_COOLDOWN_SECONDS,
  otpMaxPerPhoneHour: parsed.data.OTP_MAX_PER_PHONE_HOUR,
  otpMaxPerPhoneDay: parsed.data.OTP_MAX_PER_PHONE_DAY,
  otpGlobalDailyCap: parsed.data.OTP_GLOBAL_DAILY_CAP,
})
