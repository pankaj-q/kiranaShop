import { Router } from 'express'
import { getAuth, requireCustomer } from '../../middleware/auth.js'
import { pushSubscriptionSchema, pushUnsubscribeSchema } from './schemas.js'
import { getPushConfig, pushEnabled, subscribe, unsubscribe } from './service.js'

export const pushRoutes = Router()

pushRoutes.get('/public-key', (_req, res) => {
  res.json({ data: getPushConfig() })
})

pushRoutes.use(requireCustomer)

pushRoutes.post('/subscribe', async (req, res) => {
  if (!pushEnabled()) {
    res.status(503).json({
      error: { code: 'PUSH_DISABLED', message: 'Notifications abhi configured nahi hain' },
    })
    return
  }

  const body = pushSubscriptionSchema.parse(req.body)
  res.status(201).json({ data: await subscribe(getAuth(res).user.id, body) })
})

pushRoutes.post('/unsubscribe', async (req, res) => {
  const body = pushUnsubscribeSchema.parse(req.body)
  await unsubscribe(getAuth(res).user.id, body.endpoint)
  res.json({ data: { removed: true } })
})
