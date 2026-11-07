import { Router } from 'express'
import { authRoutes } from './modules/auth/routes.js'
import { cartRoutes } from './modules/cart/routes.js'
import { adminCatalogueRoutes, catalogueRoutes } from './modules/catalogue/routes.js'
import { adminOrderRoutes, orderRoutes } from './modules/orders/routes.js'
import { adminPaymentRoutes, customerPaymentRoutes } from './modules/payments/routes.js'
import { pushRoutes } from './modules/push/routes.js'
import { adminSettingsRoutes, settingsRoutes } from './modules/settings/routes.js'

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
