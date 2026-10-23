// A regra da aba Relatórios › Estética. PURA: nada de banco, nada de React —
// é aqui que o agrupamento por procedimento pode ser testado contra os nomes
// que a clínica digita de verdade.

/** Uma linha de `aesthetic_sessions` já com o que a tela precisa. */
export interface SessaoEstetica {
  id: number
  patientId: number
  patientName: string
  /** Como foi digitado no card. */
  procedimento: string
  totalSessoes: number
  feitas: number
  /** `start_date`, como veio do banco. */
  inicio: string | null
  /** `completed_at` da última sessão realizada, ou null. */
  ultimaFeita: string | null
}

export interface GrupoProcedimento {
  chave: string
  /** A grafia mais usada entre as variantes — nunca uma inventada. */
  nome: string
  /** Pacientes DISTINTOS, não sessões: é o número que o dono lê na aba. */
  pacientes: number
  emAberto: SessaoEstetica[]
  finalizados: SessaoEstetica[]
}

/**
 * A chave que decide se dois procedimentos são o mesmo: sem acento, minúsculo,
 * e **sem nada que não seja letra ou número**.
 *
 * NÃO reusa `chaveNome` de `implantes.ts`, que é a regra de "é a mesma
 * pessoa?": ela preserva a pontuação e só colapsa espaço, então `T- SCULPTOR` e
 * `T-SCULPTOR` cairiam em grupos diferentes — e os dois existem no banco hoje,
 * digitados pela mesma pessoa para o mesmo aparelho. Nome de pessoa e nome de
 * procedimento são problemas diferentes: num nome, a pontuação quase não varia
 * e pode até distinguir sobrenomes; num procedimento digitado entre
 * atendimentos, ela é ruído.
 *
 * O que a regra NÃO faz, de propósito: juntar palavras diferentes.
 * `Criolipólise de Placas` e `Criolipolise Dinâmica` continuam separadas — o
 * dono confirmou que são técnicas diferentes, e adivinhar semelhança é o erro
 * que já duplicou card neste sistema.
 */
export function chaveProcedimento(nome: string): string {
  return (nome ?? '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
}

/** Fez todas as sessões contratadas? Sem meta (zero ou ausente) nunca
 *  finaliza: não se conclui o que não tem quantidade combinada. */
export function ehFinalizado(s: { feitas: number; totalSessoes: number }): boolean {
  if (!s.totalSessoes || s.totalSessoes <= 0) return false
  return s.feitas >= s.totalSessoes
}

const porNome = (a: SessaoEstetica, b: SessaoEstetica) =>
  a.patientName.localeCompare(b.patientName, 'pt-BR')

/** A grafia que mais aparece. Empate resolve pela ordem alfabética, para o
 *  nome da aba não mudar sozinho quando entra um registro novo. */
function grafiaMaisUsada(grafias: string[]): string {
  const contagem = new Map<string, number>()
  for (const g of grafias) contagem.set(g, (contagem.get(g) ?? 0) + 1)
  return [...contagem.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'pt-BR'))[0][0]
}

/**
 * Agrupa as sessões por procedimento e separa quem está em aberto de quem
 * finalizou. A ordem é alfabética nos dois níveis, e por um motivo: ordenar por
 * volume faria as sub-abas trocarem de lugar conforme o movimento da clínica, e
 * quem usa a tela toda semana decora a posição.
 */
export function agruparPorProcedimento(sessoes: SessaoEstetica[]): GrupoProcedimento[] {
  const grupos = new Map<string, { grafias: string[]; sessoes: SessaoEstetica[] }>()

  for (const s of sessoes) {
    const chave = chaveProcedimento(s.procedimento)
    // Procedimento sem nome legível não vira aba: uma aba sem título seria
    // impossível de escolher e juntaria registros sem relação entre si.
    if (!chave) continue
    const g = grupos.get(chave) ?? { grafias: [], sessoes: [] }
    g.grafias.push((s.procedimento ?? '').trim())
    g.sessoes.push(s)
    grupos.set(chave, g)
  }

  return [...grupos.entries()]
    .map(([chave, { grafias, sessoes: doGrupo }]) => ({
      chave,
      nome: grafiaMaisUsada(grafias),
      pacientes: new Set(doGrupo.map(s => s.patientId)).size,
      emAberto: doGrupo.filter(s => !ehFinalizado(s)).sort(porNome),
      finalizados: doGrupo.filter(s => ehFinalizado(s)).sort(porNome),
    }))
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
}
