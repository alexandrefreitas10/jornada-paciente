// src/lib/feriados.ts
// Feriados nacionais calculados (sem lista por ano): a agenda decide com isso
// se a clínica abre, e uma lista fixa pararia de valer no ano seguinte.

// Fixos, no formato MM-DD.
const FIXOS = new Set([
  '01-01', // Confraternização Universal
  '04-21', // Tiradentes
  '05-01', // Dia do Trabalho
  '09-07', // Independência
  '10-12', // Nossa Senhora Aparecida
  '11-02', // Finados
  '11-15', // Proclamação da República
  '11-20', // Consciência Negra (nacional desde a Lei 14.759/2023)
  '12-25', // Natal
])

// Deslocamentos em dias a partir da Páscoa.
const MOVEIS_DESDE_PASCOA = [-47, -2, 60] // Carnaval, Sexta-feira Santa, Corpus Christi

const DIA_MS = 86_400_000

// Páscoa pelo algoritmo de Meeus/Butcher (calendário gregoriano).
// Devolve o instante UTC meia-noite do domingo de Páscoa.
function pascoaUTC(ano: number): number {
  const a = ano % 19
  const b = Math.floor(ano / 100)
  const c = ano % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const mes = Math.floor((h + l - 7 * m + 114) / 31) // 3 = março, 4 = abril
  const dia = ((h + l - 7 * m + 114) % 31) + 1
  return Date.UTC(ano, mes - 1, dia)
}

// `dia` é um dia de calendário puro (AAAA-MM-DD). Tudo em UTC: passar por fuso
// local recuaria um dia, bug que já aconteceu neste projeto.
export function ehFeriadoNacional(dia: string): boolean {
  if (FIXOS.has(dia.slice(5))) return true
  const ano = Number(dia.slice(0, 4))
  const pascoa = pascoaUTC(ano)
  return MOVEIS_DESDE_PASCOA.some(
    (delta) => new Date(pascoa + delta * DIA_MS).toISOString().slice(0, 10) === dia,
  )
}
