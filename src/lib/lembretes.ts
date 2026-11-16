// O lembrete da véspera: quem recebe, e o disparo.
//
// Spec: docs/superpowers/specs/2026-11-16-avisos-do-portal.md.
//
// É o único dos três avisos que não nasce de uma ação de alguém — precisa de
// algo que rode uma vez por dia e varra quem tem aplicação amanhã.

export interface AgendamentoParaLembrete {
  id: number
  patient_id: number
  dia: string
  hora: string
  status: string
}

/**
 * De todos os agendamentos de amanhã, quem de fato recebe o lembrete.
 *
 * PURO, e separado do disparo, porque é aqui que moram as decisões que doem
 * se estiverem erradas: lembrar alguém de uma aplicação que ela desmarcou, ou
 * mandar o mesmo aviso duas vezes, é o ruído que faz a pessoa desligar os
 * avisos — e desligar é quase definitivo.
 *
 * Só `agendado`: `atendido` na véspera não é compromisso, é registro de um
 * atendimento passado remarcado. `faltou`, `remarcou` e `desmarcou` existem
 * para o relatório e não seguram ninguém.
 *
 * Um por PESSOA, o mais cedo do dia — que é a hora em que ela precisa chegar.
 * Dois avisos seguidos sobre o mesmo dia parecem defeito.
 */
export function quemRecebeLembrete(
  agendamentos: AgendamentoParaLembrete[],
  jaEnviados: Set<number>,
): AgendamentoParaLembrete[] {
  const porPaciente = new Map<number, AgendamentoParaLembrete>()
  for (const a of agendamentos) {
    if (a.status !== 'agendado') continue
    if (jaEnviados.has(a.id)) continue
    const atual = porPaciente.get(a.patient_id)
    if (!atual || a.hora < atual.hora) porPaciente.set(a.patient_id, a)
  }
  return [...porPaciente.values()]
}
