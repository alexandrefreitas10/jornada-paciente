import { chaveNome } from './implantes'

// As duas regras da aba Fotos que não dependem de banco nem de navegador.

/**
 * Erro que nasce de uma REGRA NOSSA e cuja mensagem pode ir para a tela.
 *
 * Existe para a rota saber o que pode mostrar: `err.message` de qualquer erro
 * viraria 400 com a mensagem crua da biblioteca, que vaza nome de tabela, de
 * constraint e host/porta num `ECONNREFUSED` — e chamaria falha de
 * infraestrutura de "culpa do cliente", escondendo incidente atrás de um 400.
 * Erro que não é desta classe é 500 genérico, com o detalhe só no log.
 */
export class ErroDeRegra extends Error {}

/**
 * A chave que diz se duas pastas são a mesma pessoa. Normaliza acento, caixa e
 * espaço repetido — nome 100% idêntico cai na mesma pasta, que é a regra que o
 * dono pediu desde o dia em que um card de paciente duplicou numa renovação.
 *
 * Reusa `chaveNome` de `implantes.ts` de propósito: é a mesma pergunta ("é a
 * mesma pessoa?") e duas normalizações separadas divergiriam no dia em que uma
 * delas mudasse.
 *
 * Nome parecido mas não idêntico é pasta diferente, também de propósito:
 * adivinhar semelhança é como o card duplicou.
 */
export function chaveDaPasta(nome: string): string {
  const chave = chaveNome(nome ?? '')
  if (!chave) throw new ErroDeRegra('Nome da pessoa é obrigatório')
  return chave
}

export type Origem =
  | { patientId: number; pessoaId: null }
  | { patientId: null; pessoaId: number }

// Maior valor do INTEGER do Postgres (int4). Um id acima disso passaria aqui e
// só estouraria no INSERT, depois de o PNG já ter subido para o S3.
const MAX_ID = 2147483647

/**
 * O núcleo da validação de id, usado tanto pelos campos do formulário
 * (`idOuNulo`) quanto pelos ids que vêm do CAMINHO da rota (`idDeCaminho`).
 * Um lugar só: duas validações separadas divergiriam no dia em que uma mudasse.
 *
 * A validação é por regex e não por `Number()` de propósito: `Number('0x10')`
 * dá 16, `Number('1e3')` dá 1000, `Number(true)` dá 1 e `Number([5])` dá 5 —
 * formas que nunca deveriam virar id. Não "simplifique" isso de volta.
 * O teto é o do INTEGER do Postgres (MAX_ID): um id acima disso passaria por um
 * `Number.isInteger` e só estouraria dentro do Postgres, virando 500.
 */
function lerId(valor: unknown): number | 'ausente' | 'invalido' {
  if (valor == null) return 'ausente'

  let n: number
  if (typeof valor === 'string') {
    const texto = valor.trim()
    if (texto === '') return 'ausente'
    if (!/^\d+$/.test(texto)) return 'invalido'
    n = Number(texto)
  } else if (typeof valor === 'number') {
    n = valor
  } else {
    return 'invalido'
  }

  if (!Number.isInteger(n) || n <= 0 || n > MAX_ID) return 'invalido'
  return n
}

/**
 * Converte o id que chegou de um campo do formulário em número, ou em null
 * quando está ausente.
 *
 * '', só-espaço, null e undefined valem como "ausente": é o que um campo de
 * FormData deixado em branco entrega, e não pode ser tratado como erro.
 */
function idOuNulo(valor: unknown, erro: string): number | null {
  const lido = lerId(valor)
  if (lido === 'ausente') return null
  if (lido === 'invalido') throw new ErroDeRegra(erro)
  return lido
}

/**
 * O id que veio do CAMINHO da rota (`[id]`, `[fid]`), ou null se for
 * malformado. Ausente conta como malformado: segmento de caminho sempre chega.
 *
 * Devolve null em vez de lançar porque a rota responde 404 com a MESMA mensagem
 * do caminho de inexistência — para quem sonda a API, id malformado e id
 * inexistente têm de ser indistinguíveis. Sem o teto do int4 essa promessa era
 * falsa justamente no id gigante, que virava 500.
 */
export function idDeCaminho(valor: unknown): number | null {
  const lido = lerId(valor)
  return typeof lido === 'number' ? lido : null
}

/**
 * Uma montagem é de um paciente do sistema OU de uma pasta sem card, nunca dos
 * dois e nunca de nenhum. O banco também tem esse CHECK; a função existe para a
 * rota recusar com uma mensagem em português antes de subir arquivo para o S3.
 */
export function origemDaMontagem(entrada: { patientId?: unknown; pessoaId?: unknown }): Origem {
  const paciente = idOuNulo(entrada.patientId, 'Paciente inválido')
  const pessoa = idOuNulo(entrada.pessoaId, 'Pessoa inválida')
  if ((paciente == null) === (pessoa == null)) {
    throw new ErroDeRegra('Escolha um paciente ou informe o nome de uma pessoa sem card')
  }
  return paciente != null
    ? { patientId: paciente, pessoaId: null }
    : { patientId: null, pessoaId: pessoa as number }
}
