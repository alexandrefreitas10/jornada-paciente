'use client'

import { useState, useEffect } from 'react'

interface Patient { id: number; name: string }

interface Implant {
  id: number
  patient_id: number | null
  patient_name: string
  last_implant_date: string
  next_implant_date: string
  days_until: number
  notes: string | null
  created_at: string
}

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
  const [renewingId, setRenewingId] = useState<number | null>(null)
  const [deletingId, setDeletingId] = useState<number | null>(null)
  const [filter, setFilter] = useState<'todos' | 'atrasado' | 'em_breve' | 'ok'>('todos')

  // form state
  const [formPatientId, setFormPatientId] = useState<string>('')
  const [formPatientName, setFormPatientName] = useState('')
  const [formDate, setFormDate] = useState(today())
  const [formNotes, setFormNotes] = useState('')
  const [formLoading, setFormLoading] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/implants')
      .then(r => r.json())
      .then(setImplants)
      .finally(() => setLoading(false))
  }, [])

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setFormLoading(true)
    setFormError(null)
    try {
      const selectedPatient = patients.find(p => String(p.id) === formPatientId)
      const name = selectedPatient?.name ?? formPatientName
      const res = await fetch('/api/implants', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patient_id: selectedPatient?.id ?? null,
          patient_name: name,
          last_implant_date: formDate,
          notes: formNotes || null,
        }),
      })
      if (!res.ok) throw new Error((await res.json()).error || 'Erro')
      const newImplant: Implant = await res.json()
      setImplants(prev => [...prev, newImplant].sort((a, b) => a.days_until - b.days_until))
      setShowForm(false)
      setFormPatientId('')
      setFormPatientName('')
      setFormDate(today())
      setFormNotes('')
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Erro')
    } finally {
      setFormLoading(false)
    }
  }

  async function handleRenew(implant: Implant) {
    setRenewingId(implant.id)
    try {
      const res = await fetch(`/api/implants/${implant.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ last_implant_date: today() }),
      })
      if (!res.ok) throw new Error()
      const updated: Implant = await res.json()
      setImplants(prev => prev.map(i => i.id === implant.id ? updated : i).sort((a, b) => a.days_until - b.days_until))
    } finally {
      setRenewingId(null)
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

  const filtered = implants.filter(i => {
    if (filter === 'atrasado') return i.days_until < 0
    if (filter === 'em_breve') return i.days_until >= 0 && i.days_until <= 30
    if (filter === 'ok')       return i.days_until > 30
    return true
  })

  const atrasados  = implants.filter(i => i.days_until < 0).length
  const emBreve    = implants.filter(i => i.days_until >= 0 && i.days_until <= 30).length
  const okCount    = implants.filter(i => i.days_until > 30).length

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

        {/* Formulário de criação */}
        {showForm && (
          <form onSubmit={handleCreate} className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 space-y-4">
            <h2 className="text-sm font-semibold text-gray-700">Novo registro de implante</h2>

            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Paciente</label>
              <select
                value={formPatientId}
                onChange={e => {
                  setFormPatientId(e.target.value)
                  const p = patients.find(p => String(p.id) === e.target.value)
                  if (p) setFormPatientName(p.name)
                  else setFormPatientName('')
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-400"
              >
                <option value="">Selecione um paciente...</option>
                {patients.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
              {!formPatientId && (
                <input
                  type="text"
                  placeholder="Ou digite o nome manualmente"
                  value={formPatientName}
                  onChange={e => setFormPatientName(e.target.value)}
                  className="mt-2 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-400"
                />
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
          <div className="grid grid-cols-3 gap-3">
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
          </div>
        )}

        {/* Lista */}
        {loading ? (
          <div className="text-center py-12 text-gray-400 text-sm animate-pulse">Carregando...</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 text-gray-400 text-sm">
            {implants.length === 0 ? 'Nenhum implante cadastrado ainda.' : 'Nenhum implante neste filtro.'}
          </div>
        ) : (
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

                  <div className="mt-3 flex gap-2 flex-wrap">
                    <button
                      onClick={() => handleRenew(implant)}
                      disabled={renewingId === implant.id}
                      className="flex-1 py-1.5 bg-violet-600 text-white text-xs font-medium rounded-lg hover:bg-violet-700 disabled:opacity-50 transition-colors"
                    >
                      {renewingId === implant.id ? 'Registrando...' : '✅ Registrar novo implante (hoje)'}
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
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
