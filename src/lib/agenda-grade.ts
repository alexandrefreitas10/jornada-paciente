// src/lib/agenda-grade.ts
// A grade diz QUANDO a clínica atende. Quem já está ocupado é outra camada
// (subtrai desta). Lib pura: sem banco, sem React, sem rede.
import { ehFeriadoNacional } from '@/lib/feriados'

// Só estas durações existem na sala de injetáveis.
export const DURACOES = [10, 40] as const
export type Duracao = (typeof DURACOES)[number]

/**
 * "Vivo" = o agendamento segura a fatia (agendado/atendido). faltou, remarcou e
 * desmarcou soltam a cadeira. É a ÚNICA definição em TypeScript: tela e rotas
 * usam esta. A outra cópia é o SQL (índice `agendamento_fatia_viva` em db.ts e
 * os `status IN (...)` de agenda-db.ts), que não pode chamar uma função TS:
 * quem mudar a regra aqui precisa mudar lá também.
 */
export function vivo(status: string): boolean {
  return status === 'agendado' || status === 'atendido'
}

const FATIA = 10 // minutos: a menor unidade agendável

// Expediente por dia da semana (0 = domingo), em minutos desde 00:00.
// Sábado e domingo ficam de fora de propósito: ausência = fechado.
const h = (hora: number) => hora * 60
const HORARIO: Record<number, { abre: number; fecha: number }> = {
  1: { abre: h(14), fecha: h(20) }, // segunda
  2: { abre: h(14), fecha: h(20) }, // terça
  3: { abre: h(15), fecha: h(18) }, // quarta
  4: { abre: h(13), fecha: h(20) }, // quinta
  5: { abre: h(12), fecha: h(19) }, // sexta
}

// O dia é um dia puro de calendário ("AAAA-MM-DD"). Lido em UTC porque
// `new Date('AAAA-MM-DD')` já é meia-noite UTC; ler em fuso local recuaria
// um dia no Brasil (bug que já aconteceu mais de uma vez neste projeto).
function expedienteDe(dia: string) {
  if (ehFeriadoNacional(dia)) return undefined
  return HORARIO[new Date(`${dia}T00:00:00Z`).getUTCDay()]
}

const hhmm = (min: number) =>
  `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`

export function fatiasDoDia(dia: string): string[] {
  const exp = expedienteDe(dia)
  if (!exp) return []
  const fatias: string[] = []
  for (let m = exp.abre; m < exp.fecha; m += FATIA) fatias.push(hhmm(m))
  return fatias
}

// Cabe = a fatia de início existe E o atendimento termina até o fechamento.
// É isso que limita os últimos 30 min do dia a atendimentos de 10 min.
export function cabeNoExpediente(dia: string, hora: string, duracao: Duracao): boolean {
  const exp = expedienteDe(dia)
  if (!exp) return false
  if (!fatiasDoDia(dia).includes(hora)) return false
  const [hh, mm] = hora.split(':').map(Number)
  return hh * 60 + mm + duracao <= exp.fecha
}
