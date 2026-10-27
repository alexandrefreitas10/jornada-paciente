// O intervalo entre sessões de um procedimento estético. PURO: sem banco e sem
// React, porque é conta de calendário e é aqui que ela pode ser testada.
//
// Antes só existia "sessões por semana", com a semana embutida na conta da data
// final. Depilação a laser é 1x por mês e já há aparelho previsto a cada 60
// dias — nenhum dos dois cabia naquele campo.

export const UNIDADES = ['dias', 'semanas', 'meses'] as const
export type UnidadeIntervalo = (typeof UNIDADES)[number]

export function ehUnidade(valor: unknown): valor is UnidadeIntervalo {
  return typeof valor === 'string' && (UNIDADES as readonly string[]).includes(valor)
}

/**
 * Soma `quantidade` vezes o intervalo a uma data ISO (AAAA-MM-DD).
 *
 * Mês é somado como **mês de calendário**, não como 30 dias, e o dia encolhe
 * quando o mês de destino é mais curto: 31/01 + 1 mês é 28/02. Somar 30 dias
 * faria a data escorregar ao longo do ano, e a clínica marca "todo dia 31".
 */
export function somarIntervalo(
  inicioIso: string,
  quantidade: number,
  valor: number,
  unidade: UnidadeIntervalo,
): string {
  // Meio-dia, não meia-noite: evita que fuso ou horário de verão joguem a data
  // para o dia anterior.
  const d = new Date(`${inicioIso}T12:00:00`)
  if (Number.isNaN(d.getTime())) return inicioIso

  const passos = quantidade * Math.max(1, valor)

  if (unidade === 'meses') {
    const diaOriginal = d.getDate()
    d.setDate(1) // evita o estouro de 31/01 virar 03/03 ao somar o mês
    d.setMonth(d.getMonth() + passos)
    const ultimoDiaDoMes = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
    d.setDate(Math.min(diaOriginal, ultimoDiaDoMes))
  } else {
    d.setDate(d.getDate() + passos * (unidade === 'semanas' ? 7 : 1))
  }

  const mes = String(d.getMonth() + 1).padStart(2, '0')
  const dia = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${mes}-${dia}`
}

/**
 * O dia da ÚLTIMA sessão: a primeira é no próprio início, então são
 * `total − 1` intervalos.
 *
 * Difere do cálculo antigo de propósito. Ele devolvia o fim do último bloco de
 * semana (10 sessões semanais a partir de 27/10 davam 04/01, um domingo em que
 * nada acontece); este devolve 29/12, que é o dia em que a décima sessão
 * acontece. Vale só para procedimento novo — o que já está gravado mantém a
 * data que tinha.
 */
export function dataDaUltimaSessao(
  inicioIso: string,
  totalSessoes: number,
  valor: number,
  unidade: UnidadeIntervalo,
): string {
  const total = Math.max(1, Math.floor(totalSessoes || 1))
  return somarIntervalo(inicioIso, total - 1, valor, unidade)
}

/**
 * A data final de um procedimento marcado por SEMANA ("2x por semana").
 *
 * É a conta que existia antes do intervalo, preservada de propósito: 31 dos 33
 * procedimentos gravados são deste tipo, e "2x por semana" não é um intervalo
 * fixo — a clínica marca terça e quinta, não "a cada três dias e meio". O que
 * esta conta devolve é o fim da última semana de tratamento, não o dia de uma
 * sessão, e é assim que a tela sempre mostrou.
 */
export function fimPorSemana(inicioIso: string, totalSessoes: number, porSemana: number): string {
  const d = new Date(`${inicioIso}T12:00:00`)
  if (Number.isNaN(d.getTime())) return inicioIso
  const porSem = Math.max(1, Math.floor(porSemana || 1))
  const semanas = Math.ceil(Math.max(1, Math.floor(totalSessoes || 1)) / porSem)
  d.setDate(d.getDate() + semanas * 7 - 1)
  const mes = String(d.getMonth() + 1).padStart(2, '0')
  const dia = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${mes}-${dia}`
}

const SINGULAR: Record<UnidadeIntervalo, string> = {
  dias: 'dia',
  semanas: 'semana',
  meses: 'mês',
}

/** "a cada 1 mês", "a cada 60 dias", "a cada 2 semanas". */
export function descreverIntervalo(valor: number, unidade: UnidadeIntervalo): string {
  const n = Math.max(1, Math.floor(valor || 1))
  return `a cada ${n} ${n === 1 ? SINGULAR[unidade] : unidade}`
}

/**
 * A cadência de um procedimento, para a tela.
 *
 * Intervalo nulo quer dizer **procedimento gravado antes desta mudança**: ele
 * só tem `sessions_per_week`, e continua sendo exibido como era. Foi decisão do
 * dono não reescrever o que já existe.
 */
export function descreverCadencia(s: {
  intervalo_valor?: number | null
  intervalo_unidade?: string | null
  sessions_per_week?: number | null
}): string {
  if (s.intervalo_valor && ehUnidade(s.intervalo_unidade)) {
    return descreverIntervalo(s.intervalo_valor, s.intervalo_unidade)
  }
  return `${s.sessions_per_week ?? 1}×/semana`
}
