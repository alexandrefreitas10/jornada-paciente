'use client'

import { useState, useMemo } from 'react'

interface StockMovement {
  id: number; item_id: number; item_name: string; type: 'entrada' | 'saida'
  quantity: number; lot: string | null; expiry_date: string | null
  patient_id: number | null; patient_name: string | null; observation: string | null; created_by: string | null; created_at: string
}

type ReportType = 'movimentos' | 'top_saidas' | 'por_lote' | 'por_produto' | 'por_paciente'

function formatDateOnly(iso: string) {
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}
function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function today() { return new Date().toISOString().slice(0, 10) }
function firstOfMonth() {
  const d = new Date(); d.setDate(1)
  return d.toISOString().slice(0, 10)
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

export function RelatoriosTab({ movements }: { movements: StockMovement[] }) {
  const [report, setReport] = useState<ReportType>('movimentos')
  const [dateStart, setDateStart] = useState(firstOfMonth())
  const [dateEnd, setDateEnd] = useState(today())
  const [specificDate, setSpecificDate] = useState(today())
  const [useSpecific, setUseSpecific] = useState(false)
  const [copied, setCopied] = useState(false)

  const effectiveStart = useSpecific ? specificDate : dateStart
  const effectiveEnd = useSpecific ? specificDate : dateEnd

  const filtered = useMemo(
    () => filterByRange(movements, effectiveStart, effectiveEnd),
    [movements, effectiveStart, effectiveEnd]
  )

  const entries = filtered.filter(m => m.type === 'entrada')
  const exits = filtered.filter(m => m.type === 'saida')

  // ── Top saídas ──
  const topExits = useMemo(() => {
    const acc: Record<string, { name: string; qty: number }> = {}
    exits.forEach(m => {
      if (!acc[m.item_name]) acc[m.item_name] = { name: m.item_name, qty: 0 }
      acc[m.item_name].qty += m.quantity
    })
    return Object.values(acc).sort((a, b) => b.qty - a.qty)
  }, [exits])

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
    return Object.values(acc).sort((a, b) => a.item.localeCompare(b.item))
  }, [filtered])

  // ── Por produto ──
  const byProduct = useMemo(() => {
    const acc: Record<string, { name: string; entradas: number; saidas: number; movs: StockMovement[] }> = {}
    filtered.forEach(m => {
      if (!acc[m.item_name]) acc[m.item_name] = { name: m.item_name, entradas: 0, saidas: 0, movs: [] }
      if (m.type === 'entrada') acc[m.item_name].entradas += m.quantity
      else acc[m.item_name].saidas += m.quantity
      acc[m.item_name].movs.push(m)
    })
    return Object.values(acc).sort((a, b) => a.name.localeCompare(b.name))
  }, [filtered])

  // ── Por paciente ──
  const byPatient = useMemo(() => {
    const acc: Record<string, { name: string; total: number; movs: StockMovement[] }> = {}
    exits.forEach(m => {
      const patient = m.patient_name ?? 'Sem paciente'
      if (!acc[patient]) acc[patient] = { name: patient, total: 0, movs: [] }
      acc[patient].total += m.quantity
      acc[patient].movs.push(m)
    })
    return Object.values(acc).sort((a, b) => b.total - a.total)
  }, [exits])

  // ── Period label ──
  function periodLabel() {
    if (useSpecific) return `em ${formatDateOnly(specificDate + 'T12:00:00')}`
    return `de ${formatDateOnly(effectiveStart + 'T12:00:00')} a ${formatDateOnly(effectiveEnd + 'T12:00:00')}`
  }

  // ── Copy as text ──
  function buildCopyText(): string {
    const period = periodLabel()
    if (report === 'movimentos') {
      const lines: string[] = [`Relatório de Movimentações — ${period}`, '']
      lines.push(`ENTRADAS (${entries.length} movimentos, ${entries.reduce((s, m) => s + m.quantity, 0)} unidades)`)
      entries.forEach(m => lines.push(`  • ${m.item_name} | +${m.quantity}${m.lot ? ` | Lote: ${m.lot}` : ''} | ${formatDateTime(m.created_at)}${m.created_by ? ` | ${m.created_by}` : ''}`))
      lines.push('')
      lines.push(`SAÍDAS (${exits.length} movimentos, ${exits.reduce((s, m) => s + m.quantity, 0)} unidades)`)
      exits.forEach(m => lines.push(`  • ${m.item_name} | -${m.quantity}${m.lot ? ` | Lote: ${m.lot}` : ''}${m.patient_name ? ` | ${m.patient_name}` : ''} | ${formatDateTime(m.created_at)}${m.created_by ? ` | ${m.created_by}` : ''}`))
      return lines.join('\n')
    }
    if (report === 'top_saidas') {
      const lines: string[] = [`Top Saídas — ${period}`, '']
      topExits.forEach((x, i) => lines.push(`${i + 1}. ${x.name} — ${x.qty} unidades`))
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
    { key: 'top_saidas', label: 'Top Saídas', icon: '🏆' },
    { key: 'por_lote', label: 'Por Lote', icon: '🗂️' },
    { key: 'por_produto', label: 'Por Produto', icon: '💊' },
    { key: 'por_paciente', label: 'Por Paciente', icon: '👤' },
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

      {/* Date filters */}
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

      {/* Copy button */}
      <div className="flex justify-end">
        <button onClick={copy}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${copied ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}>
          {copied ? '✅ Copiado!' : '📋 Copiar relatório'}
        </button>
      </div>

      {/* ── MOVIMENTOS ── */}
      {report === 'movimentos' && (
        <div className="space-y-4">
          {/* Summary cards */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-center">
              <p className="text-2xl font-bold text-green-700">+{entries.reduce((s, m) => s + m.quantity, 0)}</p>
              <p className="text-xs text-green-600 font-medium mt-0.5">unidades entraram</p>
              <p className="text-xs text-green-500">{entries.length} movimentos</p>
            </div>
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-center">
              <p className="text-2xl font-bold text-red-600">-{exits.reduce((s, m) => s + m.quantity, 0)}</p>
              <p className="text-xs text-red-500 font-medium mt-0.5">unidades saíram</p>
              <p className="text-xs text-red-400">{exits.length} movimentos</p>
            </div>
          </div>

          {filtered.length === 0 ? (
            <EmptyState />
          ) : (
            <>
              {entries.length > 0 && (
                <Section title="Entradas" count={entries.length}>
                  {entries.map(m => (
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
              {exits.length > 0 && (
                <Section title="Saídas" count={exits.length}>
                  {exits.map(m => (
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
            </>
          )}
        </div>
      )}

      {/* ── TOP SAÍDAS ── */}
      {report === 'top_saidas' && (
        <div>
          {topExits.length === 0 ? <EmptyState /> : (
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
              {topExits.map((x, i) => (
                <div key={x.name} className="flex items-center gap-3 px-4 py-3 border-b border-gray-50 last:border-0">
                  <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${i === 0 ? 'bg-yellow-400 text-yellow-900' : i === 1 ? 'bg-gray-300 text-gray-700' : i === 2 ? 'bg-amber-600 text-white' : 'bg-gray-100 text-gray-500'}`}>
                    {i + 1}
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
          {byLot.length === 0 ? <EmptyState /> : byLot.map(x => (
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
          {byProduct.length === 0 ? <EmptyState /> : byProduct.map(x => (
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

      {/* ── POR PACIENTE ── */}
      {report === 'por_paciente' && (
        <div className="space-y-3">
          {byPatient.length === 0 ? <EmptyState msg="Nenhuma saída para pacientes no período." /> : byPatient.map(x => (
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
