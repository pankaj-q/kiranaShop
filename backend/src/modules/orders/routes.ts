import { Router } from 'express'
import { getAuth, requireCustomer, requireOwner } from '../../middleware/auth.js'
import {
  cancelOrderSchema,
  createOrderSchema,
  listOrdersQuerySchema,
  listTextSchema,
  quoteOrderSchema,
  requestOrderSchema,
  updateItemsSchema,
  updateStatusSchema,
} from './schemas.js'
import {
  cancelOrder,
  createOrder,
  getBill,
  getOrder,
  listOrders,
  parseListText,
  quoteOrder,
  requestOrder,
  updateOrderItems,
  updateOrderList,
  updateOrderStatus,
} from './service.js'

export const orderRoutes = Router()

orderRoutes.use(requireCustomer)

orderRoutes.post('/', async (req, res) => {
  const body = createOrderSchema.parse(req.body)
  res.status(201).json({ data: await createOrder(getAuth(res).user, body) })
})

orderRoutes.post('/parse', async (req, res) => {
  const body = listTextSchema.parse(req.body)
  res.json({ data: await parseListText(body.listText) })
})

orderRoutes.post('/request', async (req, res) => {
  const body = requestOrderSchema.parse(req.body)
  res.status(201).json({ data: await requestOrder(getAuth(res).user, body) })
})

orderRoutes.get('/', async (req, res) => {
  const query = listOrdersQuerySchema.parse(req.query)
  res.json({ data: await listOrders({ ...query, userId: getAuth(res).user.id }) })
})

orderRoutes.get('/:id', async (req, res) => {
  res.json({ data: await getOrder(req.params.id, getAuth(res).user.id) })
})

orderRoutes.patch('/:id/items', async (req, res) => {
  const body = updateItemsSchema.parse(req.body)
  res.json({
    data: await updateOrderItems(req.params.id, getAuth(res).user.id, body.items),
  })
})

orderRoutes.patch('/:id/request', async (req, res) => {
  const body = listTextSchema.parse(req.body)
  res.json({
    data: await updateOrderList(req.params.id, getAuth(res).user.id, body.listText),
  })
})

orderRoutes.get('/:id/bill', async (req, res) => {
  res.json({
    data: await getBill(req.params.id, {
      userId: getAuth(res).user.id,
      audience: 'customer',
    }),
  })
})

orderRoutes.post('/:id/cancel', async (req, res) => {
  const body = cancelOrderSchema.parse(req.body ?? {})
  res.json({
    data: await cancelOrder(req.params.id, getAuth(res).user.id, body.note),
  })
})

export const adminOrderRoutes = Router()

adminOrderRoutes.use(requireOwner)

adminOrderRoutes.get('/', async (req, res) => {
  const query = listOrdersQuerySchema.parse(req.query)
  res.json({ data: await listOrders(query) })
})

adminOrderRoutes.post('/parse', async (req, res) => {
  const body = listTextSchema.parse(req.body)
  res.json({ data: await parseListText(body.listText) })
})

adminOrderRoutes.get('/:id', async (req, res) => {
  res.json({ data: await getOrder(req.params.id) })
})

adminOrderRoutes.get('/:id/bill', async (req, res) => {
  res.json({
    data: await getBill(req.params.id, { audience: 'owner' }),
  })
})

adminOrderRoutes.patch('/:id/quote', async (req, res) => {
  const body = quoteOrderSchema.parse(req.body)
  res.json({
    data: await quoteOrder(req.params.id, getAuth(res).user.id, body.items, body.billNote),
  })
})

adminOrderRoutes.patch('/:id/status', async (req, res) => {
  const body = updateStatusSchema.parse(req.body)
  res.json({
    data: await updateOrderStatus(req.params.id, getAuth(res).user.id, body.status, body.note),
  })
})
