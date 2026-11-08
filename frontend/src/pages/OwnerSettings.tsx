import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import { useToast } from '../hooks/useToast'
import type { StoreSettings } from '../lib/types'
import { ApiError } from '../lib/api'

export default function OwnerSettings() {
  const toast = useToast()
  const [s, setS] = useState<StoreSettings | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const data = await api<StoreSettings>('/admin/settings')
      setS(data)
    } catch (e) {
      toast.show((e as ApiError).message, 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!s) return
    setSaving(true)
    try {
      await api('/admin/settings', {
        method: 'PATCH',
        body: JSON.stringify({
          storeName: s.storeName,
          address: s.address,
          phone: s.phone,
          openTime: s.openTime,
          closeTime: s.closeTime,
          manualClosed: s.manualClosed,
          upiId: s.upiId,
          pickupNote: s.pickupNote,
        }),
      })
      toast.show('Settings save ho gaye')
    } catch (e) {
      toast.show((e as ApiError).message, 'error')
    } finally {
      setSaving(false)
    }
  }

  if (loading || !s) return <div className="center"><span className="spinner" /></div>

  const upd = (patch: Partial<StoreSettings>) => setS({ ...s, ...patch })

  return (
    <form className="card stack" style={{ maxWidth: 640 }} onSubmit={save}>
      <h1>Store settings</h1>
      <div>
        <label className="label">Store name</label>
        <input className="input" value={s.storeName} onChange={(e) => upd({ storeName: e.target.value })} />
      </div>
      <div>
        <label className="label">Address</label>
        <input className="input" value={s.address} onChange={(e) => upd({ address: e.target.value })} />
      </div>
      <div>
        <label className="label">Phone</label>
        <input className="input" value={s.phone} onChange={(e) => upd({ phone: e.target.value })} />
      </div>
      <div className="row">
        <div style={{ flex: 1 }}>
          <label className="label">Open</label>
          <input className="input" value={s.openTime} onChange={(e) => upd({ openTime: e.target.value })} />
        </div>
        <div style={{ flex: 1 }}>
          <label className="label">Close</label>
          <input className="input" value={s.closeTime} onChange={(e) => upd({ closeTime: e.target.value })} />
        </div>
      </div>
      <div>
        <label className="label">UPI ID (payments ke liye)</label>
        <input className="input" value={s.upiId ?? ''} onChange={(e) => upd({ upiId: e.target.value || null })} placeholder="majitkirana@upi" />
      </div>
      <div>
        <label className="label">Pickup note</label>
        <input className="input" value={s.pickupNote ?? ''} onChange={(e) => upd({ pickupNote: e.target.value || null })} />
      </div>
      <label className="row" style={{ gap: 8 }}>
        <input type="checkbox" checked={s.manualClosed} onChange={(e) => upd({ manualClosed: e.target.checked })} />
        <span>Manual closed</span>
      </label>
      <button className="btn" disabled={saving}>
        {saving ? 'Save...' : 'Save'}
      </button>
    </form>
  )
}
