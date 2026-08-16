import React, { useState } from 'react'
import { signIn, signUp, signInWithGoogle, logOut } from '../../firebase/firebaseAuth'
import { firebaseReady } from '../../firebase/config'

export default function AuthModal({ user, onClose }) {
  const [tab, setTab]         = useState('signin')
  const [email, setEmail]     = useState('')
  const [password, setPass]   = useState('')
  const [name, setName]       = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')

  async function submit(e) {
    e.preventDefault()
    setLoading(true); setError('')
    try {
      if (tab === 'signin') {
        await signIn(email, password)
      } else {
        await signUp(email, password, name)
      }
      onClose()
    } catch (err) {
      setError(err.message?.replace('Firebase: ', '').replace(/\(auth.*\)\.?/, '').trim() || 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  async function handleGoogle() {
    setLoading(true); setError('')
    try {
      await signInWithGoogle()
      onClose()
    } catch (err) {
      setError(err.message || 'Google sign-in failed')
    } finally {
      setLoading(false)
    }
  }

  async function handleSignOut() {
    await logOut()
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.75)' }}>
      <div
        className="w-96 rounded-xl p-6 flex flex-col gap-4"
        style={{ background: '#0d0d1a', border: '1px solid #ffffff20' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <span className="font-display text-sm tracking-widest uppercase"
            style={{ background: 'linear-gradient(90deg,#00e5ff,#b44fff)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            {user ? 'Your Account' : 'Sign In / Sign Up'}
          </span>
          <button onClick={onClose} className="text-studio-muted hover:text-studio-text text-lg leading-none">✕</button>
        </div>

        {!firebaseReady ? (
          <SetupGuide />
        ) : user ? (
          <SignedIn user={user} onSignOut={handleSignOut} loading={loading} />
        ) : (
          <>
            {/* Tabs */}
            <div className="flex gap-1">
              {['signin', 'signup'].map(t => (
                <button key={t} onClick={() => { setTab(t); setError('') }}
                  className="flex-1 py-1.5 rounded text-xs font-semibold capitalize transition-all"
                  style={{
                    background: tab === t ? '#ffffff15' : 'transparent',
                    color: tab === t ? '#ffffff' : '#8899aa',
                    border: `1px solid ${tab === t ? '#ffffff30' : 'transparent'}`,
                  }}>
                  {t === 'signin' ? 'Sign In' : 'Create Account'}
                </button>
              ))}
            </div>

            <form onSubmit={submit} className="flex flex-col gap-3">
              {tab === 'signup' && (
                <input value={name} onChange={e => setName(e.target.value)}
                  placeholder="Display name" required
                  className="w-full bg-studio-panel border border-studio-border rounded px-3 py-2 text-sm text-studio-text placeholder-studio-muted focus:outline-none focus:border-studio-dim" />
              )}
              <input value={email} onChange={e => setEmail(e.target.value)}
                type="email" placeholder="Email address" required
                className="w-full bg-studio-panel border border-studio-border rounded px-3 py-2 text-sm text-studio-text placeholder-studio-muted focus:outline-none focus:border-studio-dim" />
              <input value={password} onChange={e => setPass(e.target.value)}
                type="password" placeholder="Password" required minLength={6}
                className="w-full bg-studio-panel border border-studio-border rounded px-3 py-2 text-sm text-studio-text placeholder-studio-muted focus:outline-none focus:border-studio-dim" />
              {error && <div className="text-xs px-2 py-1 rounded" style={{ background: '#ff2d5520', color: '#ff2d55' }}>{error}</div>}
              <button type="submit" disabled={loading}
                className="w-full py-2 rounded font-semibold text-sm transition-all"
                style={{ background: '#00e5ff', color: '#000', opacity: loading ? 0.6 : 1 }}>
                {loading ? 'Please wait…' : tab === 'signin' ? 'Sign In' : 'Create Account'}
              </button>
            </form>

            <div className="flex items-center gap-2">
              <div className="flex-1 h-px" style={{ background: '#ffffff15' }} />
              <span className="text-xs text-studio-muted">or</span>
              <div className="flex-1 h-px" style={{ background: '#ffffff15' }} />
            </div>

            <button onClick={handleGoogle} disabled={loading}
              className="w-full py-2 rounded font-semibold text-sm flex items-center justify-center gap-2 transition-all"
              style={{ background: '#ffffff10', color: '#fff', border: '1px solid #ffffff25', opacity: loading ? 0.6 : 1 }}>
              <span>G</span> Continue with Google
            </button>
          </>
        )}
      </div>
    </div>
  )
}

function SignedIn({ user, onSignOut, loading }) {
  return (
    <div className="flex flex-col items-center gap-4 py-2">
      <div className="w-16 h-16 rounded-full flex items-center justify-center text-2xl font-bold"
        style={{ background: 'linear-gradient(135deg,#00e5ff,#b44fff)', color: '#000' }}>
        {(user.displayName || user.email || '?')[0].toUpperCase()}
      </div>
      <div className="text-center">
        <div className="font-semibold text-studio-text">{user.displayName || 'Anonymous'}</div>
        <div className="text-xs text-studio-muted">{user.email}</div>
      </div>
      <button onClick={onSignOut} disabled={loading}
        className="px-6 py-2 rounded text-sm font-semibold transition-all"
        style={{ background: '#ff2d5522', color: '#ff2d55', border: '1px solid #ff2d5544' }}>
        Sign Out
      </button>
    </div>
  )
}

function SetupGuide() {
  return (
    <div className="flex flex-col gap-3">
      <div className="text-xs text-studio-dim leading-relaxed">
        Firebase is not configured yet. To enable cloud save and real-time collaboration:
      </div>
      <ol className="text-xs text-studio-text leading-loose list-decimal pl-4 space-y-1">
        <li>Go to <span className="font-mono" style={{ color: '#00e5ff' }}>firebase.google.com</span> → Create a project</li>
        <li>Click <strong>Add app</strong> → choose Web ({"</>"})</li>
        <li>Copy the config values shown</li>
        <li>Open your <span className="font-mono" style={{ color: '#ffe600' }}>.env</span> file and paste each value next to the matching <span className="font-mono">VITE_FIREBASE_*</span> key</li>
        <li>Restart the app — cloud features activate automatically</li>
      </ol>
      <div className="text-xs text-studio-muted mt-1">
        In Firebase console also enable <strong>Authentication → Sign-in method → Email/Password</strong> and optionally Google.
      </div>
    </div>
  )
}
