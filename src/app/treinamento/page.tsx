'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { LEVELS, SCENARIOS } from '@/lib/training/personas'
import { formatUsd, sessionCostUsd } from '@/lib/training/pricing'
import type { Level, ScenarioKey, TrainingSession } from '@/lib/training/types'

// Sala de treino: escolher nível/cenário e ver o histórico pessoal. A lógica
// de nota (média, veto) mora no servidor — aqui só exibimos o que a API manda.

const LEVEL_KEYS = Object.keys(LEVELS).map(Number) as Level[]
const SCENARIO_KEYS = Object.keys(SCENARIOS) as ScenarioKey[]

// Rótulos de exibição — não existe um mapa pronto no /lib para isso (só os
// tipos), então definimos aqui. DISPENSOU_BEM é um bom desfecho num nível
// difícil, não uma falha — por isso o mesmo tom de "sucesso" que AGENDOU.
const OUTCOME_LABELS: Record<string, string> = {
  AGENDOU: 'Agendou',
  NAO_AGENDOU: 'Não agendou',
  SUMIU: 'Sumiu',
  PERDEU_O_PACIENTE: 'Perdeu o paciente',
  DISPENSOU_BEM: 'Dispensou bem',
}

const OUTCOME_CLASS: Record<string, string> = {
  AGENDOU: 'bg-green-100 text-green-700',
  NAO_AGENDOU: 'bg-gray-100 text-gray-600',
  SUMIU: 'bg-amber-100 text-amber-700',
  PERDEU_O_PACIENTE: 'bg-red-100 text-red-700',
  DISPENSOU_BEM: 'bg-green-100 text-green-700',
}

const VERDICT_LABELS: Record<string, string> = {
  APROVADA: 'Aprovada',
  APROVADA_COM_RESSALVA: 'Aprovada com ressalva',
  REPROVADA: 'Reprovada',
}

const VERDICT_CLASS: Record<string, string> = {
  APROVADA: 'bg-green-100 text-green-700',
  APROVADA_COM_RESSALVA: 'bg-amber-100 text-amber-700',
  REPROVADA: 'bg-red-100 text-red-700',
}

const primaryBtn = 'px-5 py-2 bg-violet-600 text-white text-sm font-medium rounded-lg hover:bg-violet-700 disabled:opacity-50 transition-colors'
const secondaryBtn = 'px-4 py-2 border border-violet-200 text-violet-700 text-sm font-medium rounded-lg hover:bg-violet-50 transition-colors'

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

// Custo em dólar de uma sessão, a partir dos tokens de fato consumidos na API
// (gravados por sessions.ts) — não uma estimativa.
function sessionCost(s: TrainingSession) {
  return sessionCostUsd({
    patientInputTokens: s.patient_input_tokens,
    patientOutputTokens: s.patient_output_tokens,
    evalInputTokens: s.eval_input_tokens,
    evalOutputTokens: s.eval_output_tokens,
  }).total
}

function LevelPicker({ value, onChange }: { value: Level | null; onChange: (l: Level) => void }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-5 gap-2">
      {LEVEL_KEYS.map(level => (
        <button
          key={level}
          type="button"
          onClick={() => onChange(level)}
          className={`text-left p-3 rounded-xl border transition-colors ${
            value === level
              ? 'border-violet-500 bg-violet-50 ring-2 ring-violet-200'
              : 'border-gray-200 bg-white hover:border-violet-300'
          }`}
        >
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Nível {level}</p>
          <p className="text-xs text-gray-600 leading-snug">{LEVELS[level]}</p>
        </button>
      ))}
    </div>
  )
}

function ScenarioPicker({ value, onChange }: { value: ScenarioKey | null; onChange: (s: ScenarioKey) => void }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
      {SCENARIO_KEYS.map(key => (
        <button
          key={key}
          type="button"
          onClick={() => onChange(key)}
          className={`text-left p-3 rounded-xl border transition-colors flex gap-2 items-start ${
            value === key
              ? 'border-violet-500 bg-violet-50 ring-2 ring-violet-200'
              : 'border-gray-200 bg-white hover:border-violet-300'
          }`}
        >
          <span className="text-xs font-bold text-violet-600 shrink-0">{key}</span>
          <span className="text-xs text-gray-600 leading-snug">{SCENARIOS[key]}</span>
        </button>
      ))}
    </div>
  )
}

export default function TreinamentoPage() {
  const router = useRouter()

  const [level, setLevel] = useState<Level | null>(null)
  const [scenario, setScenario] = useState<ScenarioKey | null>(null)
  const [starting, setStarting] = useState(false)
  const [startError, setStartError] = useState<string | null>(null)
  const [kbMissing, setKbMissing] = useState(false)

  const [sessions, setSessions] = useState<TrainingSession[]>([])
  const [loadingHistory, setLoadingHistory] = useState(true)
  const [historyError, setHistoryError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch('/api/treinamento/sessions')
      .then(async res => {
        if (cancelled) return
        if (!res.ok) {
          setHistoryError('Não foi possível carregar seu histórico.')
          setLoadingHistory(false)
          return
        }
        const data = (await res.json()) as { sessions: TrainingSession[] }
        setSessions(data.sessions)
        setLoadingHistory(false)
      })
      .catch(() => {
        if (!cancelled) {
          setHistoryError('Não foi possível carregar seu histórico.')
          setLoadingHistory(false)
        }
      })
    return () => { cancelled = true }
  }, [])

  function randomize() {
    const randomLevel = LEVEL_KEYS[Math.floor(Math.random() * LEVEL_KEYS.length)]
    const randomScenario = SCENARIO_KEYS[Math.floor(Math.random() * SCENARIO_KEYS.length)]
    setLevel(randomLevel)
    setScenario(randomScenario)
  }

  async function handleStart() {
    if (level === null || scenario === null || starting) return
    setStarting(true)
    setStartError(null)
    setKbMissing(false)

    let res: Response
    try {
      res = await fetch('/api/treinamento/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ level, scenario }),
      })
    } catch {
      setStartError('Não foi possível conectar ao servidor. Verifique sua conexão e tente novamente.')
      setStarting(false)
      return
    }

    if (res.status === 409) {
      const data = await res.json().catch(() => ({}) as { error?: string })
      setStartError(data.error || 'A base de conhecimento ainda não foi preenchida.')
      setKbMissing(true)
      setStarting(false)
      return
    }

    if (!res.ok) {
      const data = await res.json().catch(() => ({}) as { error?: string })
      // 503 (créditos) também cai aqui: a sessão já foi criada e salva no
      // servidor, mas sem uma resposta do paciente ainda vale avisar em vez
      // de levar a um chat vazio e confuso.
      setStartError(data.error || 'Não foi possível iniciar o treino. Tente novamente.')
      setStarting(false)
      return
    }

    const data = (await res.json()) as { session: TrainingSession }
    router.push(`/treinamento/${data.session.id}`)
  }

  return (
    <main className="min-h-screen bg-gray-50 px-4 py-8">
      <div className="max-w-3xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Treinador de Atendimento</h1>
          <p className="text-sm text-gray-500 mt-1">
            Uma IA finge ser paciente conversando no WhatsApp. Você responde como se fosse de verdade,
            e no final recebe uma avaliação com nota, o que fazer diferente e uma frase pronta pra usar.
          </p>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 space-y-5">
          {startError && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">
              {startError}
              {kbMissing && (
                <>
                  {' '}
                  <Link href="/admin/treinamento" className="font-medium underline">
                    Preencher a base de conhecimento
                  </Link>
                </>
              )}
            </div>
          )}

          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-gray-700">1. Escolha o nível</h2>
            <button type="button" onClick={randomize} className={secondaryBtn}>
              🎲 Deixa a IA escolher
            </button>
          </div>
          <LevelPicker value={level} onChange={setLevel} />

          <h2 className="text-sm font-semibold text-gray-700">2. Escolha o cenário</h2>
          <ScenarioPicker value={scenario} onChange={setScenario} />

          <div className="flex justify-end pt-2">
            <button
              type="button"
              onClick={handleStart}
              disabled={level === null || scenario === null || starting}
              className={primaryBtn}
            >
              {starting ? 'Iniciando...' : 'Começar treino'}
            </button>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-gray-700">Seu histórico</h2>
            {!loadingHistory && !historyError && sessions.length > 0 && (
              <p className="text-xs text-gray-500">
                Custo total: <span className="font-semibold text-gray-700">{formatUsd(sessions.reduce((sum, s) => sum + sessionCost(s), 0))}</span>
              </p>
            )}
          </div>

          {loadingHistory && (
            <div className="text-center py-10">
              <div className="w-8 h-8 border-4 border-violet-600 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
              <p className="text-sm text-gray-500">Carregando histórico...</p>
            </div>
          )}

          {!loadingHistory && historyError && (
            <p className="text-sm text-red-600 text-center py-8 px-5">{historyError}</p>
          )}

          {!loadingHistory && !historyError && sessions.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-8 px-5">Nenhum treino realizado ainda.</p>
          )}

          {!loadingHistory && !historyError && sessions.length > 0 && (
            <ul>
              {sessions.map(s => {
                const unfinished = s.status === 'em_andamento'
                return (
                  <li key={s.id} className="border-b border-gray-100 last:border-0">
                    <Link
                      href={`/treinamento/${s.id}`}
                      className="flex flex-wrap items-center justify-between gap-2 px-5 py-4 hover:bg-gray-50 transition-colors"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-900">
                          Nível {s.level} · Cenário {s.scenario}
                          {unfinished && (
                            <span className="ml-2 text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">
                              em andamento
                            </span>
                          )}
                        </p>
                        <p className="text-xs text-gray-500 mt-0.5 truncate">{SCENARIOS[s.scenario]}</p>
                        <p className="text-xs text-gray-400 mt-0.5">{fmtDate(s.started_at)}</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {s.outcome && (
                          <span className={`text-xs px-2 py-0.5 rounded-full ${OUTCOME_CLASS[s.outcome] ?? 'bg-gray-100 text-gray-600'}`}>
                            {OUTCOME_LABELS[s.outcome] ?? s.outcome}
                          </span>
                        )}
                        {s.average !== null && (
                          <span className="text-xs font-semibold text-gray-700">{s.average.toFixed(1)}</span>
                        )}
                        <span className="text-xs text-gray-400">{formatUsd(sessionCost(s))}</span>
                        {s.verdict && (
                          <span className={`text-xs px-2 py-0.5 rounded-full ${VERDICT_CLASS[s.verdict] ?? 'bg-gray-100 text-gray-600'}`}>
                            {VERDICT_LABELS[s.verdict] ?? s.verdict}
                          </span>
                        )}
                        {unfinished && (
                          <span className="text-xs text-violet-600 font-medium">Continuar →</span>
                        )}
                      </div>
                    </Link>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </div>
    </main>
  )
}
