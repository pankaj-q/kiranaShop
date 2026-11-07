import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import { useToast } from '../state/toast'
import { ApiError } from '../lib/api'
import { Send } from 'lucide-react'

export default function NewOrder() {
  const toast = useToast()
  const navigate = useNavigate()
  const [listText, setListText] = useState('')
  const [note, setNote] = useState('')
  const [loading, setLoading] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!listText.trim()) return
    setLoading(true)
    try {
      const idempotencyKey = `web-${Date.now()}-${Math.random().toString(36).slice(2)}`
      const data = await api<{ id: string }>('/orders/request', {
        method: 'POST',
        body: JSON.stringify({ listText, customerNote: note || undefined, idempotencyKey }),
      })
      toast.show('Order bhej diya gaya')
      navigate(`/orders/${data.id}`)
    } catch (e) {
      toast.show((e as ApiError).message, 'error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="card" style={{ maxWidth: 640, margin: '0 auto' }}>
      <h1>Naya order</h1>
      <p style={{ color: 'var(--muted)' }}>
        Jo chahiye wo likhein — jaise "2 kilo chini, 1 litre tel, 500g atta".
      </p>
      <form className="stack" onSubmit={submit}>
        <div>
          <label className="label">Aapki list</label>
          <textarea
            className="input"
            placeholder="2 kilo chini, 1 litre tel..."
            value={listText}
            onChange={(e) => setListText(e.target.value)}
            required
          />
        </div>
        <div>
          <label className="label">Note (optional)</label>
          <input
            className="input"
            placeholder="Koi special instruction"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>
        <button className="btn block" disabled={loading || !listText.trim()}>
          {loading ? 'Bhej raha hai...' : <><Send size={16} /> Order bhejein</>}
        </button>
      </form>
    </div>
  )
}
