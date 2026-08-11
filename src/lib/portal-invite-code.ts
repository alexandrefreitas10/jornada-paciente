import { randomInt } from 'crypto'

// Alfabeto SEM caracteres que se confundem falando ou lendo: nada de O/0, I/1/L,
// S/5, U/V. O código é ditado por telefone e digitado de um print do WhatsApp —
// cada ambiguidade aqui vira um paciente que não consegue entrar.
export const ALFABETO = 'ABCDEFGHJKMNPQRTWXYZ2346789'
export const TAMANHO = 6
export const VALIDADE_DIAS = 30

export function sortearCodigo(): string {
  let s = ''
  // randomInt (CSPRNG) e não Math.random: o código é credencial de entrada.
  for (let i = 0; i < TAMANHO; i++) s += ALFABETO[randomInt(ALFABETO.length)]
  return s
}

// Aceita o que o paciente realmente digita: minúscula, espaço, hífen e ponto
// colados pelo teclado do celular. Sem isso, "k7p2-m9 " seria recusado sem explicação.
export function normalizarCodigo(bruto: string): string | null {
  const s = (bruto ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '')
  if (s.length !== TAMANHO) return null
  if (![...s].every(c => ALFABETO.includes(c))) return null
  return s
}

export type EstadoCodigo = 'valido' | 'invalido' | 'usado' | 'expirado'

export interface LinhaCodigo {
  invite_used_at: string | Date | null
  invite_expires_at: string | Date | null
}

// Estados distintos de propósito: "já usado" manda o paciente pro login em vez
// de dizer "inválido" — é a confusão nº 1 do fluxo por link.
export function classificarCodigo(linha: LinhaCodigo | null, agora: Date = new Date()): EstadoCodigo {
  if (!linha) return 'invalido'
  if (linha.invite_used_at) return 'usado'
  // Sem validade não vira código eterno: linha antiga (convite por link) não tem
  // esta coluna preenchida e não pode passar por código válido.
  if (!linha.invite_expires_at) return 'invalido'
  const expira = new Date(linha.invite_expires_at)
  if (expira.getTime() <= agora.getTime()) return 'expirado'
  return 'valido'
}
