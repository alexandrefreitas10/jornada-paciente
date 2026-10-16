import type postgres from 'postgres'
import sql, { initSchema } from '@/lib/db'
import { mesValido } from '@/lib/conciliacao/periodo'
import { chaveEstabelecimento, type CompraEnquadrada, type OrigemCategoria } from '@/lib/fatura/enquadrar'
import { comprasParaComparativo } from '@/lib/fatura/substituir'
import type { CompraDaTela } from '@/lib/fatura/tela'
import type { FaturaLida } from '@/lib/fatura/tipos'

// Gravação e leitura da fatura do cartão. Só servidor.
//
// Três decisões que valem explicar:
//
// 1. **A fatura não pertence ao mês de conciliação.** Não há FK para
//    `conciliacao_meses`: reenviar o mês (o BPO corrigiu algo) não pode apagar
//    a fatura que o dono já subiu e já corrigiu à mão. A ligação é a coluna
//    `mes`, e os dois lados vão e voltam sem levar o outro.
// 2. **A memória é por estabelecimento e sobrevive à fatura.** A correção do
//    dono vale para o mês seguinte — é isso que impede que ele recategorize as
//    mesmas ~70 compras todo mês. Por isso a tabela não tem FK para
//    `fatura_compra`: remover a fatura de setembro não pode levar embora o que
//    ele ensinou ao sistema.
// 3. **As datas são lidas como texto** (`to_char`), como em `conciliacao-db.ts`:
//    coluna DATE volta como `Date` à meia-noite, e o fuso de quem roda mudaria
//    o dia.

/** Uma compra gravada: a compra enquadrada mais o `id` que o PATCH usa. */
export type CompraGravada = CompraDaTela

export interface FaturaGravada {
  /** AAAA-MM do mês em que a fatura foi paga. */
  mes: string
  /** AAAA-MM impresso na fatura. */
  referencia: string
  totalFatura: number
  despesasDeclaradas: number
  residuo: number
  s3Key: string | null
  criadoEm: string
  criadoPor: string | null
  compras: CompraGravada[]
}

/** O que o envio manda gravar: a fatura lida, as compras já enquadradas e a
 *  cópia no S3 (que pode ter falhado — ver a rota). */
export interface DadosFatura {
  /** AAAA-MM do mês do pagamento. */
  mes: string
  lida: FaturaLida
  compras: CompraEnquadrada[]
  s3Key: string | null
  createdBy: string | null
}

/** Quantas compras vão num único INSERT. A fatura real tem ~70; o lote existe
 *  só para um arquivo absurdo não estourar o limite de parâmetros. */
const LOTE = 500

function primeiroDia(mes: string): string {
  if (!mesValido(mes)) throw new Error(`Mês inválido: "${mes}". Esperado AAAA-MM.`)
  return `${mes}-01`
}

/** BIGINT volta como string no postgres.js — centavo é número aqui dentro. */
const centavos = (bruto: string): number => Number(bruto)

function lotes<T>(itens: T[], tamanho: number): T[][] {
  const saida: T[][] = []
  for (let i = 0; i < itens.length; i += tamanho) saida.push(itens.slice(i, i + tamanho))
  return saida
}

/**
 * Grava a fatura do mês numa transação, substituindo a que havia.
 *
 * Subir a MESMA fatura duas vezes não duplica compra nenhuma: o `DELETE` do mês
 * vem primeiro e o `ON DELETE CASCADE` leva as compras da versão velha. Dois
 * envios simultâneos do mesmo mês: um dos dois estoura na unicidade de `mes` e
 * devolve erro, que é melhor do que duas faturas misturadas.
 *
 * Não devolve nada de propósito — quem chama relê com `lerFaturaDoMes`, e assim
 * os `id` das compras que vão para a tela são os que estão no banco, não uma
 * ordem presumida do `RETURNING`.
 */
export async function salvarFatura(dados: DadosFatura): Promise<void> {
  await initSchema()
  const dia = primeiroDia(dados.mes)
  const referencia = primeiroDia(dados.lida.referencia)

  await sql.begin(async (tx) => {
    await tx`DELETE FROM fatura_cartao WHERE mes = ${dia}::date`

    const [cabecalho] = await tx<{ id: number }[]>`
      INSERT INTO fatura_cartao (
        mes, referencia, total_centavos, despesas_centavos, residuo_centavos, s3_key, created_by
      )
      VALUES (
        ${dia}::date, ${referencia}::date, ${dados.lida.totalFatura},
        ${dados.lida.despesasDeclaradas}, ${dados.lida.residuo}, ${dados.s3Key}, ${dados.createdBy}
      )
      RETURNING id
    `

    for (const lote of lotes(dados.compras, LOTE)) {
      const linhas = lote.map(c => ({
        fatura_id: cabecalho.id,
        data: c.data,
        estabelecimento: c.estabelecimento,
        // A chave é gravada junto porque é por ela que a memória encontra o
        // estabelecimento no mês seguinte. Recalculá-la na leitura funcionaria
        // hoje, mas no dia em que a normalização mudasse as correções já feitas
        // mudariam de dono em silêncio.
        estabelecimento_chave: chaveEstabelecimento(c.estabelecimento),
        parcela: c.parcela,
        valor_centavos: Math.abs(c.centavos),
        internacional: c.internacional,
        categoria: c.categoria,
        origem_categoria: c.origem,
      }))
      await tx`INSERT INTO fatura_compra ${tx(
        linhas,
        'fatura_id',
        'data',
        'estabelecimento',
        'estabelecimento_chave',
        'parcela',
        'valor_centavos',
        'internacional',
        'categoria',
        'origem_categoria'
      )}`
    }
  })
}

interface LinhaCompra {
  id: number
  data: string
  estabelecimento: string
  parcela: string | null
  valor_centavos: string
  internacional: boolean
  categoria: string
  origem_categoria: OrigemCategoria
}

/** A fatura gravada de um mês, com as compras. `null` quando não há fatura —
 *  que é o estado normal de um mês em que o dono ainda não a subiu. */
export async function lerFaturaDoMes(mes: string): Promise<FaturaGravada | null> {
  await initSchema()
  const dia = primeiroDia(mes)

  const [cabecalho] = await sql<{
    id: number
    mes: string
    referencia: string
    total_centavos: string
    despesas_centavos: string
    residuo_centavos: string
    s3_key: string | null
    created_at: Date
    created_by: string | null
  }[]>`
    SELECT id, to_char(mes, 'YYYY-MM') AS mes, to_char(referencia, 'YYYY-MM') AS referencia,
           total_centavos, despesas_centavos, residuo_centavos, s3_key, created_at, created_by
    FROM fatura_cartao WHERE mes = ${dia}::date
  `
  if (!cabecalho) return null

  const compras = await sql<LinhaCompra[]>`
    SELECT id, to_char(data, 'YYYY-MM-DD') AS data, estabelecimento, parcela,
           valor_centavos, internacional, categoria, origem_categoria
    FROM fatura_compra WHERE fatura_id = ${cabecalho.id} ORDER BY data, id
  `

  return {
    mes: cabecalho.mes,
    referencia: cabecalho.referencia,
    totalFatura: centavos(cabecalho.total_centavos),
    despesasDeclaradas: centavos(cabecalho.despesas_centavos),
    residuo: centavos(cabecalho.residuo_centavos),
    s3Key: cabecalho.s3_key,
    criadoEm: new Date(cabecalho.created_at).toISOString(),
    criadoPor: cabecalho.created_by,
    compras: compras.map(c => ({
      id: c.id,
      data: c.data,
      estabelecimento: c.estabelecimento,
      parcela: c.parcela,
      centavos: centavos(c.valor_centavos),
      internacional: c.internacional,
      categoria: c.categoria,
      origem: c.origem_categoria,
    })),
  }
}

/**
 * As compras de um mês que podem entrar no comparativo — já pela porta de
 * `comprasParaComparativo`, que recusa fatura cujo resíduo não é zero.
 *
 * É esta função, e não `lerFaturaDoMes`, que as rotas usam para alimentar o
 * comparativo: passar as compras cruas abriria o mês com uma leitura
 * incompleta, e uma categoria MENOR do que a verdade é pior que a linha opaca
 * de R$ 25 mil, porque parece informação.
 */
export async function comprasDoComparativo(mes: string): Promise<CompraEnquadrada[]> {
  const fatura = await lerFaturaDoMes(mes)
  return comprasParaComparativo(fatura, fatura?.compras ?? [])
}

/** Remove a fatura do mês (o CASCADE leva as compras). Devolve a chave do S3
 *  do que foi removido — para a auditoria dizer o que saiu — ou `null` quando
 *  não havia fatura nenhuma naquele mês. A memória NÃO é tocada: ela é o que o
 *  dono ensinou, não um pedaço desta fatura. */
export async function apagarFatura(mes: string): Promise<{ s3Key: string | null } | null> {
  await initSchema()
  const dia = primeiroDia(mes)
  const [apagada] = await sql<{ s3_key: string | null }[]>`
    DELETE FROM fatura_cartao WHERE mes = ${dia}::date RETURNING s3_key
  `
  return apagada ? { s3Key: apagada.s3_key } : null
}

/** Tudo que o dono já corrigiu, por chave de estabelecimento. É pequeno (uma
 *  linha por lugar onde a clínica já comprou) e é lido inteiro: filtrar pela
 *  fatura do mês só adiaria a mesma leitura. */
export async function lerMemoria(): Promise<Map<string, string>> {
  await initSchema()
  const linhas = await sql<{ estabelecimento_chave: string; categoria: string }[]>`
    SELECT estabelecimento_chave, categoria FROM fatura_categoria_memoria
  `
  return new Map(linhas.map(l => [l.estabelecimento_chave, l.categoria]))
}

/** O executor: `sql` ou o `tx` de uma transação. A memória é gravada junto da
 *  troca de categoria, e as duas têm de cair ou passar juntas. */
type Executor = postgres.ISql

/**
 * Grava (ou troca) a categoria de um estabelecimento. É a linha que faz a aba
 * melhorar com o uso: medido nas duas faturas reais, uma memória construída só
 * com setembro já cobre 41 das 67 compras de outubro.
 *
 * Chave vazia é recusada em silêncio: compra sem nome legível não tem
 * identidade, e gravá-la na chave '' espalharia uma correção para todas as
 * outras linhas sem nome, que não têm relação entre si.
 */
export async function gravarMemoria(
  chave: string,
  categoria: string,
  quem: string | null,
  executor: Executor = sql
): Promise<void> {
  if (!chave.trim()) return
  await executor`
    INSERT INTO fatura_categoria_memoria (estabelecimento_chave, categoria, definido_por, definido_em)
    VALUES (${chave}, ${categoria}, ${quem}, NOW())
    ON CONFLICT (estabelecimento_chave)
    DO UPDATE SET categoria = EXCLUDED.categoria,
                  definido_por = EXCLUDED.definido_por,
                  definido_em = NOW()
  `
}

/**
 * Troca a categoria de uma compra — e das outras compras do MESMO
 * ESTABELECIMENTO na mesma fatura — e grava a memória, tudo numa transação.
 *
 * As três coisas juntas não são capricho:
 *
 * - **Sem a memória**, o dono recategoriza o mesmo estabelecimento todo mês e
 *   abandona a aba na terceira vez.
 * - **Sem as outras compras do mesmo estabelecimento**, a fatura passaria a
 *   discordar da própria memória: o descritor do cartão repete o mesmo
 *   anunciante 19 vezes nas faturas reais ("ANUNCIO*K1QWE8ZP2M",
 *   "ANUNCIO*R4TYU7HN5B", ...), e reenviar o MESMO PDF daria a TODAS elas a
 *   categoria corrigida. Fazer isso agora só antecipa o que a memória já
 *   decidiu — e poupa 18 cliques.
 * - **Meia troca** (só a compra, ou só a memória) é pior que nenhuma.
 *
 * Compra sem nome legível (chave vazia) muda só ela: compras sem nome não têm
 * relação entre si, e agrupá-las pela chave vazia espalharia a correção por
 * todas.
 *
 * O `mes` entra na condição, e não só o `compraId`: assim um id de compra de
 * outro mês não é editado pelo caminho do mês atual (é a mesma defesa dos
 * sub-recursos do portal). `null` quando a compra não é daquele mês — a rota
 * responde 404.
 */
export async function trocarCategoria(entrada: {
  mes: string
  compraId: number
  categoria: string
  definidoPor: string | null
}): Promise<{ estabelecimento: string; chave: string; alteradas: number } | null> {
  await initSchema()
  const dia = primeiroDia(entrada.mes)

  return sql.begin(async (tx) => {
    const [compra] = await tx<{
      fatura_id: number
      estabelecimento: string
      estabelecimento_chave: string
    }[]>`
      SELECT c.fatura_id, c.estabelecimento, c.estabelecimento_chave
      FROM fatura_compra c
      JOIN fatura_cartao f ON f.id = c.fatura_id
      WHERE c.id = ${entrada.compraId} AND f.mes = ${dia}::date
    `
    if (!compra) return null

    const chave = compra.estabelecimento_chave
    const alteradas = await tx<{ id: number }[]>`
      UPDATE fatura_compra SET categoria = ${entrada.categoria}, origem_categoria = 'manual'
      WHERE fatura_id = ${compra.fatura_id}
        AND ${chave ? tx`estabelecimento_chave = ${chave}` : tx`id = ${entrada.compraId}`}
      RETURNING id
    `

    await gravarMemoria(chave, entrada.categoria, entrada.definidoPor, tx)
    return { estabelecimento: compra.estabelecimento, chave, alteradas: alteradas.length }
  })
}
