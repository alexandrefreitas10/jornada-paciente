import { STATUS_AGENDAMENTO, type StatusAgendamento } from './agenda-status'
import { somarDiasAoDia } from './datas'

// Os números e o filtro da sub-aba Relatórios › Agendamentos. PURO: sem banco,
// sem React, sem rede — recebe a lista que a rota já devolveu.
//
// Por que separado da tela: contar é a parte que tem resposta certa, e é a que
// o dono vai usar para decidir coisa (a falta está subindo?). Regra que decide
// algo mora onde o teste alcança sem montar tela.

/** `'todos'` é a ausência de filtro, não um status do banco. */
export type FiltroStatus = StatusAgendamento | 'todos'

export type ResumoDoPeriodo = Record<StatusAgendamento, number> & { total: number }

/**
 * Quantos de cada status, mais o total.
 *
 * Começa com TODOS os status em zero antes de contar. Sem isso, um mês em que
 * ninguém remarcou não teria a chave `remarcou`, e a tela mostraria
 * "undefined" exatamente onde deveria mostrar "0" — que é informação, não
 * ausência dela.
 *
 * `total` conta a lista inteira, inclusive uma linha com status que este
 * código ainda não conheça: o relatório continua somando o que entende em vez
 * de quebrar a tela por causa de uma linha estranha.
 */
export function resumoDoPeriodo(lista: { status: string }[]): ResumoDoPeriodo {
  const resumo = { total: lista.length } as ResumoDoPeriodo
  for (const s of STATUS_AGENDAMENTO) resumo[s] = 0
  for (const a of lista) {
    if ((STATUS_AGENDAMENTO as readonly string[]).includes(a.status)) {
      resumo[a.status as StatusAgendamento] += 1
    }
  }
  return resumo
}

/**
 * Quantos dias à frente o período padrão alcança.
 *
 * ARITMÉTICA FRÁGIL, e por isso está escrita aqui junto de quem depende dela
 * (mesma disciplina das 4 cadeiras da sala). O servidor recusa período acima
 * de `MAX_DIAS_CONSULTA` (62) dias. O pior caso do padrão é abrir a aba no dia
 * 31 de um mês de 31 dias: de 01 até 31+31 dá exatamente 62 dias — passa, com
 * **folga zero**. Subir este número, ou baixar o teto do servidor, faz a aba
 * abrir com "Período longo demais" só em alguns dias do mês, que é o tipo de
 * falha que ninguém consegue reproduzir. `periodoPadraoCabe` tranca isso.
 */
export const DIAS_A_FRENTE = 31

/**
 * O período padrão do relatório, em dia de calendário.
 *
 * `hoje` entra pronto (já resolvido no fuso da clínica por quem chama): esta
 * função é pura e não tem opinião sobre relógio.
 */
export function periodoPadrao(hoje: string): { de: string; ate: string } {
  return { de: hoje.slice(0, 8) + '01', ate: somarDiasAoDia(hoje, DIAS_A_FRENTE) ?? hoje }
}

/** Devolve os MESMOS objetos da lista, nunca cópias: a tela usa o id deles. */
export function filtrarPorStatus<T extends { status: string }>(
  lista: T[],
  filtro: FiltroStatus,
): T[] {
  return filtro === 'todos' ? lista : lista.filter((a) => a.status === filtro)
}
