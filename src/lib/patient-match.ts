// Casar um nome digitado à mão com o paciente cadastrado.
//
// A tela de implantes deixa escrever o nome livre de propósito: nem todo mundo
// que coloca implante é paciente cadastrado (hoje são 12 dessas). O problema é
// quando a pessoa VIRA paciente depois, ou já era e o nome foi digitado — o
// vínculo nunca se refaz sozinho e as saídas de estoque somem do card dela.
//
// Puro de propósito: sem banco, para poder ser testado.

export function normalizarNomePessoa(nome: string): string {
  return nome
    .normalize('NFD')
    .replace(/\p{M}/gu, '')   // "José" e "Jose" são a mesma pessoa
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

export interface PacienteCandidato {
  id: number
  name: string
}

/**
 * Devolve o id do paciente quando existe exatamente UM com esse nome.
 *
 * Zero candidatos é o caso legítimo — implante de quem não é paciente.
 * Dois ou mais é ambiguidade, e chutar aqui vincularia a ficha clínica de
 * outra pessoa; sem vínculo é melhor do que vínculo errado.
 */
export function acharPacientePorNome(
  nome: string | null | undefined,
  candidatos: PacienteCandidato[],
): number | null {
  const alvo = normalizarNomePessoa(nome ?? '')
  if (!alvo) return null
  const achados = candidatos.filter(p => normalizarNomePessoa(p.name) === alvo)
  return achados.length === 1 ? achados[0].id : null
}
