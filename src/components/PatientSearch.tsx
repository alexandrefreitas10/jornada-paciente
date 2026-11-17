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
  const [aviso, setAviso] = useState<'todos' | 'com' | 'sem'>('todos')
  const [portal, setPortal] = useState<'todos' | 'com' | 'sem'>('todos')

  const casaTipo = (p: PatientListItem) => tipo === 'todos' || tipoDe(p.tipo) === tipo
  const casaPrescricao = (p: PatientListItem) =>
    prescricao === 'todos' || (prescricao === 'com' ? p.tem_prescricao : !p.tem_prescricao)
  const casaAviso = (p: PatientListItem) =>
    aviso === 'todos' || (aviso === 'com' ? p.tem_aviso : !p.tem_aviso)
  const casaPortal = (p: PatientListItem) =>
    portal === 'todos' || (portal === 'com' ? p.tem_portal : !p.tem_portal)

  // Cada contagem é feita com os OUTROS filtros já aplicados. Contar sobre a
  // lista inteira faria o botão prometer um número e a tela entregar outro ao
  // clicar — e número que não bate é pior que número nenhum: a pessoa para de
  // confiar na lista toda, não só naquele botão.
  const semTipo = patients.filter(p => casaPrescricao(p) && casaAviso(p) && casaPortal(p))
  const semPrescricao = patients.filter(p => casaTipo(p) && casaAviso(p) && casaPortal(p))
  const semAviso = patients.filter(p => casaTipo(p) && casaPrescricao(p) && casaPortal(p))
  const semPortal = patients.filter(p => casaTipo(p) && casaPrescricao(p) && casaAviso(p))

  const contagem = {
    todos: semTipo.length,
    nutrologia: semTipo.filter(p => tipoDe(p.tipo) === 'nutrologia').length,
    estetica: semTipo.filter(p => tipoDe(p.tipo) === 'estetica').length,
  }
  const contagemPrescricao = {
    todos: semPrescricao.length,
    com: semPrescricao.filter(p => p.tem_prescricao).length,
    sem: semPrescricao.filter(p => !p.tem_prescricao).length,
  }
  const contagemAviso = {
    todos: semAviso.length,
    com: semAviso.filter(p => p.tem_aviso).length,
    sem: semAviso.filter(p => !p.tem_aviso).length,
  }

  const contagemPortal = {
    todos: semPortal.length,
    com: semPortal.filter(p => p.tem_portal).length,
    sem: semPortal.filter(p => !p.tem_portal).length,
  }

  const visiveis = patients.filter(p => casaTipo(p) && casaPrescricao(p) && casaAviso(p) && casaPortal(p))
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

      {/* Terceira linha: quem já ligou o aviso no celular. Só a própria pessoa
          pode ligar, no aparelho dela — não há chave do nosso lado. Por isso o
          que a equipe precisa aqui é "quem ainda falta", para pedir a esses em
          vez de aos 193. */}
      {/* Acesso ao portal. "Com acesso" é só quem ATIVOU: convite enviado e
          não usado não abre porta nenhuma, então conta como sem acesso. A
          diferença entre os dois tipos de "sem" aparece na etiqueta do card,
          porque cobrar ativação é outra conversa que enviar o convite. */}
      <div role="group" aria-label="Filtrar por acesso ao portal" className="flex gap-2 mb-2 flex-wrap">
          {([
            ['todos', 'Todos'],
            ['com', 'Com acesso'],
            ['sem', 'Sem acesso'],
          ] as const).map(([valor, rotulo]) => (
            <button
              key={valor}
              onClick={() => setPortal(valor)}
              aria-pressed={portal === valor}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                portal === valor ? 'bg-violet-600 text-white' : 'text-gray-500 hover:bg-gray-50 border border-gray-200'
              }`}
            >
              {rotulo} ({contagemPortal[valor]})
            </button>
          ))}
      </div>

      <div role="group" aria-label="Filtrar por aviso no celular" className="flex gap-2 mb-2 flex-wrap">
          {([
            ['todos', 'Todos'],
            ['com', 'Com aviso'],
            ['sem', 'Sem aviso'],
          ] as const).map(([valor, rotulo]) => (
            <button
              key={valor}
              onClick={() => setAviso(valor)}
              aria-pressed={aviso === valor}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                aviso === valor ? 'bg-sky-600 text-white' : 'text-gray-500 hover:bg-gray-50 border border-gray-200'
              }`}
            >
              {rotulo} ({contagemAviso[valor]})
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
