import type { Aviso } from './push'
import { TIPO_FOLHA_PRESCRICAO } from './folha-prescricao'

// O que cada aviso do portal diz. PURO: sem banco, sem rede.
//
// Spec: docs/superpowers/specs/2026-11-16-avisos-do-portal.md (aprovada pelo
// dono em 16/11/2026).
//
// POR QUE OS TEXTOS MORAM JUNTOS, LONGE DE QUEM DISPARA: eles obedecem a uma
// regra que vale para todos e que é fácil de quebrar sem perceber ao escrever
// um texto novo no meio de uma rota — **nada de medicação, procedimento ou
// nome do paciente**. O aviso aparece na tela bloqueada, onde marido, filho e
// colega leem sem querer; "sua aplicação" basta, e é a palavra que a clínica
// já usa. Com os textos num lugar só, o teste consegue varrer todos.

const DIAS_SEMANA = [
  'Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira',
  'Quinta-feira', 'Sexta-feira', 'Sábado',
]

/**
 * "Quinta-feira, às 15h" — como a clínica fala.
 *
 * O dia é lido em UTC porque `AAAA-MM-DD` é data de CALENDÁRIO, não instante:
 * lido no fuso local, 16/11 viraria domingo em qualquer fuso a oeste e o
 * paciente leria o dia errado. Hora cheia perde os minutos ("15h"); quebrada
 * os mantém ("14h30"), que é como se diz em voz alta.
 */
export function quandoPorExtenso(dia: string, hora: string): string {
  const d = new Date(`${dia}T00:00:00Z`)
  const nome = Number.isNaN(d.getTime()) ? dia : DIAS_SEMANA[d.getUTCDay()]
  const [h, min] = hora.split(':')
  const relogio = min === '00' ? `${Number(h)}h` : `${Number(h)}h${min}`
  return `${nome}, às ${relogio}`
}

/**
 * Os textos fixos, num objeto só para o teste conseguir varrer todos de uma
 * vez contra a regra da tela bloqueada.
 */
export const TEXTOS_DE_AVISO = {
  agendaLiberada: {
    titulo: 'Sua agenda está liberada',
    texto: 'Escolha o horário da sua próxima aplicação.',
  },
  lembreteVespera: {
    titulo: 'Sua aplicação é amanhã',
    texto: '',
  },
  clinicaMarcou: {
    titulo: 'Seu horário foi marcado',
    texto: '',
  },
  clinicaMudou: {
    titulo: 'Seu horário mudou',
    texto: '',
  },
} as const

/**
 * Este arquivo que acabou de ser salvo abre a agenda deste paciente pela
 * primeira vez?
 *
 * Duas condições, e as duas importam. O tipo precisa ser a folha da aba
 * **Prescrições** — `'prescription'`, da aba Evolução, tem nome quase igual e
 * não abre nada (ver `folha-prescricao.ts`). E tem de ser a PRIMEIRA: quem
 * está em tratamento longo recebe folha nova a cada ciclo, e ouvir "sua
 * agenda está liberada" de novo, semanas depois de já estar marcando, é o
 * ruído que faz as pessoas desligarem os avisos de vez.
 */
export function devoAvisarAgendaLiberada(fileType: string, jaTinhaFolha: boolean): boolean {
  return fileType === TIPO_FOLHA_PRESCRICAO && !jaTinhaFolha
}

/** Dispara quando a PRIMEIRA folha de prescrição do paciente é salva. */
export function avisoAgendaLiberada(): Aviso {
  return { ...TEXTOS_DE_AVISO.agendaLiberada }
}

/** Dispara na manhã do dia anterior, para quem tem aplicação viva marcada. */
export function avisoLembreteVespera(dia: string, hora: string): Aviso {
  return {
    titulo: TEXTOS_DE_AVISO.lembreteVespera.titulo,
    texto: `${quandoPorExtenso(dia, hora)}.`,
  }
}

/**
 * Dispara quando a EQUIPE marca ou remarca pelo paciente.
 *
 * Nunca quando o próprio paciente marca: ele acabou de ver a tela confirmar, e
 * avisar seria eco. E nunca no bloqueio de um dia, que derruba vários de uma
 * vez — ali o aviso continua humano, por decisão do dono: receber "sua
 * aplicação foi cancelada" de um robô, sem ninguém a quem perguntar o que
 * houve, é pior que o WhatsApp da clínica.
 */
export function avisoHorarioDaClinica(dia: string, hora: string, remarcado: boolean): Aviso {
  return {
    titulo: remarcado ? TEXTOS_DE_AVISO.clinicaMudou.titulo : TEXTOS_DE_AVISO.clinicaMarcou.titulo,
    texto: `${quandoPorExtenso(dia, hora)}.`,
  }
}
