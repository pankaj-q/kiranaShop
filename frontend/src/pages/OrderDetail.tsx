import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { api, ApiError } from '../lib/api'
import { useToast } from '../hooks/useToast'
import type { Order, PaymentOptions, Bill, Receipt } from '../lib/types'
import { money, formatDate } from '../lib/api'
import NumberedList from '../components/NumberedList'
import { ArrowLeft, X, Edit3, Save } from 'lucide-react'

const statusLabel: Record<string, string> = {
  REQUESTED: 'List bheji gayi',
  PLACED: 'Bill ready',
  ACCEPTED: 'Accepted',
  PREPARING: 'Tayyar ho raha hai',
  READY_FOR_PICKUP: 'Ready for pickup!',
  COMPLETED: 'Complete',
  REJECTED: 'Reject',
  CANCELLED: 'Cancel',
}

export default function OrderDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const toast = useToast()
  const [order, setOrder] = useState<Order | null>(null)
  const [loading, setLoading] = useState(true)
  const [utr, setUtr] = useState('')
  const [paying, setPaying] = useState(false)
  const [paymentOpts, setPaymentOpts] = useState<PaymentOptions | null>(null)
  const [bill, setBill] = useState<Bill | null>(null)
  const [receipt, setReceipt] = useState<Receipt | null>(null)
  const [editing, setEditing] = useState(false)
  const [editText, setEditText] = useState('')
  const [savingEdit, setSavingEdit] = useState(false)

  const load = async (silent = false) => {
    if (!id) return
    if (!silent) setLoading(true)
    try {
      const o = await api<Order>(`/orders/${id}`)
      setOrder(o)
      setEditText(o.rawList ?? '')
      const b = await api<Bill>(`/orders/${id}/bill`).catch(() => null)
      setBill(b)
      const p = await api<PaymentOptions>(`/orders/${id}/payment`).catch(() => null)
      setPaymentOpts(p)
    } catch (e) {
      toast.show((e as ApiError).message, 'error')
    } finally {
      if (!silent) setLoading(false)
    }
  }

  useEffect(() => {
    load()
    const timer = setInterval(() => load(true), 12000)
    return () => clearInterval(timer)
  }, [id])

  const title = order?.rawList ? splitFirst(order.rawList) : order?.orderNumber ?? ''

  const cancel = async () => {
    if (!id) return
    try {
      await api(`/orders/${id}/cancel`, { method: 'POST', body: JSON.stringify({}) })
      toast.show('Order cancel ho gaya')
      load()
    } catch (e) {
      toast.show((e as ApiError).message, 'error')
    }
  }

  const saveEdit = async () => {
    if (!id || !editText.trim()) return
    setSavingEdit(true)
    try {
      await api(`/orders/${id}/request`, {
        method: 'PATCH',
        body: JSON.stringify({ listText: editText }),
      })
      toast.show('List update ho gayi')
      setEditing(false)
      load()
    } catch (e) {
      toast.show((e as ApiError).message, 'error')
    } finally {
      setSavingEdit(false)
    }
  }

  const submitUpi = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!id || !utr.trim()) return
    setPaying(true)
    try {
      await api(`/orders/${id}/payments/upi`, { method: 'POST', body: JSON.stringify({ utrReference: utr }) })
      toast.show('UTR submit ho gaya, owner verify karega')
      setUtr('')
      load()
    } catch (e) {
      toast.show((e as ApiError).message, 'error')
    } finally {
      setPaying(false)
    }
  }

  const loadReceipt = async () => {
    if (!id) return
    try {
      const r = await api<Receipt>(`/orders/${id}/receipt`)
      setReceipt(r)
    } catch (e) {
      toast.show((e as ApiError).message, 'error')
    }
  }

  if (loading) return <div className="center"><span className="spinner" /></div>
  if (!order) return <div className="empty">Order nahi mila</div>

  const canCancel = order.status === 'REQUESTED' || order.status === 'PLACED'
  const canEdit = order.status === 'REQUESTED' || order.status === 'PLACED' || order.status === 'ACCEPTED'

  return (
    <div className="stack">
      <button className="btn secondary sm" onClick={() => navigate(-1)} style={{ alignSelf: 'flex-start' }}>
        <ArrowLeft size={16} /> Wapas
      </button>

      <div className="card">
        <div className="row between">
          <div>
            <h1>{title}</h1>
            <p style={{ color: 'var(--muted)', margin: 0 }}>{order.orderNumber} · {formatDate(order.createdAt)}</p>
          </div>
          <span className={`badge ${order.status === 'READY_FOR_PICKUP' ? 'success' : order.status === 'CANCELLED' || order.status === 'REJECTED' ? 'danger' : 'warn'}`}>
            {statusLabel[order.status]}
          </span>
        </div>
        {order.rawList && !editing && (
          <div style={{ marginTop: 12, padding: 10, background: 'var(--surface-2)', borderRadius: 8 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', marginBottom: 4 }}>Aapki list</div>
            <NumberedList text={order.rawList} />
          </div>
        )}
        {editing && (
          <div style={{ marginTop: 12 }} className="stack">
            <textarea className="input" value={editText} onChange={(e) => setEditText(e.target.value)} />
            <div className="row">
              <button className="btn" onClick={saveEdit} disabled={savingEdit || !editText.trim()}>
                <Save size={16} /> {savingEdit ? 'Save...' : 'Save'}
              </button>
              <button className="btn secondary" onClick={() => { setEditing(false); setEditText(order.rawList ?? '') }}>
                Cancel
              </button>
            </div>
          </div>
        )}
        {canEdit && !editing && (
          <button className="btn ghost sm" onClick={() => setEditing(true)} style={{ marginTop: 8 }}>
            <Edit3 size={16} /> List edit karein
          </button>
        )}
        {order.status === 'REQUESTED' && (
          <p style={{ marginTop: 8, color: 'var(--muted)' }}>
            Aapki list shop ko bhej di gayi hai. Owner bill bana raha hai.
          </p>
        )}
        {order.billNote && <p style={{ marginTop: 8 }}>Note: {order.billNote}</p>}
        {order.customerNote && <p style={{ marginTop: 4, color: 'var(--muted)' }}>Aapka note: {order.customerNote}</p>}
      </div>

      {order.items.length > 0 && (
        <div className="card">
          <h2>Bill</h2>
          <table className="table">
            <thead>
              <tr>
                <th>Item</th>
                <th>Qty</th>
                <th>Price</th>
              </tr>
            </thead>
            <tbody>
              {order.items.map((it) => (
                <tr key={it.id}>
                  <td>
                    {it.nameSnapshot} <span style={{ color: 'var(--muted)', fontSize: 12 }}>({it.unitSnapshot})</span>
                  </td>
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
          {bill?.whatsappUrl && (
            <a
              href={bill.whatsappUrl}
              target="_blank"
              rel="noreferrer"
              className="btn secondary sm"
              style={{ marginTop: 8 }}
            >
              WhatsApp par bhejein
            </a>
          )}
        </div>
      )}

      {canCancel && (
        <button className="btn danger" onClick={cancel}>
          <X size={16} /> Order cancel karein
        </button>
      )}

      {paymentOpts && (paymentOpts.billReady || paymentOpts.canPay) && (
        <div className="card stack">
          <h2>Payment</h2>
          <p>Due: <strong>{money(paymentOpts.amountDuePaise)}</strong> · Status: {paymentOpts.paymentStatus}</p>
          {paymentOpts.upi && (
            <div className="stack" style={{ alignItems: 'center' }}>
              <img src={paymentOpts.upi.qrDataUrl} alt="UPI QR" style={{ width: 200, height: 200 }} />
              <p style={{ fontSize: 13, color: 'var(--muted)', textAlign: 'center' }}>
                Scan karke pay karein, phir UTR yahan likhein.
              </p>
              <form className="row" onSubmit={submitUpi} style={{ width: '100%' }}>
                <input
                  className="input"
                  placeholder="UTR number"
                  value={utr}
                  onChange={(e) => setUtr(e.target.value)}
                />
                <button className="btn" disabled={paying || !utr.trim()}>
                  {paying ? '...' : 'Submit'}
                </button>
              </form>
            </div>
          )}
          {!paymentOpts.upi && paymentOpts.canPay && (
            <p style={{ color: 'var(--muted)' }}>Owner UPI ID set nahi hai. Dukaan par pay karein.</p>
          )}
        </div>
      )}

      {order.paymentStatus === 'PAID' || order.receiptNumber ? (
        <div className="card stack">
          <h2>Receipt</h2>
          {receipt ? (
            <div>
              <p>Receipt: <strong>{receipt.receiptNumber}</strong></p>
              <p>Total: {money(receipt.totalPaise)} · Due: {money(receipt.amountDuePaise)}</p>
            </div>
          ) : (
            <button className="btn secondary" onClick={loadReceipt}>
              Receipt dekhein
            </button>
          )}
          {order.receiptNumber && (
            <a
              href={`${import.meta.env.VITE_API_URL ?? 'http://localhost:4000/api/v1'}/orders/${id}/receipt.html`}
              target="_blank"
              rel="noreferrer"
              className="btn ghost sm"
            >
              Printable bill
            </a>
          )}
        </div>
      ) : null}
    </div>
  )
}

function splitFirst(text: string): string {
  const items = text.replace(/\s*\baur\b\s*/gi, ', ').split(/[\n,;]+/).map((s) => s.trim()).filter(Boolean)
  return items[0] ?? text.slice(0, 40)
}
