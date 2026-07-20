'use client'

import React from 'react'
import { C, serif, longDate, initial, shadowCard } from '../theme'
import { ScreenHeader } from '../ui'
import { IconUser, IconBell, IconLock, IconChat, IconCamera } from '../Icons'
import type { PortalData, Screen } from '../types'

function Row({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick?: () => void }) {
  return (
    <div onClick={onClick} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '15px 16px', cursor: onClick ? 'pointer' : 'default' }}>
      <span style={{ width: 24, display: 'flex', justifyContent: 'center' }}>{icon}</span>
      <span style={{ flex: 1, fontSize: 14, fontWeight: 700, color: C.graphite }}>{label}</span>
      <span style={{ fontSize: 20, color: C.navOff, lineHeight: 1 }}>›</span>
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%', border: `1px solid ${C.border}`, borderRadius: 12, padding: '11px 13px',
  fontSize: 14, color: C.graphite, outline: 'none', boxSizing: 'border-box', background: '#fff',
}
const labelStyle: React.CSSProperties = { display: 'block', fontSize: 12, fontWeight: 700, color: C.soft, margin: '0 0 5px 2px' }

export function Perfil({ data, go, onLogout, onBack }: { data: PortalData; go: (s: Screen) => void; onLogout: () => void; onBack: () => void }) {
  const [avatar, setAvatar] = React.useState<string | null>(data.avatarUrl)
  const [editing, setEditing] = React.useState(false)
  const [birth, setBirth] = React.useState(data.birthDate ?? '')
  const [email, setEmail] = React.useState(data.email ?? '')
  const [phone, setPhone] = React.useState(data.phone ?? '')
  const [saving, setSaving] = React.useState(false)
  const [saved, setSaved] = React.useState(false)
  const [uploading, setUploading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const fileRef = React.useRef<HTMLInputElement>(null)

  async function handlePhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true); setError(null)
    try {
      const fd = new FormData(); fd.append('photo', file)
      const res = await fetch(`/api/patients/${data.patientId}/avatar`, { method: 'POST', body: fd })
      const json = await res.json().catch(() => ({}))
      if (res.ok && json.url) setAvatar(json.url)
      else setError(json.error || 'Erro ao enviar a foto')
    } catch { setError('Erro ao enviar a foto') } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  async function save() {
    setSaving(true); setError(null); setSaved(false)
    try {
      const res = await fetch(`/api/patients/${data.patientId}/profile`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ birth_date: birth || null, email: email || null, phone: phone || null }),
      })
      const json = await res.json().catch(() => ({}))
      if (res.ok) { setSaved(true); setTimeout(() => setEditing(false), 900) }
      else setError(json.error || 'Erro ao salvar')
    } catch { setError('Erro ao salvar') } finally { setSaving(false) }
  }

  return (
    <div className="pt-view">
      <ScreenHeader title="Perfil" subtitle="Suas informações e preferências" onBack={onBack} />

      {/* Avatar + nome */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: '16px 22px 22px' }}>
        <div style={{ position: 'relative' }}>
          <button onClick={() => fileRef.current?.click()} aria-label="Trocar foto" style={{
            width: 84, height: 84, borderRadius: 28, border: 'none', cursor: 'pointer', overflow: 'hidden', padding: 0,
            background: avatar ? '#eee' : 'linear-gradient(135deg,#e7d9b8,#C4A86A)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: serif, color: '#fff', fontSize: 36, boxShadow: '0 16px 30px -16px rgba(196,168,106,.8)',
          }}>
            {avatar
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={avatar} alt="Foto" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              : initial(data.name)}
          </button>
          <span style={{ position: 'absolute', right: -2, bottom: -2, width: 30, height: 30, borderRadius: '50%', background: C.gold, border: '2px solid #fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <IconCamera size={15} color="#fff" />
          </span>
          <input ref={fileRef} type="file" accept="image/*" onChange={handlePhoto} style={{ display: 'none' }} />
        </div>
        {uploading && <div style={{ fontSize: 12, color: C.muted }}>Enviando foto…</div>}
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontFamily: serif, fontSize: 24, color: C.graphiteStrong, lineHeight: 1.1 }}>{data.name}</div>
          {data.startDate && <div style={{ fontSize: 13, color: C.muted, marginTop: 4 }}>Paciente desde {longDate(data.startDate)}</div>}
        </div>
      </div>

      {/* Meus dados — formulário editável inline */}
      <div style={{ margin: '0 20px 12px', background: C.white, borderRadius: 18, boxShadow: shadowCard, overflow: 'hidden' }}>
        <Row icon={<IconUser size={20} color={C.goldIcon} />} label="Meus dados" onClick={() => setEditing(e => !e)} />
        {editing && (
          <div style={{ padding: '4px 16px 16px', display: 'flex', flexDirection: 'column', gap: 12, borderTop: `1px solid ${C.border}` }}>
            <div style={{ fontSize: 11, color: C.muted, marginTop: 8 }}>O nome não pode ser alterado (identifica seu cadastro na clínica).</div>
            <div>
              <label style={labelStyle}>Data de nascimento</label>
              <input type="date" value={birth} onChange={e => setBirth(e.target.value)} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>E-mail</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="seu@email.com" style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Telefone</label>
              <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="(00) 00000-0000" style={inputStyle} />
            </div>
            {error && <p style={{ fontSize: 13, color: '#c0392b', margin: 0 }}>{error}</p>}
            {saved && <p style={{ fontSize: 13, color: C.sage, fontWeight: 700, margin: 0 }}>✓ Dados salvos</p>}
            <button onClick={save} disabled={saving} style={{
              background: C.gold, color: '#fff', fontWeight: 700, fontSize: 14, padding: 13, borderRadius: 12, border: 'none',
              cursor: saving ? 'default' : 'pointer', opacity: saving ? 0.7 : 1,
            }}>{saving ? 'Salvando…' : 'Salvar'}</button>
          </div>
        )}
      </div>

      {/* Demais itens */}
      <div style={{ margin: '0 20px', background: C.white, borderRadius: 18, boxShadow: shadowCard, overflow: 'hidden' }}>
        <Row icon={<IconBell size={20} color={C.goldIcon} />} label="Notificações" />
        <div style={{ height: 1, background: C.border, margin: '0 16px' }} />
        <Row icon={<IconLock size={20} color={C.goldIcon} />} label="Privacidade e senha" />
        <div style={{ height: 1, background: C.border, margin: '0 16px' }} />
        <Row icon={<IconChat size={20} color={C.sageText} />} label="Deixe um feedback" onClick={() => go('ouvidoria')} />
      </div>

      <button onClick={onLogout} style={{ display: 'block', width: '100%', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'center', padding: 20, fontSize: 14, fontWeight: 700, color: C.danger }}>Sair</button>
    </div>
  )
}
