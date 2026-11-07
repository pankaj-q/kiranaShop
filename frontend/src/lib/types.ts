export type Role = 'CUSTOMER' | 'OWNER'

export type User = { id: string; name: string; phone: string; role: Role }

export type OrderStatus =
  | 'REQUESTED'
  | 'PLACED'
  | 'ACCEPTED'
  | 'PREPARING'
  | 'READY_FOR_PICKUP'
  | 'COMPLETED'
  | 'REJECTED'
  | 'CANCELLED'

export type PaymentStatus =
  | 'UNPAID'
  | 'AWAITING_VERIFICATION'
  | 'PAID'
  | 'PARTIAL'
  | 'REJECTED'
  | 'REFUNDED'

export type OrderItem = {
  id: string
  productId: string | null
  nameSnapshot: string
  unitSnapshot: string
  quantityText: string | null
  unitPricePaise: number
  quantity: number
  lineTotalPaise: number
  isUnavailable: boolean
}

export type OrderEvent = {
  id: string
  fromStatus: OrderStatus | null
  toStatus: OrderStatus | null
  note: string | null
  createdAt: string
}

export type Order = {
  id: string
  orderNumber: string
  status: OrderStatus
  customerNameSnapshot: string
  phoneSnapshot: string
  customerNote: string | null
  rawList: string | null
  billNote: string | null
  subtotalPaise: number
  totalPaise: number
  paymentStatus: PaymentStatus
  scheduledFor: string | null
  quotedAt: string | null
  receiptNumber: string | null
  version: number
  createdAt: string
  updatedAt: string
  items: OrderItem[]
  events: OrderEvent[]
  payments?: { id: string; status: PaymentStatus; utrReference: string | null; amountPaise: number }[]
}

export type Product = {
  id: string
  categoryId: string
  name: string
  searchName: string
  aliases: string[]
  unit: string
  pricePaise: number
  imageUrl: string
  imageSource: string
  description: string | null
  isAvailable: boolean
}

export type Category = { id: string; name: string; slug: string; displayOrder: number; isActive: boolean }

export type StoreSettings = {
  id: string
  storeName: string
  address: string
  phone: string
  openTime: string
  closeTime: string
  timezone: string
  manualClosed: boolean
  upiId: string | null
  pickupNote: string | null
}

export type PaymentOptions = {
  billReady: boolean
  canPay: boolean
  amountDuePaise: number
  paymentStatus: PaymentStatus
  upi: { uri: string; qrDataUrl: string } | null
  payments: any[]
}

export type Receipt = {
  receiptNumber: string
  orderNumber: string
  totalPaise: number
  amountDuePaise: number
  paymentStatus: PaymentStatus
  html: string
}

export type Bill = { billText: string; whatsappUrl: string }

export type ParsedList = {
  items: { productId: string; name: string; quantity: number; quantityText: string; confidence: string }[]
  unmatched: { name: string; quantity: number; quantityText: string }[]
}
