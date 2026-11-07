import { randomBytes } from 'node:crypto'
import type { Prisma } from '../../generated/prisma/client.js'
import type { OrderStatus, PaymentStatus } from '../../generated/prisma/enums.js'
import { prisma } from '../../db.js'
import { istDateStamp, nextServiceAt } from '../../lib/ist.js'
import { rupees } from '../../lib/money.js'
import { AppError } from '../../middleware/error.js'
import { priceCart, type CartInputItem } from '../cart/service.js'
import { parseList } from './listParser.js'

type OrderUser = { id: string; name: string; phone: string }
type PaymentState = { status: PaymentStatus }

const orderInclude = {
  items: true,
  events: { orderBy: { createdAt: 'asc' as const } },
  payments: { orderBy: { createdAt: 'desc' as const } },
}

function hasPaymentActivity(payments: PaymentState[]) {
  return payments.some(
    (payment) =>
      payment.status === 'AWAITING_VERIFICATION' ||
      payment.status === 'PAID' ||
      payment.status === 'PARTIAL',
  )
}

/** A quoted/paid order must be settled (or refunded) before the list changes. */
function assertNoPaymentActivity(order: { payments: PaymentState[] }) {
  if (hasPaymentActivity(order.payments)) {
    throw new AppError(
      409,
      'ORDER_HAS_PAYMENT',
      'Payment ho chuka hai ya verify hone ka wait hai. Pehle payment settle karein.',
    )
  }
}

/** Which statuses the owner may move an order to. */
const OWNER_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  REQUESTED: ['REJECTED'],
  PLACED: ['ACCEPTED', 'PREPARING', 'REJECTED'],
  ACCEPTED: ['PREPARING', 'REJECTED'],
  PREPARING: ['READY_FOR_PICKUP'],
  READY_FOR_PICKUP: ['COMPLETED'],
  COMPLETED: [],
  REJECTED: [],
  CANCELLED: [],
}

/** Customer may edit the list or cancel until the owner starts preparing. */
const CUSTOMER_EDITABLE: OrderStatus[] = ['REQUESTED', 'PLACED', 'ACCEPTED']

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

async function existingByIdempotencyKey(key: string | undefined, userId: string) {
  if (!key) return null

  const existing = await prisma.order.findUnique({
    where: { idempotencyKey: key },
    include: orderInclude,
  })

  if (!existing) return null
  if (existing.userId !== userId) {
    throw new AppError(409, 'IDEMPOTENCY_CONFLICT', 'Yeh request pehle use ho chuki hai')
  }
  return existing
}

async function createOrderRow(
  idempotencyKey: string | undefined,
  data: Omit<Prisma.OrderUncheckedCreateInput, 'orderNumber'>,
) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await prisma.order.create({
        data: { ...data, orderNumber: newOrderNumber() },
        include: orderInclude,
      })
    } catch (error) {
      if (!isPrismaCode(error, 'P2002')) throw error

      if (idempotencyKey) {
        const existing = await prisma.order.findUnique({
          where: { idempotencyKey },
          include: orderInclude,
        })
        if (existing) return existing
      }
      // Otherwise a duplicate order number — try again.
    }
  }

  throw new AppError(500, 'ORDER_NUMBER_FAILED', 'Order banane me dikkat aayi, dobara try karein')
}

async function scheduleForNextSlot() {
  const store = await prisma.storeSettings.findUnique({ where: { id: 'singleton' } })
  return nextServiceAt(new Date(), store?.openTime ?? '06:00', store?.closeTime ?? '23:00')
}

export async function createOrder(
  user: OrderUser,
  input: { items: CartInputItem[]; customerNote?: string; idempotencyKey?: string },
) {
  const existing = await existingByIdempotencyKey(input.idempotencyKey, user.id)
  if (existing) return existing

  const cart = await pricedCartOrThrow(input.items)

  return createOrderRow(input.idempotencyKey, {
    idempotencyKey: input.idempotencyKey,
    userId: user.id,
    customerNameSnapshot: user.name,
    phoneSnapshot: user.phone,
    customerNote: input.customerNote,
    subtotalPaise: cart.subtotalPaise,
    totalPaise: cart.totalPaise,
    scheduledFor: await scheduleForNextSlot(),
    items: { create: itemCreate(cart.items) },
    events: {
      create: {
        actorId: user.id,
        actorRole: 'CUSTOMER',
        toStatus: 'PLACED',
        note: 'Order placed',
      },
    },
  })
}

/** Text-list flow: customer sends a free-text list; owner bills it later. */
export async function requestOrder(
  user: OrderUser,
  input: { listText: string; customerNote?: string; idempotencyKey?: string },
) {
  const existing = await existingByIdempotencyKey(input.idempotencyKey, user.id)
  if (existing) return existing

  return createOrderRow(input.idempotencyKey, {
    idempotencyKey: input.idempotencyKey,
    userId: user.id,
    customerNameSnapshot: user.name,
    phoneSnapshot: user.phone,
    customerNote: input.customerNote,
    rawList: input.listText,
    subtotalPaise: 0,
    totalPaise: 0,
    status: 'REQUESTED',
    scheduledFor: await scheduleForNextSlot(),
    events: {
      create: {
        actorId: user.id,
        actorRole: 'CUSTOMER',
        toStatus: 'REQUESTED',
        note: 'List received',
      },
    },
  })
}

export async function parseListText(rawText: string) {
  const products = await prisma.product.findMany({
    where: { category: { isActive: true } },
    select: {
      id: true,
      name: true,
      unit: true,
      pricePaise: true,
      aliases: true,
      searchName: true,
      isAvailable: true,
    },
  })

  return parseList(rawText, products)
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
  assertNoPaymentActivity(order)

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
  assertNoPaymentActivity(order)

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

/** Customer edits/appends the free-text list. Any existing bill is invalidated. */
export async function updateOrderList(id: string, userId: string, listText: string) {
  const order = await findOrder(id, userId)

  if (!CUSTOMER_EDITABLE.includes(order.status)) {
    throw new AppError(409, 'ORDER_NOT_EDITABLE', 'Order ab edit nahi ho sakta')
  }
  assertNoPaymentActivity(order)

  return prisma.$transaction(async (tx) => {
    await tx.orderItem.deleteMany({ where: { orderId: id } })

    return tx.order.update({
      where: { id },
      data: {
        rawList: listText,
        status: 'REQUESTED',
        quotedAt: null,
        billNote: null,
        subtotalPaise: 0,
        totalPaise: 0,
        version: { increment: 1 },
        events: {
          create: {
            actorId: userId,
            actorRole: 'CUSTOMER',
            fromStatus: order.status,
            toStatus: 'REQUESTED',
            note: 'List updated',
          },
        },
      },
      include: orderInclude,
    })
  })
}

type QuoteItem = {
  productId?: string
  name?: string
  unit?: string
  quantity: number
  quantityText?: string
  pricePaise?: number
}

/** Owner turns a REQUESTED list into a bill (PLACED). */
export async function quoteOrder(
  id: string,
  ownerId: string,
  items: QuoteItem[],
  billNote?: string,
) {
  const order = await findOrder(id)

  if (order.status !== 'REQUESTED' && order.status !== 'PLACED') {
    throw new AppError(409, 'ORDER_NOT_QUOTABLE', 'Is order ka bill ab nahi ban sakta')
  }
  assertNoPaymentActivity(order)

  const productIds = [
    ...new Set(items.map((item) => item.productId).filter((value): value is string => Boolean(value))),
  ]
  const products = productIds.length
    ? await prisma.product.findMany({ where: { id: { in: productIds } } })
    : []
  const byId = new Map(products.map((product) => [product.id, product]))

  const prepared = items.map((item, index) => {
    const product = item.productId ? byId.get(item.productId) : undefined
    if (item.productId && !product) {
      throw new AppError(400, 'PRODUCT_NOT_FOUND', `Item ${index + 1}: product nahi mila`)
    }

    const name = product?.name ?? item.name
    const unit = product?.unit ?? item.unit
    const pricePaise = item.pricePaise ?? product?.pricePaise

    if (!name || !unit || !pricePaise) {
      throw new AppError(
        400,
        'INVALID_BILL_ITEM',
        `Item ${index + 1}: name, unit aur price chahiye`,
      )
    }

    return {
      productId: product?.id ?? null,
      nameSnapshot: name,
      unitSnapshot: unit,
      quantityText: item.quantityText ?? null,
      unitPricePaise: pricePaise,
      quantity: item.quantity,
      lineTotalPaise: pricePaise * item.quantity,
    }
  })

  const totalPaise = prepared.reduce((sum, item) => sum + item.lineTotalPaise, 0)

  return prisma.$transaction(async (tx) => {
    await tx.orderItem.deleteMany({ where: { orderId: id } })

    return tx.order.update({
      where: { id },
      data: {
        status: 'PLACED',
        subtotalPaise: totalPaise,
        totalPaise,
        quotedAt: new Date(),
        billNote: billNote ?? null,
        version: { increment: 1 },
        items: { create: prepared },
        events: {
          create: {
            actorId: ownerId,
            actorRole: 'OWNER',
            fromStatus: order.status,
            toStatus: 'PLACED',
            note: 'Bill sent',
          },
        },
      },
      include: orderInclude,
    })
  })
}

function waNumber(phone: string) {
  const digits = phone.replace(/\D/g, '')
  return digits.length === 10 ? `91${digits}` : digits
}

/** Bill text + wa.me link. Owner link goes to the customer, customer link to the shop. */
export async function getBill(
  id: string,
  opts: { userId?: string; audience: 'customer' | 'owner' },
) {
  const order = await findOrder(id, opts.userId)

  if (order.status === 'REQUESTED' || !order.items.length) {
    throw new AppError(409, 'BILL_NOT_READY', 'Bill abhi ready nahi hai')
  }

  const store = await prisma.storeSettings.findUnique({ where: { id: 'singleton' } })
  const storeName = store?.storeName ?? 'MajitKirana'
  const storePhone = store?.phone || process.env.ADMIN_LOGIN || ''
  const targetPhone = opts.audience === 'owner' ? order.phoneSnapshot : storePhone

  const lines = [
    `*${storeName}* — Bill`,
    `Order: ${order.orderNumber}`,
    ...order.items.map((item) => {
      const quantity = item.quantityText ?? `${item.quantity} x ${item.unitSnapshot}`
      return `${quantity} ${item.nameSnapshot} — ${rupees(item.lineTotalPaise)}`
    }),
    `Total: ${rupees(order.totalPaise)}`,
    ...(order.billNote ? [order.billNote] : []),
    `Pickup: ${store?.pickupNote || 'Dukaan se le lein'}`,
  ]
  const billText = lines.join('\n')

  return {
    billText,
    whatsappUrl: targetPhone
      ? `https://wa.me/${waNumber(targetPhone)}?text=${encodeURIComponent(billText)}`
      : null,
    order,
  }
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

  if (status === 'REJECTED') assertNoPaymentActivity(order)

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
