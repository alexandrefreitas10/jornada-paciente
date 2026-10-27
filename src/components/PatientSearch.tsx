'use client'

import { useState } from 'react'
import { PatientCard } from './PatientCard'
import { PatientListItem } from '@/lib/patients'
import { ROTULO_TIPO, tipoDe, type TipoPaciente } from '@/lib/tipo-paciente'

interface Props {
  patients: PatientListItem[]
}

export function PatientSearch({ patients }: Props) {
  const [query, setQuery] = useState('')
  // Começa na nutrologia, que é a lista que o dono sempre viu. Quem é só
  // estética não some: tem a própria aba, com a contagem ao lado.
  const [tipo, setTipo] = useState<TipoPaciente | 'todos'>('nutrologia')

  const contagem = {
    todos: patients.length,
    nutrologia: patients.filter(p => tipoDe(p.tipo) === 'nutrologia').length,
    estetica: patients.filter(p => tipoDe(p.tipo) === 'estetica').length,
  }

  const doTipo = tipo === 'todos' ? patients : patients.filter(p => tipoDe(p.tipo) === tipo)
  const filtered = query.trim()
    ? doTipo.filter((p) => p.name.toLowerCase().includes(query.toLowerCase()))
    : doTipo

  return (
    <>
      <div className="relative mb-6">
        <svg
          className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4 pointer-events-none"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
        </svg>
        <input
          type="text"
          placeholder="Buscar paciente..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full pl-9 pr-4 py-2 rounded-lg border border-gray-200 bg-white text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-violet-400 focus:border-transparent"
        />
        {query && (
          <button
            onClick={() => setQuery('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            aria-label="Limpar busca"
          >
            ✕
          </button>
        )}
      </div>

      {/* Só aparece quando existe alguém de estética: enquanto a clínica não
          tiver nenhum, a tela continua exatamente como sempre foi. */}
      {contagem.estetica > 0 && (
        <div className="flex gap-2 mb-4 flex-wrap">
          {(['nutrologia', 'estetica', 'todos'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTipo(t)}
              aria-pressed={tipo === t}
              className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
                tipo === t ? 'bg-violet-600 text-white' : 'text-gray-600 hover:bg-gray-50 border border-gray-200'
              }`}
            >
              {t === 'todos' ? 'Todos' : ROTULO_TIPO[t]} ({contagem[t]})
            </button>
          ))}
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <p className="text-lg mb-1">Nenhum paciente encontrado</p>
          <p className="text-sm">Tente outro nome</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((patient) => (
            <PatientCard key={patient.id} patient={patient} />
          ))}
        </div>
      )}
    </>
  )
}
