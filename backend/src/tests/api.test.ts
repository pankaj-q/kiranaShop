import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import request from 'supertest'
import { app } from '../app.js'
import { prisma } from '../db.js'
import { hashPassword } from '../lib/password.js'

const databaseUrl = process.env.DATABASE_URL ?? ''
if (!/test/i.test(databaseUrl)) {
  throw new Error(
    'Refusing to run tests: DATABASE_URL must point to a dedicated test database (name must contain "test").',
  )
}

const OWNER_PHONE = '9000000000'
const OWNER_PASSWORD = 'TestOwner123!'
const UPI_ID = 'majitkirana@upi'
const UTR = 'TEST123456'

let owner: ReturnType<typeof request.agent>
let customer: ReturnType<typeof request.agent>
let otherCustomer: ReturnType<typeof request.agent>

let categoryId = ''
let sugarId = ''
let orderId = ''
let paymentId = ''
let receiptNumber = ''

async function resetDatabase() {
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE push_subscriptions, payments, order_events, order_items, orders, products, categories, sessions, users, store_settings RESTART IDENTITY CASCADE',
  )
}

describe('MajitKirana API', () => {
  before(async () => {
    await resetDatabase()

    await prisma.storeSettings.create({
      data: {
        id: 'singleton',
        storeName: 'MajitKirana',
        address: 'Majeet Tiraha, Ramghat Road, Jargwan',
        phone: OWNER_PHONE,
        openTime: '06:00',
        closeTime: '23:00',
        timezone: 'Asia/Kolkata',
        pickupNote: 'Order ready hone par dukaan se le lein.',
      },
    })

    await prisma.user.create({
      data: {
        name: 'Test Owner',
        phone: OWNER_PHONE,
        role: 'OWNER',
        passwordHash: hashPassword(OWNER_PASSWORD),
      },
    })

    owner = request.agent(app)
    customer = request.agent(app)
    otherCustomer = request.agent(app)
  })

  after(async () => {
    await resetDatabase().catch(() => undefined)
    await prisma.$disconnect()
  })

  it('serves health', async () => {
    const res = await request(app).get('/api/v1/healthz').expect(200)
    assert.equal(res.body.data.status, 'ok')
  })

  it('logs in the owner and creates customer sessions', async () => {
    const login = await owner
      .post('/api/v1/admin/login')
      .send({ login: OWNER_PHONE, password: OWNER_PASSWORD })
      .expect(200)
    assert.equal(login.body.data.user.role, 'OWNER')

    const first = await customer
      .post('/api/v1/customer/session')
      .send({ name: 'Pankaj', phone: '9876543210' })
      .expect(200)
    assert.equal(first.body.data.user.role, 'CUSTOMER')

    await otherCustomer
      .post('/api/v1/customer/session')
      .send({ name: 'Ravi', phone: '9876543211' })
      .expect(200)

    await request(app)
      .post('/api/v1/admin/login')
      .send({ login: OWNER_PHONE, password: 'wrong-password' })
      .expect(401)
  })

  it('creates a category and a product', async () => {
    const category = await owner
      .post('/api/v1/admin/categories')
      .send({ name: 'Test Kirana' })
      .expect(201)
    categoryId = category.body.data.id

    const product = await owner
      .post('/api/v1/admin/products')
      .send({
        categoryId,
        name: 'Sugar',
        aliases: ['chini', 'cheeni'],
        unit: '1 kg',
        pricePaise: 4500,
        imageUrl: '/images/placeholder.png',
      })
      .expect(201)
    sugarId = product.body.data.id

    await owner
      .post('/api/v1/admin/products')
      .send({
        categoryId,
        name: 'Cinnamon',
        aliases: ['dalchini'],
        unit: '100 g',
        pricePaise: 6000,
        imageUrl: '/images/placeholder.png',
      })
      .expect(201)

    assert.equal(product.body.data.searchName, 'sugar chini cheeni')
  })

  it('searches the public catalogue by Hinglish alias', async () => {
    const res = await request(app).get('/api/v1/products?query=chini').expect(200)
    assert.deepEqual(
      res.body.data.items.map((item: { name: string }) => item.name),
      ['Sugar'],
    )
    assert.equal(res.body.data.items[0].pricePaise, 4500)
  })

  it('parses a free-text list into suggestions', async () => {
    const res = await customer
      .post('/api/v1/orders/parse')
      .send({ listText: 'mujhe 2 kilo chini aur 1 shampoo chahiye' })
      .expect(200)

    assert.equal(res.body.data.items.length, 1)
    assert.equal(res.body.data.items[0].name, 'Sugar')
    assert.equal(res.body.data.items[0].quantity, 2)
    assert.equal(res.body.data.items[0].quantityText, '2 kg')
    assert.equal(res.body.data.items[0].confidence, 'high')
    assert.equal(res.body.data.unmatched.length, 1)
    assert.equal(res.body.data.unmatched[0].name, 'shampoo')
  })

  it('creates a REQUESTED order and quotes it into a bill', async () => {
    const created = await customer
      .post('/api/v1/orders/request')
      .send({ listText: '2 kilo chini', idempotencyKey: 'test-list-request-1' })
      .expect(201)
    orderId = created.body.data.id
    assert.equal(created.body.data.status, 'REQUESTED')
    assert.equal(created.body.data.totalPaise, 0)

    const replayed = await customer
      .post('/api/v1/orders/request')
      .send({ listText: 'different list', idempotencyKey: 'test-list-request-1' })
      .expect(201)
    assert.equal(replayed.body.data.id, orderId)

    const quoted = await owner
      .patch(`/api/v1/admin/orders/${orderId}/quote`)
      .send({ items: [{ productId: sugarId, quantity: 2 }], billNote: 'Aaj ka rate' })
      .expect(200)

    assert.equal(quoted.body.data.status, 'PLACED')
    assert.equal(quoted.body.data.totalPaise, 9000)
    assert.equal(quoted.body.data.items[0].nameSnapshot, 'Sugar')
  })

  it('returns the WhatsApp bill and a printable receipt', async () => {
    const bill = await customer.get(`/api/v1/orders/${orderId}/bill`).expect(200)
    assert.match(bill.body.data.billText, /Total: ₹90/)
    assert.match(bill.body.data.billText, /Sugar/)
    assert.match(bill.body.data.whatsappUrl, /^https:\/\/wa\.me\/919000000000/)

    const receipt = await customer.get(`/api/v1/orders/${orderId}/receipt`).expect(200)
    receiptNumber = receipt.body.data.receiptNumber
    assert.match(receiptNumber, /^R-\d{8}-[A-F0-9]{6}$/)
    assert.equal(receipt.body.data.totalPaise, 9000)
    assert.equal(receipt.body.data.amountDuePaise, 9000)

    const again = await customer.get(`/api/v1/orders/${orderId}/receipt`).expect(200)
    assert.equal(again.body.data.receiptNumber, receiptNumber)

    const html = await customer.get(`/api/v1/orders/${orderId}/receipt.html`).expect(200)
    assert.match(html.headers['content-type'] ?? '', /text\/html/)
    assert.match(html.text, /Bill \/ Receipt/)
    assert.match(html.text, new RegExp(receiptNumber))
  })

  it('takes a UPI payment and lets the owner verify it', async () => {
    const before = await customer.get(`/api/v1/orders/${orderId}/payment`).expect(200)
    assert.equal(before.body.data.billReady, true)
    assert.equal(before.body.data.canPay, true)
    assert.equal(before.body.data.upi, null)

    await owner
      .patch('/api/v1/admin/settings')
      .send({ upiId: UPI_ID })
      .expect(200)

    const options = await customer.get(`/api/v1/orders/${orderId}/payment`).expect(200)
    assert.equal(options.body.data.amountDuePaise, 9000)
    assert.match(options.body.data.upi.uri, /pa=majitkirana%40upi/)
    assert.match(options.body.data.upi.uri, /am=90\.00/)
    assert.match(options.body.data.upi.qrDataUrl, /^data:image\/png;base64,/)

    const bad = await customer
      .post(`/api/v1/orders/${orderId}/payments/upi`)
      .send({ utrReference: 'abc' })
      .expect(400)
    assert.equal(bad.body.error.code, 'VALIDATION_ERROR')

    const submitted = await customer
      .post(`/api/v1/orders/${orderId}/payments/upi`)
      .send({ utrReference: UTR })
      .expect(201)
    paymentId = submitted.body.data.payment.id
    assert.equal(submitted.body.data.order.paymentStatus, 'AWAITING_VERIFICATION')

    const duplicate = await customer
      .post(`/api/v1/orders/${orderId}/payments/upi`)
      .send({ utrReference: 'TEST654321' })
      .expect(409)
    assert.equal(duplicate.body.error.code, 'PAYMENT_PENDING')

    const pending = await owner
      .get('/api/v1/admin/payments?status=AWAITING_VERIFICATION')
      .expect(200)
    assert.equal(pending.body.data.items[0].id, paymentId)

    const verified = await owner
      .post(`/api/v1/admin/payments/${paymentId}/verify`)
      .send({})
      .expect(200)
    assert.equal(verified.body.data.payment.status, 'PAID')
    assert.equal(verified.body.data.order.paymentStatus, 'PAID')

    const receipt = await customer.get(`/api/v1/orders/${orderId}/receipt`).expect(200)
    assert.equal(receipt.body.data.paymentStatus, 'PAID')
    assert.equal(receipt.body.data.amountDuePaise, 0)
  })

  it('moves a paid order to READY_FOR_PICKUP', async () => {
    await owner
      .patch(`/api/v1/admin/orders/${orderId}/status`)
      .send({ status: 'PREPARING' })
      .expect(200)

    const ready = await owner
      .patch(`/api/v1/admin/orders/${orderId}/status`)
      .send({ status: 'READY_FOR_PICKUP' })
      .expect(200)

    assert.equal(ready.body.data.status, 'READY_FOR_PICKUP')
    assert.deepEqual(
      ready.body.data.events
        .map((event: { toStatus: string | null }) => event.toStatus)
        .filter(Boolean),
      ['REQUESTED', 'PLACED', 'PREPARING', 'READY_FOR_PICKUP'],
    )
  })

  it('reports push as disabled without VAPID keys', async () => {
    const config = await request(app).get('/api/v1/push/public-key').expect(200)
    assert.equal(config.body.data.enabled, false)
    assert.equal(config.body.data.publicKey, null)

    await request(app)
      .post('/api/v1/push/subscribe')
      .send({ endpoint: 'https://example.com/push', keys: { p256dh: 'x'.repeat(20), auth: 'y'.repeat(20) } })
      .expect(401)

    await customer
      .post('/api/v1/push/subscribe')
      .send({ endpoint: 'https://example.com/push', keys: { p256dh: 'x'.repeat(20), auth: 'y'.repeat(20) } })
      .expect(503)
  })

  it('enforces authz and validation', async () => {
    await otherCustomer.get(`/api/v1/orders/${orderId}/receipt`).expect(404)
    await owner
      .post('/api/v1/orders/request')
      .send({ listText: '2 chini' })
      .expect(403)
    await request(app).get('/api/v1/admin/settings').expect(401)
    await customer.post('/api/v1/orders/parse').send({ listText: '' }).expect(400)
    await owner
      .patch('/api/v1/admin/settings')
      .send({ upiId: 'not-a-upi' })
      .expect(400)
  })
})
