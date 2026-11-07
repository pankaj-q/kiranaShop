import { Router } from 'express'
import { priceCartSchema } from './schemas.js'
import { priceCart } from './service.js'

export const cartRoutes = Router()

cartRoutes.post('/cart/price', async (req, res) => {
  const body = priceCartSchema.parse(req.body)
  res.json({ data: await priceCart(body.items) })
})
