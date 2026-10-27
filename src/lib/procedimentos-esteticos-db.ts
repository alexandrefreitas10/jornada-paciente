import sql, { initSchema } from './db'
import { chaveProcedimento } from './estetica-relatorio'

// A lista de procedimentos estéticos que a tela do card oferece.
//
// Existe para acabar com a unificação manual: enquanto o nome era digitado, a
// produção acumulou 15 grafias para 9 procedimentos, e juntar palavras
// diferentes exigia uma declaração no código — ou seja, o dono pedia e alguém
// publicava. Escolhendo de uma lista, grafia nova para procedimento que já
// existe deixa de ser possível pelo caminho normal.

export interface ProcedimentoEstetico {
  id: number
  nome: string
  chave: string
  created_at: string
  created_by: string | null
}

/**
 * Os 7 procedimentos que já existiam quando a lista foi criada, com a grafia
 * exata em que foram digitados — escolha do dono, avisado de que
 * `DEPILAÇÃO A LASER` está em caixa alta e `Criolipolise Dinâmica` sem acento.
 */
const SEMENTE = [
  'Blindagem Capilar',
  'Criolipólise de Placas',
  'Criolipolise Dinâmica',
  'DEPILAÇÃO A LASER',
  'Fortalize',
  'Radiofrequência',
  'T-SCULPTOR',
]

/**
 * Semeia a lista na primeira leitura, e não na migração, de propósito: aqui a
 * chave de cada nome é calculada por `chaveProcedimento`, a mesma função que o
 * relatório usa. Escrita à mão no SQL, ela divergiria no dia em que a regra
 * mudasse — e aí o menu ofereceria duas opções que o relatório trata como uma.
 *
 * `ON CONFLICT DO NOTHING` faz disto idempotente: roda em toda leitura sem
 * duplicar nada e sem desfazer nome que alguém tenha cadastrado depois.
 */
async function garantirSemente(): Promise<void> {
  for (const nome of SEMENTE) {
    await sql`
      INSERT INTO procedimentos_esteticos (nome, chave, created_by)
      VALUES (${nome}, ${chaveProcedimento(nome)}, 'sistema')
      ON CONFLICT (chave) DO NOTHING
    `
  }
}

export async function listarProcedimentos(): Promise<ProcedimentoEstetico[]> {
  await initSchema()
  await garantirSemente()
  return sql<ProcedimentoEstetico[]>`
    SELECT * FROM procedimentos_esteticos ORDER BY nome
  `
}

export interface ResultadoCadastro {
  procedimento: ProcedimentoEstetico
  /** true quando o nome digitado caiu num procedimento que já existia. A tela
   *  avisa, para a pessoa entender por que o nome dela virou outro. */
  jaExistia: boolean
}

/**
 * Acha-ou-cria pelo nome. É aqui que a unificação deixa de ser manual: quem
 * digita `T sculptor` recebe de volta o `T-SCULPTOR` que já existe, porque a
 * chave é a mesma do relatório.
 *
 * O `UNIQUE` da coluna é o que garante isso sob corrida — duas pessoas
 * cadastrando ao mesmo tempo não criam dois.
 */
export async function acharOuCriarProcedimento(
  nome: string,
  createdBy?: string | null,
): Promise<ResultadoCadastro> {
  await initSchema()
  const limpo = (nome ?? '').trim()
  const chave = chaveProcedimento(limpo)
  if (!chave) throw new Error('Informe o nome do procedimento')

  const [existente] = await sql<ProcedimentoEstetico[]>`
    SELECT * FROM procedimentos_esteticos WHERE chave = ${chave}
  `
  if (existente) return { procedimento: existente, jaExistia: true }

  const [criado] = await sql<ProcedimentoEstetico[]>`
    INSERT INTO procedimentos_esteticos (nome, chave, created_by)
    VALUES (${limpo}, ${chave}, ${createdBy ?? null})
    ON CONFLICT (chave) DO UPDATE SET nome = procedimentos_esteticos.nome
    RETURNING *
  `
  // O `DO UPDATE` acima é no-op e serve só para o RETURNING devolver a linha
  // quando outra pessoa cadastrou o mesmo nome no mesmo instante.
  return { procedimento: criado, jaExistia: false }
}
