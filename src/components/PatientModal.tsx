// src/components/PatientModal.tsx
'use client'

import { useState } from 'react'
import { validarTelefone } from '@/lib/telefone'
import { ROTULO_TIPO, TIPO_PADRAO, TIPOS_PACIENTE, tipoDe } from '@/lib/tipo-paciente'

interface PatientFormData {
  name: string
  /** 'nutrologia' (padrão) ou 'estetica'. */
  tipo?: string
  phone: string
  start_date: string
  duration: string
  notes: string
}

interface Props {
  initial?: PatientFormData
  onSave: (data: PatientFormData) => Promise<void>
  onClose: () => void
  title: string
  /**
   * Só o cadastro novo exige telefone. Na edição ele fica opcional: 165
   * pacientes ainda não têm número, e travar impediria de corrigir o nome deles.
   */
  telefoneObrigatorio?: boolean
}

export function PatientModal({ initial, onSave, onClose, title, telefoneObrigatorio = false }: Props) {
  const [form, setForm] = useState<PatientFormData>(
    initial ?? { name: '', tipo: TIPO_PADRAO, start_date: '', duration: '', notes: '', phone: '' }
  )
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim()) { setError('Nome é obrigatório'); return }
    const tel = validarTelefone(form.phone)
    if (telefoneObrigatorio && !tel.ok) { setError(tel.motivo); return }
    if (form.phone.trim() && !tel.ok) { setError(tel.motivo); return }
    setLoading(true)
    setError('')
    try {
      await onSave(form)
      onClose()
    } catch {
      setError('Erro ao salvar. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      {/* `max-h` + `overflow-y-auto`: o formulário já passa da altura da tela
          em notebook, e sem rolagem os botões de Cancelar e Salvar ficam fora
          do alcance — o quadro vira uma armadilha sem saída. */}
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 max-h-[90vh] overflow-y-auto">
        <h2 className="text-lg font-semibold mb-4">{title}</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nome *</label>
            <input
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-violet-400"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Nome do paciente"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Telefone {telefoneObrigatorio && '*'}
            </label>
            <input
              type="tel"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-violet-400"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              placeholder="(62) 98149-1277"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Tipo de atendimento</label>
            <select
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-violet-400"
              value={tipoDe(form.tipo)}
              onChange={(e) => setForm({ ...form, tipo: e.target.value })}
            >
              {TIPOS_PACIENTE.map(t => <option key={t} value={t}>{ROTULO_TIPO[t]}</option>)}
            </select>
            <p className="text-xs text-gray-500 mt-1">
              Estética mostra no card apenas Estética e Fotos — o resto é do tratamento da nutrologia.
            </p>
          </div>
          {/* Início e duração são do tratamento da nutrologia: para quem só faz
              estética eles ficariam vazios para sempre, e as datas que importam
              são as de cada procedimento. */}
          {tipoDe(form.tipo) === 'nutrologia' && (
          <>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Data de início</label>
            <input
              type="date"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-violet-400"
              value={form.start_date}
              onChange={(e) => setForm({ ...form, start_date: e.target.value })}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Duração do tratamento (semanas)</label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min="1"
                max="104"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-violet-400"
                value={form.duration}
                onChange={(e) => setForm({ ...form, duration: e.target.value })}
                placeholder="Ex: 12"
              />
              <span className="text-sm text-gray-500 whitespace-nowrap">semanas</span>
            </div>
          </div>
          </>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Observações</label>
            <textarea
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-violet-400 resize-none"
              rows={3}
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              placeholder="Observações sobre o paciente..."
            />
          </div>
          {error && <p className="text-sm text-red-500">{error}</p>}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 px-4 py-2 bg-violet-600 text-white rounded-lg hover:bg-violet-700 disabled:opacity-50"
            >
              {loading ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
