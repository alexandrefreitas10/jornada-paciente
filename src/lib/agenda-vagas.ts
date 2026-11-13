// src/lib/agenda-vagas.ts
// Subtrai da grade da clínica o que já está ocupado ou bloqueado.
// Lib pura: sem banco, sem React, sem rede.
import { cabeNoExpediente, fatiasDoDia, type Duracao } from '@/lib/agenda-grade'

// Início de cada agendamento vivo do dia.
export type Ocupacao = { hora: string }
// Faixa fora do ar, em HH:MM. `ate` é EXCLUSIVO: 15:00–16:00 libera as 16:00.
export type Bloqueio = { de: string; ate: string }

const minutos = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

// O bloqueio vale para o atendimento INTEIRO, não só para a fatia de início:
// um soro de 40 min às 15:40 com sala fechada a partir das 16:00 deixaria o
// paciente na cadeira com a sala fechada (é o mesmo raciocínio do fim do dia).
// Intervalo [hora, hora+duração) contra [de, ate): encostar em 'de' não cruza.
const cruzaBloqueio = (hora: string, duracao: Duracao, b: Bloqueio) =>
  minutos(hora) < minutos(b.ate) && minutos(hora) + duracao > minutos(b.de)

// Só a fatia de INÍCIO conta como ocupada, de propósito: a enfermeira só fica
// presa nos ~10 min iniciais; o soro de 40 min usa uma cadeira, não a enfermeira.
// 40 min = 4 fatias = 4 cadeiras, então um início por fatia já respeita a sala.
// Reservar as fatias seguintes cortaria a capacidade da sala por quatro.
const fatiaOcupada = (hora: string, ocupadas: Ocupacao[]) =>
  ocupadas.some((o) => o.hora === hora)

export function vagasDoDia(
  dia: string,
  duracao: Duracao,
  ocupadas: Ocupacao[],
  bloqueios: Bloqueio[],
): string[] {
  return fatiasDoDia(dia).filter(
    (hora) =>
      cabeNoExpediente(dia, hora, duracao) &&
      !fatiaOcupada(hora, ocupadas) &&
      !bloqueios.some((b) => cruzaBloqueio(hora, duracao, b)),
  )
}

// Texto para a equipe ler na tela: devolve a primeira razão que barra a fatia.
export function motivoDeRecusa(
  dia: string,
  hora: string,
  duracao: Duracao,
  ocupadas: Ocupacao[],
  bloqueios: Bloqueio[],
): string | null {
  const fatias = fatiasDoDia(dia)
  if (fatias.length === 0) return 'A clínica não atende neste dia.'
  if (!fatias.includes(hora)) return 'Este horário está fora do expediente da clínica.'
  if (!cabeNoExpediente(dia, hora, duracao))
    return `Um atendimento de ${duracao} minutos às ${hora} passaria da hora em que a clínica fecha.`
  if (fatiaOcupada(hora, ocupadas)) return 'Este horário já está ocupado por outro agendamento.'
  if (bloqueios.some((b) => cruzaBloqueio(hora, duracao, b))) return 'Este horário está bloqueado na agenda.'
  return null
}

// Decide o que fazer com um pedido de gravação DEPOIS de saber se a regra barra
// o horário. Só disponibilidade: quem pode pedir já foi decidido na rota.
// `forcado` é o encaixe da equipe — fura a regra de propósito. O motivo nunca
// some: se grava furando, volta como `aviso` para a tela mostrar; furar sem
// perceber é o que não pode acontecer. `encaixe` é o que tira a linha do índice
// único parcial; sem motivo não há regra furada, então não marca encaixe.
export function decidirGravacao(p: { motivo: string | null; forcado: boolean }):
  | { grava: true; status: 201; aviso: string | null; encaixe: boolean }
  | { grava: false; status: 409; aviso: string; encaixe: false } {
  if (p.motivo === null) return { grava: true, status: 201, aviso: null, encaixe: false }
  if (p.forcado) return { grava: true, status: 201, aviso: p.motivo, encaixe: true }
  return { grava: false, status: 409, aviso: p.motivo, encaixe: false }
}
