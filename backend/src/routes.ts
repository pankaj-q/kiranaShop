import { Router } from 'express'
import { authRoutes } from './modules/auth/routes.js'

export const routes = Router()

routes.get('/healthz', (_req, res) => {
  res.json({
    data: {
      status: 'ok',
      uptime: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
    },
  })
})

routes.use(authRoutes)
