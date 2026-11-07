import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { api, ApiError } from '../lib/api'
import { useToast } from '../state/toast'
import type { Order, Product } from '../lib/types'
import { money, formatDate } from '../lib/api'
import { ArrowLeft } from 'lucide-react'
import NumberedList from '../components/NumberedList'

type QuoteLine = {
  productId?: string
  name: string
  unit: string
  quantity: number
  quantityText?: string
  pricePaise: number
  lineTotalPaise: number
}

export default function OwnerOrderDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const toast = useToast()
  const [order, setOrder] = useState<Order | null>(null)
  const [products, setProducts] = useState<Product[]>([])
  const [search, setSearch] = useState('')
  const [lines, setLines] = useState<QuoteLine[]>([])
  const [billNote, setBillNote] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const load = async () => {
    if (!id) return
    setLoading(true)
    try {
      const [o, p] = await Promise.all([
        api<Order>(`/admin/orders/${id}`),
        api<{ items: Product[] }>('/admin/products?limit=200'),
      ])
      setOrder(o)
      setProducts(p.items)
      setBillNote(o.billNote ?? '')
    } catch (e) {
      toast.show((e as ApiError).message, 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [id])

  const addProduct = (p: Product) => {
    setLines((prev) => {
      const existing = prev.find((l) => l.productId === p.id)
      if (existing) {
        return prev.map((l) =>
          l.productId === p.id
            ? { ...l, quantity: l.quantity + 1, lineTotalPaise: (l.quantity + 1) * l.pricePaise }
            : l,
        )
      }
      return [
        ...prev,
        {
          productId: p.id,
          name: p.name,
          unit: p.unit,
          quantity: 1,
          pricePaise: p.pricePaise,
          lineTotalPaise: p.pricePaise,
        },
      ]
    })
  }

  const updateLine = (idx: number, patch: Partial<QuoteLine>) => {
    setLines((prev) =>
      prev.map((l, i) => {
        if (i !== idx) return l
        const next = { ...l, ...patch }
        next.lineTotalPaise = next.pricePaise * next.quantity
        return next
      }),
    )
  }

  const removeLine = (idx: number) => setLines((prev) => prev.filter((_, i) => i !== idx))

  const submitQuote = async () => {
    if (!id || lines.length === 0) return
    setSaving(true)
    try {
      await api(`/admin/orders/${id}/quote`, {
        method: 'PATCH',
        body: JSON.stringify({
          items: lines.map((l) => ({
            productId: l.productId,
            name: l.productId ? undefined : l.name,
            unit: l.productId ? undefined : l.unit,
            quantity: l.quantity,
            quantityText: l.quantityText,
            pricePaise: l.pricePaise,
            lineTotalPaise: l.lineTotalPaise,
          })),
          billNote: billNote || undefined,
        }),
      })
      toast.show('Bill ban gaya')
      setLines([])
      load()
    } catch (e) {
      toast.show((e as ApiError).message, 'error')
    } finally {
      setSaving(false)
    }
  }

  const changeStatus = async (status: string) => {
    if (!id) return
    try {
      await api(`/admin/orders/${id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      })
      toast.show('Status update ho gaya')
      load()
    } catch (e) {
      toast.show((e as ApiError).message, 'error')
    }
  }

  const payAtShop = async () => {
    if (!id || !order) return
    try {
      await api(`/admin/orders/${id}/pay-at-shop`, {
        method: 'POST',
        body: JSON.stringify({ amountPaise: order.totalPaise }),
      })
      toast.show('Pay at shop recorded')
      load()
    } catch (e) {
      toast.show((e as ApiError).message, 'error')
    }
  }

  const verifyPayment = async (paymentId: string) => {
    try {
      await api(`/admin/payments/${paymentId}/verify`, { method: 'POST', body: JSON.stringify({}) })
      toast.show('Payment verified')
      load()
    } catch (e) {
      toast.show((e as ApiError).message, 'error')
    }
  }

  const rejectPayment = async (paymentId: string) => {
    try {
      await api(`/admin/payments/${paymentId}/reject`, { method: 'POST', body: JSON.stringify({ note: 'Rejected' }) })
      toast.show('Payment reject ho gaya')
      load()
    } catch (e) {
      toast.show((e as ApiError).message, 'error')
    }
  }

  if (loading) return <div className="center"><span className="spinner" /></div>
  if (!order) return <div className="empty">Order nahi mila</div>

  const filteredProducts = products.filter((p) =>
    (p.name + ' ' + p.aliases.join(' ')).toLowerCase().includes(search.toLowerCase()),
  )

  const pendingPayments = (order.payments ?? []).filter((p) => p.status === 'AWAITING_VERIFICATION')

  return (
    <div className="stack">
      <button className="btn secondary sm" onClick={() => navigate(-1)} style={{ alignSelf: 'flex-start' }}>
        <ArrowLeft size={16} /> Wapas
      </button>

      <div className="card">
        <div className="row between">
          <div>
            <h1>{order.orderNumber}</h1>
            <p style={{ color: 'var(--muted)', margin: 0 }}>
              {formatDate(order.createdAt)}
            </p>
          </div>
          <span className="badge warn">{order.status}</span>
        </div>
        <div style={{ marginTop: 12, padding: 10, background: 'var(--primary-soft)', borderRadius: 8 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--primary-dark)', marginBottom: 2 }}>Customer</div>
          <div style={{ fontWeight: 700 }}>{order.customerNameSnapshot}</div>
          <div style={{ fontSize: 13, color: 'var(--muted)' }}>{order.phoneSnapshot}</div>
        </div>
      </div>

      {order.rawList && (
        <div className="card">
          <h2>Order list</h2>
          <div style={{ marginBottom: 8, fontSize: 13, color: 'var(--muted)' }}>
            <strong>{order.customerNameSnapshot}</strong> · {formatDate(order.createdAt)}
          </div>
          <NumberedList text={order.rawList} />
        </div>
      )}

      {order.items.length > 0 && (
        <div className="card">
          <h2>Bill items</h2>
          <table className="table">
            <tbody>
              {order.items.map((it) => (
                <tr key={it.id}>
                  <td>{it.nameSnapshot}</td>
                  <td>{it.quantityText ?? it.quantity}</td>
                  <td>{money(it.lineTotalPaise)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="row between" style={{ marginTop: 8, fontWeight: 700 }}>
            <span>Total</span>
            <span>{money(order.totalPaise)}</span>
          </div>
        </div>
      )}

      {(order.status === 'REQUESTED' || order.status === 'PLACED') && (
        <div className="card stack">
          <h2>Bill banao / update</h2>
          <input
            className="input"
            placeholder="Product search (chini, tel...)"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <div style={{ maxHeight: 160, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 8 }}>
            {filteredProducts.slice(0, 20).map((p) => (
              <div
                key={p.id}
                className="list-item"
                style={{ cursor: 'pointer' }}
                onClick={() => addProduct(p)}
              >
                <span>{p.name} <span style={{ color: 'var(--muted)', fontSize: 12 }}>({p.unit})</span></span>
                <span style={{ fontWeight: 600 }}>{money(p.pricePaise)}</span>
              </div>
            ))}
          </div>

          {lines.length > 0 && (
            <div className="stack">
              {lines.map((l, idx) => (
                <div key={idx} className="row" style={{ alignItems: 'center' }}>
                  <div style={{ flex: 1, fontWeight: 600 }}>{l.name}</div>
                  <input
                    className="input"
                    type="number"
                    min={1}
                    style={{ width: 60 }}
                    value={l.quantity}
                    onChange={(e) => updateLine(idx, { quantity: Number(e.target.value) || 1 })}
                  />
                  <input
                    className="input"
                    type="number"
                    style={{ width: 90 }}
                    value={l.pricePaise}
                    onChange={(e) => updateLine(idx, { pricePaise: Number(e.target.value) || 0 })}
                  />
                  <span style={{ width: 80, textAlign: 'right' }}>{money(l.lineTotalPaise)}</span>
                  <button className="icon-btn" onClick={() => removeLine(idx)}>✕</button>
                </div>
              ))}
              <div className="row between" style={{ fontWeight: 700 }}>
                <span>Total</span>
                <span>{money(lines.reduce((s, l) => s + l.lineTotalPaise, 0))}</span>
              </div>
            </div>
          )}

          <div>
            <label className="label">Bill note</label>
            <input className="input" value={billNote} onChange={(e) => setBillNote(e.target.value)} />
          </div>

          <button className="btn" disabled={saving || lines.length === 0} onClick={submitQuote}>
            {saving ? 'Save...' : 'Bill save karein'}
          </button>
        </div>
      )}

      <div className="card stack">
        <h2>Status</h2>
        <div className="row">
          {['ACCEPTED', 'PREPARING', 'READY_FOR_PICKUP', 'COMPLETED', 'REJECTED'].map((s) => (
            <button
              key={s}
              className="btn secondary sm"
              disabled={order.status === s}
              onClick={() => changeStatus(s)}
            >
              {s.replace(/_/g, ' ')}
            </button>
          ))}
        </div>
      </div>

      {pendingPayments.length > 0 && (
        <div className="card stack">
          <h2>UPI verify karein</h2>
          {pendingPayments.map((p) => (
            <div key={p.id} className="row between">
              <div>
                <div style={{ fontWeight: 600 }}>{p.utrReference}</div>
                <div style={{ fontSize: 13, color: 'var(--muted)' }}>{money(p.amountPaise)}</div>
              </div>
              <div className="row">
                <button className="btn sm" onClick={() => verifyPayment(p.id)}>Verify</button>
                <button className="btn danger sm" onClick={() => rejectPayment(p.id)}>Reject</button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="card stack">
        <h2>Payment</h2>
        <button className="btn secondary" onClick={payAtShop}>
          Pay at shop record karein
        </button>
      </div>

      {order.receiptNumber && (
        <a
          href={`${import.meta.env.VITE_API_URL ?? 'http://localhost:4000/api/v1'}/admin/orders/${id}/receipt.html`}
          target="_blank"
          rel="noreferrer"
          className="btn ghost"
        >
          Printable receipt
        </a>
      )}
    </div>
  )
}
