// Quem é a mesma pessoa na lista de implantes. Puro de propósito: a tela tem
// ~880 linhas e nenhum teste, e esta é a regra que decide se um paciente
// aparece uma vez ou duas.

export interface PessoaImplante {
  patient_id: number | null
  patient_name: string
}

/** Nome só para COMPARAR: sem acento, sem caixa, sem espaço sobrando. */
export function chaveNome(nome: string): string {
  return (nome ?? '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Devolve a função que diz a qual pessoa cada implante pertence.
 *
 * O implante antigo costuma ter nascido sem vínculo (`patient_id` nulo) e a
 * renovação nasce vinculada, porque desde 24/08 ela reconsulta o paciente pelo
 * nome. Com uma chave do tipo `patient_id ?? patient_name`, as duas linhas caem
 * em grupos diferentes e a MESMA pessoa vira dois cards — um "Atrasado" com o
 * implante velho e um "Em dia" com o novo. Por isso a chave é o nome.
 *
 * Exceção: quando o cadastro afirma que aquele nome pertence a dois pacientes
 * DIFERENTES, juntar esconderia o implante de um deles. Nesse caso a chave
 * volta a levar o id, e uma linha sem vínculo fica no seu próprio grupo —
 * porque não há como adivinhar de qual dos dois ela é.
 */
export function chavesDePessoa<T extends PessoaImplante>(lista: T[]): (implante: T) => string {
  const idsPorNome = new Map<string, Set<number>>()
  for (const implante of lista) {
    if (implante.patient_id == null) continue
    const nome = chaveNome(implante.patient_name)
    const ids = idsPorNome.get(nome) ?? new Set<number>()
    ids.add(implante.patient_id)
    idsPorNome.set(nome, ids)
  }

  return (implante: T) => {
    const nome = chaveNome(implante.patient_name)
    const ambiguo = (idsPorNome.get(nome)?.size ?? 0) > 1
    return ambiguo ? `${nome}|${implante.patient_id ?? ''}` : nome
  }
}
