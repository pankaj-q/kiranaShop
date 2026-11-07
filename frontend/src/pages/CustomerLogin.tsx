import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../state/auth'
import { useToast } from '../state/toast'
import { ApiError } from '../lib/api'

export default function CustomerLogin() {
  const { requestOtp, verifyOtp, legacyCustomerLogin } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()

  const [phone, setPhone] = useState('')
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [step, setStep] = useState<'phone' | 'otp'>('phone')
  const [isNew, setIsNew] = useState(false)
  const [loading, setLoading] = useState(false)
  const [cooldown, setCooldown] = useState(0)

  const startCooldown = (s: number) => {
    setCooldown(s)
    const t = setInterval(() => {
      setCooldown((c) => {
        if (c <= 1) {
          clearInterval(t)
          return 0
        }
        return c - 1
      })
    }, 1000)
  }

  const handleRequest = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      const r = await requestOtp(phone)
      setIsNew(false)
      setStep('otp')
      startCooldown(r.retryAfterSeconds)
      toast.show('Code bhej diya gaya hai')
    } catch (err) {
      const e = err as ApiError
      toast.show(e.message, 'error')
    } finally {
      setLoading(false)
    }
  }

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      await verifyOtp(phone, code, name || undefined)
      toast.show('Login successful')
      navigate('/')
    } catch (err) {
      const e = err as ApiError
      if (e.code === 'NAME_REQUIRED') setIsNew(true)
      toast.show(e.message, 'error')
    } finally {
      setLoading(false)
    }
  }

  const handleResend = async () => {
    if (cooldown > 0) return
    setLoading(true)
    try {
      const r = await requestOtp(phone)
      startCooldown(r.retryAfterSeconds)
      toast.show('Naya code bhej diya')
    } catch (err) {
      toast.show((err as ApiError).message, 'error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="card" style={{ maxWidth: 420, margin: '40px auto' }}>
      <h1>Apna mobile number</h1>
      <p className="muted">Hum 6 digit ka code bhejenge. Koi spam nahi.</p>

      {step === 'phone' ? (
        <form className="stack" onSubmit={handleRequest}>
          <div>
            <label className="label">Mobile number</label>
            <input
              className="input"
              type="tel"
              inputMode="numeric"
              placeholder="9876543210"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              required
            />
          </div>
          <button className="btn block" disabled={loading}>
            {loading ? 'Bhej raha hai...' : 'Code bhejein'}
          </button>
        </form>
      ) : (
        <form className="stack" onSubmit={handleVerify}>
          <div>
            <label className="label">6 digit ka code</label>
            <input
              className="input"
              inputMode="numeric"
              maxLength={6}
              placeholder="123456"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              required
            />
          </div>
          {isNew && (
            <div>
              <label className="label">Apna naam</label>
              <input
                className="input"
                placeholder="Pankaj"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>
          )}
          <button className="btn block" disabled={loading}>
            {loading ? 'Verify kar raha hai...' : 'Verify karein'}
          </button>
          <div className="row between">
            <button type="button" className="btn ghost sm" onClick={() => setStep('phone')}>
              Number badlein
            </button>
            <button
              type="button"
              className="btn ghost sm"
              onClick={handleResend}
              disabled={cooldown > 0 || loading}
            >
              {cooldown > 0 ? `Dobara bhejein (${cooldown}s)` : 'Dobara bhejein'}
            </button>
          </div>
        </form>
      )}
      <p style={{ marginTop: 12, fontSize: 13, color: 'var(--muted)' }}>
        Demo: legacy login bhi available hai{' '}
        <button
          className="btn ghost sm"
          onClick={async () => {
            const n = prompt('Naam?') || 'Demo'
            const p = prompt('Phone?') || '9876543210'
            try {
              await legacyCustomerLogin(n, p)
              navigate('/')
            } catch (e) {
              toast.show((e as ApiError).message, 'error')
            }
          }}
        >
          legacy
        </button>
      </p>
    </div>
  )
}
