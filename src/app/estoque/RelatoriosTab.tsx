'use client'

import { useState, useMemo, useEffect, useCallback } from 'react'
import { agruparParaReposicao, precisaRepor, LIMITE_PADRAO, LIMITE_CONTROLADO, type LinhaReposicao } from '@/lib/stock-actives'
// Ignora acento, caixa e pontuação — "tirzepartida" acha "TIRZEPARTIDA".
import { normalizarNomePessoa as normalizarBusca } from '@/lib/patient-match'

interface StockMovement {
  id: number; item_id: number; item_name: string; type: 'entrada' | 'saida'
  quantity: number; lot: string | null; expiry_date: string | null
  patient_id: number | null; patient_name: string | null; observation: string | null; created_by: string | null; created_at: string
}

interface StockItem {
  id: number; name: string; unit: string; quantity: number
  notes: string | null; lot: string | null; expiry_date: string | null
}

type ReportType = 'movimentos' | 'repor' | 'top_saidas' | 'por_lote' | 'por_produto' | 'por_paciente' | 'atividade_paciente'

// A régua deixou de ser única: os ativos de uso contínuo entram na lista abaixo
// de 30, o resto abaixo de 5 (LIMITE_PADRAO). Quem decide é o catálogo em
// src/lib/stock-actives.ts.
function reorderLabel(q: number): string {
  if (q < 0) return '🚨 Saldo negativo'
  if (q === 0) return '🚨 Zerado'
  return '⚠️ Pedir'
}

interface PatientActivity {
  patient_id: number
  patient_name: string
  activities: {
    type: string
    description: string
    detail: string | null
    created_at: string
    created_by: string | null
  }[]
}

function formatDateOnly(iso: string) {
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}
function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

// Datas no fuso local (Brasília), não UTC — senão à noite o padrão pula de dia
function today() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function firstOfMonth() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

function filterByRange(movs: StockMovement[], dateStart: string, dateEnd: string) {
  const start = dateStart ? new Date(dateStart + 'T00:00:00') : null
  const end = dateEnd ? new Date(dateEnd + 'T23:59:59') : null
  return movs.filter(m => {
    const d = new Date(m.created_at)
    if (start && d < start) return false
    if (end && d > end) return false
    return true
  })
}

export function RelatoriosTab({ movements, items = [] }: { movements: StockMovement[]; items?: StockItem[] }) {
  const [report, setReport] = useState<ReportType>('movimentos')
  const [movFilter, setMovFilter] = useState<'all' | 'entrada' | 'saida'>('all')
  const [activityData, setActivityData] = useState<PatientActivity[]>([])
  const [activityLoading, setActivityLoading] = useState(false)
  const [expandedPatient, setExpandedPatient] = useState<number | null>(null)
  const [activityCopied, setActivityCopied] = useState<number | null>(null)
  const [dateStart, setDateStart] = useState(firstOfMonth())
  const [dateEnd, setDateEnd] = useState(today())
  const [specificDate, setSpecificDate] = useState(today())
  const [useSpecific, setUseSpecific] = useState(false)
  const [copied, setCopied] = useState(false)
  // Vale para todos os relatórios e sobrevive à troca entre eles: buscar
  // "tirzepartida" e ir pulando de relatório é o uso esperado.
  const [busca, setBusca] = useState('')
  const termo = normalizarBusca(busca)
  const casa = useCallback(
    (...textos: (string | null | undefined)[]) =>
      !termo || textos.some(t => t && normalizarBusca(t).includes(termo)),
    [termo]
  )

  const effectiveStart = useSpecific ? specificDate : dateStart
  const effectiveEnd = useSpecific ? specificDate : dateEnd

  const fetchActivity = useCallback(async () => {
    if (report !== 'atividade_paciente') return
    setActivityLoading(true)
    try {
      const res = await fetch(`/api/reports/patient-activity?start=${effectiveStart}&end=${effectiveEnd}`)
      if (res.ok) setActivityData(await res.json())
    } finally {
      setActivityLoading(false)
    }
  }, [report, effectiveStart, effectiveEnd])

  useEffect(() => { fetchActivity() }, [fetchActivity])

  // A prop `items` vem da listagem padrão, que esconde saldo zero. Numa lista
  // de compra o zerado é o que mais importa, então buscamos a lista completa.
  // Refaz a busca quando `items` muda — é o sinal de que o EstoqueClient
  // recarregou depois de uma movimentação, e a lista de compra não pode ficar
  // atrasada em relação ao resto da tela. Se a busca falhar seguimos com o que
  // tínhamos e avisamos na tela — lista incompleta sem aviso vira pedido de
  // compra errado.
  const [itemsComZerados, setItemsComZerados] = useState<StockItem[] | null>(null)
  const [zeradosFalhou, setZeradosFalhou] = useState(false)
  useEffect(() => {
    if (report !== 'repor') return
    let cancelado = false
    fetch('/api/estoque/items?zerados=1')
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((lista: StockItem[]) => { if (!cancelado) { setItemsComZerados(lista); setZeradosFalhou(false) } })
      .catch(() => { if (!cancelado) setZeradosFalhou(true) })
    return () => { cancelado = true }
  }, [report, items])

  const filtered = useMemo(
    () => filterByRange(movements, effectiveStart, effectiveEnd),
    [movements, effectiveStart, effectiveEnd]
  )

  const entries = filtered.filter(m => m.type === 'entrada')
  const exits = filtered.filter(m => m.type === 'saida')
  // Só "Entradas e Saídas" filtra linha a linha. Os relatórios agrupados
  // filtram o GRUPO, para os totais de cada um continuarem verdadeiros.
  const entriesVisiveis = entries.filter(m => casa(m.item_name, m.lot))
  const exitsVisiveis = exits.filter(m => casa(m.item_name, m.patient_name, m.lot))

  // ── Repor estoque ──
  // Baseado no saldo ATUAL do item, não no período: é uma lista de compra.
  // Agrupa os lotes por ativo ANTES de filtrar — olhar lote a lote fazia o
  // relatório pedir HMB duas vezes com 21 unidades na prateleira.
  const toReorder = useMemo<LinhaReposicao[]>(() => {
    return agruparParaReposicao(itemsComZerados ?? items)
      .filter(precisaRepor)
      // Ordem alfabética: a lista é lida de pé na frente da prateleira, e
      // achar o nome importa mais do que ver o mais urgente primeiro — a
      // urgência continua marcada em cada linha ("🚨 Zerado", "⚠️ Pedir").
      // localeCompare com 'pt-BR' para "Ácido" não cair depois de "Zinco".
      .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
  }, [items, itemsComZerados])
  // Separado de toReorder: lista vazia por causa da busca não é "estoque em dia".
  const toReorderVisivel = toReorder.filter(l => casa(l.nome))

  // ── Top saídas ──
  // A posição é calculada antes da busca: achar a Tirzepatida não pode
  // promovê-la a "1º lugar".
  const topExits = useMemo(() => {
    const acc: Record<string, { name: string; qty: number }> = {}
    exits.forEach(m => {
      if (!acc[m.item_name]) acc[m.item_name] = { name: m.item_name, qty: 0 }
      acc[m.item_name].qty += m.quantity
    })
    return Object.values(acc)
      .sort((a, b) => b.qty - a.qty)
      .map((x, i) => ({ ...x, posicao: i + 1 }))
      .filter(x => casa(x.name))
  }, [exits, casa])

  // ── Por lote ──
  const byLot = useMemo(() => {
    const acc: Record<string, { lot: string; item: string; entradas: number; saidas: number; movs: StockMovement[] }> = {}
    filtered.forEach(m => {
      const key = `${m.item_name}||${m.lot ?? 'sem lote'}`
      if (!acc[key]) acc[key] = { lot: m.lot ?? 'Sem lote', item: m.item_name, entradas: 0, saidas: 0, movs: [] }
      if (m.type === 'entrada') acc[key].entradas += m.quantity
      else acc[key].saidas += m.quantity
      acc[key].movs.push(m)
    })
    return Object.values(acc)
      .filter(x => casa(x.item, x.lot))
      .sort((a, b) => a.item.localeCompare(b.item))
  }, [filtered, casa])

  // ── Por produto ──
  const byProduct = useMemo(() => {
    const acc: Record<string, { name: string; entradas: number; saidas: number; movs: StockMovement[] }> = {}
    filtered.forEach(m => {
      if (!acc[m.item_name]) acc[m.item_name] = { name: m.item_name, entradas: 0, saidas: 0, movs: [] }
      if (m.type === 'entrada') acc[m.item_name].entradas += m.quantity
      else acc[m.item_name].saidas += m.quantity
      acc[m.item_name].movs.push(m)
    })
    return Object.values(acc)
      .filter(x => casa(x.name))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [filtered, casa])

  // ── Por paciente ──
  const byPatient = useMemo(() => {
    const acc: Record<string, { name: string; total: number; movs: StockMovement[] }> = {}
    exits.forEach(m => {
      const patient = m.patient_name ?? 'Sem paciente'
      if (!acc[patient]) acc[patient] = { name: patient, total: 0, movs: [] }
      acc[patient].total += m.quantity
      acc[patient].movs.push(m)
    })
    return Object.values(acc)
      .filter(x => casa(x.name))
      .sort((a, b) => b.total - a.total)
  }, [exits, casa])

  const activityVisivel = activityData.filter(p => casa(p.patient_name))

  const placeholderBusca: Record<ReportType, string> = {
    movimentos: 'Buscar produto, paciente ou lote',
    repor: 'Buscar produto',
    top_saidas: 'Buscar produto',
    por_lote: 'Buscar produto ou lote',
    por_produto: 'Buscar produto',
    por_paciente: 'Buscar paciente',
    atividade_paciente: 'Buscar paciente',
  }
  const nadaEncontrado = `Nada encontrado para "${busca.trim()}".`

  // ── Period label ──
  function periodLabel() {
    if (useSpecific) return `em ${formatDateOnly(specificDate + 'T12:00:00')}`
    return `de ${formatDateOnly(effectiveStart + 'T12:00:00')} a ${formatDateOnly(effectiveEnd + 'T12:00:00')}`
  }

  // ── Copy as text ──
  function buildCopyText(): string {
    const texto = montarTextoRelatorio()
    // Copiado com busca ativa, a lista é parcial — quem recebe precisa saber.
    if (!termo || !texto) return texto
    const [titulo, ...resto] = texto.split('\n')
    return [titulo, `Filtro: "${busca.trim()}"`, ...resto].join('\n')
  }

  function montarTextoRelatorio(): string {
    const period = periodLabel()
    if (report === 'movimentos') {
      const entries = entriesVisiveis
      const exits = exitsVisiveis
      const lines: string[] = [`Relatório de Movimentações — ${period}`, '']
      lines.push(`ENTRADAS (${entries.length} movimentos, ${entries.reduce((s, m) => s + m.quantity, 0)} unidades)`)
      entries.forEach(m => lines.push(`  • ${m.item_name} | +${m.quantity}${m.lot ? ` | Lote: ${m.lot}` : ''} | ${formatDateTime(m.created_at)}${m.created_by ? ` | ${m.created_by}` : ''}`))
      lines.push('')
      lines.push(`SAÍDAS (${exits.length} movimentos, ${exits.reduce((s, m) => s + m.quantity, 0)} unidades)`)
      exits.forEach(m => lines.push(`  • ${m.item_name} | -${m.quantity}${m.lot ? ` | Lote: ${m.lot}` : ''}${m.patient_name ? ` | ${m.patient_name}` : ''} | ${formatDateTime(m.created_at)}${m.created_by ? ` | ${m.created_by}` : ''}`))
      return lines.join('\n')
    }
    if (report === 'repor') {
      // Lista de compra: saldo atual, sem período
      const today = new Date().toLocaleDateString('pt-BR')
      if (toReorder.length === 0) return `Repor Estoque — ${today}\n\nEstoque em dia. ✅`
      const lines: string[] = [`Repor Estoque — ${today}`, '']
      toReorderVisivel.forEach(l => {
        const meta = [
          l.lot ? `Lote: ${l.lot}` : null,
          l.expiry_date ? `Val: ${l.expiry_date}` : null,
          l.registros > 1 ? `${l.registros} lotes somados` : null,
        ].filter(Boolean).join(' | ')
        // Com duas réguas em uso, o número solto não se explica — daí o "/30".
        // A unidade some quando os lotes do ativo discordam dela.
        const saldo = `${l.quantidade}/${l.limite}${l.unit ? ` ${l.unit}` : ''}`
        lines.push(`• ${l.nome} — ${saldo} ${reorderLabel(l.quantidade)}${meta ? ` (${meta})` : ''}`)
      })
      lines.push('', `Total: ${toReorderVisivel.length} ativo(s) para repor.`)
      return lines.join('\n')
    }
    if (report === 'top_saidas') {
      const lines: string[] = [`Top Saídas — ${period}`, '']
      topExits.forEach(x => lines.push(`${x.posicao}. ${x.name} — ${x.qty} unidades`))
      return lines.join('\n')
    }
    if (report === 'por_lote') {
      const lines: string[] = [`Relatório por Lote — ${period}`, '']
      byLot.forEach(x => {
        lines.push(`${x.item} | Lote: ${x.lot}`)
        lines.push(`  Entradas: +${x.entradas} | Saídas: -${x.saidas} | Saldo: ${x.entradas - x.saidas}`)
      })
      return lines.join('\n')
    }
    if (report === 'por_produto') {
      const lines: string[] = [`Relatório por Produto — ${period}`, '']
      byProduct.forEach(x => {
        lines.push(`${x.name}`)
        lines.push(`  Entradas: +${x.entradas} | Saídas: -${x.saidas} | Saldo: ${x.entradas - x.saidas}`)
      })
      return lines.join('\n')
    }
    if (report === 'por_paciente') {
      const lines: string[] = [`Relatório por Paciente — ${period}`, '']
      byPatient.forEach(x => {
        lines.push(`${x.name} — ${x.total} unidades`)
        x.movs.forEach(m => lines.push(`  • ${m.item_name}: ${m.quantity}${m.lot ? ` (Lote: ${m.lot})` : ''} | ${formatDateTime(m.created_at)}`))
      })
      return lines.join('\n')
    }
    return ''
  }

  function copy() {
    navigator.clipboard.writeText(buildCopyText()).then(() => {
      setCopied(true); setTimeout(() => setCopied(false), 2000)
    })
  }

  const reportOptions: { key: ReportType; label: string; icon: string }[] = [
    { key: 'movimentos', label: 'Entradas e Saídas', icon: '📊' },
    { key: 'repor', label: 'Repor Estoque', icon: '⚠️' },
    { key: 'top_saidas', label: 'Top Saídas', icon: '🏆' },
    { key: 'por_lote', label: 'Por Lote', icon: '🗂️' },
    { key: 'por_produto', label: 'Por Produto', icon: '💊' },
    { key: 'por_paciente', label: 'Por Paciente', icon: '👤' },
    { key: 'atividade_paciente', label: 'Resumo do Paciente', icon: '🗒️' },
  ]

  return (
    <div className="space-y-4">
      {/* Report type selector */}
      <div className="flex gap-2 flex-wrap">
        {reportOptions.map(o => (
          <button key={o.key} onClick={() => setReport(o.key)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors border ${report === o.key ? 'bg-violet-600 text-white border-violet-600' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'}`}>
            {o.icon} {o.label}
          </button>
        ))}
      </div>

      {/* Filtro de data — não se aplica a "Repor Estoque", que usa o saldo atual */}
      {report !== 'repor' && (
      <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm space-y-3">
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer select-none">
            <input type="checkbox" checked={useSpecific} onChange={e => setUseSpecific(e.target.checked)} className="accent-violet-600" />
            Data específica
          </label>
        </div>
        {useSpecific ? (
          <div className="flex items-center gap-2">
            <label className="text-xs font-medium text-gray-500 w-10">Data</label>
            <input type="date" value={specificDate} onChange={e => setSpecificDate(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400" />
          </div>
        ) : (
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <label className="text-xs font-medium text-gray-500 w-10">Início</label>
              <input type="date" value={dateStart} onChange={e => setDateStart(e.target.value)}
                className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400" />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs font-medium text-gray-500 w-10">Fim</label>
              <input type="date" value={dateEnd} onChange={e => setDateEnd(e.target.value)}
                className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400" />
            </div>
          </div>
        )}
        <p className="text-xs text-gray-400">{filtered.length} movimentação(ões) no período</p>
      </div>
      )}

      {/* Busca + copiar */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[220px]">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
            </svg>
          </span>
          <input
            type="search"
            value={busca}
            onChange={e => setBusca(e.target.value)}
            placeholder={placeholderBusca[report]}
            aria-label={placeholderBusca[report]}
            autoComplete="off"
            className="w-full pl-9 pr-9 py-2 bg-white border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-400 [&::-webkit-search-cancel-button]:hidden"
          />
          {busca && (
            <button type="button" onClick={() => setBusca('')} aria-label="Limpar busca"
              className="absolute right-2 top-1/2 -translate-y-1/2 w-6 h-6 flex items-center justify-center rounded text-gray-400 hover:text-gray-600 text-lg leading-none">
              ×
            </button>
          )}
        </div>
        <button onClick={copy}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ml-auto ${copied ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}>
          {copied ? '✅ Copiado!' : '📋 Copiar relatório'}
        </button>
      </div>

      {/* ── REPOR ESTOQUE ── */}
      {report === 'repor' && (
        toReorder.length === 0 ? (
          <div className="bg-green-50 border border-green-200 rounded-xl p-6 text-center">
            <p className="text-2xl mb-1">✅</p>
            <p className="text-sm font-semibold text-green-700">Estoque em dia</p>
            <p className="text-xs text-green-600 mt-0.5">Nenhum ativo abaixo do limite de reposição.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {zeradosFalhou && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
                <p className="text-xs text-amber-700">
                  ⚠️ Não foi possível carregar os itens zerados. A lista pode estar incompleta —
                  recarregue a página antes de usar como pedido de compra.
                </p>
              </div>
            )}
            <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 text-center">
              <p className="text-2xl font-bold text-orange-600">
                {termo ? `${toReorderVisivel.length} de ${toReorder.length}` : toReorder.length}
              </p>
              <p className="text-xs text-orange-600 font-medium mt-0.5">ativo(s) para repor</p>
              <p className="text-xs text-orange-500">
                uso contínuo abaixo de {LIMITE_CONTROLADO} · demais abaixo de {LIMITE_PADRAO}
              </p>
            </div>

            {termo && toReorderVisivel.length === 0 && <EmptyState msg={nadaEncontrado} />}
            {toReorderVisivel.map(l => {
              const critical = l.quantidade <= 0
              return (
                <div key={l.chave}
                  className={`rounded-xl border p-4 shadow-sm flex items-start gap-4 ${critical ? 'bg-red-50 border-red-300' : 'bg-white border-gray-200'}`}>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-800">{l.nome}</p>
                    <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1">
                      {/* Lote e validade só existem quando um lote só tem
                          saldo — ver agruparParaReposicao. */}
                      {l.lot && <p className="text-xs text-gray-500">Lote: <span className="font-medium">{l.lot}</span></p>}
                      {l.expiry_date && <p className="text-xs text-gray-500">Val: <span className="font-medium">{l.expiry_date}</span></p>}
                      {l.registros > 1 && (
                        <p className="text-xs text-gray-500">{l.registros} lotes somados</p>
                      )}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className={`text-xl font-bold ${critical ? 'text-red-500' : 'text-orange-500'}`}>{l.quantidade}</p>
                    <p className="text-xs text-gray-400">de {l.limite}{l.unit ? ` ${l.unit}` : ''}</p>
                    <p className={`text-xs font-semibold mt-0.5 ${critical ? 'text-red-600' : 'text-orange-500'}`}>
                      {reorderLabel(l.quantidade)}
                    </p>
                  </div>
                </div>
              )
            })}
          </div>
        )
      )}

      {/* ── MOVIMENTOS ── */}
      {report === 'movimentos' && (
        <div className="space-y-4">
          {/* Summary cards */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-center">
              <p className="text-2xl font-bold text-green-700">+{entriesVisiveis.reduce((s, m) => s + m.quantity, 0)}</p>
              <p className="text-xs text-green-600 font-medium mt-0.5">unidades entraram</p>
              <p className="text-xs text-green-500">{entriesVisiveis.length} movimentos</p>
            </div>
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-center">
              <p className="text-2xl font-bold text-red-600">-{exitsVisiveis.reduce((s, m) => s + m.quantity, 0)}</p>
              <p className="text-xs text-red-500 font-medium mt-0.5">unidades saíram</p>
              <p className="text-xs text-red-400">{exitsVisiveis.length} movimentos</p>
            </div>
          </div>

          {/* Filtro de tipo */}
          <div className="flex gap-2">
            {([['all', 'Tudo'], ['entrada', 'Só Entradas'], ['saida', 'Só Saídas']] as const).map(([val, label]) => (
              <button
                key={val}
                onClick={() => setMovFilter(val)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                  movFilter === val
                    ? val === 'entrada' ? 'bg-green-600 text-white border-green-600'
                      : val === 'saida' ? 'bg-red-500 text-white border-red-500'
                      : 'bg-gray-800 text-white border-gray-800'
                    : 'bg-white text-gray-600 border-gray-300 hover:border-gray-400'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {filtered.length === 0 ? (
            <EmptyState />
          ) : movFilter === 'all' && termo && entriesVisiveis.length + exitsVisiveis.length === 0 ? (
            <EmptyState msg={nadaEncontrado} />
          ) : (
            <>
              {(movFilter === 'all' || movFilter === 'entrada') && entriesVisiveis.length > 0 && (
                <Section title="Entradas" count={entriesVisiveis.length}>
                  {entriesVisiveis.map(m => (
                    <Row key={m.id}
                      icon="📥"
                      main={m.item_name}
                      badge={`+${m.quantity}`}
                      badgeColor="text-green-700 bg-green-50 border-green-200"
                      sub={[m.lot ? `Lote: ${m.lot}` : null, m.expiry_date ? `Val: ${m.expiry_date}` : null].filter(Boolean).join(' · ')}
                      date={formatDateTime(m.created_at)}
                      by={m.created_by}
                    />
                  ))}
                </Section>
              )}
              {(movFilter === 'all' || movFilter === 'saida') && exitsVisiveis.length > 0 && (
                <Section title="Saídas" count={exitsVisiveis.length}>
                  {exitsVisiveis.map(m => (
                    <Row key={m.id}
                      icon="📤"
                      main={m.item_name}
                      badge={`-${m.quantity}`}
                      badgeColor="text-red-600 bg-red-50 border-red-200"
                      sub={[m.lot ? `Lote: ${m.lot}` : null, m.patient_name ? `Paciente: ${m.patient_name}` : null, m.observation ?? null].filter(Boolean).join(' · ')}
                      date={formatDateTime(m.created_at)}
                      by={m.created_by}
                    />
                  ))}
                </Section>
              )}
              {movFilter === 'entrada' && entriesVisiveis.length === 0 && <EmptyState msg={termo ? nadaEncontrado : undefined} />}
              {movFilter === 'saida' && exitsVisiveis.length === 0 && <EmptyState msg={termo ? nadaEncontrado : undefined} />}
            </>
          )}
        </div>
      )}

      {/* ── TOP SAÍDAS ── */}
      {report === 'top_saidas' && (
        <div>
          {topExits.length === 0 ? <EmptyState msg={termo ? nadaEncontrado : undefined} /> : (
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
              {topExits.map(x => (
                <div key={x.name} className="flex items-center gap-3 px-4 py-3 border-b border-gray-50 last:border-0">
                  <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${x.posicao === 1 ? 'bg-yellow-400 text-yellow-900' : x.posicao === 2 ? 'bg-gray-300 text-gray-700' : x.posicao === 3 ? 'bg-amber-600 text-white' : 'bg-gray-100 text-gray-500'}`}>
                    {x.posicao}
                  </span>
                  <p className="flex-1 text-sm font-medium text-gray-800">{x.name}</p>
                  <span className="text-sm font-bold text-red-600">-{x.qty}</span>
                  <span className="text-xs text-gray-400">un.</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── POR LOTE ── */}
      {report === 'por_lote' && (
        <div className="space-y-3">
          {byLot.length === 0 ? <EmptyState msg={termo ? nadaEncontrado : undefined} /> : byLot.map(x => (
            <div key={`${x.item}||${x.lot}`} className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3 mb-2">
                <div>
                  <p className="text-sm font-semibold text-gray-800">{x.item}</p>
                  <p className="text-xs text-violet-600 font-medium">Lote: {x.lot}</p>
                </div>
                <div className="flex gap-3 text-right shrink-0">
                  <div><p className="text-sm font-bold text-green-700">+{x.entradas}</p><p className="text-xs text-gray-400">entradas</p></div>
                  <div><p className="text-sm font-bold text-red-600">-{x.saidas}</p><p className="text-xs text-gray-400">saídas</p></div>
                  <div><p className={`text-sm font-bold ${x.entradas - x.saidas >= 0 ? 'text-gray-800' : 'text-red-500'}`}>{x.entradas - x.saidas >= 0 ? '+' : ''}{x.entradas - x.saidas}</p><p className="text-xs text-gray-400">saldo</p></div>
                </div>
              </div>
              <div className="space-y-1 mt-2 border-t border-gray-50 pt-2">
                {x.movs.map(m => (
                  <div key={m.id} className="flex items-center gap-2 text-xs text-gray-500">
                    <span className={m.type === 'entrada' ? 'text-green-600 font-bold' : 'text-red-500 font-bold'}>{m.type === 'entrada' ? '+' : '-'}{m.quantity}</span>
                    <span className="flex-1">{m.type === 'entrada' ? 'Entrada' : m.patient_name ?? 'Saída'}</span>
                    <span className="text-gray-400">{formatDateTime(m.created_at)}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── POR PRODUTO ── */}
      {report === 'por_produto' && (
        <div className="space-y-3">
          {byProduct.length === 0 ? <EmptyState msg={termo ? nadaEncontrado : undefined} /> : byProduct.map(x => (
            <div key={x.name} className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3 mb-2">
                <p className="text-sm font-semibold text-gray-800">{x.name}</p>
                <div className="flex gap-3 text-right shrink-0">
                  <div><p className="text-sm font-bold text-green-700">+{x.entradas}</p><p className="text-xs text-gray-400">entradas</p></div>
                  <div><p className="text-sm font-bold text-red-600">-{x.saidas}</p><p className="text-xs text-gray-400">saídas</p></div>
                  <div><p className={`text-sm font-bold ${x.entradas - x.saidas >= 0 ? 'text-gray-800' : 'text-red-500'}`}>{x.entradas - x.saidas >= 0 ? '+' : ''}{x.entradas - x.saidas}</p><p className="text-xs text-gray-400">saldo</p></div>
                </div>
              </div>
              <div className="space-y-1 border-t border-gray-50 pt-2">
                {x.movs.sort((a, b) => a.created_at.localeCompare(b.created_at)).map(m => (
                  <div key={m.id} className="flex items-center gap-2 text-xs text-gray-500">
                    <span className={m.type === 'entrada' ? 'text-green-600 font-bold' : 'text-red-500 font-bold'}>{m.type === 'entrada' ? '+' : '-'}{m.quantity}</span>
                    {m.lot && <span className="text-violet-500">Lote: {m.lot}</span>}
                    <span className="flex-1">{m.type === 'saida' && m.patient_name ? m.patient_name : m.type === 'entrada' ? 'Entrada' : 'Saída'}</span>
                    <span className="text-gray-400">{formatDateTime(m.created_at)}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── RESUMO DO PACIENTE ── */}
      {report === 'atividade_paciente' && (
        <div className="space-y-3">
          {activityLoading ? (
            <div className="text-center py-10 text-gray-400 text-sm">Carregando...</div>
          ) : activityVisivel.length === 0 ? (
            <EmptyState msg={termo && activityData.length > 0 ? nadaEncontrado : 'Nenhuma atividade encontrada no período.'} />
          ) : activityVisivel.map(p => {
            const isOpen = expandedPatient === p.patient_id

            function copyPatient() {
              const lines = [
                `Resumo — ${p.patient_name}`,
                `Período: ${effectiveStart === effectiveEnd ? effectiveStart : `${effectiveStart} a ${effectiveEnd}`}`,
                '',
                ...p.activities.map(a =>
                  `• ${a.description}${a.detail ? ` — ${a.detail}` : ''}${a.created_by ? ` (${a.created_by})` : ''} — ${new Date(a.created_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}`
                )
              ]
              navigator.clipboard.writeText(lines.join('\n')).then(() => {
                setActivityCopied(p.patient_id)
                setTimeout(() => setActivityCopied(null), 2000)
              })
            }

            const ICONS: Record<string, string> = {
              saida: '💊', foto: '📸', exame: '🔬', dieta: '🥗', prescricao: '📄',
              medicao: '📏', tarefa: '✅', resumo: '📝',
            }

            return (
              <div key={p.patient_id} className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
                <button
                  onClick={() => setExpandedPatient(isOpen ? null : p.patient_id)}
                  className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors"
                >
                  <div className="w-8 h-8 rounded-full bg-violet-100 flex items-center justify-center text-violet-600 font-bold text-sm shrink-0">
                    {p.patient_name.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 text-left">
                    <p className="text-sm font-semibold text-gray-800">{p.patient_name}</p>
                    <p className="text-xs text-gray-400">{p.activities.length} atividade(s)</p>
                  </div>
                  <span className="text-gray-400 text-xs">{isOpen ? '▲' : '▼'}</span>
                </button>

                {isOpen && (
                  <div className="border-t border-gray-100 px-4 pb-4 pt-3 space-y-2">
                    {p.activities.map((a, i) => (
                      <div key={i} className="flex items-start gap-2.5">
                        <span className="text-base mt-0.5 shrink-0">{ICONS[a.type] ?? '•'}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-gray-800">{a.description}</p>
                          {a.detail && <p className="text-xs text-gray-400 truncate">{a.detail}</p>}
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-xs text-gray-400">
                            {new Date(a.created_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                          </p>
                          {a.created_by && <p className="text-xs text-gray-400">{a.created_by}</p>}
                        </div>
                      </div>
                    ))}
                    <div className="pt-2 border-t border-gray-50">
                      <button onClick={copyPatient}
                        className={`w-full py-2 rounded-lg text-xs font-medium transition-colors ${activityCopied === p.patient_id ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                        {activityCopied === p.patient_id ? '✅ Copiado!' : '📋 Copiar resumo deste paciente'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* ── POR PACIENTE ── */}
      {report === 'por_paciente' && (
        <div className="space-y-3">
          {byPatient.length === 0 ? <EmptyState msg={termo ? nadaEncontrado : 'Nenhuma saída para pacientes no período.'} /> : byPatient.map(x => (
            <div key={x.name} className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
              <div className="flex items-center gap-3 mb-2">
                <span className="text-xl">👤</span>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-gray-800">{x.name}</p>
                  <p className="text-xs text-gray-400">{x.movs.length} item(s) · {x.total} unidades</p>
                </div>
                <span className="text-sm font-bold text-red-600">-{x.total}</span>
              </div>
              <div className="space-y-1 border-t border-gray-50 pt-2">
                {x.movs.map(m => (
                  <div key={m.id} className="flex items-center gap-2 text-xs text-gray-500">
                    <span className="text-red-500 font-bold">-{m.quantity}</span>
                    <span className="flex-1 font-medium text-gray-700">{m.item_name}</span>
                    {m.lot && <span className="text-violet-500">Lote: {m.lot}</span>}
                    <span className="text-gray-400">{formatDateTime(m.created_at)}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function Section({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">{title} ({count})</p>
      <div className="space-y-2">{children}</div>
    </div>
  )
}

function Row({ icon, main, badge, badgeColor, sub, date, by }: {
  icon: string; main: string; badge: string; badgeColor: string; sub: string; date: string; by: string | null
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-3 shadow-sm flex items-start gap-3">
      <span className="text-xl mt-0.5 shrink-0">{icon}</span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-800">{main}</p>
        {sub && <p className="text-xs text-gray-500 mt-0.5">{sub}</p>}
        <p className="text-xs text-gray-400 mt-0.5">{date}{by ? ` · ${by}` : ''}</p>
      </div>
      <span className={`text-sm font-bold px-2 py-0.5 rounded-lg border shrink-0 ${badgeColor}`}>{badge}</span>
    </div>
  )
}

function EmptyState({ msg }: { msg?: string }) {
  return (
    <div className="text-center py-12 text-gray-400">
      <p className="text-3xl mb-2">📊</p>
      <p className="text-sm">{msg ?? 'Nenhuma movimentação no período selecionado.'}</p>
    </div>
  )
}
