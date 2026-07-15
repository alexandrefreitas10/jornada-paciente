'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { C, serif, shadowCard } from '@/components/portal/theme'

export function NpsForm({ patientId }: { patientId: number }) {
  const router = useRouter()
  const [score, setScore] = useState<number | null>(null)
  const [comment, setComment] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (score === null) { setError('Escolha uma nota de 0 a 10'); return }
    setLoading(true)
    setError(null)

    const res = await fetch(`/api/patients/${patientId}/nps`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ score, comment }),
    })

    if (!res.ok && res.status !== 409) {
      const data = await res.json().catch(() => ({}))
      setError(data.error || 'Erro ao enviar. Tente novamente.')
      setLoading(false)
      return
    }

    router.push('/portal/paciente')
    router.refresh()
  }

  // Cores dos botões de nota (detrator/neutro/promotor) no tom do design
  const btnBg = (n: number, active: boolean) => {
    if (active) return n <= 6 ? '#c98a8a' : n <= 8 ? C.gold : C.sage
    return n <= 6 ? '#f6ecec' : n <= 8 ? C.goldBox : C.sageBox
  }
  const btnColor = (n: number, active: boolean) => {
    if (active) return '#fff'
    return n <= 6 ? '#a86a6a' : n <= 8 ? C.pending : C.sageText
  }

  return (
    <div style={{ minHeight: '100dvh', background: C.sand, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '32px 22px' }}>
      <div style={{ width: '100%', maxWidth: 380 }}>
        <div style={{ textAlign: 'center', marginBottom: 22 }}>
          <div style={{ fontFamily: serif, fontSize: 26, color: C.graphiteStrong, lineHeight: 1.15 }}>Antes de começar…</div>
          <div style={{ fontSize: 14, color: C.soft, marginTop: 10, lineHeight: 1.5 }}>
            Sua opinião é muito importante para nós. Leva menos de um minuto!
          </div>
        </div>

        <div style={{ background: C.white, borderRadius: 22, boxShadow: shadowCard, padding: 22 }}>
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div>
              <p style={{ fontSize: 14, fontWeight: 700, color: C.graphite, marginBottom: 12, lineHeight: 1.4 }}>
                De 0 a 10, o quanto você recomendaria o Instituto Torres para um amigo ou familiar?
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(11, 1fr)', gap: 4 }}>
                {Array.from({ length: 11 }, (_, n) => {
                  const active = score === n
                  return (
                    <button key={n} type="button" onClick={() => setScore(n)}
                      style={{
                        aspectRatio: '1', borderRadius: 8, border: 'none', cursor: 'pointer',
                        fontSize: 12, fontWeight: 700, transition: 'all .12s ease',
                        background: btnBg(n, active), color: btnColor(n, active),
                      }}>
                      {n}
                    </button>
                  )
                })}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: C.muted, marginTop: 4 }}>
                <span>Não recomendaria</span><span>Com certeza!</span>
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: C.graphite, marginBottom: 6 }}>
                Quer nos contar o motivo? <span style={{ color: C.muted, fontWeight: 400 }}>(opcional)</span>
              </label>
              <textarea value={comment} onChange={e => setComment(e.target.value)} rows={3} maxLength={2000} placeholder="Escreva aqui…"
                style={{
                  width: '100%', border: `1px solid ${C.border}`, borderRadius: 14, padding: '12px 14px',
                  fontSize: 14, color: C.graphite, resize: 'none', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box',
                }} />
            </div>

            {error && <p style={{ fontSize: 13, color: '#c0392b', margin: 0 }}>{error}</p>}

            <button type="submit" disabled={loading} style={{
              width: '100%', background: C.gold, color: '#fff', fontWeight: 700, fontSize: 15, padding: 15,
              borderRadius: 14, border: 'none', boxShadow: '0 14px 26px -14px #C4A86A',
              cursor: loading ? 'default' : 'pointer', opacity: loading ? 0.7 : 1,
            }}>
              {loading ? 'Enviando…' : 'Enviar e acessar minha área'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
