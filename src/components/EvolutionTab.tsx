'use client'

import { useState, useRef } from 'react'
import { Measurement, MeasurementInput } from '@/lib/measurements'
import { MeasurementChart } from './MeasurementChart'

interface Props {
  patientId: number
  initialMeasurements: Measurement[]
}

const emptyInput = (): MeasurementInput => ({
  week: null,
  date: null,
  weight: null,
  abdominal_circumference: null,
  waist_circumference: null,
  tirzepatide_dose: null,
})

export function EvolutionTab({ patientId, initialMeasurements }: Props) {
  const [measurements, setMeasurements] = useState<Measurement[]>(initialMeasurements)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editValues, setEditValues] = useState<MeasurementInput>(emptyInput())
  const [addingNew, setAddingNew] = useState(false)
  const [newValues, setNewValues] = useState<MeasurementInput>(emptyInput())
  const fileInputRef = useRef<HTMLInputElement>(null)

  async function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    setUploadError(null)
    try {
      const formData = new FormData()
      formData.append('photo', file)
      const res = await fetch(`/api/patients/${patientId}/measurements/extract`, {
        method: 'POST',
        body: formData,
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Erro ao processar a foto')
      }
      const created: Measurement = await res.json()
      setMeasurements((prev) =>
        [...prev, created].sort((a, b) => (a.week ?? 999) - (b.week ?? 999))
      )
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Erro desconhecido')
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  async function handleSaveEdit(id: number) {
    const res = await fetch(`/api/patients/${patientId}/measurements/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(editValues),
    })
    if (!res.ok) return
    const updated: Measurement = await res.json()
    setMeasurements((prev) => prev.map((m) => (m.id === id ? updated : m)))
    setEditingId(null)
  }

  async function handleDelete(id: number) {
    await fetch(`/api/patients/${patientId}/measurements/${id}`, { method: 'DELETE' })
    setMeasurements((prev) => prev.filter((m) => m.id !== id))
  }

  async function handleSaveNew() {
    const res = await fetch(`/api/patients/${patientId}/measurements`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newValues),
    })
    if (!res.ok) return
    const created: Measurement = await res.json()
    setMeasurements((prev) =>
      [...prev, created].sort((a, b) => (a.week ?? 999) - (b.week ?? 999))
    )
    setAddingNew(false)
    setNewValues(emptyInput())
  }

  function startEdit(m: Measurement) {
    setEditingId(m.id)
    setEditValues({
      week: m.week,
      date: m.date,
      weight: m.weight,
      abdominal_circumference: m.abdominal_circumference,
      waist_circumference: m.waist_circumference,
      tirzepatide_dose: m.tirzepatide_dose,
    })
  }

  const numVal = (v: string) => (v === '' ? null : Number(v))

  const fields = [
    'week',
    'date',
    'weight',
    'abdominal_circumference',
    'waist_circumference',
    'tirzepatide_dose',
  ] as const

  return (
    <div className="space-y-6">
      {/* Upload de foto */}
      <div className="flex items-center gap-3">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handlePhotoChange}
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="flex items-center gap-2 px-4 py-2 bg-violet-600 text-white text-sm font-medium rounded-lg hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {uploading ? (
            <>
              <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8v8H4z"
                />
              </svg>
              Extraindo dados...
            </>
          ) : (
            <>📷 Enviar foto da tabela</>
          )}
        </button>
        {uploadError && <p className="text-sm text-red-600">{uploadError}</p>}
      </div>

      {/* Tabela de registros */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b border-gray-200">
              {[
                'Semana',
                'Data',
                'Peso (kg)',
                'Abdômen (cm)',
                'Cintura (cm)',
                'Tirzepatida (mg)',
                '',
              ].map((h) => (
                <th
                  key={h}
                  className="text-left py-2 px-2 text-xs font-semibold text-gray-500 whitespace-nowrap"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {measurements.map((m) =>
              editingId === m.id ? (
                <tr key={m.id} className="border-b border-gray-100 bg-violet-50">
                  {fields.map((field) => (
                    <td key={field} className="py-1 px-2">
                      <input
                        type={field === 'date' ? 'text' : 'number'}
                        value={editValues[field] ?? ''}
                        onChange={(e) =>
                          setEditValues((prev) => ({
                            ...prev,
                            [field]:
                              field === 'date'
                                ? e.target.value || null
                                : numVal(e.target.value),
                          }))
                        }
                        className="w-full border border-violet-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-violet-400"
                      />
                    </td>
                  ))}
                  <td className="py-1 px-2 whitespace-nowrap">
                    <button
                      onClick={() => handleSaveEdit(m.id)}
                      className="text-xs text-violet-700 font-medium hover:underline mr-2"
                    >
                      Salvar
                    </button>
                    <button
                      onClick={() => setEditingId(null)}
                      className="text-xs text-gray-400 hover:underline"
                    >
                      Cancelar
                    </button>
                  </td>
                </tr>
              ) : (
                <tr key={m.id} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="py-2 px-2">{m.week ?? '—'}</td>
                  <td className="py-2 px-2">{m.date ?? '—'}</td>
                  <td className="py-2 px-2">{m.weight ?? '—'}</td>
                  <td className="py-2 px-2">{m.abdominal_circumference ?? '—'}</td>
                  <td className="py-2 px-2">{m.waist_circumference ?? '—'}</td>
                  <td className="py-2 px-2">{m.tirzepatide_dose ?? '—'}</td>
                  <td className="py-2 px-2 whitespace-nowrap">
                    <button
                      onClick={() => startEdit(m)}
                      className="text-xs text-gray-400 hover:text-violet-600 mr-2"
                      title="Editar"
                    >
                      ✏️
                    </button>
                    <button
                      onClick={() => handleDelete(m.id)}
                      className="text-xs text-gray-400 hover:text-red-500"
                      title="Apagar"
                    >
                      🗑️
                    </button>
                  </td>
                </tr>
              )
            )}

            {/* Linha de novo registro */}
            {addingNew && (
              <tr className="border-b border-gray-100 bg-green-50">
                {fields.map((field) => (
                  <td key={field} className="py-1 px-2">
                    <input
                      type={field === 'date' ? 'text' : 'number'}
                      placeholder={field === 'date' ? 'dd/mm/aaaa' : ''}
                      value={newValues[field] ?? ''}
                      onChange={(e) =>
                        setNewValues((prev) => ({
                          ...prev,
                          [field]:
                            field === 'date'
                              ? e.target.value || null
                              : numVal(e.target.value),
                        }))
                      }
                      className="w-full border border-green-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-green-400"
                    />
                  </td>
                ))}
                <td className="py-1 px-2 whitespace-nowrap">
                  <button
                    onClick={handleSaveNew}
                    className="text-xs text-green-700 font-medium hover:underline mr-2"
                  >
                    Salvar
                  </button>
                  <button
                    onClick={() => {
                      setAddingNew(false)
                      setNewValues(emptyInput())
                    }}
                    className="text-xs text-gray-400 hover:underline"
                  >
                    Cancelar
                  </button>
                </td>
              </tr>
            )}
          </tbody>
        </table>

        {!addingNew && (
          <button
            onClick={() => setAddingNew(true)}
            className="mt-3 text-sm text-violet-600 hover:text-violet-800 font-medium"
          >
            + Adicionar manualmente
          </button>
        )}
      </div>

      {/* Gráficos */}
      {measurements.length > 0 && (
        <div className="grid grid-cols-1 gap-4">
          <MeasurementChart
            title="Peso"
            unit="kg"
            data={measurements
              .filter((m) => m.weight != null)
              .map((m) => ({ semana: m.week ?? '?', valor: Number(m.weight) }))}
            color="#7c3aed"
          />
          <MeasurementChart
            title="Circunferência do Abdômen"
            unit="cm"
            data={measurements
              .filter((m) => m.abdominal_circumference != null)
              .map((m) => ({ semana: m.week ?? '?', valor: Number(m.abdominal_circumference) }))}
            color="#2563eb"
          />
          <MeasurementChart
            title="Circunferência da Cintura"
            unit="cm"
            data={measurements
              .filter((m) => m.waist_circumference != null)
              .map((m) => ({ semana: m.week ?? '?', valor: Number(m.waist_circumference) }))}
            color="#059669"
          />
          <MeasurementChart
            title="Dose de Tirzepatida"
            unit="mg"
            data={measurements
              .filter((m) => m.tirzepatide_dose != null)
              .map((m) => ({ semana: m.week ?? '?', valor: Number(m.tirzepatide_dose) }))}
            color="#d97706"
          />
        </div>
      )}

      {measurements.length === 0 && !addingNew && (
        <p className="text-sm text-gray-400 text-center py-8">
          Nenhum registro ainda. Envie uma foto ou adicione manualmente.
        </p>
      )}
    </div>
  )
}
