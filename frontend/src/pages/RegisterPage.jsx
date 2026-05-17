import { useState, useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Auth } from '../lib/api'
import { setToken, setStoredUser } from '../lib/auth'

function passwordStrength(p) {
  if (!p) return { score: 0, label: '—', color: 'bg-gray-600' }
  let score = 0
  if (p.length >= 8) score++
  if (p.length >= 12) score++
  if (/\d/.test(p)) score++
  if (/[A-Z]/.test(p) && /[a-z]/.test(p)) score++
  if (/[^A-Za-z0-9]/.test(p)) score++
  const labels = ['Too weak', 'Weak', 'Fair', 'Good', 'Strong', 'Excellent']
  const colors = ['bg-red-500', 'bg-red-400', 'bg-amber-400', 'bg-yellow-400', 'bg-emerald-400', 'bg-emerald-500']
  return { score, label: labels[score], color: colors[score] }
}

export default function RegisterPage() {
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const strength = useMemo(() => passwordStrength(password), [password])

  const submit = async (e) => {
    e.preventDefault()
    setError(null)
    if (password.length < 8) return setError('Password must be at least 8 characters')
    if (!/\d/.test(password)) return setError('Password must contain at least one number')
    setLoading(true)
    try {
      const { access_token } = await Auth.register({
        name: name.trim(),
        email: email.trim().toLowerCase(),
        password,
      })
      setToken(access_token)
      const me = await Auth.me()
      setStoredUser(me)
      navigate('/')
    } catch (err) {
      const detail = err.response?.data?.detail
      const msg = Array.isArray(detail) ? detail.map((d) => d.msg).join(', ') : (detail || err.message || 'Registration failed')
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-app text-gray-100 flex items-center justify-center p-4">
      <div className="card w-full max-w-sm p-8">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-bold text-yellow-400 mb-1">⚡ Watt</h1>
          <p className="text-xs text-gray-500">Create an account</p>
        </div>
        <form onSubmit={submit} className="flex flex-col gap-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-xs text-gray-400 uppercase tracking-wider">Name</span>
            <input type="text" required autoFocus value={name}
                   onChange={(e) => setName(e.target.value)}
                   className="input" maxLength={100} />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs text-gray-400 uppercase tracking-wider">Email</span>
            <input type="email" required value={email}
                   onChange={(e) => setEmail(e.target.value)}
                   className="input" />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs text-gray-400 uppercase tracking-wider">Password</span>
            <input type="password" required value={password}
                   onChange={(e) => setPassword(e.target.value)}
                   minLength={8} maxLength={128} className="input" />
            <div className="flex items-center gap-2 mt-1">
              <div className="flex-1 h-1 rounded-full bg-line overflow-hidden">
                <div className={`h-full transition-all ${strength.color}`}
                     style={{ width: `${(strength.score / 5) * 100}%` }} />
              </div>
              <span className="text-[10px] text-gray-500 font-mono w-16 text-right">{strength.label}</span>
            </div>
            <span className="text-[10px] text-gray-600">8+ characters, at least one number</span>
          </label>
          {error && (
            <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg p-2.5">
              {error}
            </div>
          )}
          <button type="submit" disabled={loading}
                  className="px-5 py-2 rounded-lg text-sm font-semibold bg-primary text-white hover:bg-primary-dim disabled:opacity-50 active:scale-95 transition-all flex items-center justify-center gap-2 mt-2">
            {loading && <span className="w-3 h-3 rounded-full border-2 border-white/40 border-t-white animate-spin" />}
            Create account
          </button>
        </form>
        <div className="mt-6 text-center text-xs text-gray-500">
          Have an account? <Link to="/login" className="text-primary hover:underline">Sign in</Link>
        </div>
        <style>{`
          .input { background:#0a0a0f; border:1px solid #1e1e2e; border-radius:0.5rem;
                   padding:0.625rem 0.875rem; font-size:0.875rem; color:#e5e7eb; outline:none;
                   transition: border-color 150ms; }
          .input:focus { border-color:#6366f1; }
        `}</style>
      </div>
    </div>
  )
}
