import { randomBytes } from 'node:crypto'
import type { OrderStatus } from '../../generated/prisma/enums.js'
import { prisma } from '../../db.js'
import { istDateStamp, nextServiceAt } from '../../lib/ist.js'
import { AppError } from '../../middleware/error.js'
import { priceCart, type CartInputItem } from '../cart/service.js'

type OrderUser = { id: string; name: string; phone: string }

const orderInclude = {
  items: true,
  events: { orderBy: { createdAt: 'asc' as const } },
}

/** Which statuses the owner may move an order to. */
const OWNER_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  PLACED: ['ACCEPTED', 'REJECTED'],
  ACCEPTED: ['PREPARING', 'REJECTED'],
  PREPARING: ['READY_FOR_PICKUP'],
  READY_FOR_PICKUP: ['COMPLETED'],
  COMPLETED: [],
  REJECTED: [],
  CANCELLED: [],
}

/** Customer may edit or cancel until the owner starts preparing. */
const CUSTOMER_EDITABLE: OrderStatus[] = ['PLACED', 'ACCEPTED']

function isPrismaCode(error: unknown, code: string) {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === code
}

function newOrderNumber() {
  return `MK-${istDateStamp()}-${randomBytes(3).toString('hex').toUpperCase()}`
}

function itemCreate(lines: Awaited<ReturnType<typeof priceCart>>['items']) {
  return lines.map((line) => ({
    productId: line.productId,
    nameSnapshot: line.name ?? '',
    unitSnapshot: line.unit ?? '',
    unitPricePaise: line.pricePaise ?? 0,
    quantity: line.quantity,
    lineTotalPaise: line.lineTotalPaise,
  }))
}

async function pricedCartOrThrow(items: CartInputItem[]) {
  const cart = await priceCart(items)
  const unavailable = cart.items.filter((line) => !line.isAvailable)

  if (unavailable.length) {
    throw new AppError(
      400,
      'CART_INVALID',
      'Kuch items ab available nahi hain',
      unavailable.map((line) => ({ productId: line.productId, name: line.name, removed: line.removed })),
    )
  }

  return cart
}

export async function createOrder(
  user: OrderUser,
  input: { items: CartInputItem[]; customerNote?: string; idempotencyKey?: string },
) {
  if (input.idempotencyKey) {
    const existing = await prisma.order.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
      include: orderInclude,
    })

    if (existing) {
      if (existing.userId !== user.id) {
        throw new AppError(409, 'IDEMPOTENCY_CONFLICT', 'Yeh request pehle use ho chuki hai')
      }
      return existing
    }
  }

  const cart = await pricedCartOrThrow(input.items)
  const store = await prisma.storeSettings.findUnique({ where: { id: 'singleton' } })
  const scheduledFor = nextServiceAt(
    new Date(),
    store?.openTime ?? '06:00',
    store?.closeTime ?? '23:00',
  )

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await prisma.order.create({
        data: {
          orderNumber: newOrderNumber(),
          idempotencyKey: input.idempotencyKey,
          userId: user.id,
          customerNameSnapshot: user.name,
          phoneSnapshot: user.phone,
          customerNote: input.customerNote,
          subtotalPaise: cart.subtotalPaise,
          totalPaise: cart.totalPaise,
          scheduledFor,
          items: { create: itemCreate(cart.items) },
          events: {
            create: {
              actorId: user.id,
              actorRole: 'CUSTOMER',
              toStatus: 'PLACED',
              note: 'Order placed',
            },
          },
        },
        include: orderInclude,
      })
    } catch (error) {
      if (!isPrismaCode(error, 'P2002')) throw error

      if (input.idempotencyKey) {
        const existing = await prisma.order.findUnique({
          where: { idempotencyKey: input.idempotencyKey },
          include: orderInclude,
        })
        if (existing) return existing
      }
      // Otherwise a duplicate order number — try again.
    }
  }

  throw new AppError(500, 'ORDER_NUMBER_FAILED', 'Order banane me dikkat aayi, dobara try karein')
}

export async function listOrders(params: {
  userId?: string
  status?: OrderStatus
  page: number
  limit: number
}) {
  const where = {
    ...(params.userId ? { userId: params.userId } : {}),
    ...(params.status ? { status: params.status } : {}),
  }

  const [total, items] = await prisma.$transaction([
    prisma.order.count({ where }),
    prisma.order.findMany({
      where,
      include: orderInclude,
      orderBy: { createdAt: 'desc' },
      skip: (params.page - 1) * params.limit,
      take: params.limit,
    }),
  ])

  return {
    items,
    meta: {
      page: params.page,
      limit: params.limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / params.limit)),
    },
  }
}

async function findOrder(id: string, userId?: string) {
  const order = await prisma.order.findFirst({
    where: { id, ...(userId ? { userId } : {}) },
    include: orderInclude,
  })

  if (!order) throw new AppError(404, 'ORDER_NOT_FOUND', 'Order nahi mila')
  return order
}

export function getOrder(id: string, userId?: string) {
  return findOrder(id, userId)
}

export async function updateOrderItems(id: string, userId: string, items: CartInputItem[]) {
  const order = await findOrder(id, userId)

  if (!CUSTOMER_EDITABLE.includes(order.status)) {
    throw new AppError(409, 'ORDER_NOT_EDITABLE', 'Order ab edit nahi ho sakta')
  }

  const cart = await pricedCartOrThrow(items)

  return prisma.$transaction(async (tx) => {
    await tx.orderItem.deleteMany({ where: { orderId: id } })

    return tx.order.update({
      where: { id },
      data: {
        subtotalPaise: cart.subtotalPaise,
        totalPaise: cart.totalPaise,
        version: { increment: 1 },
        items: { create: itemCreate(cart.items) },
        events: {
          create: {
            actorId: userId,
            actorRole: 'CUSTOMER',
            note: 'Items updated',
          },
        },
      },
      include: orderInclude,
    })
  })
}

export async function cancelOrder(id: string, userId: string, note?: string) {
  const order = await findOrder(id, userId)

  if (!CUSTOMER_EDITABLE.includes(order.status)) {
    throw new AppError(409, 'ORDER_NOT_CANCELLABLE', 'Order ab cancel nahi ho sakta')
  }

  return prisma.order.update({
    where: { id },
    data: {
      status: 'CANCELLED',
      version: { increment: 1 },
      events: {
        create: {
          actorId: userId,
          actorRole: 'CUSTOMER',
          fromStatus: order.status,
          toStatus: 'CANCELLED',
          note: note ?? 'Customer cancelled',
        },
      },
    },
    include: orderInclude,
  })
}

export async function updateOrderStatus(
  id: string,
  ownerId: string,
  status: OrderStatus,
  note?: string,
) {
  const order = await findOrder(id)
  const allowed = OWNER_TRANSITIONS[order.status]

  if (!allowed.includes(status)) {
    throw new AppError(409, 'INVALID_STATUS_TRANSITION', `${order.status} se ${status} nahi ho sakta`, {
      from: order.status,
      allowed,
    })
  }

  return prisma.order.update({
    where: { id },
    data: {
      status,
      version: { increment: 1 },
      events: {
        create: {
          actorId: ownerId,
          actorRole: 'OWNER',
          fromStatus: order.status,
          toStatus: status,
          note,
        },
      },
    },
    include: orderInclude,
  })
}
