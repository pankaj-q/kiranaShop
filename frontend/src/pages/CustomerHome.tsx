import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../lib/api'
import { useToast } from '../state/toast'
import type { Order } from '../lib/types'
import { formatDate } from '../lib/api'
import { splitList } from '../components/NumberedList'
import { Plus } from 'lucide-react'

const statusLabel: Record<string, string> = {
  REQUESTED: 'List bheji gayi',
  PLACED: 'Bill ready',
  ACCEPTED: 'Accepted',
  PREPARING: 'Tayyar ho raha hai',
  READY_FOR_PICKUP: 'Ready for pickup',
  COMPLETED: 'Complete',
  REJECTED: 'Reject',
  CANCELLED: 'Cancel',
}

const statusBadge: Record<string, string> = {
  REQUESTED: 'info',
  PLACED: 'warn',
  PREPARING: 'warn',
  READY_FOR_PICKUP: 'success',
  COMPLETED: 'success',
  REJECTED: 'danger',
  CANCELLED: 'danger',
}

function orderTitle(o: Order): string {
  const first = splitList(o.rawList ?? '')[0]
  return first ? first.slice(0, 40) : o.orderNumber
}

function itemCount(o: Order): number {
  if (o.items.length > 0) return o.items.length
  return splitList(o.rawList ?? '').length
}

export default function CustomerHome() {
  const toast = useToast()
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)

  const load = async () => {
    setLoading(true)
    try {
      const data = await api<{ items: Order[] }>('/orders')
      setOrders(data.items)
    } catch (e) {
      toast.show((e as Error).message, 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  if (loading) return <div className="center"><span className="spinner" /></div>

  return (
    <div className="stack">
      <div className="row between">
        <h1>Mere orders</h1>
        <Link to="/orders/new" className="btn">
          <Plus size={16} /> Naya order
        </Link>
      </div>

      {orders.length === 0 ? (
        <div className="empty">
          <p>Abhi koi order nahi hai.</p>
          <Link to="/orders/new" className="btn" style={{ marginTop: 8 }}>
            Pehla order banao
          </Link>
        </div>
      ) : (
        <div className="list">
          {orders.map((o) => (
            <Link key={o.id} to={`/orders/${o.id}`} className="list-item">
              <div>
                <div style={{ fontWeight: 600 }}>{orderTitle(o)}</div>
                <div style={{ fontSize: 13, color: 'var(--muted)' }}>
                  {formatDate(o.createdAt)} · {itemCount(o)} items
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <span className={`badge ${statusBadge[o.status] ?? ''}`}>
                  {statusLabel[o.status]}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
