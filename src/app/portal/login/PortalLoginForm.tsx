'use client'
import { useActionState } from 'react'
import { portalLogin } from './actions'

const inputStyle: React.CSSProperties = {
  background: '#fff', border: '1px solid #eee6d7', borderRadius: 14, padding: '15px 16px',
  fontSize: 14, color: '#514f4a', width: '100%', outline: 'none',
}

export function PortalLoginForm() {
  const [state, action, pending] = useActionState(portalLogin, null)
  return (
    <form action={action} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <input name="email" type="email" required autoComplete="email" placeholder="seu@email.com" style={inputStyle} />
      <input name="password" type="password" required autoComplete="current-password" placeholder="••••••••" style={inputStyle} />
      {state?.error && <p style={{ fontSize: 13, color: '#c0392b', textAlign: 'left', margin: 0 }}>{state.error}</p>}
      <button type="submit" disabled={pending} style={{
        background: '#C4A86A', color: '#fff', fontWeight: 700, fontSize: 15, padding: 16, borderRadius: 14, border: 'none',
        boxShadow: '0 14px 26px -14px #C4A86A', cursor: pending ? 'default' : 'pointer', opacity: pending ? 0.7 : 1,
      }}>
        {pending ? 'Entrando…' : 'Entrar'}
      </button>
      <div style={{ fontSize: 13, color: '#8A9A7B', fontWeight: 700, marginTop: 4 }}>Esqueci minha senha</div>
    </form>
  )
}
