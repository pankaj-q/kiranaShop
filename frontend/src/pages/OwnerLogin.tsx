import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { useToast } from '../hooks/useToast'
import { ApiError } from '../lib/api'

export default function OwnerLogin() {
  const { loginOwner } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()
  const [login, setLogin] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      await loginOwner(login, password)
      toast.show('Owner login successful')
      navigate('/admin')
    } catch (e) {
      toast.show((e as ApiError).message, 'error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="card" style={{ maxWidth: 420, margin: '40px auto' }}>
      <h1>Owner login</h1>
      <p style={{ color: 'var(--muted)' }}>Dukaan ka dashboard.</p>
      <form className="stack" onSubmit={submit}>
        <div>
          <label className="label">Phone (login)</label>
          <input className="input" value={login} onChange={(e) => setLogin(e.target.value)} required />
        </div>
        <div>
          <label className="label">Password</label>
          <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </div>
        <button className="btn block" disabled={loading}>
          {loading ? 'Login...' : 'Login'}
        </button>
      </form>
    </div>
  )
}
