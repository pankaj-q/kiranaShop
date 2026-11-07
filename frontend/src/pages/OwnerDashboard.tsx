import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../lib/api'
import { useToast } from '../state/toast'
import type { Order } from '../lib/types'
import { money, formatDate } from '../lib/api'

const STATUSES = ['', 'REQUESTED', 'PLACED', 'PREPARING', 'READY_FOR_PICKUP', 'COMPLETED']

const statusLabel: Record<string, string> = {
  REQUESTED: 'Nayi list',
  PLACED: 'Bill ready',
  PREPARING: 'Tayyar',
  READY_FOR_PICKUP: 'Ready',
  COMPLETED: 'Done',
}

export default function OwnerDashboard() {
  const toast = useToast()
  const [orders, setOrders] = useState<Order[]>([])
  const [status, setStatus] = useState('')
  const [loading, setLoading] = useState(true)

  const load = async () => {
    setLoading(true)
    try {
      const q = status ? `?status=${status}` : ''
      const data = await api<{ items: Order[] }>(`/admin/orders${q}`)
      setOrders(data.items)
    } catch (e) {
      toast.show((e as Error).message, 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [status])

  return (
    <div className="stack">
      <div className="row between">
        <h1>Orders</h1>
        <div className="row">
          <Link to="/admin/catalogue" className="btn secondary sm">Catalogue</Link>
          <Link to="/admin/settings" className="btn secondary sm">Settings</Link>
        </div>
      </div>

      <div className="row">
        <select className="input" style={{ width: 'auto' }} value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">Sabhi</option>
          {STATUSES.filter(Boolean).map((s) => (
            <option key={s} value={s}>{statusLabel[s]}</option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="center"><span className="spinner" /></div>
      ) : orders.length === 0 ? (
        <div className="empty">Koi order nahi hai</div>
      ) : (
        <div className="list">
          {orders.map((o) => (
            <Link key={o.id} to={`/admin/orders/${o.id}`} className="list-item">
              <div>
                <div style={{ fontWeight: 600 }}>
                  {o.orderNumber} · {o.customerNameSnapshot}
                </div>
                <div style={{ fontSize: 13, color: 'var(--muted)' }}>
                  {formatDate(o.createdAt)} · {o.items.length} items
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <span className="badge warn">{statusLabel[o.status] ?? o.status}</span>
                <div style={{ fontWeight: 600, marginTop: 4 }}>
                  {o.totalPaise > 0 ? money(o.totalPaise) : '—'}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
