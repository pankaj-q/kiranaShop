import { prisma } from '../../db.js'

export type CartInputItem = { productId: string; quantity: number }

export type CartLine = {
  productId: string
  quantity: number
  name: string | null
  unit: string | null
  pricePaise: number | null
  lineTotalPaise: number
  isAvailable: boolean
  removed: boolean
}

/**
 * Reads current prices from the DB and builds the bill.
 * B6 reuses this inside order creation so the saved price matches the bill.
 */
export async function priceCart(items: CartInputItem[]) {
  const merged = new Map<string, number>()

  for (const item of items) {
    merged.set(item.productId, Math.min(99, (merged.get(item.productId) ?? 0) + item.quantity))
  }

  const products = await prisma.product.findMany({
    where: { id: { in: [...merged.keys()] } },
    include: { category: { select: { isActive: true } } },
  })
  const byId = new Map(products.map((product) => [product.id, product]))

  const lines: CartLine[] = []

  for (const [productId, quantity] of merged) {
    const product = byId.get(productId)

    if (!product) {
      lines.push({
        productId,
        quantity,
        name: null,
        unit: null,
        pricePaise: null,
        lineTotalPaise: 0,
        isAvailable: false,
        removed: true,
      })
      continue
    }

    const isAvailable = product.isAvailable && product.category.isActive

    lines.push({
      productId,
      quantity,
      name: product.name,
      unit: product.unit,
      pricePaise: product.pricePaise,
      lineTotalPaise: product.pricePaise * quantity,
      isAvailable,
      removed: false,
    })
  }

  const totalPaise = lines.reduce(
    (sum, line) => (line.isAvailable ? sum + line.lineTotalPaise : sum),
    0,
  )

  return {
    items: lines,
    subtotalPaise: totalPaise,
    totalPaise,
  }
}
