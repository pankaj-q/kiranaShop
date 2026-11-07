import QRCode from 'qrcode'
import type { Prisma } from '../../generated/prisma/client.js'
import type { OrderStatus, PaymentStatus } from '../../generated/prisma/enums.js'
import { prisma } from '../../db.js'
import { rupees } from '../../lib/money.js'
import { AppError } from '../../middleware/error.js'

/** Payment is allowed while the order is live, including pickup day. */
const PAYABLE_STATUSES: OrderStatus[] = [
  'PLACED',
  'ACCEPTED',
  'PREPARING',
  'READY_FOR_PICKUP',
  'COMPLETED',
]

const orderInclude = {
  items: true,
  payments: { orderBy: { createdAt: 'desc' as const } },
} satisfies Prisma.OrderInclude

const paymentWithOrder = {
  order: {
    select: {
      id: true,
      orderNumber: true,
      customerNameSnapshot: true,
      phoneSnapshot: true,
      status: true,
      totalPaise: true,
      paymentStatus: true,
    },
  },
} satisfies Prisma.PaymentInclude

type OrderWithPayments = Prisma.OrderGetPayload<{ include: typeof orderInclude }>
type PaymentAmount = { status: PaymentStatus; amountPaise: number }

async function findOrder(id: string, userId?: string) {
  const order = await prisma.order.findFirst({
    where: { id, ...(userId ? { userId } : {}) },
    include: orderInclude,
  })

  if (!order) throw new AppError(404, 'ORDER_NOT_FOUND', 'Order nahi mila')
  return order
}

async function findPayment(id: string) {
  const payment = await prisma.payment.findUnique({
    where: { id },
    include: { order: true },
  })

  if (!payment) throw new AppError(404, 'PAYMENT_NOT_FOUND', 'Payment nahi mili')
  return payment
}

function billReady(order: OrderWithPayments) {
  return order.status !== 'REQUESTED' && order.items.length > 0 && order.totalPaise > 0
}

function paidPaise(payments: PaymentAmount[]) {
  return payments
    .filter((payment) => payment.status === 'PAID' || payment.status === 'PARTIAL')
    .reduce((sum, payment) => sum + payment.amountPaise, 0)
}

function pendingPayment<T extends PaymentAmount>(payments: T[]) {
  return payments.find((payment) => payment.status === 'AWAITING_VERIFICATION')
}

function assertBillReady(order: OrderWithPayments) {
  if (!billReady(order)) {
    throw new AppError(409, 'BILL_NOT_READY', 'Bill abhi ready nahi hai')
  }
}

function assertPayable(order: OrderWithPayments) {
  if (!PAYABLE_STATUSES.includes(order.status)) {
    throw new AppError(409, 'ORDER_NOT_PAYABLE', 'Is order par payment nahi ho sakti', {
      status: order.status,
    })
  }
}

function assertDue(order: OrderWithPayments) {
  const due = order.totalPaise - paidPaise(order.payments)
  if (order.paymentStatus === 'PAID' || due <= 0) {
    throw new AppError(409, 'ORDER_ALREADY_PAID', 'Is order ka payment ho chuka hai')
  }
  return due
}

function assertNoPending(order: OrderWithPayments) {
  const pending = pendingPayment(order.payments)
  if (pending) {
    throw new AppError(409, 'PAYMENT_PENDING', 'Payment verify hone ka wait karein', {
      paymentId: pending.id,
    })
  }
}

function buildUpiUri(upiId: string, storeName: string, amountPaise: number, orderNumber: string) {
  const params = [
    ['pa', upiId],
    ['pn', storeName],
    ['am', (amountPaise / 100).toFixed(2)],
    ['cu', 'INR'],
    ['tn', `Order ${orderNumber}`],
  ]
    .map(([key, value]) => `${key}=${encodeURIComponent(value ?? '')}`)
    .join('&')

  return `upi://pay?${params}`
}

async function syncOrderPaymentStatus(
  tx: Prisma.TransactionClient,
  orderId: string,
  totalPaise: number,
) {
  const payments = await tx.payment.findMany({
    where: { orderId },
    select: { status: true, amountPaise: true },
  })

  const paid = paidPaise(payments)
  const pending = pendingPayment(payments)

  const paymentStatus: PaymentStatus =
    totalPaise > 0 && paid >= totalPaise
      ? 'PAID'
      : pending
        ? 'AWAITING_VERIFICATION'
        : paid > 0
          ? 'PARTIAL'
          : 'UNPAID'

  await tx.order.update({ where: { id: orderId }, data: { paymentStatus } })
  return paymentStatus
}

/** Customer payment screen: amount due, UPI intent + QR, and past attempts. */
export async function getPaymentOptions(orderId: string, userId: string) {
  const order = await findOrder(orderId, userId)
  const store = await prisma.storeSettings.findUnique({ where: { id: 'singleton' } })

  const paid = paidPaise(order.payments)
  const due = Math.max(0, order.totalPaise - paid)
  const pending = pendingPayment(order.payments)
  const ready = billReady(order)
  const payable = ready && PAYABLE_STATUSES.includes(order.status)
  const canPay = payable && due > 0 && !pending

  let upi: { upiId: string; uri: string; qrDataUrl: string } | null = null

  if (canPay && store?.upiId) {
    const uri = buildUpiUri(store.upiId, store.storeName, due, order.orderNumber)
    upi = {
      upiId: store.upiId,
      uri,
      qrDataUrl: await QRCode.toDataURL(uri, { margin: 1, width: 320 }),
    }
  }

  return {
    orderId: order.id,
    orderNumber: order.orderNumber,
    status: order.status,
    billReady: ready,
    totalPaise: order.totalPaise,
    amountPaidPaise: paid,
    amountDuePaise: due,
    paymentStatus: order.paymentStatus,
    canPay,
    canPayAtShop: payable && due > 0 && !pending,
    pendingPaymentId: pending?.id ?? null,
    upi,
    payments: order.payments,
  }
}

/** Customer says "main UPI se pay kar diya" and submits the UTR. */
export async function submitUpiPayment(orderId: string, userId: string, utrReference: string) {
  const order = await findOrder(orderId, userId)

  assertBillReady(order)
  assertPayable(order)
  const due = assertDue(order)
  assertNoPending(order)

  const store = await prisma.storeSettings.findUnique({ where: { id: 'singleton' } })
  if (!store?.upiId) {
    throw new AppError(
      409,
      'UPI_NOT_CONFIGURED',
      'UPI ID abhi set nahi hai. Dukaan par cash de sakte hain.',
    )
  }

  const duplicate = await prisma.payment.findFirst({
    where: {
      utrReference: { equals: utrReference, mode: 'insensitive' },
      status: { not: 'REJECTED' },
    },
    select: { id: true },
  })
  if (duplicate) {
    throw new AppError(409, 'UTR_ALREADY_USED', 'Yeh UTR pehle use ho chuka hai')
  }

  const payment = await prisma.$transaction(async (tx) => {
    const created = await tx.payment.create({
      data: {
        orderId,
        method: 'UPI_MANUAL',
        amountPaise: due,
        status: 'AWAITING_VERIFICATION',
        utrReference,
      },
    })

    await syncOrderPaymentStatus(tx, orderId, order.totalPaise)
    await tx.order.update({
      where: { id: orderId },
      data: {
        version: { increment: 1 },
        events: {
          create: {
            actorId: userId,
            actorRole: 'CUSTOMER',
            note: `UPI payment submitted (UTR ${utrReference})`,
          },
        },
      },
    })

    return created
  })

  return { payment, order: await findOrder(orderId, userId) }
}

export async function listPayments(params: {
  status?: PaymentStatus
  page: number
  limit: number
}) {
  const where = params.status ? { status: params.status } : {}

  const [total, items] = await prisma.$transaction([
    prisma.payment.count({ where }),
    prisma.payment.findMany({
      where,
      include: paymentWithOrder,
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

/** Owner confirms the UTR; amount can be adjusted (partial payment). */
export async function verifyPayment(
  paymentId: string,
  ownerId: string,
  input: { amountPaise?: number; note?: string },
) {
  const payment = await findPayment(paymentId)

  if (payment.status !== 'AWAITING_VERIFICATION') {
    throw new AppError(409, 'PAYMENT_NOT_PENDING', 'Yeh payment verify karne layak nahi hai', {
      status: payment.status,
    })
  }

  const otherPaid = await prisma.payment.aggregate({
    where: {
      orderId: payment.orderId,
      status: { in: ['PAID', 'PARTIAL'] },
    },
    _sum: { amountPaise: true },
  })
  const due = payment.order.totalPaise - (otherPaid._sum.amountPaise ?? 0)
  const amount = input.amountPaise ?? payment.amountPaise

  if (amount > due) {
    throw new AppError(400, 'INVALID_PAYMENT_AMOUNT', 'Amount baaki rakam se zyada hai', {
      amountPaise: amount,
      duePaise: due,
    })
  }

  await prisma.$transaction(async (tx) => {
    await tx.payment.update({
      where: { id: paymentId },
      data: {
        amountPaise: amount,
        status: amount >= due ? 'PAID' : 'PARTIAL',
        verifiedById: ownerId,
        verifiedAt: new Date(),
        adjustmentNote: input.note ?? null,
      },
    })

    await syncOrderPaymentStatus(tx, payment.orderId, payment.order.totalPaise)
    await tx.order.update({
      where: { id: payment.orderId },
      data: {
        version: { increment: 1 },
        events: {
          create: {
            actorId: ownerId,
            actorRole: 'OWNER',
            note: `UPI payment verified: ${rupees(amount)}`,
          },
        },
      },
    })
  })

  return { payment: await findPayment(paymentId), order: await findOrder(payment.orderId) }
}

export async function rejectPayment(paymentId: string, ownerId: string, note?: string) {
  const payment = await findPayment(paymentId)

  if (payment.status !== 'AWAITING_VERIFICATION') {
    throw new AppError(409, 'PAYMENT_NOT_PENDING', 'Yeh payment pending nahi hai', {
      status: payment.status,
    })
  }

  await prisma.$transaction(async (tx) => {
    await tx.payment.update({
      where: { id: paymentId },
      data: {
        status: 'REJECTED',
        verifiedById: ownerId,
        verifiedAt: new Date(),
        adjustmentNote: note ?? null,
      },
    })

    await syncOrderPaymentStatus(tx, payment.orderId, payment.order.totalPaise)
    await tx.order.update({
      where: { id: payment.orderId },
      data: {
        version: { increment: 1 },
        events: {
          create: {
            actorId: ownerId,
            actorRole: 'OWNER',
            note: note ? `UPI payment rejected: ${note}` : 'UPI payment rejected',
          },
        },
      },
    })
  })

  return { payment: await findPayment(paymentId), order: await findOrder(payment.orderId) }
}

export async function refundPayment(paymentId: string, ownerId: string, note?: string) {
  const payment = await findPayment(paymentId)

  if (payment.status !== 'PAID' && payment.status !== 'PARTIAL') {
    throw new AppError(409, 'PAYMENT_NOT_REFUNDABLE', 'Sirf paid payment refund ho sakti hai', {
      status: payment.status,
    })
  }

  await prisma.$transaction(async (tx) => {
    await tx.payment.update({
      where: { id: paymentId },
      data: {
        status: 'REFUNDED',
        adjustmentNote: note ?? payment.adjustmentNote,
      },
    })

    await syncOrderPaymentStatus(tx, payment.orderId, payment.order.totalPaise)
    await tx.order.update({
      where: { id: payment.orderId },
      data: {
        version: { increment: 1 },
        events: {
          create: {
            actorId: ownerId,
            actorRole: 'OWNER',
            note: note ? `Payment refunded: ${note}` : 'Payment refunded',
          },
        },
      },
    })
  })

  return { payment: await findPayment(paymentId), order: await findOrder(payment.orderId) }
}

/** Owner records cash received at the shop (full or part payment). */
export async function payAtShop(
  orderId: string,
  ownerId: string,
  input: { amountPaise?: number; note?: string },
) {
  const order = await findOrder(orderId)

  assertBillReady(order)
  assertPayable(order)
  const due = assertDue(order)
  assertNoPending(order)

  const amount = input.amountPaise ?? due
  if (amount > due) {
    throw new AppError(400, 'INVALID_PAYMENT_AMOUNT', 'Amount baaki rakam se zyada hai', {
      amountPaise: amount,
      duePaise: due,
    })
  }

  const payment = await prisma.$transaction(async (tx) => {
    const created = await tx.payment.create({
      data: {
        orderId,
        method: 'PAY_AT_SHOP',
        amountPaise: amount,
        status: amount >= due ? 'PAID' : 'PARTIAL',
        verifiedById: ownerId,
        verifiedAt: new Date(),
        adjustmentNote: input.note ?? null,
      },
    })

    await syncOrderPaymentStatus(tx, orderId, order.totalPaise)
    await tx.order.update({
      where: { id: orderId },
      data: {
        version: { increment: 1 },
        events: {
          create: {
            actorId: ownerId,
            actorRole: 'OWNER',
            note: `Cash received at shop: ${rupees(amount)}`,
          },
        },
      },
    })

    return created
  })

  return { payment, order: await findOrder(orderId) }
}
