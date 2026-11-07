import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import { useToast } from '../state/toast'
import type { Product, Category } from '../lib/types'
import { money } from '../lib/api'
import { ApiError } from '../lib/api'

export default function OwnerCatalogue() {
  const toast = useToast()
  const [products, setProducts] = useState<Product[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState({
    categoryId: '',
    name: '',
    aliases: '',
    unit: '1 kg',
    priceRupees: '10',
    imageUrl: '/images/placeholder.png',
  })

  const load = async () => {
    setLoading(true)
    try {
      const [p, c] = await Promise.all([
        api<{ items: Product[] }>('/admin/products?limit=200'),
        api<{ items?: Category[]; data?: Category[] }>('/admin/categories').catch(() => ({ items: [] })),
      ])
      setProducts(p.items)
      const cats = (c as any).items ?? (c as any).data ?? c
      setCategories(Array.isArray(cats) ? cats : [])
      if (!form.categoryId && Array.isArray(cats) && cats.length) {
        setForm((f) => ({ ...f, categoryId: cats[0].id }))
      }
    } catch (e) {
      toast.show((e as ApiError).message, 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const toggle = async (p: Product) => {
    try {
      await api(`/admin/products/${p.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ isAvailable: !p.isAvailable }),
      })
      load()
    } catch (e) {
      toast.show((e as ApiError).message, 'error')
    }
  }

  const updatePrice = async (p: Product, pricePaise: number) => {
    try {
      await api(`/admin/products/${p.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ pricePaise }),
      })
      toast.show('Price update ho gaya')
      load()
    } catch (e) {
      toast.show((e as ApiError).message, 'error')
    }
  }

  const addProduct = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      await api('/admin/products', {
        method: 'POST',
        body: JSON.stringify({
          categoryId: form.categoryId,
          name: form.name,
          aliases: form.aliases.split(',').map((s) => s.trim()).filter(Boolean),
          unit: form.unit,
          pricePaise: Math.round(Number(form.priceRupees) * 100) || 0,
          imageUrl: form.imageUrl,
        }),
      })
      toast.show('Product add ho gaya')
      setShowAdd(false)
      setForm({ ...form, name: '', aliases: '' })
      load()
    } catch (e) {
      toast.show((e as ApiError).message, 'error')
    }
  }

  const filtered = products.filter((p) =>
    (p.name + ' ' + p.aliases.join(' ')).toLowerCase().includes(search.toLowerCase()),
  )

  if (loading) return <div className="center"><span className="spinner" /></div>

  return (
    <div className="stack">
      <div className="row between">
        <h1>Catalogue</h1>
        <button className="btn" onClick={() => setShowAdd((v) => !v)}>
          {showAdd ? 'Band karein' : 'Naya product'}
        </button>
      </div>

      {showAdd && (
        <form className="card stack" onSubmit={addProduct}>
          <div>
            <label className="label">Category</label>
            <select className="input" value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: e.target.value })}>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Name</label>
            <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          </div>
          <div>
            <label className="label">Aliases (comma separated)</label>
            <input className="input" value={form.aliases} onChange={(e) => setForm({ ...form, aliases: e.target.value })} />
          </div>
          <div className="row">
            <div style={{ flex: 1 }}>
              <label className="label">Unit</label>
              <input className="input" value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} />
            </div>
            <div style={{ flex: 1 }}>
              <label className="label">Price (rupees)</label>
              <input
                className="input"
                type="number"
                step="0.01"
                value={form.priceRupees}
                onChange={(e) => setForm({ ...form, priceRupees: e.target.value })}
              />
            </div>
          </div>
          <button className="btn" type="submit">Save</button>
        </form>
      )}

      <input className="input" placeholder="Search product..." value={search} onChange={(e) => setSearch(e.target.value)} />

      <div className="list">
        {filtered.map((p) => (
          <div key={p.id} className="list-item">
            <img
              src={p.imageUrl}
              alt={p.name}
              style={{ width: 40, height: 40, objectFit: 'cover', borderRadius: 6, background: 'var(--surface-2)' }}
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
            />
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600 }}>
                {p.name} {!p.isAvailable && <span className="badge danger">Unavailable</span>}
              </div>
              <div style={{ fontSize: 13, color: 'var(--muted)' }}>
                {p.unit} · {p.aliases.slice(0, 3).join(', ')}
              </div>
            </div>
            <input
              className="input"
              type="number"
              step="0.01"
              style={{ width: 90 }}
              defaultValue={(p.pricePaise / 100).toFixed(2)}
              onBlur={(e) => {
                const v = Number(e.target.value)
                if (v && Math.round(v * 100) !== p.pricePaise) updatePrice(p, Math.round(v * 100))
              }}
            />
            <span style={{ width: 70, textAlign: 'right', fontWeight: 600 }}>{money(p.pricePaise)}</span>
            <button className="btn secondary sm" onClick={() => toggle(p)}>
              {p.isAvailable ? 'Hide' : 'Show'}
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
