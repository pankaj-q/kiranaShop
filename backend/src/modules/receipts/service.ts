import { randomBytes } from 'node:crypto'
import type { Prisma } from '../../generated/prisma/client.js'
import type { PaymentStatus } from '../../generated/prisma/enums.js'
import { prisma } from '../../db.js'
import { istDateStamp, istDateTime } from '../../lib/ist.js'
import { rupees } from '../../lib/money.js'
import { AppError } from '../../middleware/error.js'

const receiptInclude = {
  items: true,
  payments: { orderBy: { createdAt: 'desc' as const } },
} satisfies Prisma.OrderInclude

type ReceiptOrder = Prisma.OrderGetPayload<{ include: typeof receiptInclude }>

const PAYMENT_LABELS: Record<PaymentStatus, string> = {
  UNPAID: 'Baaki',
  AWAITING_VERIFICATION: 'Verify hone ka wait',
  PAID: 'Paid',
  PARTIAL: 'Part payment',
  REJECTED: 'Rejected',
  REFUNDED: 'Refunded',
}

function isPrismaCode(error: unknown, code: string) {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === code
}

function newReceiptNumber() {
  return `R-${istDateStamp()}-${randomBytes(3).toString('hex').toUpperCase()}`
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => {
    switch (char) {
      case '&':
        return '&amp;'
      case '<':
        return '&lt;'
      case '>':
        return '&gt;'
      case '"':
        return '&quot;'
      default:
        return '&#39;'
    }
  })
}

function paidPaise(order: ReceiptOrder) {
  return order.payments
    .filter((payment) => payment.status === 'PAID' || payment.status === 'PARTIAL')
    .reduce((sum, payment) => sum + payment.amountPaise, 0)
}

async function ensureReceiptNumber(order: ReceiptOrder) {
  if (order.receiptNumber) return order.receiptNumber

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const updated = await prisma.order.update({
        where: { id: order.id },
        data: { receiptNumber: newReceiptNumber() },
        select: { receiptNumber: true },
      })
      if (updated.receiptNumber) return updated.receiptNumber
    } catch (error) {
      if (!isPrismaCode(error, 'P2002')) throw error
      // Receipt number collision — try another one.
    }
  }

  throw new AppError(500, 'RECEIPT_NUMBER_FAILED', 'Receipt number banane me dikkat aayi')
}

function receiptHtml(input: {
  receiptNumber: string
  order: ReceiptOrder
  store: {
    storeName: string
    address: string
    phone: string
    pickupNote: string | null
    upiId: string | null
  }
  issuedAt: string
  paidPaise: number
  duePaise: number
}) {
  const { receiptNumber, order, store, issuedAt, paidPaise, duePaise } = input

  const rows = order.items
    .map((item) => {
      const quantity = item.quantityText ?? `${item.quantity} x ${item.unitSnapshot}`
      return `<tr>
        <td>${escapeHtml(item.nameSnapshot)}</td>
        <td class="qty">${escapeHtml(quantity)}</td>
        <td class="num">${rupees(item.unitPricePaise)}</td>
        <td class="num">${rupees(item.lineTotalPaise)}</td>
      </tr>`
    })
    .join('')

  const paymentRows = order.payments
    .map((payment) => {
      const method = payment.method === 'UPI_MANUAL' ? 'UPI' : 'Cash at shop'
      const reference = payment.utrReference ? ` · ${escapeHtml(payment.utrReference)}` : ''
      return `<li>${method} — ${rupees(payment.amountPaise)} — ${PAYMENT_LABELS[payment.status]}${reference}</li>`
    })
    .join('')

  return `<!doctype html>
<html lang="hi">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(receiptNumber)} — ${escapeHtml(store.storeName)}</title>
<style>
  @page { size: A4; margin: 14mm; }
  * { box-sizing: border-box; }
  body { margin: 0; background: #f3f4f6; color: #111827; font-family: system-ui, -apple-system, "Segoe UI", Arial, sans-serif; }
  .sheet { max-width: 760px; margin: 24px auto; padding: 28px; background: #fff; border: 1px solid #e5e7eb; border-radius: 12px; }
  h1 { margin: 0 0 4px; font-size: 26px; }
  .muted { color: #6b7280; font-size: 13px; }
  .head { display: flex; justify-content: space-between; gap: 20px; padding-bottom: 16px; border-bottom: 2px solid #111827; }
  .head-right { text-align: right; }
  .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 24px; margin: 16px 0; font-size: 14px; }
  .meta span { color: #6b7280; }
  table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 14px; }
  th, td { padding: 9px 8px; border-bottom: 1px solid #e5e7eb; text-align: left; vertical-align: top; }
  th { background: #f9fafb; font-size: 12px; text-transform: uppercase; letter-spacing: .04em; color: #4b5563; }
  .num, .qty { text-align: right; white-space: nowrap; }
  .totals { width: 300px; margin: 16px 0 0 auto; font-size: 14px; }
  .totals div { display: flex; justify-content: space-between; padding: 5px 0; }
  .totals .grand { margin-top: 6px; padding-top: 9px; border-top: 2px solid #111827; font-size: 18px; font-weight: 700; }
  .pill { display: inline-block; padding: 2px 9px; border-radius: 999px; background: #f3f4f6; font-size: 12px; font-weight: 600; }
  .note { margin-top: 18px; padding: 12px 14px; background: #f9fafb; border-left: 3px solid #111827; font-size: 13px; }
  .foot { margin-top: 26px; padding-top: 14px; border-top: 1px solid #e5e7eb; font-size: 12px; color: #6b7280; text-align: center; }
  .print-hint { max-width: 760px; margin: 14px auto 0; font-size: 12px; color: #6b7280; text-align: center; }
  @media print {
    body { background: #fff; }
    .sheet { margin: 0; padding: 0; border: 0; border-radius: 0; max-width: none; }
    .print-hint { display: none; }
  }
</style>
</head>
<body>
  <div class="sheet">
    <div class="head">
      <div>
        <h1>${escapeHtml(store.storeName)}</h1>
        <div class="muted">${escapeHtml(store.address)}</div>
        <div class="muted">${store.phone ? `Phone: ${escapeHtml(store.phone)}` : ''}</div>
      </div>
      <div class="head-right">
        <strong>Bill / Receipt</strong>
        <div class="muted">${escapeHtml(receiptNumber)}</div>
      </div>
    </div>

    <div class="meta">
      <div><span>Order:</span> ${escapeHtml(order.orderNumber)}</div>
      <div><span>Date:</span> ${escapeHtml(issuedAt)}</div>
      <div><span>Customer:</span> ${escapeHtml(order.customerNameSnapshot)}</div>
      <div><span>Phone:</span> ${escapeHtml(order.phoneSnapshot)}</div>
      <div><span>Status:</span> ${escapeHtml(order.status.replaceAll('_', ' '))}</div>
      <div><span>Payment:</span> <span class="pill">${PAYMENT_LABELS[order.paymentStatus]}</span></div>
    </div>

    <table>
      <thead>
        <tr><th>Item</th><th class="qty">Qty</th><th class="num">Rate</th><th class="num">Amount</th></tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>

    <div class="totals">
      <div><span>Subtotal</span><span>${rupees(order.subtotalPaise)}</span></div>
      <div class="grand"><span>Total</span><span>${rupees(order.totalPaise)}</span></div>
      <div><span>Paid</span><span>${rupees(paidPaise)}</span></div>
      <div><span>Due</span><span>${rupees(duePaise)}</span></div>
    </div>

    ${order.billNote ? `<div class="note">${escapeHtml(order.billNote)}</div>` : ''}
    ${paymentRows ? `<div class="note"><strong>Payments</strong><ul>${paymentRows}</ul></div>` : ''}
    ${
      duePaise > 0 && store.upiId
        ? `<div class="note">UPI se pay karne ke liye: <strong>${escapeHtml(store.upiId)}</strong></div>`
        : ''
    }
    ${
      store.pickupNote
        ? `<div class="note">${escapeHtml(store.pickupNote)}</div>`
        : ''
    }

    <div class="foot">
      Yeh computer-generated bill hai. Dhanyavaad!<br />
      ${escapeHtml(store.storeName)} · ${escapeHtml(store.address)}
    </div>
  </div>
  <div class="print-hint">Print / Save PDF ke liye Ctrl + P (Mac par Cmd + P) dabayein.</div>
</body>
</html>`
}

export async function getReceipt(orderId: string, userId?: string) {
  const order = await prisma.order.findFirst({
    where: { id: orderId, ...(userId ? { userId } : {}) },
    include: receiptInclude,
  })

  if (!order) throw new AppError(404, 'ORDER_NOT_FOUND', 'Order nahi mila')

  if (order.status === 'REQUESTED' || !order.items.length || order.totalPaise <= 0) {
    throw new AppError(409, 'BILL_NOT_READY', 'Bill abhi ready nahi hai')
  }

  const store = await prisma.storeSettings.findUnique({ where: { id: 'singleton' } })
  const storeView = {
    storeName: store?.storeName ?? 'MajitKirana',
    address: store?.address ?? '',
    phone: store?.phone ?? '',
    pickupNote: store?.pickupNote ?? null,
    upiId: store?.upiId ?? null,
  }

  const receiptNumber = await ensureReceiptNumber(order)
  const paid = paidPaise(order)
  const due = Math.max(0, order.totalPaise - paid)
  const issuedAt = istDateTime(new Date())

  const html = receiptHtml({
    receiptNumber,
    order,
    store: storeView,
    issuedAt,
    paidPaise: paid,
    duePaise: due,
  })

  return {
    receiptNumber,
    orderNumber: order.orderNumber,
    issuedAt,
    store: storeView,
    customer: {
      name: order.customerNameSnapshot,
      phone: order.phoneSnapshot,
    },
    status: order.status,
    paymentStatus: order.paymentStatus,
    items: order.items.map((item) => ({
      name: item.nameSnapshot,
      unit: item.unitSnapshot,
      quantity: item.quantity,
      quantityText: item.quantityText,
      unitPricePaise: item.unitPricePaise,
      lineTotalPaise: item.lineTotalPaise,
    })),
    subtotalPaise: order.subtotalPaise,
    totalPaise: order.totalPaise,
    amountPaidPaise: paid,
    amountDuePaise: due,
    billNote: order.billNote,
    payments: order.payments.map((payment) => ({
      method: payment.method,
      status: payment.status,
      amountPaise: payment.amountPaise,
      utrReference: payment.utrReference,
      createdAt: payment.createdAt,
    })),
    html,
  }
}

export async function getReceiptHtml(orderId: string, userId?: string) {
  return (await getReceipt(orderId, userId)).html
}
