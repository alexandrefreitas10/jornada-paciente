// src/lib/agenda-vagas.ts
// Subtrai da grade da clínica o que já está ocupado ou bloqueado.
// Lib pura: sem banco, sem React, sem rede.
import { cabeNoExpediente, fatiasDoDia, type Duracao } from '@/lib/agenda-grade'

// Início de cada agendamento vivo do dia.
export type Ocupacao = { hora: string }
// Faixa fora do ar, em HH:MM. `ate` é EXCLUSIVO: 15:00–16:00 libera as 16:00.
export type Bloqueio = { de: string; ate: string }

// "HH:MM" tem largura fixa, então a ordem de texto é a ordem do relógio.
const cobertaPor = (hora: string, b: Bloqueio) => hora >= b.de && hora < b.ate

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
      !bloqueios.some((b) => cobertaPor(hora, b)),
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
  if (fatiasDoDia(dia).length === 0) return 'A clínica não atende neste dia.'
  if (!fatiasDoDia(dia).includes(hora)) return 'Este horário está fora do expediente da clínica.'
  if (!cabeNoExpediente(dia, hora, duracao))
    return `Um atendimento de ${duracao} minutos às ${hora} passaria da hora em que a clínica fecha.`
  if (fatiaOcupada(hora, ocupadas)) return 'Este horário já está ocupado por outro agendamento.'
  if (bloqueios.some((b) => cobertaPor(hora, b))) return 'Este horário está bloqueado na agenda.'
  return null
}
