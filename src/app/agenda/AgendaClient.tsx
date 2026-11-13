'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { fatiasDoDia } from '@/lib/agenda-grade'
import { atingidosPeloBloqueio } from '@/lib/agenda-vagas'
import { somarDiasAoDia } from '@/lib/datas'
import type { AgendamentoComNome, BloqueioGravado, Desmarcado, StatusAgendamento } from '@/lib/agenda-db'

// Tela da equipe. A enfermeira abre isto no começo do turno, com a sala cheia:
// o que importa é ver quem está em cada horário e mudar o estado com um toque.
// Todas as datas são dias puros AAAA-MM-DD, nunca passam por `Date` local.

type Modo = 'dia' | 'semana'
type Duracao = 10 | 40
type PacienteBusca = { id: number; name: string }

// Os quatro estados que a enfermeira alterna. `desmarcou` não entra: é o que o
// botão "Desmarcar" e o bloqueio gravam, e a linha some da grade.
const STATUS_ESCOLHA: { valor: StatusAgendamento; rotulo: string }[] = [
  { valor: 'agendado', rotulo: 'Agendado' },
  { valor: 'atendido', rotulo: 'Atendido' },
  { valor: 'faltou', rotulo: 'Faltou' },
  { valor: 'remarcou', rotulo: 'Remarcou' },
]

const COR_STATUS: Record<StatusAgendamento, string> = {
  agendado: 'bg-violet-100 text-violet-800 border-violet-200',
  atendido: 'bg-green-100 text-green-800 border-green-200',
  faltou: 'bg-red-100 text-red-800 border-red-200',
  remarcou: 'bg-amber-100 text-amber-800 border-amber-200',
  desmarcou: 'bg-gray-100 text-gray-500 border-gray-200',
}

const DIAS_SEMANA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']

// Lido em UTC: `AAAA-MM-DD` já é meia-noite UTC; em fuso local recuaria um dia.
const diaDaSemana = (dia: string) => new Date(`${dia}T00:00:00Z`).getUTCDay()
const segundaDe = (dia: string) => somarDiasAoDia(dia, -((diaDaSemana(dia) + 6) % 7)) ?? dia
const dm = (dia: string) => `${dia.slice(8, 10)}/${dia.slice(5, 7)}`
const rotuloDia = (dia: string) => `${DIAS_SEMANA[diaDaSemana(dia)]}, ${dm(dia)}`
const minutos = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5))
const hhmm = (min: number) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`
const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

// Só estes dois estados seguram a cadeira (mesma regra do servidor).
const vivo = (s: StatusAgendamento) => s === 'agendado' || s === 'atendido'

async function lerJson(r: Response) {
  return r.json().catch(() => ({}))
}

type Pendente = { id: number; para: StatusAgendamento }

export function AgendaClient({ hoje }: { hoje: string }) {
  const [modo, setModo] = useState<Modo>('dia')
  const [dia, setDia] = useState(hoje)
  const [agendamentos, setAgendamentos] = useState<AgendamentoComNome[]>([])
  const [bloqueios, setBloqueios] = useState<BloqueioGravado[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  // Avisos do servidor ficam na tela até a pessoa fechar: furar a regra sabendo é
  // permitido, furar sem ver o aviso não é.
  const [aviso, setAviso] = useState<string | null>(null)
  const [atingidos, setAtingidos] = useState<{ dia: string; de: string; ate: string; lista: Desmarcado[] } | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const [pendente, setPendente] = useState<Pendente | null>(null)
  const [encaixe, setEncaixe] = useState<{ hora: string } | null>(null)
  const [bloqueando, setBloqueando] = useState(false)

  const de = modo === 'dia' ? dia : segundaDe(dia)
  const ate = modo === 'dia' ? dia : (somarDiasAoDia(de, 6) ?? de)

  // Resposta de um período antigo não pode sobrescrever a do período atual
  // quando a pessoa troca de dia/modo rápido.
  const seq = useRef(0)
  const carregar = useCallback(async () => {
    const minha = ++seq.current
    setCarregando(true)
    try {
      const r = await fetch(`/api/agenda?de=${de}&ate=${ate}`)
      const dados = await lerJson(r)
      if (minha !== seq.current) return
      if (!r.ok) {
        setErro(dados.error ?? 'Não foi possível carregar a agenda.')
        return
      }
      setErro(null)
      setAgendamentos(dados.agendamentos ?? [])
      setBloqueios(dados.bloqueios ?? [])
    } catch {
      if (minha === seq.current) setErro('Não foi possível carregar a agenda.')
    } finally {
      if (minha === seq.current) setCarregando(false)
    }
  }, [de, ate])

  useEffect(() => {
    carregar()
  }, [carregar])

  // Desmarcado some da grade (o horário ficou livre); o total aparece no rodapé.
  const visiveis = useMemo(() => agendamentos.filter((a) => a.status !== 'desmarcou'), [agendamentos])
  const desmarcadosNoPeriodo = agendamentos.length - visiveis.length

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async function chamar(url: string, init: RequestInit, aoOk?: (dados: any) => void) {
    setOcupado(true)
    setErro(null)
    try {
      const r = await fetch(url, init)
      const dados = await lerJson(r)
      if (!r.ok) {
        setErro(dados.error ?? 'Não foi possível concluir a ação.')
        return false
      }
      aoOk?.(dados)
      await carregar()
      return true
    } catch {
      setErro('Não foi possível concluir a ação.')
      return false
    } finally {
      setOcupado(false)
    }
  }

  const json = (metodo: string, corpo: unknown): RequestInit => ({
    method: metodo,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(corpo),
  })

  function pedirStatus(a: AgendamentoComNome, para: StatusAgendamento) {
    if (a.status === para) return
    // faltou/remarcou soltam a cadeira. Voltar para agendado/atendido a retoma sem
    // o servidor conferir se o horário ainda está livre ou bloqueado (só o índice
    // único barra uma colisão). Por isso pede confirmação, dizendo isso.
    if (!vivo(a.status) && vivo(para)) {
      setPendente({ id: a.id, para })
      return
    }
    aplicarStatus(a.id, para)
  }

  async function aplicarStatus(id: number, para: StatusAgendamento) {
    setPendente(null)
    if (para === 'desmarcou') await chamar(`/api/agenda/${id}`, { method: 'DELETE' })
    else await chamar(`/api/agenda/${id}`, json('PATCH', { status: para }))
  }

  async function mudarDuracao(a: AgendamentoComNome, duracao: Duracao) {
    if (a.duracao === duracao) return
    await chamar(`/api/agenda/${a.id}`, json('PATCH', { duracao }), (d) => {
      if (d.aviso) setAviso(`Duração alterada, mas atenção: ${d.aviso}`)
    })
  }

  const cartao = (a: AgendamentoComNome) => (
    <CartaoAgendamento
      key={a.id}
      a={a}
      ocupado={ocupado}
      pendente={pendente?.id === a.id ? pendente : null}
      onStatus={pedirStatus}
      onDuracao={mudarDuracao}
      onConfirmar={() => pendente && aplicarStatus(pendente.id, pendente.para)}
      onCancelar={() => setPendente(null)}
      onDesmarcar={() => setPendente({ id: a.id, para: 'desmarcou' })}
    />
  )

  function irPara(novo: string) {
    setDia(novo)
    setPendente(null)
  }
  const passo = modo === 'dia' ? 1 : 7

  return (
    <main className="min-h-screen bg-gray-50 px-4 py-6">
      <div className="max-w-3xl mx-auto space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-2xl font-bold text-gray-900">Agenda</h1>
          <div className="inline-flex rounded-xl border border-gray-200 bg-white overflow-hidden text-sm">
            {(['dia', 'semana'] as Modo[]).map((m) => (
              <button
                key={m}
                onClick={() => setModo(m)}
                aria-pressed={modo === m}
                className={`px-4 py-2 font-medium ${modo === m ? 'bg-violet-600 text-white' : 'text-gray-600 hover:bg-gray-50'}`}
              >
                {m === 'dia' ? 'Dia' : 'Semana'}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 bg-white rounded-xl border border-gray-200 px-3 py-2">
          <button
            aria-label={modo === 'dia' ? 'Dia anterior' : 'Semana anterior'}
            onClick={() => irPara(somarDiasAoDia(dia, -passo) ?? dia)}
            className="px-3 py-1.5 rounded-lg text-gray-600 hover:bg-gray-100"
          >
            ←
          </button>
          <div className="text-center">
            <p className="font-semibold text-gray-800">
              {modo === 'dia' ? rotuloDia(dia) : `${dm(de)} a ${dm(ate)}`}
            </p>
            {dia !== hoje && (
              <button onClick={() => irPara(hoje)} className="text-xs text-violet-600 hover:underline">
                Ir para hoje
              </button>
            )}
          </div>
          <button
            aria-label={modo === 'dia' ? 'Próximo dia' : 'Próxima semana'}
            onClick={() => irPara(somarDiasAoDia(dia, passo) ?? dia)}
            className="px-3 py-1.5 rounded-lg text-gray-600 hover:bg-gray-100"
          >
            →
          </button>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setEncaixe({ hora: '' })}
            className="px-4 py-2 bg-violet-600 text-white text-sm font-medium rounded-xl hover:bg-violet-700"
          >
            Encaixar alguém
          </button>
          <button
            onClick={() => setBloqueando(true)}
            className="px-4 py-2 bg-white border border-gray-300 text-gray-700 text-sm font-medium rounded-xl hover:bg-gray-50"
          >
            Bloquear
          </button>
        </div>

        {erro && (
          <p role="alert" className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-4 py-2">
            {erro}
          </p>
        )}

        {aviso && (
          <div role="status" className="flex items-start gap-2 text-sm text-amber-900 bg-amber-50 border border-amber-300 rounded-xl px-4 py-3">
            <p className="flex-1">{aviso}</p>
            <button onClick={() => setAviso(null)} aria-label="Fechar aviso" className="text-amber-700 hover:text-amber-900">
              ✕
            </button>
          </div>
        )}

        {atingidos && (
          <div role="status" className="text-sm bg-red-50 border border-red-300 rounded-xl px-4 py-3">
            <div className="flex items-start gap-2">
              <p className="flex-1 font-semibold text-red-900">
                Bloqueio de {atingidos.de} às {atingidos.ate} em {dm(atingidos.dia)} gravado.{' '}
                {atingidos.lista.length === 0
                  ? 'Ninguém estava marcado nesse período.'
                  : `${atingidos.lista.length === 1 ? 'Esta pessoa foi desmarcada' : `Estas ${atingidos.lista.length} pessoas foram desmarcadas`}: avise pelo WhatsApp.`}
              </p>
              <button onClick={() => setAtingidos(null)} aria-label="Fechar lista de desmarcados" className="text-red-700 hover:text-red-900">
                ✕
              </button>
            </div>
            {atingidos.lista.length > 0 && (
              <ul className="mt-2 space-y-1 text-red-900">
                {atingidos.lista.map((d) => (
                  <li key={d.id}>
                    <span className="font-mono">{d.hora}</span>{' '}
                    <a href={`/pacientes/${d.patientId}`} className="underline">{d.nome}</a>{' '}
                    <span className="text-red-700">({d.duracao} min)</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {encaixe && (
          <FormEncaixe
            dia={dia}
            horaInicial={encaixe.hora}
            ocupado={ocupado}
            onFechar={() => setEncaixe(null)}
            onEnviar={async (corpo) => {
              const ok = await chamar('/api/agenda', json('POST', { ...corpo, forcado: true }), (d) => {
                setAviso(d.aviso ? `Encaixe gravado, mas atenção: ${d.aviso}` : null)
              })
              if (ok) setEncaixe(null)
            }}
          />
        )}

        {bloqueando && (
          <FormBloqueio
            dia={dia}
            agendamentos={agendamentos}
            ocupado={ocupado}
            onFechar={() => setBloqueando(false)}
            onEnviar={async (corpo) => {
              const ok = await chamar('/api/agenda/bloqueios', json('POST', corpo), (d) => {
                setAtingidos({ dia: corpo.dia, de: corpo.de, ate: corpo.ate, lista: d.desmarcados ?? [] })
              })
              if (ok) setBloqueando(false)
            }}
          />
        )}

        {carregando && <p className="text-sm text-gray-400">Carregando...</p>}

        {modo === 'dia' ? (
          <VisaoDia
            dia={dia}
            agendamentos={visiveis}
            bloqueios={bloqueios}
            cartao={cartao}
            onEncaixarAqui={(hora) => setEncaixe({ hora })}
          />
        ) : (
          <VisaoSemana
            de={de}
            agendamentos={visiveis}
            bloqueios={bloqueios}
            hoje={hoje}
            onAbrirDia={(d) => {
              setDia(d)
              setModo('dia')
            }}
          />
        )}

        {desmarcadosNoPeriodo > 0 && (
          <p className="text-xs text-gray-400">
            {desmarcadosNoPeriodo} {desmarcadosNoPeriodo === 1 ? 'horário desmarcado' : 'horários desmarcados'} neste período (não aparecem na grade).
          </p>
        )}
      </div>
    </main>
  )
}

function CartaoAgendamento({
  a, ocupado, pendente, onStatus, onDuracao, onConfirmar, onCancelar, onDesmarcar,
}: {
  a: AgendamentoComNome
  ocupado: boolean
  pendente: Pendente | null
  onStatus: (a: AgendamentoComNome, para: StatusAgendamento) => void
  onDuracao: (a: AgendamentoComNome, d: Duracao) => void
  onConfirmar: () => void
  onCancelar: () => void
  onDesmarcar: () => void
}) {
  return (
    <li className="rounded-xl border border-gray-200 bg-white px-3 py-2 space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <a href={`/pacientes/${a.patient_id}`} className="font-semibold text-violet-700 hover:underline">
          {a.nome}
        </a>
        <span className={`text-xs px-2 py-0.5 rounded-full border ${COR_STATUS[a.status]}`}>{a.status}</span>
        {a.encaixe && (
          <span className="text-xs px-2 py-0.5 rounded-full bg-orange-100 text-orange-800 border border-orange-300 font-medium">
            Encaixe
          </span>
        )}
        <span className="text-xs text-gray-400">{a.duracao} min</span>
        {a.status === 'atendido' && (
          <a
            href={`/estoque/saida?paciente=${a.patient_id}`}
            className="ml-auto text-xs font-medium text-green-700 border border-green-300 bg-green-50 rounded-lg px-2 py-1 hover:bg-green-100"
          >
            Registrar saída dos ativos
          </a>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {STATUS_ESCOLHA.map((s) => (
          <button
            key={s.valor}
            disabled={ocupado}
            aria-pressed={a.status === s.valor}
            onClick={() => onStatus(a, s.valor)}
            className={`text-xs px-2.5 py-1 rounded-lg border disabled:opacity-50 ${
              a.status === s.valor ? COR_STATUS[s.valor] + ' font-semibold' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
            }`}
          >
            {s.rotulo}
          </button>
        ))}
        {vivo(a.status) && (
          <span className="inline-flex items-center gap-1 ml-1" role="group" aria-label="Duração">
            {([10, 40] as Duracao[]).map((d) => (
              <button
                key={d}
                disabled={ocupado}
                aria-pressed={a.duracao === d}
                onClick={() => onDuracao(a, d)}
                className={`text-xs px-2 py-1 rounded-lg border disabled:opacity-50 ${
                  a.duracao === d ? 'bg-gray-800 text-white border-gray-800' : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'
                }`}
              >
                {d} min
              </button>
            ))}
          </span>
        )}
        <button
          disabled={ocupado}
          onClick={onDesmarcar}
          className="text-xs px-2 py-1 ml-auto text-gray-400 hover:text-red-600 disabled:opacity-50"
        >
          Desmarcar
        </button>
      </div>

      {pendente && (
        <div role="alert" className="text-xs bg-amber-50 border border-amber-300 text-amber-900 rounded-lg px-3 py-2 space-y-2">
          <p>
            {pendente.para === 'desmarcou'
              ? 'Desmarcar este horário? O paciente deixa de aparecer na grade e o horário fica livre.'
              : `Voltar para "${pendente.para}" retoma o horário sem conferir de novo se ele ainda está livre nem se está bloqueado. Se alguém já ocupou, o sistema recusa; um bloqueio ele não vê.`}
          </p>
          <div className="flex gap-2">
            <button disabled={ocupado} onClick={onConfirmar} className="px-3 py-1 bg-amber-600 text-white rounded-lg font-medium disabled:opacity-50">
              {pendente.para === 'desmarcou' ? 'Desmarcar' : 'Voltar mesmo assim'}
            </button>
            <button onClick={onCancelar} className="px-3 py-1 text-amber-800 hover:underline">
              Cancelar
            </button>
          </div>
        </div>
      )}
    </li>
  )
}

function VisaoDia({
  dia, agendamentos, bloqueios, cartao, onEncaixarAqui,
}: {
  dia: string
  agendamentos: AgendamentoComNome[]
  bloqueios: BloqueioGravado[]
  cartao: (a: AgendamentoComNome) => ReactNode
  onEncaixarAqui: (hora: string) => void
}) {
  const fatias = fatiasDoDia(dia)
  const doDia = agendamentos.filter((a) => a.dia === dia)
  const bloqueiosDoDia = bloqueios.filter((b) => b.dia === dia)
  // Um encaixe pode cair fora do expediente (feriado, 20:30). Mesmo assim a linha
  // precisa existir: se só as fatias da grade aparecessem, quem foi encaixado
  // sumiria da tela.
  const horas = Array.from(new Set([...fatias, ...doDia.map((a) => a.hora)])).sort()
  const bloqueado = (hora: string) => bloqueiosDoDia.find((b) => b.de <= hora && hora < b.ate)

  return (
    <section className="space-y-2">
      {fatias.length === 0 && (
        <p className="text-sm text-gray-500 bg-white rounded-xl border border-gray-200 px-4 py-3">
          A clínica não atende neste dia.
        </p>
      )}
      {bloqueiosDoDia.map((b) => (
        <p key={b.id} className="text-sm bg-gray-100 text-gray-700 rounded-xl px-4 py-2">
          Bloqueado das {b.de} às {b.ate}
          {b.motivo ? `: ${b.motivo}` : ''}
        </p>
      ))}
      <ol className="space-y-1.5">
        {horas.map((hora) => {
          const aqui = doDia.filter((a) => a.hora === hora)
          const bloq = bloqueado(hora)
          return (
            <li key={hora} className="flex gap-3 items-start" aria-label={`Horário ${hora}`}>
              <span className="w-12 shrink-0 pt-2 text-sm font-mono text-gray-500">{hora}</span>
              <div className="flex-1 min-w-0">
                {aqui.length > 0 ? (
                  <div className="space-y-1.5">
                    <ul className="space-y-1.5">{aqui.map((a) => cartao(a))}</ul>
                    {aqui.length > 1 && (
                      <p className="text-xs text-orange-700">{aqui.length} pessoas neste horário (encaixe).</p>
                    )}
                  </div>
                ) : bloq ? (
                  <p className="text-sm text-gray-400 pt-2">Bloqueado</p>
                ) : (
                  <div className="flex items-center justify-between pt-1.5">
                    <span className="text-sm text-gray-300">Livre</span>
                    <button onClick={() => onEncaixarAqui(hora)} className="text-xs text-violet-600 hover:underline">
                      Encaixar às {hora}
                    </button>
                  </div>
                )}
              </div>
            </li>
          )
        })}
      </ol>
    </section>
  )
}

function VisaoSemana({
  de, agendamentos, bloqueios, hoje, onAbrirDia,
}: {
  de: string
  agendamentos: AgendamentoComNome[]
  bloqueios: BloqueioGravado[]
  hoje: string
  onAbrirDia: (dia: string) => void
}) {
  const dias = Array.from({ length: 7 }, (_, i) => somarDiasAoDia(de, i) ?? de)
  return (
    <section className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {dias.map((d) => {
        const lista = agendamentos.filter((a) => a.dia === d)
        const fechado = fatiasDoDia(d).length === 0
        return (
          <div key={d} className={`rounded-xl border bg-white p-3 ${d === hoje ? 'border-violet-400' : 'border-gray-200'}`}>
            <button onClick={() => onAbrirDia(d)} className="font-semibold text-gray-800 hover:text-violet-700">
              {rotuloDia(d)}
            </button>
            {fechado && lista.length === 0 && <p className="text-xs text-gray-400 mt-1">Fechado</p>}
            {bloqueios.filter((b) => b.dia === d).map((b) => (
              <p key={b.id} className="text-xs text-gray-500 mt-1">Bloqueado {b.de} às {b.ate}</p>
            ))}
            <ul className="mt-1 space-y-1">
              {lista.map((a) => (
                <li key={a.id} className="flex flex-wrap items-center gap-1.5 text-sm">
                  <span className="font-mono text-gray-500">{a.hora}</span>
                  <a href={`/pacientes/${a.patient_id}`} className="text-violet-700 hover:underline">{a.nome}</a>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full border ${COR_STATUS[a.status]}`}>{a.status}</span>
                  {a.encaixe && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-orange-100 text-orange-800 border border-orange-300">Encaixe</span>
                  )}
                </li>
              ))}
            </ul>
            {!fechado && lista.length === 0 && <p className="text-xs text-gray-300 mt-1">Ninguém marcado</p>}
          </div>
        )
      })}
    </section>
  )
}

function FormEncaixe({
  dia, horaInicial, ocupado, onFechar, onEnviar,
}: {
  dia: string
  horaInicial: string
  ocupado: boolean
  onFechar: () => void
  onEnviar: (c: { patientId: number; dia: string; hora: string; duracao: Duracao }) => void
}) {
  const [hora, setHora] = useState(horaInicial)
  const [duracao, setDuracao] = useState<Duracao>(10)
  const [busca, setBusca] = useState('')
  const [escolhido, setEscolhido] = useState<PacienteBusca | null>(null)
  const [pacientes, setPacientes] = useState<PacienteBusca[] | null>(null)

  // A lista de pacientes só desce quando a pessoa abre este formulário, e não com
  // a grade: é dado de saúde, e a grade do dia já vem com os nomes de que precisa.
  useEffect(() => {
    let montado = true
    fetch('/api/patients')
      .then((r) => r.json())
      .then((l) => montado && setPacientes(Array.isArray(l) ? l.map((p: PacienteBusca) => ({ id: p.id, name: p.name })) : []))
      .catch(() => montado && setPacientes([]))
    return () => {
      montado = false
    }
  }, [])

  const achados = busca.trim()
    ? (pacientes ?? []).filter((p) => semAcento(p.name).includes(semAcento(busca.trim()))).slice(0, 6)
    : []
  const horaOk = /^\d{2}:\d{2}$/.test(hora)

  return (
    <div className="bg-white rounded-xl border border-violet-200 p-4 space-y-3">
      <h2 className="font-semibold text-gray-800">Encaixar alguém em {rotuloDia(dia)}</h2>
      {escolhido ? (
        <div className="flex items-center gap-2 p-2.5 bg-violet-50 border border-violet-200 rounded-xl">
          <span className="text-sm font-medium text-violet-800 flex-1">{escolhido.name}</span>
          <button onClick={() => setEscolhido(null)} aria-label="Trocar paciente" className="text-violet-400 hover:text-violet-600">✕</button>
        </div>
      ) : (
        <div>
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar paciente..."
            aria-label="Buscar paciente"
            className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400"
          />
          {achados.map((p) => (
            <button
              key={p.id}
              onClick={() => setEscolhido(p)}
              className="block w-full text-left px-3 py-2 text-sm hover:bg-violet-50 border-b border-gray-50"
            >
              {p.name}
            </button>
          ))}
          {busca.trim() && pacientes && achados.length === 0 && (
            <p className="text-xs text-gray-400 mt-1">Nenhum paciente encontrado</p>
          )}
        </div>
      )}
      <div className="flex flex-wrap gap-3 items-end">
        <label className="text-sm text-gray-600">
          Hora
          <input
            type="time"
            step={600}
            value={hora}
            onChange={(e) => setHora(e.target.value)}
            className="block border border-gray-300 rounded-xl px-3 py-2 text-sm mt-1"
          />
        </label>
        <div className="text-sm text-gray-600">
          Duração
          <div className="flex gap-1 mt-1">
            {([10, 40] as Duracao[]).map((d) => (
              <button
                key={d}
                aria-pressed={duracao === d}
                onClick={() => setDuracao(d)}
                className={`px-3 py-2 rounded-xl border text-sm ${duracao === d ? 'bg-gray-800 text-white border-gray-800' : 'bg-white text-gray-600 border-gray-300'}`}
              >
                {d} min
              </button>
            ))}
          </div>
        </div>
      </div>
      <p className="text-xs text-gray-500">
        O encaixe grava mesmo se o horário estiver ocupado, bloqueado ou fora do expediente. Se isso acontecer, o aviso aparece na tela.
      </p>
      <div className="flex gap-2">
        <button
          disabled={ocupado || !escolhido || !horaOk}
          onClick={() => escolhido && onEnviar({ patientId: escolhido.id, dia, hora, duracao })}
          className="px-4 py-2 bg-violet-600 text-white text-sm font-medium rounded-xl hover:bg-violet-700 disabled:opacity-50"
        >
          Confirmar encaixe
        </button>
        <button onClick={onFechar} className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700">
          Cancelar
        </button>
      </div>
    </div>
  )
}

function FormBloqueio({
  dia, agendamentos, ocupado, onFechar, onEnviar,
}: {
  dia: string
  agendamentos: AgendamentoComNome[]
  ocupado: boolean
  onFechar: () => void
  onEnviar: (c: { dia: string; de: string; ate: string; motivo?: string }) => void
}) {
  const fatias = fatiasDoDia(dia)
  const [de, setDe] = useState(fatias[0] ?? '08:00')
  const [ate, setAte] = useState(fatias.length ? hhmm(minutos(fatias[fatias.length - 1]) + 10) : '18:00')
  const [motivo, setMotivo] = useState('')

  const valido = /^\d{2}:\d{2}$/.test(de) && /^\d{2}:\d{2}$/.test(ate) && de < ate
  // Prévia ANTES de confirmar, com a mesma régua do servidor: bloquear desmarca
  // gente, e a equipe precisa saber quem antes de apertar. Depois do envio o
  // servidor devolve a lista oficial, que é a que fica na tela.
  const previa = valido
    ? atingidosPeloBloqueio(
        { dia, de, ate },
        agendamentos.filter((a) => a.dia === dia && vivo(a.status)),
      )
    : []
  const nomesPrevia = agendamentos.filter((a) => previa.includes(a.id))

  return (
    <div className="bg-white rounded-xl border border-gray-300 p-4 space-y-3">
      <h2 className="font-semibold text-gray-800">Bloquear {rotuloDia(dia)}</h2>
      <div className="flex flex-wrap gap-3 items-end">
        <label className="text-sm text-gray-600">
          De
          <input type="time" value={de} onChange={(e) => setDe(e.target.value)} className="block border border-gray-300 rounded-xl px-3 py-2 text-sm mt-1" />
        </label>
        <label className="text-sm text-gray-600">
          Até
          <input type="time" value={ate} onChange={(e) => setAte(e.target.value)} className="block border border-gray-300 rounded-xl px-3 py-2 text-sm mt-1" />
        </label>
        <label className="text-sm text-gray-600 flex-1 min-w-[10rem]">
          Motivo (opcional)
          <input value={motivo} onChange={(e) => setMotivo(e.target.value)} className="block w-full border border-gray-300 rounded-xl px-3 py-2 text-sm mt-1" />
        </label>
      </div>
      {valido && (
        <div className="text-sm">
          {nomesPrevia.length === 0 ? (
            <p className="text-gray-500">Ninguém marcado neste período será desmarcado.</p>
          ) : (
            <div className="text-red-800 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
              <p className="font-medium">Serão desmarcados ({nomesPrevia.length}):</p>
              <ul>
                {nomesPrevia.map((a) => (
                  <li key={a.id}>{a.hora} {a.nome}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
      {!valido && <p className="text-xs text-red-600">A hora final precisa ser depois da inicial.</p>}
      <div className="flex gap-2">
        <button
          disabled={ocupado || !valido}
          onClick={() => onEnviar({ dia, de, ate, motivo: motivo.trim() || undefined })}
          className="px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-xl hover:bg-red-700 disabled:opacity-50"
        >
          Confirmar bloqueio
        </button>
        <button onClick={onFechar} className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700">
          Cancelar
        </button>
      </div>
    </div>
  )
}
