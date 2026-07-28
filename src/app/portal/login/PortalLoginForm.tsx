'use client'
import { useActionState, useState } from 'react'
import { portalLogin } from './actions'
import { IconEye, IconEyeOff } from '@/components/portal/Icons'

const inputStyle: React.CSSProperties = {
  background: '#fff', border: '1px solid #eee6d7', borderRadius: 14, padding: '15px 16px',
  fontSize: 14, color: '#514f4a', width: '100%', outline: 'none',
}

const eyeBtn: React.CSSProperties = {
  position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
  background: 'none', border: 'none', cursor: 'pointer', padding: 4, display: 'flex', color: '#8A9A7B',
}

export function PortalLoginForm() {
  const [state, action, pending] = useActionState(portalLogin, null)
  const [show, setShow] = useState(false)
  return (
    <form action={action} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <input name="email" type="email" required autoComplete="email" placeholder="seu@email.com" style={inputStyle} />
      <div style={{ position: 'relative' }}>
        <input name="password" type={show ? 'text' : 'password'} required autoComplete="current-password" placeholder="••••••••" style={{ ...inputStyle, paddingRight: 46 }} />
        <button type="button" onClick={() => setShow(s => !s)} aria-label={show ? 'Ocultar senha' : 'Mostrar senha'} style={eyeBtn}>
          {show ? <IconEyeOff size={20} /> : <IconEye size={20} />}
        </button>
      </div>
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
