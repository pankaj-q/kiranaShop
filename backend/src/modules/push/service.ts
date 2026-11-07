import webpush from 'web-push'
import { config } from '../../config.js'
import { prisma } from '../../db.js'
import { logger } from '../../lib/logger.js'

export type PushPayload = {
  title: string
  body: string
  url?: string
  tag?: string
}

const hasKeys = Boolean(config.vapidPublicKey && config.vapidPrivateKey)
let usable = false

if (hasKeys) {
  try {
    webpush.setVapidDetails(
      config.vapidSubject,
      config.vapidPublicKey as string,
      config.vapidPrivateKey as string,
    )
    usable = true
  } catch (error) {
    logger.error({ err: error }, 'Invalid VAPID configuration; push disabled')
  }
}

export function pushEnabled() {
  return usable
}

export function getPushConfig() {
  return {
    enabled: usable,
    publicKey: usable ? config.vapidPublicKey : null,
  }
}

export async function subscribe(
  userId: string,
  input: { endpoint: string; keys: { p256dh: string; auth: string } },
) {
  return prisma.pushSubscription.upsert({
    where: { endpoint: input.endpoint },
    update: {
      userId,
      p256dh: input.keys.p256dh,
      auth: input.keys.auth,
    },
    create: {
      userId,
      endpoint: input.endpoint,
      p256dh: input.keys.p256dh,
      auth: input.keys.auth,
    },
  })
}

export async function unsubscribe(userId: string, endpoint: string) {
  return prisma.pushSubscription.deleteMany({ where: { userId, endpoint } })
}

function statusCodeOf(error: unknown) {
  if (typeof error === 'object' && error !== null && 'statusCode' in error) {
    return Number((error as { statusCode?: number }).statusCode)
  }
  return undefined
}

/** Sends to every device the customer registered. Never throws. */
export async function sendToUser(userId: string, payload: PushPayload) {
  if (!pushEnabled()) return { sent: 0, failed: 0, skipped: true }

  const subscriptions = await prisma.pushSubscription.findMany({ where: { userId } })
  const body = JSON.stringify(payload)
  let sent = 0
  let failed = 0

  await Promise.all(
    subscriptions.map(async (subscription) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: subscription.endpoint,
            keys: { p256dh: subscription.p256dh, auth: subscription.auth },
          },
          body,
          { TTL: 60 * 60, timeout: 5000 },
        )
        sent++
        await prisma.pushSubscription
          .update({ where: { id: subscription.id }, data: { lastSuccessAt: new Date() } })
          .catch(() => undefined)
      } catch (error) {
        failed++
        const statusCode = statusCodeOf(error)

        // The browser has gone away; drop the dead endpoint.
        if (statusCode === 404 || statusCode === 410) {
          await prisma.pushSubscription
            .deleteMany({ where: { id: subscription.id } })
            .catch(() => undefined)
          return
        }

        logger.warn({ err: error, endpoint: subscription.endpoint }, 'Push notification failed')
      }
    }),
  )

  return { sent, failed, skipped: false }
}

export async function notifyOrderReady(order: { id: string; userId: string; orderNumber: string }) {
  try {
    return await sendToUser(order.userId, {
      title: 'Order ready hai — MajitKirana',
      body: `${order.orderNumber} dukaan par ready hai. Pickup kar lein.`,
      url: `/orders/${order.id}`,
      tag: `order-${order.id}`,
    })
  } catch (error) {
    logger.warn({ err: error, orderId: order.id }, 'Ready push failed')
    return { sent: 0, failed: 0, skipped: false }
  }
}
