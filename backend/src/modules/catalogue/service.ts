import { parse } from 'csv-parse/sync'
import { z } from 'zod'
import { prisma } from '../../db.js'
import { AppError } from '../../middleware/error.js'

const PLACEHOLDER_IMAGE = '/images/placeholder.png'

function isPrismaCode(error: unknown, code: string) {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === code
}

function slugify(name: string) {
  return (
    name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'category'
  )
}

async function uniqueSlug(name: string) {
  const base = slugify(name)
  let slug = base
  let n = 2
  while (await prisma.category.findUnique({ where: { slug } })) slug = `${base}-${n++}`
  return slug
}

function searchNameFor(name: string, aliases: string[]) {
  return [name, ...aliases].join(' ').toLowerCase().replace(/\s+/g, ' ').trim()
}

function normalizeQuery(value: string) {
  return value.toLowerCase().replace(/\s+/g, ' ').trim()
}

function scoreProduct(product: { name: string; aliases: string[] }, query: string) {
  const name = product.name.toLowerCase()
  if (name === query || product.aliases.some((alias) => alias.toLowerCase() === query)) return 0
  if (name.startsWith(query) || product.aliases.some((alias) => alias.toLowerCase().startsWith(query))) return 1
  if (name.includes(query)) return 2
  return 3
}

export async function listCategories(publicOnly: boolean) {
  return prisma.category.findMany({
    where: publicOnly ? { isActive: true } : {},
    orderBy: [{ displayOrder: 'asc' }, { name: 'asc' }],
    include: { _count: { select: { products: true } } },
  })
}

export async function createCategory(input: { name: string; displayOrder: number; isActive: boolean }) {
  try {
    return await prisma.category.create({
      data: { ...input, slug: await uniqueSlug(input.name) },
    })
  } catch (error) {
    if (isPrismaCode(error, 'P2002')) {
      throw new AppError(409, 'CATEGORY_EXISTS', 'Yeh category pehle se hai')
    }
    throw error
  }
}

export async function updateCategory(
  id: string,
  input: { name?: string; displayOrder?: number; isActive?: boolean },
) {
  try {
    return await prisma.category.update({ where: { id }, data: input })
  } catch (error) {
    if (isPrismaCode(error, 'P2002')) {
      throw new AppError(409, 'CATEGORY_EXISTS', 'Yeh category pehle se hai')
    }
    if (isPrismaCode(error, 'P2025')) {
      throw new AppError(404, 'CATEGORY_NOT_FOUND', 'Category nahi mili')
    }
    throw error
  }
}

export async function listProducts(params: {
  query?: string
  category?: string
  page: number
  limit: number
  publicOnly: boolean
}) {
  const query = params.query ? normalizeQuery(params.query) : ''
  const categoryFilter = params.category
    ? { slug: params.category, ...(params.publicOnly ? { isActive: true } : {}) }
    : params.publicOnly
      ? { isActive: true }
      : undefined

  const products = await prisma.product.findMany({
    where: {
      ...(categoryFilter ? { category: categoryFilter } : {}),
      ...(query ? { searchName: { contains: query } } : {}),
    },
    include: { category: { select: { id: true, name: true, slug: true, isActive: true } } },
    orderBy: { name: 'asc' },
  })

  const sorted = query
    ? [...products].sort(
        (a, b) => scoreProduct(a, query) - scoreProduct(b, query) || a.name.localeCompare(b.name),
      )
    : products

  const total = sorted.length
  const start = (params.page - 1) * params.limit

  return {
    items: sorted.slice(start, start + params.limit),
    meta: {
      page: params.page,
      limit: params.limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / params.limit)),
    },
  }
}

export async function getProduct(id: string, publicOnly: boolean) {
  const product = await prisma.product.findUnique({
    where: { id },
    include: { category: { select: { id: true, name: true, slug: true, isActive: true } } },
  })

  if (!product || (publicOnly && !product.category.isActive)) {
    throw new AppError(404, 'PRODUCT_NOT_FOUND', 'Product nahi mila')
  }

  return product
}

async function assertCategory(categoryId: string) {
  const category = await prisma.category.findUnique({
    where: { id: categoryId },
    select: { id: true },
  })
  if (!category) throw new AppError(400, 'CATEGORY_NOT_FOUND', 'Category nahi mili')
}

export async function createProduct(input: {
  categoryId: string
  name: string
  aliases: string[]
  unit: string
  pricePaise: number
  imageUrl: string
  description?: string
  isAvailable: boolean
}) {
  await assertCategory(input.categoryId)

  try {
    return await prisma.product.create({
      data: { ...input, searchName: searchNameFor(input.name, input.aliases) },
    })
  } catch (error) {
    if (isPrismaCode(error, 'P2002')) {
      throw new AppError(409, 'PRODUCT_EXISTS', 'Yeh product pehle se hai')
    }
    throw error
  }
}

export async function updateProduct(
  id: string,
  input: {
    categoryId?: string
    name?: string
    aliases?: string[]
    unit?: string
    pricePaise?: number
    imageUrl?: string
    description?: string | null
    isAvailable?: boolean
  },
) {
  const existing = await prisma.product.findUnique({ where: { id } })
  if (!existing) throw new AppError(404, 'PRODUCT_NOT_FOUND', 'Product nahi mila')

  if (input.categoryId) await assertCategory(input.categoryId)

  const name = input.name ?? existing.name
  const aliases = input.aliases ?? existing.aliases

  try {
    return await prisma.product.update({
      where: { id },
      data: { ...input, searchName: searchNameFor(name, aliases) },
    })
  } catch (error) {
    if (isPrismaCode(error, 'P2002')) {
      throw new AppError(409, 'PRODUCT_EXISTS', 'Yeh product pehle se hai')
    }
    throw error
  }
}

const importRowSchema = z.object({
  name: z.string().trim().min(2).max(120),
  category: z.string().trim().min(2).max(60),
  unit: z.string().trim().min(1).max(30),
  price: z.string().trim().transform((value, ctx) => {
    const cleaned = value.replace(/[₹,\s]/g, '')
    if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) {
      ctx.addIssue({ code: 'custom', message: 'price rupees me likhein, jaise 45.50' })
      return z.NEVER
    }
    return Math.round(Number(cleaned) * 100)
  }),
  aliases: z.string().trim().optional().default(''),
  image_url: z.string().trim().optional().default(''),
  description: z.string().trim().optional().default(''),
})

function splitAliases(value: string) {
  return value
    .split(/[|;]/)
    .map((alias) => alias.trim().toLowerCase())
    .filter((alias) => alias.length > 0 && alias.length <= 40)
    .slice(0, 10)
}

export async function importProducts(csv: string) {
  let rows: Record<string, string>[]

  try {
    rows = parse(csv, { columns: true, skip_empty_lines: true, trim: true, bom: true })
  } catch {
    throw new AppError(400, 'INVALID_CSV', 'CSV padha nahi ja saka')
  }

  if (!rows.length) throw new AppError(400, 'EMPTY_CSV', 'CSV khali hai')

  const errors: string[] = []
  const prepared: Array<{
    name: string
    category: string
    unit: string
    pricePaise: number
    aliases: string[]
    imageUrl: string
    description: string | null
  }> = []

  rows.forEach((row, index) => {
    const result = importRowSchema.safeParse(row)
    if (!result.success) {
      errors.push(`Row ${index + 2}: ${result.error.issues[0]?.message ?? 'invalid'}`)
      return
    }
    prepared.push({
      name: result.data.name,
      category: result.data.category,
      unit: result.data.unit,
      pricePaise: result.data.price,
      aliases: splitAliases(result.data.aliases),
      imageUrl: result.data.image_url || PLACEHOLDER_IMAGE,
      description: result.data.description || null,
    })
  })

  if (errors.length) {
    throw new AppError(400, 'INVALID_CSV', 'CSV me kuch rows galat hain', errors.slice(0, 20))
  }

  const categoryNames = [...new Set(prepared.map((row) => row.category))]
  const existing = await prisma.category.findMany({ select: { id: true, name: true, slug: true } })
  const categoryIdByName = new Map(existing.map((category) => [category.name.toLowerCase(), category.id]))
  const usedSlugs = new Set(existing.map((category) => category.slug))
  let categoriesCreated = 0

  for (const name of categoryNames) {
    if (categoryIdByName.has(name.toLowerCase())) continue

    const base = slugify(name)
    let slug = base
    let n = 2
    while (usedSlugs.has(slug)) slug = `${base}-${n++}`

    const created = await prisma.category.create({ data: { name, slug } })
    usedSlugs.add(slug)
    categoryIdByName.set(name.toLowerCase(), created.id)
    categoriesCreated++
  }

  await prisma.$transaction(
    async (tx) => {
      for (const row of prepared) {
        const categoryId = categoryIdByName.get(row.category.toLowerCase())
        if (!categoryId) throw new AppError(500, 'IMPORT_FAILED', 'Category ban nahi payi')

        const searchName = searchNameFor(row.name, row.aliases)

        await tx.product.upsert({
          where: { categoryId_name_unit: { categoryId, name: row.name, unit: row.unit } },
          update: {
            aliases: row.aliases,
            pricePaise: row.pricePaise,
            imageUrl: row.imageUrl,
            description: row.description,
            searchName,
          },
          create: {
            categoryId,
            name: row.name,
            unit: row.unit,
            aliases: row.aliases,
            pricePaise: row.pricePaise,
            imageUrl: row.imageUrl,
            description: row.description,
            searchName,
          },
        })
      }
    },
    { timeout: 60_000 },
  )

  return { imported: prepared.length, categoriesCreated }
}
