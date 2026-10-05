// Telefone do paciente. Puro de propósito: é o dado que vai alimentar o envio
// das mensagens, e a tela e o servidor precisam recusar exatamente a mesma coisa.

/**
 * Só os dígitos. O `55` do Brasil cai quando sobra na frente — e SÓ aí: o DDD
 * 55 existe (Santa Maria/RS), então um número de 10 ou 11 dígitos nunca perde
 * o começo.
 */
export function digitosTelefone(texto: string | null | undefined): string {
  const d = (texto ?? '').replace(/\D/g, '')
  return (d.length === 12 || d.length === 13) && d.startsWith('55') ? d.slice(2) : d
}

export type ResultadoTelefone =
  | { ok: true; digitos: string }
  | { ok: false; motivo: string }

/** Aceita 10 (fixo) ou 11 (celular, com 9 na frente), com DDD de 11 a 99. */
export function validarTelefone(texto: string | null | undefined): ResultadoTelefone {
  const d = digitosTelefone(texto)
  if (!d) return { ok: false, motivo: 'Informe o telefone com DDD.' }
  if (d.length < 10 || d.length > 11) {
    return { ok: false, motivo: 'O telefone precisa ter DDD e 8 ou 9 dígitos.' }
  }
  const ddd = Number(d.slice(0, 2))
  if (ddd < 11 || ddd > 99) return { ok: false, motivo: 'DDD inválido.' }
  if (d.length === 11 && d[2] !== '9') {
    return { ok: false, motivo: 'Celular com 9 dígitos precisa começar com 9.' }
  }
  return { ok: true, digitos: d }
}

/**
 * "62981491277" → "(62) 98149-1277". O que não casa com 10 nem 11 dígitos volta
 * como veio: os telefones antigos foram digitados livremente pelos pacientes no
 * portal e não devem sumir da tela por não caberem na regra.
 */
export function formatarTelefone(valor: string | null | undefined): string {
  const bruto = (valor ?? '').trim()
  const d = digitosTelefone(bruto)
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
  return bruto
}
