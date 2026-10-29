import { ehFinalizado, type SessaoEstetica } from './estetica-relatorio'
import { ehUnidade } from './estetica-intervalo'

// Quem está atrasado na estética. PURO: sem banco, sem React.
//
// Espelha a ideia do "Em tratamento" (verde / amarela / vermelha pelo tempo sem
// vir), com uma diferença que muda tudo: lá o intervalo é do paciente, aqui é
// de CADA procedimento. Vinte dias sem vir é normal numa depilação mensal e é
// abandono num protocolo de 2× por semana.

export const ETIQUETAS_ATRASO = ['verde', 'amarela', 'vermelha', 'nunca_veio'] as const
export type EtiquetaAtraso = (typeof ETIQUETAS_ATRASO)[number]

/** Dias de um mês, para a conta de atraso. Aproximação consciente: aqui o
 *  número só decide a cor de uma etiqueta, não a data de uma sessão — para
 *  data, `somarIntervalo` usa mês de calendário de verdade. */
const DIAS_NO_MES = 30

/** Piso do amarelo. Sem ele, um protocolo diário ficaria vermelho em três
 *  dias, e a tela viraria um mar de vermelho que ninguém olha. */
const PISO_AMARELO = 7

/**
 * De quantos em quantos dias esta pessoa deveria vir.
 *
 * `2× por semana` vira ~4 dias (7÷2, arredondado): não é exato porque a clínica
 * marca terça e quinta, mas para decidir "faz quanto tempo que ela sumiu" essa
 * aproximação basta — e é melhor que tratar tudo como semanal.
 */
export function cadenciaEmDias(s: {
  sessions_per_week?: number | null
  intervalo_valor?: number | null
  intervalo_unidade?: string | null
}): number {
  if (s.intervalo_valor && ehUnidade(s.intervalo_unidade)) {
    const n = Math.max(1, Math.floor(s.intervalo_valor))
    if (s.intervalo_unidade === 'dias') return n
    if (s.intervalo_unidade === 'semanas') return n * 7
    return n * DIAS_NO_MES
  }
  const porSemana = Math.max(1, Math.floor(s.sessions_per_week || 1))
  return Math.max(1, Math.round(7 / porSemana))
}

export interface Atraso {
  etiqueta: EtiquetaAtraso
  /** Dias desde a última sessão feita — ou desde o início, para quem nunca veio. */
  diasSemVir: number
  cadenciaDias: number
}

function diasEntre(de: Date, ate: Date): number {
  return Math.floor((ate.getTime() - de.getTime()) / 86_400_000)
}

/**
 * Classifica um procedimento EM ABERTO pelo tempo sem vir.
 *
 * Devolve `null` para procedimento finalizado: quem terminou não está
 * atrasado, e misturar os dois encheria a tela de gente que não precisa de
 * nada.
 *
 * A conta parte da ÚLTIMA SESSÃO REALIZADA, que é um fato registrado, e não da
 * data inicial — o dono avisou que as datas iniciais ficaram tortas em vários
 * cards quando ele preencheu o histórico de uma vez só.
 */
export function classificarAtraso(
  s: SessaoEstetica,
  agora: Date = new Date(),
): Atraso | null {
  if (ehFinalizado(s)) return null

  const cadenciaDias = cadenciaEmDias(s)

  if (!s.feitas || !s.ultimaFeita) {
    // Nunca veio: conta do início combinado. Sem data de início não dá para
    // dizer há quanto tempo — mas ela segue sendo alguém que não começou.
    const inicio = s.inicio ? new Date(s.inicio) : null
    const dias = inicio && !Number.isNaN(inicio.getTime())
      ? Math.max(0, diasEntre(inicio, agora))
      : 0
    return { etiqueta: 'nunca_veio', diasSemVir: dias, cadenciaDias }
  }

  const ultima = new Date(s.ultimaFeita)
  if (Number.isNaN(ultima.getTime())) return { etiqueta: 'nunca_veio', diasSemVir: 0, cadenciaDias }

  const diasSemVir = Math.max(0, diasEntre(ultima, agora))
  const limiteAmarelo = Math.max(2 * cadenciaDias, PISO_AMARELO)

  const etiqueta: EtiquetaAtraso =
    diasSemVir <= cadenciaDias ? 'verde'
    : diasSemVir <= limiteAmarelo ? 'amarela'
    : 'vermelha'

  return { etiqueta, diasSemVir, cadenciaDias }
}

export type FiltroAtraso = 'todos' | 'atrasados' | 'em_dia' | 'nunca_veio'

export interface LinhaAtraso extends SessaoEstetica, Atraso {}

/** Prioridade na tela: o mais abandonado primeiro. Quem nunca veio fica no
 *  topo junto dos vermelhos, porque é o caso que mais pede um telefonema. */
const PESO: Record<EtiquetaAtraso, number> = {
  vermelha: 0,
  nunca_veio: 1,
  amarela: 2,
  verde: 3,
}

export function montarAtrasos(sessoes: SessaoEstetica[], agora: Date = new Date()): LinhaAtraso[] {
  return sessoes
    .map(s => {
      const a = classificarAtraso(s, agora)
      return a ? { ...s, ...a } : null
    })
    .filter((l): l is LinhaAtraso => l !== null)
    .sort((a, b) =>
      PESO[a.etiqueta] - PESO[b.etiqueta] ||
      b.diasSemVir - a.diasSemVir ||
      a.patientName.localeCompare(b.patientName, 'pt-BR'),
    )
}

export function filtrarAtrasos(linhas: LinhaAtraso[], filtro: FiltroAtraso): LinhaAtraso[] {
  if (filtro === 'todos') return linhas
  if (filtro === 'nunca_veio') return linhas.filter(l => l.etiqueta === 'nunca_veio')
  if (filtro === 'em_dia') return linhas.filter(l => l.etiqueta === 'verde')
  // "Atrasados" junta amarela e vermelha: é a lista de quem precisa de contato.
  return linhas.filter(l => l.etiqueta === 'amarela' || l.etiqueta === 'vermelha')
}
