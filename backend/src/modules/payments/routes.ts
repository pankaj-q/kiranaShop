import { Router } from 'express'
import { getAuth, requireCustomer, requireOwner } from '../../middleware/auth.js'
import {
  listPaymentsQuerySchema,
  refundPaymentSchema,
  rejectPaymentSchema,
  submitUpiPaymentSchema,
  verifyPaymentSchema,
} from './schemas.js'
import {
  getPaymentOptions,
  listPayments,
  refundPayment,
  rejectPayment,
  submitUpiPayment,
  verifyPayment,
} from './service.js'

export const customerPaymentRoutes = Router()

customerPaymentRoutes.use(requireCustomer)

customerPaymentRoutes.get('/:id/payment', async (req, res) => {
  res.json({ data: await getPaymentOptions(req.params.id, getAuth(res).user.id) })
})

customerPaymentRoutes.post('/:id/payments/upi', async (req, res) => {
  const body = submitUpiPaymentSchema.parse(req.body)
  res.status(201).json({
    data: await submitUpiPayment(req.params.id, getAuth(res).user.id, body.utrReference),
  })
})

export const adminPaymentRoutes = Router()

adminPaymentRoutes.use(requireOwner)

adminPaymentRoutes.get('/', async (req, res) => {
  const query = listPaymentsQuerySchema.parse(req.query)
  res.json({ data: await listPayments(query) })
})

adminPaymentRoutes.post('/:id/verify', async (req, res) => {
  const body = verifyPaymentSchema.parse(req.body ?? {})
  res.json({ data: await verifyPayment(req.params.id, getAuth(res).user.id, body) })
})

adminPaymentRoutes.post('/:id/reject', async (req, res) => {
  const body = rejectPaymentSchema.parse(req.body ?? {})
  res.json({ data: await rejectPayment(req.params.id, getAuth(res).user.id, body.note) })
})

adminPaymentRoutes.post('/:id/refund', async (req, res) => {
  const body = refundPaymentSchema.parse(req.body ?? {})
  res.json({ data: await refundPayment(req.params.id, getAuth(res).user.id, body.note) })
})
