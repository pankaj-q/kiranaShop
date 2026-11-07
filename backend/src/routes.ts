import { Router } from 'express'

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
