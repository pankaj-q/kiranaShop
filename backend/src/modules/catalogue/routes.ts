import { Router } from 'express'
import { requireOwner } from '../../middleware/auth.js'
import {
  categoryCreateSchema,
  categoryUpdateSchema,
  importSchema,
  listQuerySchema,
  productCreateSchema,
  productUpdateSchema,
} from './schemas.js'
import {
  createCategory,
  createProduct,
  getProduct,
  importProducts,
  listCategories,
  listProducts,
  updateCategory,
  updateProduct,
} from './service.js'

export const catalogueRoutes = Router()

catalogueRoutes.get('/categories', async (_req, res) => {
  res.json({ data: await listCategories(true) })
})

catalogueRoutes.get('/products', async (req, res) => {
  const query = listQuerySchema.parse(req.query)
  res.json({ data: await listProducts({ ...query, publicOnly: true }) })
})

catalogueRoutes.get('/products/:id', async (req, res) => {
  res.json({ data: await getProduct(req.params.id, true) })
})

export const adminCatalogueRoutes = Router()

adminCatalogueRoutes.use(requireOwner)

adminCatalogueRoutes.get('/categories', async (_req, res) => {
  res.json({ data: await listCategories(false) })
})

adminCatalogueRoutes.post('/categories', async (req, res) => {
  const body = categoryCreateSchema.parse(req.body)
  res.status(201).json({ data: await createCategory(body) })
})

adminCatalogueRoutes.patch('/categories/:id', async (req, res) => {
  const body = categoryUpdateSchema.parse(req.body)
  res.json({ data: await updateCategory(req.params.id, body) })
})

adminCatalogueRoutes.get('/products', async (req, res) => {
  const query = listQuerySchema.parse(req.query)
  res.json({ data: await listProducts({ ...query, publicOnly: false }) })
})

adminCatalogueRoutes.post('/products', async (req, res) => {
  const body = productCreateSchema.parse(req.body)
  res.status(201).json({ data: await createProduct(body) })
})

adminCatalogueRoutes.post('/products/import', async (req, res) => {
  const body = importSchema.parse(req.body)
  res.json({ data: await importProducts(body.csv) })
})

adminCatalogueRoutes.patch('/products/:id', async (req, res) => {
  const body = productUpdateSchema.parse(req.body)
  res.json({ data: await updateProduct(req.params.id, body) })
})
