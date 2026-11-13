'use client'

import React from 'react'
import { C, serif, shadowCard } from '../theme'
import { ScreenHeader } from '../ui'

// A tela busca os próprios dados em vez de recebê-los pelo `PortalData`: quem
// não tem a aba (a maioria, durante o piloto) não paga por uma consulta de
// agenda a cada abertura do portal.

interface DiaComVagas { dia: string; vagas10: string[]; vagas40: string[] }
interface MeuAgendamento {
  id: number; dia: string; hora: string; duracao: number
  /** Trocar pode ser em cima da hora; desmarcar exige antecedência. */
  podeTrocar: boolean
  podeDesmarcar: boolean
}
interface Dados {
  hoje: string
  dias: DiaComVagas[]
  meus: MeuAgendamento[]
  podeMarcar: boolean
  avisoEmCimaDaHora: string
}

const DIAS_SEMANA = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado']
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']

/** Dia da semana lido em UTC: `dia` é data de calendário, não instante. */
function rotuloDoDia(dia: string): string {
  const d = new Date(`${dia}T00:00:00Z`)
  return `${DIAS_SEMANA[d.getUTCDay()]}, ${d.getUTCDate()} de ${MESES[d.getUTCMonth()]}`
}

export function Agenda({ onBack }: { onBack: () => void }) {
  const [dados, setDados] = React.useState<Dados | null>(null)
  const [erro, setErro] = React.useState<string | null>(null)
  const [ocupado, setOcupado] = React.useState(false)

  // null = ninguém escolhendo. Guarda o id quando está TROCANDO um horário.
  const [escolhendo, setEscolhendo] = React.useState<{ trocar: number | null } | null>(null)
  const [duracao, setDuracao] = React.useState<10 | 40 | null>(null)
  const [diaEscolhido, setDiaEscolhido] = React.useState<string | null>(null)

  const carregar = React.useCallback(async () => {
    try {
      const r = await fetch('/api/portal/agenda')
      if (!r.ok) { setErro('Não consegui carregar sua agenda.'); return }
      setDados(await r.json())
      setErro(null)
    } catch {
      setErro('Não consegui carregar sua agenda.')
    }
  }, [])

  React.useEffect(() => { carregar() }, [carregar])

  async function enviar(url: string, init: RequestInit) {
    setOcupado(true); setErro(null)
    try {
      const r = await fetch(url, init)
      const corpo = await r.json().catch(() => ({}))
      if (!r.ok) { setErro(corpo.error ?? 'Não deu certo. Tente de novo.'); return false }
      await carregar()
      setEscolhendo(null); setDuracao(null); setDiaEscolhido(null)
      return true
    } catch {
      setErro('A conexão caiu. Tente de novo.')
      return false
    } finally {
      setOcupado(false)
    }
  }

  const marcar = (dia: string, hora: string) =>
    enviar('/api/portal/agenda', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dia, hora, duracao, trocar: escolhendo?.trocar ?? undefined }),
    })

  const desmarcar = (id: number) => {
    if (!confirm('Desmarcar esta aplicação?')) return
    enviar('/api/portal/agenda', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
  }

  const vagasDoDia = (d: DiaComVagas) => (duracao === 40 ? d.vagas40 : d.vagas10)
  const diasComVaga = (dados?.dias ?? []).filter((d) => vagasDoDia(d).length > 0)

  return (
    <>
      <ScreenHeader title="Agenda" onBack={onBack} />
      <div style={{ padding: '0 20px 28px' }}>
        {erro && (
          <div role="alert" style={{ background: '#fdeceb', border: '1px solid #f3b7b2', color: '#9c2d24', borderRadius: 12, padding: '11px 13px', fontSize: 13, marginBottom: 14 }}>
            {erro}
          </div>
        )}

        {!dados && !erro && <p style={{ fontSize: 13, opacity: 0.6 }}>Carregando...</p>}

        {dados && !escolhendo && (
          <>
            {dados.meus.length === 0 ? (
              <div style={{ background: C.white, borderRadius: 16, padding: '22px 16px', textAlign: 'center', boxShadow: shadowCard }}>
                <div style={{ fontSize: 30, marginBottom: 8 }}>🗓️</div>
                <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 5 }}>Nenhuma aplicação marcada</div>
                <div style={{ fontSize: 12, opacity: 0.65, lineHeight: 1.5 }}>
                  Escolha o melhor horário para você nas próximas quatro semanas.
                </div>
              </div>
            ) : (
              dados.meus.map((m) => (
                <div key={m.id} style={{ background: C.white, borderRadius: 16, padding: '17px 15px', boxShadow: shadowCard, borderLeft: `4px solid ${C.sageText}`, marginBottom: 12 }}>
                  <div style={{ fontSize: 10, opacity: 0.6, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 5 }}>
                    Sua próxima aplicação
                  </div>
                  <div style={{ fontSize: 17, fontWeight: 700 }}>{rotuloDoDia(m.dia)}</div>
                  <div style={{ fontSize: 27, fontWeight: 700, fontFamily: serif, margin: '3px 0' }}>{m.hora}</div>
                  <div style={{ fontSize: 12, opacity: 0.7 }}>
                    {m.duracao === 40 ? 'Soroterapia — 40 minutos' : 'Aplicação — 10 minutos'}
                  </div>

                  {/* Os dois botões vivem permissões DIFERENTES: trocar pode
                      ser em cima da hora, porque o paciente continua vindo;
                      desmarcar não, porque a medicação já separada fica sem
                      dono. Por isso não há um `if` só para os dois. */}
                  {(m.podeTrocar || m.podeDesmarcar) && (
                    <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
                      {m.podeTrocar && (
                        <button
                          onClick={() => { setEscolhendo({ trocar: m.id }); setDuracao(m.duracao as 10 | 40) }}
                          style={{ flex: 1, border: `1px solid rgba(0,0,0,.16)`, background: C.white, borderRadius: 11, padding: 10, fontSize: 13, fontWeight: 700 }}
                        >
                          Trocar horário
                        </button>
                      )}
                      {m.podeDesmarcar && (
                        <button
                          onClick={() => desmarcar(m.id)}
                          disabled={ocupado}
                          style={{ flex: 1, border: '1px solid rgba(180,69,58,.45)', color: '#b4453a', background: C.white, borderRadius: 11, padding: 10, fontSize: 13, fontWeight: 700 }}
                        >
                          Desmarcar
                        </button>
                      )}
                    </div>
                  )}

                  {/* Só o DESMARCAR manda para o grupo. Quando dá para trocar
                      mas não para desmarcar, o recado é esse — e explicar
                      que trocar continua valendo evita a pessoa achar que
                      está sem saída. */}
                  {!m.podeDesmarcar && (
                    <div role="note" style={{ marginTop: 14, background: '#fdf6e3', border: '1px solid #e8d9a8', borderRadius: 11, padding: '11px 12px', fontSize: 12, lineHeight: 1.5 }}>
                      {m.podeTrocar
                        ? `Você ainda pode trocar o horário. Para desmarcar: ${dados.avisoEmCimaDaHora.toLowerCase()}`
                        : dados.avisoEmCimaDaHora}
                    </div>
                  )}
                </div>
              ))
            )}

            {dados.podeMarcar && (
              <button
                onClick={() => setEscolhendo({ trocar: null })}
                style={{ width: '100%', background: C.sageText, color: '#fff', borderRadius: 12, padding: 13, fontSize: 14, fontWeight: 700, marginTop: 14, border: 'none' }}
              >
                Marcar minha aplicação
              </button>
            )}

            {!dados.podeMarcar && dados.meus.length > 0 && (
              <p style={{ fontSize: 11, opacity: 0.55, marginTop: 13, lineHeight: 1.55, textAlign: 'center' }}>
                Você marca uma aplicação por vez. Depois desta, a próxima libera.
              </p>
            )}
          </>
        )}

        {dados && escolhendo && (
          <>
            <button
              onClick={() => { setEscolhendo(null); setDuracao(null); setDiaEscolhido(null) }}
              style={{ background: 'none', border: 'none', fontSize: 12, opacity: 0.6, padding: 0, marginBottom: 12 }}
            >
              ← voltar
            </button>

            <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 7 }}>Quanto tempo você vai ficar?</div>
            <div style={{ display: 'flex', gap: 7, marginBottom: 17 }}>
              {([10, 40] as const).map((d) => (
                <button
                  key={d}
                  onClick={() => { setDuracao(d); setDiaEscolhido(null) }}
                  style={{
                    flex: 1, borderRadius: 12, padding: '12px 7px', textAlign: 'center',
                    border: duracao === d ? `2px solid ${C.sageText}` : '1px solid rgba(0,0,0,.14)',
                    background: duracao === d ? C.sageText : C.white,
                    color: duracao === d ? '#fff' : C.graphite,
                  }}
                >
                  <div style={{ fontSize: 17, fontWeight: 700, fontFamily: serif }}>{d} minutos</div>
                  <div style={{ fontSize: 10.5, opacity: 0.85, marginTop: 3 }}>
                    {d === 10 ? 'Só a aplicação' : 'Soroterapia — com ou sem aplicação junto'}
                  </div>
                </button>
              ))}
            </div>

            {duracao && (
              <>
                <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 7 }}>Que dia?</div>
                <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 6, marginBottom: 16 }}>
                  {diasComVaga.map((d) => (
                    <button
                      key={d.dia}
                      onClick={() => setDiaEscolhido(d.dia)}
                      style={{
                        flexShrink: 0, minWidth: 64, borderRadius: 10, padding: '8px 6px', textAlign: 'center',
                        border: diaEscolhido === d.dia ? `2px solid ${C.sageText}` : '1px solid rgba(0,0,0,.12)',
                        background: C.white, fontSize: 10,
                      }}
                    >
                      {rotuloDoDia(d.dia).split(',')[0].slice(0, 3)}
                      <div style={{ fontSize: 14, fontWeight: 700 }}>{Number(d.dia.slice(8, 10))}</div>
                    </button>
                  ))}
                </div>
                {diasComVaga.length === 0 && (
                  <p style={{ fontSize: 12, opacity: 0.6 }}>Não há horário livre para essa duração nas próximas semanas.</p>
                )}
              </>
            )}

            {duracao && diaEscolhido && (
              <>
                <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 7 }}>Que horas?</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {vagasDoDia(diasComVaga.find((d) => d.dia === diaEscolhido)!).map((h) => (
                    <button
                      key={h}
                      disabled={ocupado}
                      onClick={() => marcar(diaEscolhido, h)}
                      style={{ background: C.white, border: '1px solid rgba(0,0,0,.12)', borderRadius: 9, padding: '7px 11px', fontSize: 12.5, fontWeight: 600 }}
                    >
                      {h}
                    </button>
                  ))}
                </div>
                <p style={{ fontSize: 10.5, opacity: 0.55, marginTop: 11, lineHeight: 1.5 }}>
                  Na dúvida, é o que foi combinado no grupo.
                </p>
              </>
            )}
          </>
        )}
      </div>
    </>
  )
}
