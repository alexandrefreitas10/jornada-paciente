import { STATUS_AGENDAMENTO, type StatusAgendamento } from './agenda-db'

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

/** Devolve os MESMOS objetos da lista, nunca cópias: a tela usa o id deles. */
export function filtrarPorStatus<T extends { status: string }>(
  lista: T[],
  filtro: FiltroStatus,
): T[] {
  return filtro === 'todos' ? lista : lista.filter((a) => a.status === filtro)
}
