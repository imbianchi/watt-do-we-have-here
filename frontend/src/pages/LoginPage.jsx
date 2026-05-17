import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Auth } from '../lib/api'
import { setToken, setStoredUser } from '../lib/auth'

export default function LoginPage() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const submit = async (e) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const { access_token } = await Auth.login({ email: email.trim().toLowerCase(), password })
      setToken(access_token)
      const me = await Auth.me()
      setStoredUser(me)
      navigate('/')
    } catch (err) {
      setError(err.response?.data?.detail || err.message || 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-app text-gray-100 flex items-center justify-center p-4">
      <div className="card w-full max-w-sm p-8">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-bold text-yellow-400 mb-1">⚡ Watt</h1>
          <p className="text-xs text-gray-500">Sign in to your home energy monitor</p>
        </div>
        <form onSubmit={submit} className="flex flex-col gap-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-xs text-gray-400 uppercase tracking-wider">Email</span>
            <input type="email" required autoFocus value={email}
                   onChange={(e) => setEmail(e.target.value)}
                   className="input" />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs text-gray-400 uppercase tracking-wider">Password</span>
            <input type="password" required value={password}
                   onChange={(e) => setPassword(e.target.value)}
                   className="input" />
          </label>
          {error && (
            <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg p-2.5">
              {error}
            </div>
          )}
          <button type="submit" disabled={loading}
                  className="px-5 py-2 rounded-lg text-sm font-semibold bg-primary text-white hover:bg-primary-dim disabled:opacity-50 active:scale-95 transition-all flex items-center justify-center gap-2 mt-2">
            {loading && <span className="w-3 h-3 rounded-full border-2 border-white/40 border-t-white animate-spin" />}
            Sign in
          </button>
        </form>
        <div className="mt-6 text-center text-xs text-gray-500">
          No account? <Link to="/register" className="text-primary hover:underline">Create one</Link>
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
