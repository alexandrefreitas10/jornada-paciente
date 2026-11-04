import type { EtiquetaAtraso, FiltroAtraso, LinhaAtraso } from '@/lib/estetica-atraso'
import type { GrupoProcedimento, SessaoEstetica } from '@/lib/estetica-relatorio'
import { descreverCadencia } from '@/lib/estetica-intervalo'

// A versão em papel da aba Estética, para "Imprimir / Salvar PDF".
//
// Mora fora de `Estetica.tsx` porque aquele arquivo já carrega as duas visões
// da tela, e porque papel e tela têm regras diferentes — misturar os dois num
// componente só faria cada ajuste de layout mexer no outro sem querer.
//
// **Este componente não filtra nada.** Recebe pronto o que a tela já escolheu.
// Refiltrar aqui abriria a chance de o papel discordar da tela que o dono
// estava olhando quando clicou em imprimir, e aí o relatório impresso seria uma
// terceira versão da verdade.

const ROTULOS: Record<EtiquetaAtraso, string> = {
  verde: 'em dia',
  amarela: 'atrasada',
  vermelha: 'muito atrasada',
  nunca_veio: 'nunca veio',
}

const FILTRO_ROTULO: Record<FiltroAtraso, string> = {
  atrasados: 'Atrasados',
  nunca_veio: 'Nunca veio',
  em_dia: 'Em dia',
  todos: 'Todos',
}

function fmtData(valor: string | Date | null): string {
  if (!valor) return '—'
  const d = new Date(valor)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'America/Sao_Paulo',
  })
}

/** O tempo sem vir, escrito como a tela escreve. */
function tempo(l: LinhaAtraso): string {
  if (l.etiqueta === 'nunca_veio') {
    return l.diasSemVir > 0 ? `há ${l.diasSemVir} dias sem iniciar` : 'ainda não iniciou'
  }
  return `há ${l.diasSemVir} dias`
}

const TH = 'text-left font-semibold border-b border-black px-1 py-1'
const TD = 'px-1 py-1 align-top'
/** `break-inside: avoid` em cada linha: um paciente partido ao meio na virada
 *  de página obriga quem lê a juntar as duas metades. */
const TR = 'border-b border-gray-300 break-inside-avoid'

function Vazio({ colunas }: { colunas: number }) {
  return (
    <tr>
      <td className={TD} colSpan={colunas}>Ninguém por aqui.</td>
    </tr>
  )
}

function TabelaDeSessoes({ titulo, sessoes }: { titulo: string; sessoes: SessaoEstetica[] }) {
  return (
    <table aria-label={`${titulo} (${sessoes.length})`} className="w-full text-[11px] mb-4">
      <caption className="text-left font-semibold pb-1">{titulo} ({sessoes.length})</caption>
      <thead>
        <tr>
          <th className={TH}>Paciente</th>
          <th className={TH}>Sessões</th>
          <th className={TH}>Início</th>
          <th className={TH}>Última</th>
        </tr>
      </thead>
      <tbody>
        {sessoes.length === 0 ? <Vazio colunas={4} /> : sessoes.map(s => (
          <tr key={s.id} className={TR}>
            <td className={TD}>{s.patientName}</td>
            <td className={TD}>{s.feitas} de {s.totalSessoes || '—'}</td>
            <td className={TD}>{fmtData(s.inicio)}</td>
            <td className={TD}>{fmtData(s.ultimaFeita)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export function EsteticaImpressao({
  visao,
  filtro,
  atrasos,
  grupo,
  emitidoEm,
}: {
  visao: 'procedimento' | 'atraso'
  filtro: FiltroAtraso
  /** Já filtrados pela tela. */
  atrasos: LinhaAtraso[]
  /** O procedimento aberto, ou `null` quando não há nenhum. */
  grupo: GrupoProcedimento | null
  emitidoEm: Date
}) {
  const titulo = visao === 'atraso'
    ? 'Estética — Quem está atrasado'
    : `Estética — ${grupo?.nome ?? 'Por procedimento'}`

  const subtitulo = visao === 'atraso'
    ? `Filtro: ${FILTRO_ROTULO[filtro]} · ${atrasos.length} ${atrasos.length === 1 ? 'paciente' : 'pacientes'}`
    : grupo
      ? `${grupo.pacientes} ${grupo.pacientes === 1 ? 'paciente' : 'pacientes'}`
      : 'Nenhum procedimento selecionado'

  return (
    <section id="estetica-print" role="region" aria-label="Relatório de Estética para impressão" className="hidden">
      <header className="mb-3 pb-2 border-b-2 border-black">
        <h1 className="text-base font-bold uppercase">{titulo}</h1>
        <div className="flex justify-between text-[11px] mt-1">
          <span>{subtitulo}</span>
          <span>Emitido em {fmtData(emitidoEm)}</span>
        </div>
      </header>

      {visao === 'atraso' ? (
        <table aria-label="Pacientes" className="w-full text-[11px]">
          <thead>
            <tr>
              <th className={TH}>Paciente</th>
              <th className={TH}>Procedimento</th>
              <th className={TH}>Cadência</th>
              <th className={TH}>Sessões</th>
              <th className={TH}>Tempo</th>
              <th className={TH}>Situação</th>
            </tr>
          </thead>
          <tbody>
            {atrasos.length === 0 ? <Vazio colunas={6} /> : atrasos.map(l => (
              <tr key={l.id} className={TR}>
                <td className={TD}>{l.patientName}</td>
                <td className={TD}>{l.procedimento}</td>
                <td className={TD}>{descreverCadencia(l)}</td>
                <td className={TD}>{l.feitas} de {l.totalSessoes || '—'}</td>
                <td className={TD}>{tempo(l)}</td>
                {/* Texto, não pílula colorida: o papel costuma sair em preto e
                    branco, e aí a cor que distinguia as situações some. */}
                <td className={TD}>{ROTULOS[l.etiqueta]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : grupo ? (
        <>
          <TabelaDeSessoes titulo="Em aberto" sessoes={grupo.emAberto} />
          <TabelaDeSessoes titulo="Finalizados" sessoes={grupo.finalizados} />
        </>
      ) : null}
    </section>
  )
}
