'use client'

import React, { useEffect, useState } from 'react'
import { C, serif, longDate, shadowCard, shadowCardSoft } from '../theme'
import { ScreenHeader, EmptyState } from '../ui'
import type { PortalData } from '../types'

interface Feedback {
  id: number
  message: string
  created_at: string
}

// "12 mar 2026 às 14:30"
function longDateTime(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = longDate(iso)
  try {
    const h = new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    return d ? `${d} às ${h}` : ''
  } catch { return d }
}

export function Ouvidoria({ data, onBack }: { data: PortalData; onBack: () => void }) {
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [feedbacks, setFeedbacks] = useState<Feedback[]>([])

  async function loadFeedbacks() {
    try {
      const res = await fetch('/api/patients/' + data.patientId + '/feedback')
      if (!res.ok) return
      const json = await res.json()
      setFeedbacks(Array.isArray(json?.feedbacks) ? json.feedbacks : [])
    } catch { /* silencioso */ }
  }

  useEffect(() => {
    loadFeedbacks()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.patientId])

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    const text = message.trim()
    if (!text || sending) return
    setSending(true)
    setSent(false)
    try {
      const res = await fetch('/api/patients/' + data.patientId + '/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text }),
      })
      if (res.ok) {
        setMessage('')
        setSent(true)
        await loadFeedbacks()
      }
    } catch { /* silencioso */ } finally {
      setSending(false)
    }
  }

  const disabled = sending || message.trim().length === 0

  return (
    <div className="pt-view">
      <ScreenHeader
        title="Deixe um feedback"
        subtitle="Sua mensagem vai direto para a direção, com confidencialidade"
        onBack={onBack}
      />

      {/* Formulário */}
      <form onSubmit={onSubmit} style={{ padding: '0 20px' }}>
        <div style={{ background: C.white, borderRadius: 14, border: `1px solid ${C.border}`, boxShadow: shadowCardSoft, padding: 6 }}>
          <textarea
            value={message}
            onChange={(e) => { setMessage(e.target.value); if (sent) setSent(false) }}
            rows={4}
            placeholder="Escreva aqui sua mensagem, sugestão ou reclamação…"
            style={{
              width: '100%', minHeight: 100, resize: 'vertical', border: 'none', outline: 'none',
              background: 'transparent', padding: '12px 12px', fontSize: 14, color: C.graphite,
              lineHeight: 1.5, fontFamily: 'inherit', boxSizing: 'border-box',
            }}
          />
        </div>

        <button
          type="submit"
          disabled={disabled}
          className="pt-press"
          style={{
            marginTop: 12, width: '100%', cursor: disabled ? 'default' : 'pointer',
            background: C.gold, color: C.white, border: 'none', borderRadius: 14, padding: '14px 18px',
            fontSize: 15, fontWeight: 700, boxShadow: shadowCard, opacity: disabled ? 0.6 : 1,
          }}
        >
          {sending ? 'Enviando…' : 'Enviar mensagem'}
        </button>

        {sent && (
          <div style={{ marginTop: 12, fontSize: 14, color: C.sage, fontWeight: 700 }}>
            ✓ Mensagem enviada. Obrigado!
          </div>
        )}
      </form>

      {/* Mensagens anteriores */}
      <div style={{ fontFamily: serif, fontSize: 19, color: C.graphiteStrong, padding: '26px 22px 10px' }}>
        Suas mensagens anteriores
      </div>

      {feedbacks.length === 0 ? (
        <EmptyState>Você ainda não enviou nenhuma mensagem.</EmptyState>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '0 20px 8px' }}>
          {feedbacks.map((f) => (
            <div key={f.id} style={{ background: C.sand, borderRadius: 16, border: `1px solid ${C.border}`, padding: 16 }}>
              <div style={{ fontSize: 14, color: C.graphite, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{f.message}</div>
              <div style={{ fontSize: 12, color: C.muted, marginTop: 10 }}>{longDateTime(f.created_at)}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
