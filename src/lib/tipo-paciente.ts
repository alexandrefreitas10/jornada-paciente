// De que tipo é a pessoa cadastrada. PURO: sem banco e sem React.
//
// O card nasceu para o paciente da nutrologia em tratamento. Mas a clínica
// também atende quem só faz estética — quem vem da internet, quem só faz
// depilação a laser. Essas pessoas ficavam de fora de tudo: sem relatório de
// estética, sem foto no card, sem portal.
//
// A escolha foi dar card a elas também, com um tipo, em vez de criar um
// segundo cadastro paralelo: a cliente que hoje só faz depilação pode virar
// paciente da nutrologia amanhã (é o funil de quem vem da internet), e com dois
// cadastros isso vira duplicata e junção manual — a mesma dor que o card de
// implante duplicado e as 15 grafias de procedimento já causaram aqui.

export const TIPOS_PACIENTE = ['nutrologia', 'estetica'] as const
export type TipoPaciente = (typeof TIPOS_PACIENTE)[number]

export const TIPO_PADRAO: TipoPaciente = 'nutrologia'

export function ehTipoPaciente(valor: unknown): valor is TipoPaciente {
  return typeof valor === 'string' && (TIPOS_PACIENTE as readonly string[]).includes(valor)
}

/** Tipo vindo do banco, já com o padrão para linha antiga ou valor estranho. */
export function tipoDe(valor: unknown): TipoPaciente {
  return ehTipoPaciente(valor) ? valor : TIPO_PADRAO
}

export const ROTULO_TIPO: Record<TipoPaciente, string> = {
  nutrologia: 'Nutrologia',
  estetica: 'Estética',
}

/**
 * As abas que o card de uma cliente só de estética mostra — decisão do dono:
 * "ela precisa ver só estética e fotos".
 *
 * O resto do card (tarefas, evolução, bioimpedância, dietas, prescrições,
 * termos, medicações) é do tratamento da nutrologia e ficaria vazio para
 * sempre. Aba que nunca terá conteúdo não é neutra: ela faz quem usa procurar
 * o que não existe.
 */
const ABAS_DA_ESTETICA = ['estetica', 'photos'] as const

export function podeVerAba(tipo: TipoPaciente, aba: string): boolean {
  if (tipo === 'nutrologia') return true
  return (ABAS_DA_ESTETICA as readonly string[]).includes(aba)
}

/** A primeira aba que o card deve abrir para cada tipo. */
export function abaInicial(tipo: TipoPaciente, padraoDaNutrologia: string): string {
  return tipo === 'estetica' ? 'estetica' : padraoDaNutrologia
}
