// Regras de arquivamento de paciente. Puro — usado pela API e pelos
// formulários, para que a tela e o servidor recusem exatamente o mesmo.

export const MOTIVO_MIN = 3
export const MOTIVO_MAX = 500
const MAIOR_INTEIRO_PG = 2147483647

/** Motivo limpo, ou `null` se vazio, curto ou longo demais. */
export function validarMotivo(valor: unknown): string | null {
  if (typeof valor !== 'string') return null
  const texto = valor.trim()
  return texto.length >= MOTIVO_MIN && texto.length <= MOTIVO_MAX ? texto : null
}

/** Id de paciente vindo de URL ou JSON; `null` se não couber num INTEGER positivo. */
export function idPacienteValido(valor: unknown): number | null {
  if (typeof valor !== 'number' && typeof valor !== 'string') return null
  if (typeof valor === 'string' && valor.trim() === '') return null
  if (typeof valor === 'string' && !/^\d+$/.test(valor)) return null
  const n = Number(valor)
  return Number.isInteger(n) && n > 0 && n <= MAIOR_INTEIRO_PG ? n : null
}
