import { Router } from 'express'
import type { RequestHandler } from 'express'
import { prisma } from './db.js'
import { logger } from './lib/logger.js'
import { authRoutes } from './modules/auth/routes.js'
import { cartRoutes } from './modules/cart/routes.js'
import { adminCatalogueRoutes, catalogueRoutes } from './modules/catalogue/routes.js'
import { adminOrderRoutes, orderRoutes } from './modules/orders/routes.js'
import { adminPaymentRoutes, customerPaymentRoutes } from './modules/payments/routes.js'
import { pushRoutes } from './modules/push/routes.js'
import { adminSettingsRoutes, settingsRoutes } from './modules/settings/routes.js'

const DB_HEALTH_TIMEOUT_MS = 3000

async function databaseHealthy() {
  let timer: ReturnType<typeof setTimeout> | undefined

  try {
    await Promise.race([
      prisma.$queryRaw`SELECT 1`,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error('database health check timed out')),
          DB_HEALTH_TIMEOUT_MS,
        )
        timer.unref()
      }),
    ])
    return true
  } catch (error) {
    logger.warn({ err: error }, 'healthz database check failed')
    return false
  } finally {
    if (timer) clearTimeout(timer)
  }
}

export const routes = Router()

/** Liveness only: cheap and safe for Render's frequent health probe. */
routes.get('/livez', (_req, res) => {
  res.json({
    data: {
      status: 'ok',
      uptime: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
    },
  })
})

/** Readiness: checks Postgres. Wakes Neon, so use `/livez` for Render probes. */
const readiness: RequestHandler = async (_req, res) => {
  const startedAt = performance.now()
  const databaseOk = await databaseHealthy()

  res.status(databaseOk ? 200 : 503).json({
    data: {
      status: databaseOk ? 'ok' : 'degraded',
      database: databaseOk ? 'ok' : 'down',
      uptime: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
      latencyMs: Math.round(performance.now() - startedAt),
    },
  })
}

routes.get('/healthz', readiness)
routes.get('/readyz', readiness)

routes.use(authRoutes)
routes.use(cartRoutes)
routes.use('/orders', orderRoutes)
routes.use('/orders', customerPaymentRoutes)
routes.use(catalogueRoutes)
routes.use(settingsRoutes)
routes.use('/push', pushRoutes)
routes.use('/admin', adminCatalogueRoutes)
routes.use('/admin', adminSettingsRoutes)
routes.use('/admin/orders', adminOrderRoutes)
routes.use('/admin/payments', adminPaymentRoutes)
