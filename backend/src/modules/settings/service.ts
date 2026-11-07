import type { Prisma } from '../../generated/prisma/client.js'
import { prisma } from '../../db.js'
import { AppError } from '../../middleware/error.js'

export async function getSettings() {
  const settings = await prisma.storeSettings.findUnique({ where: { id: 'singleton' } })

  if (!settings) {
    throw new AppError(500, 'SETTINGS_MISSING', 'Store settings nahi mile, seed chalayein')
  }

  return settings
}

/** Public view: enough for the storefront and payment screen, no secrets. */
export async function getPublicSettings() {
  const settings = await getSettings()

  return {
    storeName: settings.storeName,
    address: settings.address,
    phone: settings.phone,
    openTime: settings.openTime,
    closeTime: settings.closeTime,
    timezone: settings.timezone,
    manualClosed: settings.manualClosed,
    pickupNote: settings.pickupNote,
    upiId: settings.upiId,
  }
}

export async function updateSettings(input: Prisma.StoreSettingsUpdateInput) {
  return prisma.storeSettings.update({
    where: { id: 'singleton' },
    data: input,
  })
}
