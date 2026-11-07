import { prisma } from '../src/db.js'
import { hashPassword } from '../src/lib/password.js'

const adminLogin = process.env.ADMIN_LOGIN
const adminPassword = process.env.ADMIN_PASSWORD

if (!adminLogin || !adminPassword) {
  console.error('ADMIN_LOGIN and ADMIN_PASSWORD are required to seed the owner account.')
  process.exit(1)
}

async function main() {
  await prisma.storeSettings.upsert({
    where: { id: 'singleton' },
    update: {},
    create: {
      id: 'singleton',
      storeName: 'MajitKirana',
      address: 'Majeet Tiraha, Ramghat Road, Jargwan',
      phone: '',
      openTime: '06:00',
      closeTime: '23:00',
      timezone: 'Asia/Kolkata',
      pickupNote: 'Order ready hone par dukaan se le lein.',
    },
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

  console.log(`Seeded store settings and owner ${owner.phone}`)
}

main()
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
