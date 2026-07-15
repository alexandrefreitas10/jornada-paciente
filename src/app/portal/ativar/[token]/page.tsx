'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { C, serif, shadowCard } from '@/components/portal/theme'

const wrap: React.CSSProperties = { minHeight: '100dvh', background: C.sand, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '32px 22px' }
const card: React.CSSProperties = { background: C.white, borderRadius: 22, boxShadow: shadowCard, padding: 28, maxWidth: 360, width: '100%', textAlign: 'center' }
const inputStyle: React.CSSProperties = { width: '100%', border: `1px solid ${C.border}`, borderRadius: 14, padding: '14px 16px', fontSize: 14, color: C.graphite, outline: 'none', boxSizing: 'border-box' }

export default function AtivarPortalPage() {
  const { token } = useParams<{ token: string }>()
  const router = useRouter()

  const [checking, setChecking] = useState(true)
  const [email, setEmail] = useState<string | null>(null)
  const [tokenInvalid, setTokenInvalid] = useState(false)

  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)

  useEffect(() => {
    fetch(`/api/portal/invite/${token}`)
      .then(r => r.json())
      .then(data => {
        if (data.valid) setEmail(data.email)
        else setTokenInvalid(true)
      })
      .catch(() => setTokenInvalid(true))
      .finally(() => setChecking(false))
  }, [token])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (password.length < 6) { setError('Senha deve ter no mínimo 6 caracteres'); return }
    if (password !== confirm) { setError('As senhas não coincidem'); return }
    setLoading(true)
    setError(null)

    const res = await fetch(`/api/portal/invite/${token}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    })
    const data = await res.json()

    if (!res.ok) {
      setError(data.error || 'Erro ao ativar conta')
      setLoading(false)
      return
    }

    setDone(true)
    setTimeout(() => router.push('/portal/login'), 2000)
  }

  if (checking) {
    return <div style={wrap}><p style={{ fontSize: 14, color: C.muted }}>Verificando link…</p></div>
  }

  if (tokenInvalid) {
    return (
      <div style={wrap}>
        <div style={card}>
          <div style={{ fontSize: 34, marginBottom: 12 }}>⚠️</div>
          <div style={{ fontFamily: serif, fontSize: 20, color: C.graphiteStrong }}>Link inválido</div>
          <p style={{ fontSize: 14, color: C.soft, marginTop: 8 }}>Este link não é válido ou já foi utilizado.</p>
        </div>
      </div>
    )
  }

  if (done) {
    return (
      <div style={wrap}>
        <div style={card}>
          <div style={{ fontSize: 34, marginBottom: 12 }}>✅</div>
          <div style={{ fontFamily: serif, fontSize: 20, color: C.graphiteStrong }}>Conta ativada!</div>
          <p style={{ fontSize: 14, color: C.soft, marginTop: 8 }}>Redirecionando para o login…</p>
        </div>
      </div>
    )
  }

  return (
    <div style={wrap}>
      <div style={{ width: '100%', maxWidth: 360 }}>
        <div style={{ textAlign: 'center', marginBottom: 22 }}>
          <div style={{ fontFamily: serif, fontSize: 26, color: C.graphiteStrong }}>Criar sua senha</div>
          <p style={{ fontSize: 14, color: C.soft, marginTop: 8, lineHeight: 1.5 }}>Bem-vindo(a)! Defina uma senha para acessar sua área.</p>
          {email && <p style={{ fontSize: 13, color: C.gold, marginTop: 8, fontWeight: 700 }}>{email}</p>}
        </div>
        <div style={{ background: C.white, borderRadius: 22, boxShadow: shadowCard, padding: 24 }}>
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} required minLength={6} placeholder="Criar senha (mín. 6 caracteres)" style={inputStyle} />
            <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)} required placeholder="Confirmar senha" style={inputStyle} />
            {error && <p style={{ fontSize: 13, color: '#c0392b', margin: 0 }}>{error}</p>}
            <button type="submit" disabled={loading} style={{
              width: '100%', background: C.gold, color: '#fff', fontWeight: 700, fontSize: 15, padding: 15,
              borderRadius: 14, border: 'none', boxShadow: '0 14px 26px -14px #C4A86A',
              cursor: loading ? 'default' : 'pointer', opacity: loading ? 0.7 : 1,
            }}>
              {loading ? 'Ativando…' : 'Ativar conta'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
