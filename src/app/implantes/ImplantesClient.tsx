'use client'

import { useState, useEffect, useRef } from 'react'

interface Patient { id: number; name: string }
interface StockItem { id: number; name: string; unit: string; quantity: number; lot: string | null; expiry_date: string | null }

interface ImplantItem { name: string; quantity: number; unit: string; lot?: string | null; expiry_date?: string | null }

interface Implant {
  id: number
  patient_id: number | null
  patient_name: string
  last_implant_date: string
  next_implant_date: string
  days_until: number
  notes: string | null
  items_used: ImplantItem[]
  archived_at: string | null
  created_at: string
}

interface SelectedStock { item: StockItem; quantity: number }

function statusInfo(days: number) {
  if (days < 0)  return { label: 'Atrasado',  color: 'bg-red-100 text-red-700 border-red-200',    dot: 'bg-red-500',    cardBorder: 'border-red-300' }
  if (days <= 30) return { label: 'Em breve',  color: 'bg-amber-100 text-amber-700 border-amber-200', dot: 'bg-amber-400',  cardBorder: 'border-amber-300' }
  return           { label: 'Ok',             color: 'bg-emerald-100 text-emerald-700 border-emerald-200', dot: 'bg-emerald-400', cardBorder: 'border-gray-200' }
}

function fmtDate(iso: string) {
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

function today() {
  return new Date().toISOString().slice(0, 10)
}

interface Props { patients: Patient[] }

export default function ImplantesClient({ patients }: Props) {
  const [implants, setImplants] = useState<Implant[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [deletingId, setDeletingId] = useState<number | null>(null)
  const [archivingId, setArchivingId] = useState<number | null>(null)
  const [filter, setFilter] = useState<'todos' | 'atrasado' | 'em_breve' | 'ok' | 'antigos'>('todos')
  const [nameSearch, setNameSearch] = useState('')
  const [expandedHistory, setExpandedHistory] = useState<Set<string>>(new Set())

  // modal renovação
  const [renewTarget, setRenewTarget] = useState<Implant | null>(null)
  const [renewDate, setRenewDate] = useState(today())
  const [renewStock, setRenewStock] = useState<SelectedStock[]>([])
  const [renewSearch, setRenewSearch] = useState('')
  const [renewSaida, setRenewSaida] = useState(true)
  const [renewLoading, setRenewLoading] = useState(false)
  const [renewError, setRenewError] = useState<string | null>(null)

  // form state
  const [formPatientId, setFormPatientId] = useState<string>('')
  const [formPatientName, setFormPatientName] = useState('')
  const [formPatientSearch, setFormPatientSearch] = useState('')
  const [formPatientOpen, setFormPatientOpen] = useState(false)
  const patientDropdownRef = useRef<HTMLDivElement>(null)
  const [formDate, setFormDate] = useState(today())
  const [formNotes, setFormNotes] = useState('')
  const [formLoading, setFormLoading] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  // estoque state
  const [stockItems, setStockItems] = useState<StockItem[]>([])
  const [selectedStock, setSelectedStock] = useState<SelectedStock[]>([])
  const [registerSaida, setRegisterSaida] = useState(true)
  const [stockSearch, setStockSearch] = useState('')

  useEffect(() => {
    fetch('/api/implants')
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data)) {
          setImplants(data.map(imp => ({
            ...imp,
            items_used: Array.isArray(imp.items_used) ? imp.items_used
              : (typeof imp.items_used === 'string' ? JSON.parse(imp.items_used) : [])
          })))
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  // Fecha dropdown de paciente ao clicar fora
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (patientDropdownRef.current && !patientDropdownRef.current.contains(e.target as Node)) {
        setFormPatientOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Carrega itens do estoque ao abrir o form ou modal de renovação
  useEffect(() => {
    if (!showForm && !renewTarget) return
    fetch('/api/estoque/items')
      .then(r => r.json())
      .then((items: StockItem[]) => setStockItems(items))
      .catch(() => {})
  }, [showForm, renewTarget])

  function toggleStockItem(item: StockItem) {
    setSelectedStock(prev => {
      const exists = prev.find(s => s.item.id === item.id)
      if (exists) return prev.filter(s => s.item.id !== item.id)
      return [...prev, { item, quantity: 1 }]
    })
  }

  function updateStockQty(itemId: number, qty: number) {
    setSelectedStock(prev => prev.map(s => s.item.id === itemId ? { ...s, quantity: Math.max(1, qty) } : s))
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setFormLoading(true)
    setFormError(null)
    try {
      const selectedPatient = patients.find(p => String(p.id) === formPatientId)
      const name = selectedPatient?.name ?? formPatientName

      // 1. Cria o card de implante
      const itemsUsed = registerSaida && selectedStock.length > 0
        ? selectedStock.map(s => ({ name: s.item.name, quantity: s.quantity, unit: s.item.unit, lot: s.item.lot ?? null, expiry_date: s.item.expiry_date ?? null }))
        : []

      const res = await fetch('/api/implants', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patient_id: selectedPatient?.id ?? null,
          patient_name: name,
          last_implant_date: formDate,
          notes: formNotes || null,
          items_used: itemsUsed,
        }),
      })
      if (!res.ok) throw new Error((await res.json()).error || 'Erro')
      const newImplant: Implant = await res.json()

      // 2. Registra saídas no estoque se solicitado
      if (registerSaida && selectedStock.length > 0) {
        await Promise.all(selectedStock.map(s =>
          fetch('/api/estoque/movements', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              item_id: s.item.id,
              type: 'saida',
              quantity: s.quantity,
              lot: s.item.lot ?? null,
              patient_id: selectedPatient?.id ?? null,
              patient_name: name,
              observation: 'Implante hormonal',
            }),
          })
        ))
      }

      setImplants(prev => [...prev, newImplant].sort((a, b) => a.days_until - b.days_until))
      setShowForm(false)
      setFormPatientId('')
      setFormPatientName('')
      setFormPatientSearch('')
      setFormPatientOpen(false)
      setFormDate(today())
      setFormNotes('')
      setSelectedStock([])
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Erro')
    } finally {
      setFormLoading(false)
    }
  }

  function openRenew(implant: Implant) {
    setRenewTarget(implant)
    setRenewDate(today())
    setRenewStock([])
    setRenewSearch('')
    setRenewSaida(true)
    setRenewError(null)
  }

  async function handleRenewSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!renewTarget) return
    setRenewLoading(true)
    setRenewError(null)
    try {
      const itemsUsed = renewSaida && renewStock.length > 0
        ? renewStock.map(s => ({ name: s.item.name, quantity: s.quantity, unit: s.item.unit, lot: s.item.lot ?? null, expiry_date: s.item.expiry_date ?? null }))
        : []

      // Cria novo registro (preserva histórico)
      const res = await fetch('/api/implants', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patient_id: renewTarget.patient_id,
          patient_name: renewTarget.patient_name,
          last_implant_date: renewDate,
          notes: renewTarget.notes,
          items_used: itemsUsed,
        }),
      })
      if (!res.ok) throw new Error((await res.json()).error || 'Erro')
      const newImplant: Implant = await res.json()
      newImplant.items_used = Array.isArray(newImplant.items_used) ? newImplant.items_used
        : (typeof newImplant.items_used === 'string' ? JSON.parse(newImplant.items_used) : [])

      // Registra saídas no estoque
      if (renewSaida && renewStock.length > 0) {
        await Promise.all(renewStock.map(s =>
          fetch('/api/estoque/movements', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              item_id: s.item.id,
              type: 'saida',
              quantity: s.quantity,
              lot: s.item.lot ?? null,
              patient_id: renewTarget.patient_id,
              patient_name: renewTarget.patient_name,
              observation: 'Implante hormonal',
            }),
          })
        ))
      }

      setImplants(prev => [...prev, newImplant].sort((a, b) => a.days_until - b.days_until))
      setRenewTarget(null)
    } catch (err) {
      setRenewError(err instanceof Error ? err.message : 'Erro')
    } finally {
      setRenewLoading(false)
    }
  }

  async function handleDelete(id: number) {
    if (!confirm('Excluir este registro de implante?')) return
    setDeletingId(id)
    try {
      await fetch(`/api/implants/${id}`, { method: 'DELETE' })
      setImplants(prev => prev.filter(i => i.id !== id))
    } finally {
      setDeletingId(null)
    }
  }

  async function handleArchive(implant: Implant, archive: boolean) {
    setArchivingId(implant.id)
    try {
      const res = await fetch(`/api/implants/${implant.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ archive }),
      })
      if (!res.ok) return
      const updated = await res.json()
      setImplants(prev => prev.map(i => i.id === implant.id ? { ...i, archived_at: updated.archived_at } : i))
    } finally {
      setArchivingId(null)
    }
  }

  // Separa arquivados dos ativos
  const activeImplants   = implants.filter(i => !i.archived_at)
  const archivedImplants = implants.filter(i => !!i.archived_at)

  // Agrupa ativos por paciente — mostra o mais recente como card principal
  const grouped = activeImplants.reduce((acc, imp) => {
    const key = String(imp.patient_id ?? imp.patient_name)
    if (!acc[key]) acc[key] = []
    acc[key].push(imp)
    return acc
  }, {} as Record<string, Implant[]>)

  const latestByPatient = Object.values(grouped).map(group =>
    group.slice().sort((a, b) => b.days_until - a.days_until)[0]
  )

  const filtered = latestByPatient.filter(i => {
    if (nameSearch && !i.patient_name.toLowerCase().includes(nameSearch.toLowerCase())) return false
    if (filter === 'atrasado') return i.days_until < 0
    if (filter === 'em_breve') return i.days_until >= 0 && i.days_until <= 30
    if (filter === 'ok')       return i.days_until > 30
    return true
  })

  // Agrupa arquivados por paciente — mostra o mais recente
  const archivedGrouped = archivedImplants.reduce((acc, imp) => {
    const key = String(imp.patient_id ?? imp.patient_name)
    if (!acc[key]) acc[key] = []
    acc[key].push(imp)
    return acc
  }, {} as Record<string, Implant[]>)

  const archivedLatest = Object.values(archivedGrouped)
    .map(group => group.slice().sort((a, b) => new Date(b.last_implant_date).getTime() - new Date(a.last_implant_date).getTime())[0])
    .filter(i => !nameSearch || i.patient_name.toLowerCase().includes(nameSearch.toLowerCase()))

  const atrasados  = latestByPatient.filter(i => i.days_until < 0).length
  const emBreve    = latestByPatient.filter(i => i.days_until >= 0 && i.days_until <= 30).length
  const okCount    = latestByPatient.filter(i => i.days_until > 30).length

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-2xl mx-auto px-4 py-6 space-y-5">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Implantes</h1>
            <p className="text-xs text-gray-500 mt-0.5">Controle de implantes hormonais — renovação a cada 6 meses</p>
          </div>
          <button
            onClick={() => setShowForm(v => !v)}
            className="px-4 py-2 bg-violet-600 text-white text-sm font-medium rounded-xl hover:bg-violet-700 transition-colors shadow-sm"
          >
            + Novo
          </button>
        </div>

        {/* Busca por nome */}
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
            </svg>
          </span>
          <input
            type="text"
            value={nameSearch}
            onChange={e => setNameSearch(e.target.value)}
            placeholder="Buscar paciente pelo nome..."
            className="w-full pl-9 pr-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-400 shadow-sm"
          />
          {nameSearch && (
            <button onClick={() => setNameSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-lg leading-none">×</button>
          )}
        </div>

        {/* Formulário de criação */}
        {showForm && (
          <form onSubmit={handleCreate} className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 space-y-4">
            <h2 className="text-sm font-semibold text-gray-700">Novo registro de implante</h2>

            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Paciente</label>
              {formPatientId ? (
                // Paciente vinculado — mostra chip com opção de trocar
                <div className="flex items-center gap-2 px-3 py-2 bg-violet-50 border border-violet-300 rounded-lg">
                  <span className="flex-1 text-sm text-violet-800 font-medium">{formPatientName}</span>
                  <button type="button" onClick={() => { setFormPatientId(''); setFormPatientName(''); setFormPatientSearch(''); setFormPatientOpen(true) }}
                    className="text-violet-400 hover:text-violet-600 text-lg leading-none">×</button>
                </div>
              ) : (
                // Busca com autocomplete
                <div className="relative" ref={patientDropdownRef}>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
                      <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
                      </svg>
                    </span>
                    <input
                      type="text"
                      value={formPatientSearch}
                      onChange={e => { setFormPatientSearch(e.target.value); setFormPatientOpen(true) }}
                      onFocus={() => setFormPatientOpen(true)}
                      placeholder="Buscar paciente..."
                      autoComplete="off"
                      className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-400"
                    />
                  </div>
                  {formPatientOpen && (
                    <div className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-lg max-h-52 overflow-y-auto">
                      {(() => {
                        const q = formPatientSearch.trim().toLowerCase()
                        const matches = patients.filter(p => p.name.toLowerCase().includes(q))
                        return (
                          <>
                            {matches.map(p => (
                              <button key={p.id} type="button"
                                onMouseDown={() => { setFormPatientId(String(p.id)); setFormPatientName(p.name); setFormPatientSearch(p.name); setFormPatientOpen(false) }}
                                className="w-full text-left px-4 py-2.5 text-sm text-gray-800 hover:bg-violet-50 hover:text-violet-700 transition-colors">
                                {p.name}
                              </button>
                            ))}
                            {q && matches.length === 0 && (
                              <div className="px-4 py-3">
                                <p className="text-xs text-gray-400 mb-2">Nenhum paciente encontrado para "{formPatientSearch}"</p>
                                <button type="button"
                                  onMouseDown={() => { setFormPatientName(formPatientSearch.trim()); setFormPatientOpen(false) }}
                                  className="w-full py-2 px-3 bg-violet-50 border border-violet-200 text-violet-700 text-xs font-medium rounded-lg hover:bg-violet-100 transition-colors text-left">
                                  + Cadastrar implante para "{formPatientSearch.trim()}"
                                </button>
                              </div>
                            )}
                            {!q && matches.length === 0 && (
                              <p className="px-4 py-3 text-xs text-gray-400">Nenhum paciente cadastrado.</p>
                            )}
                          </>
                        )
                      })()}
                    </div>
                  )}
                </div>
              )}
              {/* Nome manual (sem vínculo) */}
              {!formPatientId && formPatientName && !formPatientOpen && (
                <div className="mt-2 flex items-center gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg">
                  <span className="text-xs text-amber-600 flex-1">Nome manual: <strong>{formPatientName}</strong> (sem vínculo a paciente)</span>
                  <button type="button" onClick={() => { setFormPatientName(''); setFormPatientSearch('') }}
                    className="text-amber-400 hover:text-amber-600 text-lg leading-none">×</button>
                </div>
              )}
            </div>

            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Data do último implante</label>
              <input
                type="date"
                value={formDate}
                onChange={e => setFormDate(e.target.value)}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-400"
              />
            </div>

            {/* Itens do estoque usados — apenas com "implante" no nome */}
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-2">Implantes utilizados (do estoque)</label>

              {/* Lupa de busca */}
              <div className="relative mb-2">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">🔍</span>
                <input
                  type="text"
                  value={stockSearch}
                  onChange={e => setStockSearch(e.target.value)}
                  placeholder="Buscar implante..."
                  className="w-full pl-8 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-400"
                />
              </div>

              {(() => {
                const implantItems = stockItems
                  .filter(i => i.name.toLowerCase().includes('implante'))
                  .filter(i => stockSearch === '' || i.name.toLowerCase().includes(stockSearch.toLowerCase()))

                if (stockItems.length === 0) return <p className="text-xs text-gray-400">Carregando estoque...</p>
                if (implantItems.length === 0) return <p className="text-xs text-gray-400">Nenhum implante encontrado no estoque.</p>

                return (
                  <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
                    {implantItems.map(item => {
                      const sel = selectedStock.find(s => s.item.id === item.id)
                      return (
                        <div key={item.id}
                          className={`flex items-center gap-3 p-2.5 rounded-xl border cursor-pointer transition-colors ${sel ? 'border-violet-400 bg-violet-50' : 'border-gray-200 hover:border-gray-300'}`}
                          onClick={() => toggleStockItem(item)}>
                          <div className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${sel ? 'bg-violet-600 border-violet-600' : 'border-gray-300'}`}>
                            {sel && <span className="text-white text-xs leading-none">✓</span>}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-gray-800 truncate">{item.name}</p>
                            <p className="text-xs text-gray-400">
                              {item.lot ? `Lote: ${item.lot}` : 'Sem lote'}
                              {item.expiry_date ? ` · Val: ${item.expiry_date}` : ''}
                              {` · Estoque: ${item.quantity} ${item.unit}`}
                            </p>
                          </div>
                          {sel && (
                            <div className="flex items-center gap-1 shrink-0" onClick={e => e.stopPropagation()}>
                              <button type="button" onClick={() => updateStockQty(item.id, sel.quantity - 1)}
                                className="w-6 h-6 rounded-full border border-gray-300 text-gray-500 text-sm flex items-center justify-center hover:border-violet-400">−</button>
                              <span className="w-6 text-center text-sm font-bold text-gray-700">{sel.quantity}</span>
                              <button type="button" onClick={() => updateStockQty(item.id, sel.quantity + 1)}
                                className="w-6 h-6 rounded-full border border-gray-300 text-gray-500 text-sm flex items-center justify-center hover:border-violet-400">+</button>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )
              })()}
            </div>

            {/* Opção de dar saída */}
            {selectedStock.length > 0 && (
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input type="checkbox" checked={registerSaida} onChange={e => setRegisterSaida(e.target.checked)} className="accent-violet-600 w-4 h-4" />
                <span className="text-sm text-gray-700">Dar saída no estoque automaticamente</span>
              </label>
            )}

            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Observações (opcional)</label>
              <textarea
                value={formNotes}
                onChange={e => setFormNotes(e.target.value)}
                rows={2}
                placeholder="Ex: tipo do implante, dose..."
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-400 resize-none"
              />
            </div>

            {formError && <p className="text-sm text-red-600">{formError}</p>}

            <div className="flex gap-2">
              <button type="button" onClick={() => setShowForm(false)}
                className="flex-1 py-2 border border-gray-300 text-sm text-gray-600 rounded-xl hover:bg-gray-50 transition-colors">
                Cancelar
              </button>
              <button type="submit" disabled={formLoading || (!formPatientId && !formPatientName)}
                className="flex-1 py-2 bg-violet-600 text-white text-sm font-medium rounded-xl hover:bg-violet-700 disabled:opacity-50 transition-colors">
                {formLoading ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </form>
        )}

        {/* Totalizadores */}
        {!loading && implants.length > 0 && (
          <div className="grid grid-cols-4 gap-2">
            <button onClick={() => setFilter(f => f === 'atrasado' ? 'todos' : 'atrasado')}
              className={`rounded-xl border p-3 text-center transition-colors ${filter === 'atrasado' ? 'bg-red-600 text-white border-red-600' : 'bg-white border-gray-200 hover:border-red-300'}`}>
              <p className={`text-2xl font-bold ${filter === 'atrasado' ? 'text-white' : 'text-red-600'}`}>{atrasados}</p>
              <p className={`text-xs mt-0.5 ${filter === 'atrasado' ? 'text-red-100' : 'text-gray-500'}`}>Atrasados</p>
            </button>
            <button onClick={() => setFilter(f => f === 'em_breve' ? 'todos' : 'em_breve')}
              className={`rounded-xl border p-3 text-center transition-colors ${filter === 'em_breve' ? 'bg-amber-500 text-white border-amber-500' : 'bg-white border-gray-200 hover:border-amber-300'}`}>
              <p className={`text-2xl font-bold ${filter === 'em_breve' ? 'text-white' : 'text-amber-500'}`}>{emBreve}</p>
              <p className={`text-xs mt-0.5 ${filter === 'em_breve' ? 'text-amber-100' : 'text-gray-500'}`}>Em breve</p>
            </button>
            <button onClick={() => setFilter(f => f === 'ok' ? 'todos' : 'ok')}
              className={`rounded-xl border p-3 text-center transition-colors ${filter === 'ok' ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white border-gray-200 hover:border-emerald-300'}`}>
              <p className={`text-2xl font-bold ${filter === 'ok' ? 'text-white' : 'text-emerald-600'}`}>{okCount}</p>
              <p className={`text-xs mt-0.5 ${filter === 'ok' ? 'text-emerald-100' : 'text-gray-500'}`}>Em dia</p>
            </button>
            <button onClick={() => setFilter(f => f === 'antigos' ? 'todos' : 'antigos')}
              className={`rounded-xl border p-3 text-center transition-colors ${filter === 'antigos' ? 'bg-gray-600 text-white border-gray-600' : 'bg-white border-gray-200 hover:border-gray-400'}`}>
              <p className={`text-2xl font-bold ${filter === 'antigos' ? 'text-white' : 'text-gray-500'}`}>{archivedLatest.length}</p>
              <p className={`text-xs mt-0.5 ${filter === 'antigos' ? 'text-gray-300' : 'text-gray-500'}`}>Antigos</p>
            </button>
          </div>
        )}

        {/* Lista de antigos */}
        {!loading && filter === 'antigos' && (
          archivedLatest.length === 0 ? (
            <div className="text-center py-12 text-gray-400 text-sm">Nenhum paciente antigo de implante.</div>
          ) : (
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm divide-y divide-gray-100">
              {archivedLatest.map(implant => (
                <div key={implant.id} className="px-4 py-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    {implant.patient_id ? (
                      <a href={`/pacientes/${implant.patient_id}`}
                        className="text-sm font-medium text-gray-700 hover:text-violet-700 transition-colors">
                        {implant.patient_name}
                      </a>
                    ) : (
                      <p className="text-sm font-medium text-gray-700">{implant.patient_name}</p>
                    )}
                    <p className="text-xs text-gray-400 mt-0.5">Último implante: {fmtDate(implant.last_implant_date)}</p>
                    {implant.notes && <p className="text-xs text-gray-400 truncate">{implant.notes}</p>}
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <button
                      onClick={() => handleArchive(implant, false)}
                      disabled={archivingId === implant.id}
                      title="Reativar"
                      className="px-3 py-1.5 border border-violet-200 text-violet-600 text-xs font-medium rounded-lg hover:bg-violet-50 disabled:opacity-50 transition-colors"
                    >
                      {archivingId === implant.id ? '...' : '↩ Reativar'}
                    </button>
                    <button
                      onClick={() => handleDelete(implant.id)}
                      disabled={deletingId === implant.id}
                      className="px-3 py-1.5 border border-red-200 text-red-600 text-xs font-medium rounded-lg hover:bg-red-50 disabled:opacity-50 transition-colors"
                    >
                      {deletingId === implant.id ? '...' : '🗑'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )
        )}

        {/* Lista de ativos */}
        {loading ? (
          <div className="text-center py-12 text-gray-400 text-sm animate-pulse">Carregando...</div>
        ) : filter !== 'antigos' && filtered.length === 0 ? (
          <div className="text-center py-12 text-gray-400 text-sm">
            {implants.length === 0 ? 'Nenhum implante cadastrado ainda.' : 'Nenhum implante neste filtro.'}
          </div>
        ) : filter !== 'antigos' ? (
          <div className="space-y-3">
            {filtered.map(implant => {
              const s = statusInfo(implant.days_until)
              return (
                <div key={implant.id} className={`bg-white rounded-2xl border shadow-sm p-4 ${s.cardBorder}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${s.dot}`} />
                      <div className="min-w-0">
                        {implant.patient_id ? (
                          <a href={`/pacientes/${implant.patient_id}`}
                            className="text-sm font-semibold text-gray-900 hover:text-violet-700 transition-colors">
                            {implant.patient_name}
                          </a>
                        ) : (
                          <p className="text-sm font-semibold text-gray-900">{implant.patient_name}</p>
                        )}
                        {implant.notes && (
                          <p className="text-xs text-gray-400 mt-0.5 truncate">{implant.notes}</p>
                        )}
                      </div>
                    </div>
                    <span className={`text-xs font-medium px-2 py-1 rounded-full border shrink-0 ${s.color}`}>
                      {s.label}
                    </span>
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-gray-500">
                    <div>
                      <p className="text-gray-400">Último implante</p>
                      <p className="font-medium text-gray-700">{fmtDate(implant.last_implant_date)}</p>
                    </div>
                    <div>
                      <p className="text-gray-400">Próximo previsto</p>
                      <p className={`font-medium ${implant.days_until < 0 ? 'text-red-600' : implant.days_until <= 30 ? 'text-amber-600' : 'text-gray-700'}`}>
                        {fmtDate(implant.next_implant_date)}
                        {implant.days_until < 0
                          ? ` (${Math.abs(implant.days_until)}d atraso)`
                          : implant.days_until === 0
                          ? ' (hoje)'
                          : ` (em ${implant.days_until}d)`}
                      </p>
                    </div>
                  </div>

                  {Array.isArray(implant.items_used) && implant.items_used.length > 0 && (
                    <div className="mt-2 pt-2 border-t border-gray-100">
                      <p className="text-xs text-gray-400 mb-1">Itens utilizados:</p>
                      <div className="flex flex-wrap gap-1.5">
                        {implant.items_used.map((item, i) => (
                          <span key={i} className="text-xs bg-violet-50 text-violet-700 border border-violet-200 rounded-lg px-2 py-0.5 leading-relaxed">
                            {item.name} × {item.quantity} {item.unit}
                            {item.lot && <span className="text-violet-400"> · Lote: {item.lot}</span>}
                            {item.expiry_date && <span className="text-violet-400"> · Val: {item.expiry_date}</span>}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="mt-3 flex gap-2 flex-wrap">
                    <button
                      onClick={() => openRenew(implant)}
                      className="flex-1 py-1.5 bg-violet-600 text-white text-xs font-medium rounded-lg hover:bg-violet-700 transition-colors"
                    >
                      ✅ Registrar novo implante
                    </button>
                    <button
                      onClick={() => handleArchive(implant, true)}
                      disabled={archivingId === implant.id}
                      title="Mover para Pacientes antigos"
                      className="px-3 py-1.5 border border-gray-200 text-gray-500 text-xs font-medium rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors"
                    >
                      {archivingId === implant.id ? '...' : '📦'}
                    </button>
                    <button
                      onClick={() => handleDelete(implant.id)}
                      disabled={deletingId === implant.id}
                      className="px-3 py-1.5 border border-red-200 text-red-600 text-xs font-medium rounded-lg hover:bg-red-50 disabled:opacity-50 transition-colors"
                    >
                      {deletingId === implant.id ? '...' : '🗑'}
                    </button>
                  </div>

                  {/* Histórico de implantes do mesmo paciente */}
                  {(() => {
                    const key = String(implant.patient_id ?? implant.patient_name)
                    const history = (grouped[key] ?? []).filter(i => i.id !== implant.id).sort((a, b) =>
                      new Date(b.last_implant_date).getTime() - new Date(a.last_implant_date).getTime()
                    )
                    if (history.length === 0) return null
                    const histOpen = expandedHistory.has(key)
                    return (
                      <div className="mt-2 border-t border-gray-100 pt-2">
                        <button
                          onClick={() => setExpandedHistory(prev => {
                            const next = new Set(prev)
                            next.has(key) ? next.delete(key) : next.add(key)
                            return next
                          })}
                          className="text-xs text-violet-600 hover:text-violet-800 font-medium"
                        >
                          {histOpen ? '▲ Ocultar histórico' : `▼ Ver histórico (${history.length} registro${history.length > 1 ? 's' : ''})`}
                        </button>
                        {histOpen && (
                          <div className="mt-2 space-y-1.5">
                            {history.map(h => (
                              <div key={h.id} className="bg-gray-50 rounded-lg px-3 py-2 text-xs text-gray-600 flex items-start justify-between gap-2">
                                <div>
                                  <p className="font-medium text-gray-700">{fmtDate(h.last_implant_date)}</p>
                                  {Array.isArray(h.items_used) && h.items_used.length > 0 && (
                                    <div className="mt-1 space-y-0.5">
                                      {h.items_used.map((it, idx) => (
                                        <p key={idx} className="text-gray-400">
                                          {it.name} ×{it.quantity}
                                          {it.lot && <span> · Lote: {it.lot}</span>}
                                          {it.expiry_date && <span> · Val: {it.expiry_date}</span>}
                                        </p>
                                      ))}
                                    </div>
                                  )}
                                  {h.notes && <p className="text-gray-400 italic mt-0.5">{h.notes}</p>}
                                </div>
                                <button
                                  onClick={() => handleDelete(h.id)}
                                  disabled={deletingId === h.id}
                                  className="text-red-400 hover:text-red-600 shrink-0 disabled:opacity-50"
                                >🗑</button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )
                  })()}
                </div>
              )
            })}
          </div>
        ) : null}
      </div>

      {/* Modal de renovação */}
      {renewTarget && (
        <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-gray-800">Novo implante — {renewTarget.patient_name}</h2>
                <button onClick={() => setRenewTarget(null)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
              </div>

              <form onSubmit={handleRenewSubmit} className="space-y-4">
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">Data do implante</label>
                  <input
                    type="date"
                    value={renewDate}
                    onChange={e => setRenewDate(e.target.value)}
                    required
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-400"
                  />
                </div>

                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-2">Implantes utilizados</label>
                  <div className="relative mb-2">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">🔍</span>
                    <input
                      type="text"
                      value={renewSearch}
                      onChange={e => setRenewSearch(e.target.value)}
                      placeholder="Buscar implante..."
                      className="w-full pl-8 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-400"
                    />
                  </div>

                  {(() => {
                    const implantItems = stockItems
                      .filter(i => i.name.toLowerCase().includes('implante'))
                      .filter(i => renewSearch === '' || i.name.toLowerCase().includes(renewSearch.toLowerCase()))

                    if (stockItems.length === 0) return <p className="text-xs text-gray-400">Carregando estoque...</p>
                    if (implantItems.length === 0) return <p className="text-xs text-gray-400">Nenhum implante no estoque.</p>

                    return (
                      <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                        {implantItems.map(item => {
                          const sel = renewStock.find(s => s.item.id === item.id)
                          return (
                            <div key={item.id}
                              className={`flex items-center gap-3 p-2.5 rounded-xl border cursor-pointer transition-colors ${sel ? 'border-violet-400 bg-violet-50' : 'border-gray-200 hover:border-gray-300'}`}
                              onClick={() => setRenewStock(prev => {
                                const exists = prev.find(s => s.item.id === item.id)
                                return exists ? prev.filter(s => s.item.id !== item.id) : [...prev, { item, quantity: 1 }]
                              })}>
                              <div className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 ${sel ? 'bg-violet-600 border-violet-600' : 'border-gray-300'}`}>
                                {sel && <span className="text-white text-xs leading-none">✓</span>}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm text-gray-800 truncate">{item.name}</p>
                                <p className="text-xs text-gray-400">
                                  {item.lot ? `Lote: ${item.lot}` : 'Sem lote'}
                                  {item.expiry_date ? ` · Val: ${item.expiry_date}` : ''}
                                  {` · Estoque: ${item.quantity} ${item.unit}`}
                                </p>
                              </div>
                              {sel && (
                                <div className="flex items-center gap-1 shrink-0" onClick={e => e.stopPropagation()}>
                                  <button type="button"
                                    onClick={() => setRenewStock(prev => prev.map(s => s.item.id === item.id ? { ...s, quantity: Math.max(1, s.quantity - 1) } : s))}
                                    className="w-6 h-6 rounded-full border border-gray-300 text-gray-500 text-sm flex items-center justify-center hover:border-violet-400">−</button>
                                  <span className="w-6 text-center text-sm font-bold text-gray-700">{sel.quantity}</span>
                                  <button type="button"
                                    onClick={() => setRenewStock(prev => prev.map(s => s.item.id === item.id ? { ...s, quantity: s.quantity + 1 } : s))}
                                    className="w-6 h-6 rounded-full border border-gray-300 text-gray-500 text-sm flex items-center justify-center hover:border-violet-400">+</button>
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    )
                  })()}
                </div>

                {renewStock.length > 0 && (
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input type="checkbox" checked={renewSaida} onChange={e => setRenewSaida(e.target.checked)} className="accent-violet-600 w-4 h-4" />
                    <span className="text-sm text-gray-700">Dar saída no estoque automaticamente</span>
                  </label>
                )}

                {renewError && <p className="text-sm text-red-600">{renewError}</p>}

                <div className="flex gap-2 pt-1">
                  <button type="button" onClick={() => setRenewTarget(null)}
                    className="flex-1 py-2 border border-gray-300 text-sm text-gray-600 rounded-xl hover:bg-gray-50">
                    Cancelar
                  </button>
                  <button type="submit" disabled={renewLoading}
                    className="flex-1 py-2 bg-violet-600 text-white text-sm font-medium rounded-xl hover:bg-violet-700 disabled:opacity-50">
                    {renewLoading ? 'Salvando...' : 'Salvar'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
