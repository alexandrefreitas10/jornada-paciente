import { STATUS_AGENDAMENTO, type StatusAgendamento } from './agenda-status'

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
 * O período padrão do relatório: o **mês fechado** de `hoje`, do dia 1 ao
 * último dia.
 *
 * Decisão do dono em 17/11/2026. A primeira versão ia do dia 1 até 31 dias à
 * frente, para ajudar a gerenciar a semana seguinte — mas aí os números do
 * topo misturavam o mês corrente com metade do mês seguinte, e "Agendado (40)"
 * respondia uma pergunta que ninguém tinha feito. Ele abre a aba para FECHAR
 * O MÊS; quem quiser ver o que vem muda as datas na mão.
 *
 * De quebra, isto sossega a aritmética do teto: um mês tem no máximo 31 dias,
 * bem abaixo dos 62 que o servidor aceita. A versão anterior encostava no
 * limite exato em alguns dias do mês.
 *
 * `hoje` entra pronto (já resolvido no fuso da clínica por quem chama): esta
 * função é pura e não tem opinião sobre relógio. O último dia sai de
 * `Date.UTC(ano, mes, 0)` — dia zero do mês seguinte é o último do atual, e em
 * UTC porque aqui se fala de calendário, não de instante.
 */
export function periodoPadrao(hoje: string): { de: string; ate: string } {
  const [ano, mes] = hoje.split('-').map(Number)
  const ultimo = new Date(Date.UTC(ano, mes, 0)).getUTCDate()
  const inicio = hoje.slice(0, 8)
  return { de: `${inicio}01`, ate: `${inicio}${String(ultimo).padStart(2, '0')}` }
}

/** Devolve os MESMOS objetos da lista, nunca cópias: a tela usa o id deles. */
export function filtrarPorStatus<T extends { status: string }>(
  lista: T[],
  filtro: FiltroStatus,
): T[] {
  return filtro === 'todos' ? lista : lista.filter((a) => a.status === filtro)
}
