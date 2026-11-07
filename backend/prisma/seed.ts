import { prisma } from '../src/db.js'
import { hashPassword } from '../src/lib/password.js'
import { seedCatalogue } from './catalogue.js'

const adminLogin = process.env.ADMIN_LOGIN
const adminPassword = process.env.ADMIN_PASSWORD

if (!adminLogin || !adminPassword) {
  console.error('ADMIN_LOGIN and ADMIN_PASSWORD are required to seed the owner account.')
  process.exit(1)
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

function searchNameFor(name: string, aliases: string[]) {
  return [name, ...aliases].join(' ').toLowerCase().replace(/\s+/g, ' ').trim()
}

function assertSeedDataIsClean() {
  const categories = new Set<string>()
  const products = new Set<string>()

  for (const group of seedCatalogue) {
    if (categories.has(group.name)) {
      throw new Error(`Duplicate seed category: ${group.name}`)
    }
    categories.add(group.name)

    for (const [name, unit] of group.items) {
      const key = `${group.name}|${name}|${unit}`
      if (products.has(key)) throw new Error(`Duplicate seed product: ${key}`)
      products.add(key)
    }
  }
}

async function main() {
  assertSeedDataIsClean()

  await prisma.storeSettings.upsert({
    where: { id: 'singleton' },
    update: {},
    create: {
      id: 'singleton',
      storeName: 'MajitKirana',
      address: 'Majeet Tiraha, Ramghat Road, Jargwan',
      phone: adminLogin,
      openTime: '06:00',
      closeTime: '23:00',
      timezone: 'Asia/Kolkata',
      pickupNote: 'Order ready hone par dukaan se le lein.',
    },
  })

  // Fill the shop phone only if it is still empty (don't overwrite owner edits).
  await prisma.storeSettings.updateMany({
    where: { id: 'singleton', phone: '' },
    data: { phone: adminLogin },
  })

  const owner = await prisma.user.upsert({
    where: { phone: adminLogin },
    update: {
      name: 'MajitKirana Owner',
      role: 'OWNER',
      passwordHash: hashPassword(adminPassword),
    },
    create: {
      name: 'MajitKirana Owner',
      phone: adminLogin,
      role: 'OWNER',
      passwordHash: hashPassword(adminPassword),
    },
  })

  const before = await prisma.product.count()

  for (const group of seedCatalogue) {
    // `update: {}` keeps owner edits (prices, aliases, availability) intact.
    const category = await prisma.category.upsert({
      where: { name: group.name },
      update: {},
      create: {
        name: group.name,
        slug: slugify(group.name),
        displayOrder: group.displayOrder,
        isActive: true,
      },
    })

    for (const [name, unit, priceRupees, aliases = []] of group.items) {
      await prisma.product.upsert({
        where: {
          categoryId_name_unit: {
            categoryId: category.id,
            name,
            unit,
          },
        },
        update: {},
        create: {
          categoryId: category.id,
          name,
          searchName: searchNameFor(name, aliases),
          aliases,
          unit,
          pricePaise: Math.round(priceRupees * 100),
          imageUrl: '/images/placeholder.png',
          imageSource: 'SEEDED',
          isAvailable: true,
        },
      })
    }
  }

  const after = await prisma.product.count()
  console.log(`Seeded store settings and owner ${owner.phone}`)
  console.log(`Catalogue: ${after - before} new products added, ${after} products total`)
}

main()
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
