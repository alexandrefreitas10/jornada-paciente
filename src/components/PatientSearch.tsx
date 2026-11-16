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
  // Filtro SEPARADO do de tipo, e os dois valem ao mesmo tempo. Substituir um
  // pelo outro tiraria da equipe a pergunta que ela mais vai fazer nas próximas
  // semanas: "de quem da nutrologia ainda falta subir a folha?".
  const [prescricao, setPrescricao] = useState<'todos' | 'com' | 'sem'>('todos')

  const casaTipo = (p: PatientListItem) => tipo === 'todos' || tipoDe(p.tipo) === tipo
  const casaPrescricao = (p: PatientListItem) =>
    prescricao === 'todos' || (prescricao === 'com' ? p.tem_prescricao : !p.tem_prescricao)

  // Cada contagem é feita com o OUTRO filtro já aplicado. Contar sobre a lista
  // inteira faria o botão prometer um número e a tela entregar outro ao clicar
  // — e número que não bate é pior que número nenhum: a pessoa para de
  // confiar na lista toda, não só naquele botão.
  const porPrescricao = patients.filter(casaPrescricao)
  const porTipo = patients.filter(casaTipo)

  const contagem = {
    todos: porPrescricao.length,
    nutrologia: porPrescricao.filter(p => tipoDe(p.tipo) === 'nutrologia').length,
    estetica: porPrescricao.filter(p => tipoDe(p.tipo) === 'estetica').length,
  }
  const contagemPrescricao = {
    todos: porTipo.length,
    com: porTipo.filter(p => p.tem_prescricao).length,
    sem: porTipo.filter(p => !p.tem_prescricao).length,
  }

  const visiveis = patients.filter(p => casaTipo(p) && casaPrescricao(p))
  // A busca por nome NÃO entra nas contagens: ela é consulta passageira, não
  // um recorte da lista como os dois filtros.
  const filtered = query.trim()
    ? visiveis.filter((p) => p.name.toLowerCase().includes(query.toLowerCase()))
    : visiveis

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

      {/* Sempre visível, a pedido do dono: o filtro também SINALIZA que os
          cards de hoje são todos da nutrologia, o que antes não aparecia em
          lugar nenhum da tela. */}
      {/* Os dois grupos têm nome acessível porque ambos ganharam um botão
          "Todos": sem o nome, nem a equipe no leitor de tela nem o teste
          conseguem dizer de qual "Todos" se está falando. */}
      <div role="group" aria-label="Filtrar por tipo de paciente" className="flex gap-2 mb-2 flex-wrap">
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

      <div role="group" aria-label="Filtrar por prescrição" className="flex gap-2 mb-4 flex-wrap">
          {([
            ['todos', 'Todos'],
            ['com', 'Com prescrição'],
            ['sem', 'Sem prescrição'],
          ] as const).map(([valor, rotulo]) => (
            <button
              key={valor}
              onClick={() => setPrescricao(valor)}
              aria-pressed={prescricao === valor}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                prescricao === valor ? 'bg-emerald-600 text-white' : 'text-gray-500 hover:bg-gray-50 border border-gray-200'
              }`}
            >
              {rotulo} ({contagemPrescricao[valor]})
            </button>
          ))}
      </div>

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
