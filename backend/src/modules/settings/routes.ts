import { Router } from 'express'
import { requireOwner } from '../../middleware/auth.js'
import { updateSettingsSchema } from './schemas.js'
import { getPublicSettings, getSettings, updateSettings } from './service.js'

export const settingsRoutes = Router()

settingsRoutes.get('/settings', async (_req, res) => {
  res.json({ data: await getPublicSettings() })
})

export const adminSettingsRoutes = Router()

adminSettingsRoutes.use(requireOwner)

adminSettingsRoutes.get('/settings', async (_req, res) => {
  res.json({ data: await getSettings() })
})

adminSettingsRoutes.patch('/settings', async (req, res) => {
  const body = updateSettingsSchema.parse(req.body)
  res.json({ data: await updateSettings(body) })
})
