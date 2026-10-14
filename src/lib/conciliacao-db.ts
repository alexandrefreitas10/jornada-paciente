import sql, { initSchema } from '@/lib/db'
import { mesValido } from './conciliacao/periodo'
import type { LancamentoExtratoBanco } from './conciliacao/resultado'
import type { Banco, ConferenciaSaldo, LancamentoSistema } from './conciliacao/tipos'

// Gravação e leitura de um mês de conciliação. Só servidor.
//
// Duas decisões que valem explicar:
//
// 1. **Reenviar um mês substitui o anterior.** O dono acha uma diferença,
//    cobra o BPO, eles corrigem, ele reexporta e envia de novo. O `DELETE` do
//    mês derruba as linhas dos dois lados pelo `ON DELETE CASCADE`, e tudo
//    acontece numa transação — nunca existe meia conciliação, nem linha órfã
//    da versão velha misturada com a nova.
// 2. **As datas são lidas como texto** (`to_char`), não como `Date`. Coluna
//    DATE volta como `Date` à meia-noite, e converter isso de volta para
//    AAAA-MM-DD depende do fuso de quem está rodando: num servidor a leste de
//    Greenwich o dia 01 viraria 31 do mês anterior, e aí nada casaria com o
//    extrato. Texto não tem fuso.

/** Chaves dos quatro arquivos no S3. `null` quando o upload falhou (o envio
 *  não é perdido por causa do arquivo de histórico). */
export interface ChavesS3 {
  recebidas: string | null
  pagas: string | null
  unicred: string | null
  itau: string | null
}

/**
 * O que os leitores descartaram sem entender, guardado junto com o mês. São só
 * estes quatro números porque são os que acendem o aviso da tela: diferença
 * causada por falha de leitura não é erro do BPO, e reabrir o mês sem o aviso
 * faria o dono cobrar o BPO por um tropeço do leitor. As outras contagens da
 * leitura (quantas linhas entraram, período do extrato, o que ficou fora do
 * mês) não são guardadas — elas informam no momento do envio e não mudam
 * nenhuma conclusão depois.
 */
export interface Descartes {
  naoEntendidasUnicred: number
  naoEntendidasItau: number
  semValorRecebidas: number
  semValorPagas: number
}

/**
 * A prova de leitura de cada extrato, guardada junto com o mês pelo mesmo
 * motivo que `Descartes`: reabrir o mês sem o aviso de que a leitura não fecha
 * faria o dono cobrar do BPO um tropeço nosso.
 *
 * `null` por banco é "este extrato não imprime os dois saldos" — e continua
 * `null` na leitura de volta, nunca um zero que afirmaria que fecha.
 */
export type Conferencias = Record<Banco, ConferenciaSaldo | null>

export interface DadosMes {
  /** AAAA-MM. */
  mes: string
  sistema: LancamentoSistema[]
  extrato: LancamentoExtratoBanco[]
  s3: ChavesS3
  descartes: Descartes
  conferencias: Conferencias
  createdBy: string | null
}

export interface MesEnviado {
  /** AAAA-MM. */
  mes: string
  criadoEm: string
  criadoPor: string | null
}

export interface MesGravado extends MesEnviado {
  s3: ChavesS3
  /** `null` num mês gravado antes das colunas de descarte existirem: ninguém
   *  sabe o que o leitor descartou naquele envio, e inventar zero diria que
   *  estava tudo limpo. */
  descartes: Descartes | null
  /** Por banco: a prova de leitura gravada, ou `null` quando não há (mês
   *  gravado antes das colunas, ou extrato que não imprime os dois saldos). */
  conferencias: Conferencias
  sistema: LancamentoSistema[]
  extrato: LancamentoExtratoBanco[]
}

/** Quantas linhas vão num único INSERT. 320 linhas/mês é o volume real; o lote
 *  existe só para um ano importado de uma vez não estourar o limite de
 *  parâmetros de uma instrução. */
const LOTE = 500

function primeiroDia(mes: string): string {
  if (!mesValido(mes)) throw new Error(`Mês inválido: "${mes}". Esperado AAAA-MM.`)
  return `${mes}-01`
}

function lotes<T>(itens: T[], tamanho: number): T[][] {
  const saida: T[][] = []
  for (let i = 0; i < itens.length; i += tamanho) saida.push(itens.slice(i, i + tamanho))
  return saida
}

/**
 * Grava um mês inteiro numa transação, substituindo o que havia. As chaves do
 * S3 antigas não são apagadas do bucket: o arquivo enviado antes fica como
 * histórico (a chave velha vai para a auditoria de quem chama).
 */
export async function salvarMes(dados: DadosMes): Promise<void> {
  await initSchema()
  const dia = primeiroDia(dados.mes)

  await sql.begin(async (tx) => {
    // Dois envios do MESMO mês ao mesmo tempo: um dos dois estoura na trava de
    // unicidade de `mes` e devolve erro. É o comportamento desejado — melhor um
    // envio recusado do que duas versões misturadas.
    await tx`DELETE FROM conciliacao_meses WHERE mes = ${dia}::date`

    // Extrato sem os dois saldos impressos grava NULL nas três colunas dele —
    // nunca zero, que na volta seria lido como "fecha".
    const u = dados.conferencias.unicred
    const i = dados.conferencias.itau
    const [mesRow] = await tx<{ id: number }[]>`
      INSERT INTO conciliacao_meses (
        mes, recebidas_s3_key, pagas_s3_key, unicred_s3_key, itau_s3_key,
        nao_entendidas_unicred, nao_entendidas_itau, sem_valor_recebidas, sem_valor_pagas,
        saldo_abertura_unicred, saldo_soma_unicred, saldo_fechamento_unicred,
        saldo_abertura_itau, saldo_soma_itau, saldo_fechamento_itau,
        created_by
      )
      VALUES (
        ${dia}::date, ${dados.s3.recebidas}, ${dados.s3.pagas},
        ${dados.s3.unicred}, ${dados.s3.itau},
        ${dados.descartes.naoEntendidasUnicred}, ${dados.descartes.naoEntendidasItau},
        ${dados.descartes.semValorRecebidas}, ${dados.descartes.semValorPagas},
        ${u ? u.abertura : null}, ${u ? u.soma : null}, ${u ? u.fechamento : null},
        ${i ? i.abertura : null}, ${i ? i.soma : null}, ${i ? i.fechamento : null},
        ${dados.createdBy}
      )
      RETURNING id
    `
    const mesId = mesRow.id

    for (const lote of lotes(dados.sistema, LOTE)) {
      const linhas = lote.map(l => ({
        mes_id: mesId,
        data: l.data,
        competencia: l.competencia,
        valor_centavos: l.centavos,
        banco: l.banco,
        nome: l.nome,
        descricao: l.descricao,
        categoria: l.categoria,
      }))
      await tx`INSERT INTO conciliacao_sistema ${tx(linhas, 'mes_id', 'data', 'competencia', 'valor_centavos', 'banco', 'nome', 'descricao', 'categoria')}`
    }

    for (const lote of lotes(dados.extrato, LOTE)) {
      const linhas = lote.map(l => ({
        mes_id: mesId,
        banco: l.banco,
        data: l.data,
        valor_centavos: l.centavos,
        descricao: l.descricao,
      }))
      await tx`INSERT INTO conciliacao_extrato ${tx(linhas, 'mes_id', 'banco', 'data', 'valor_centavos', 'descricao')}`
    }
  })
}

interface LinhaSistema {
  data: string
  competencia: string | null
  valor_centavos: string
  banco: Banco
  nome: string
  descricao: string | null
  categoria: string
}

interface LinhaExtrato {
  banco: Banco
  data: string
  valor_centavos: string
  descricao: string
}

/** BIGINT volta como string no postgres.js — centavo é número aqui dentro. */
const centavos = (bruto: string): number => Number(bruto)

/** Os lançamentos de sistema de um mês. É o que o comparativo precisa do mês
 *  anterior, sem carregar o extrato à toa. */
export async function lerSistemaDoMes(mes: string): Promise<LancamentoSistema[] | null> {
  await initSchema()
  const dia = primeiroDia(mes)
  const [existe] = await sql<{ id: number }[]>`SELECT id FROM conciliacao_meses WHERE mes = ${dia}::date`
  if (!existe) return null
  const linhas = await sql<LinhaSistema[]>`
    SELECT to_char(data, 'YYYY-MM-DD') AS data,
           to_char(competencia, 'YYYY-MM-DD') AS competencia,
           valor_centavos, banco, nome, descricao, categoria
    FROM conciliacao_sistema WHERE mes_id = ${existe.id} ORDER BY data, id
  `
  return linhas.map(l => ({
    data: l.data,
    competencia: l.competencia,
    centavos: centavos(l.valor_centavos),
    banco: l.banco,
    nome: l.nome,
    descricao: l.descricao,
    categoria: l.categoria,
  }))
}

/** Um mês gravado, com as linhas dos dois lados. `null` se o mês não foi enviado. */
export async function lerMes(mes: string): Promise<MesGravado | null> {
  await initSchema()
  const dia = primeiroDia(mes)

  const [cabecalho] = await sql<{
    id: number
    mes: string
    created_at: Date
    created_by: string | null
    recebidas_s3_key: string | null
    pagas_s3_key: string | null
    unicred_s3_key: string | null
    itau_s3_key: string | null
    nao_entendidas_unicred: number | null
    nao_entendidas_itau: number | null
    sem_valor_recebidas: number | null
    sem_valor_pagas: number | null
    // BIGINT volta como string no postgres.js; NULL volta NULL.
    saldo_abertura_unicred: string | null
    saldo_soma_unicred: string | null
    saldo_fechamento_unicred: string | null
    saldo_abertura_itau: string | null
    saldo_soma_itau: string | null
    saldo_fechamento_itau: string | null
  }[]>`
    SELECT id, to_char(mes, 'YYYY-MM') AS mes, created_at, created_by,
           recebidas_s3_key, pagas_s3_key, unicred_s3_key, itau_s3_key,
           nao_entendidas_unicred, nao_entendidas_itau, sem_valor_recebidas, sem_valor_pagas,
           saldo_abertura_unicred, saldo_soma_unicred, saldo_fechamento_unicred,
           saldo_abertura_itau, saldo_soma_itau, saldo_fechamento_itau
    FROM conciliacao_meses WHERE mes = ${dia}::date
  `
  if (!cabecalho) return null

  const [sistema, extrato] = await Promise.all([
    sql<LinhaSistema[]>`
      SELECT to_char(data, 'YYYY-MM-DD') AS data,
             to_char(competencia, 'YYYY-MM-DD') AS competencia,
             valor_centavos, banco, nome, descricao, categoria
      FROM conciliacao_sistema WHERE mes_id = ${cabecalho.id} ORDER BY data, id
    `,
    sql<LinhaExtrato[]>`
      SELECT banco, to_char(data, 'YYYY-MM-DD') AS data, valor_centavos, descricao
      FROM conciliacao_extrato WHERE mes_id = ${cabecalho.id} ORDER BY data, id
    `,
  ])

  // Tudo ou nada: se alguma das quatro contagens é NULL (mês gravado antes das
  // colunas), o conjunto não vale — meio descarte conhecido viraria um aviso
  // pela metade, que é pior do que não avisar.
  const d = [
    cabecalho.nao_entendidas_unicred,
    cabecalho.nao_entendidas_itau,
    cabecalho.sem_valor_recebidas,
    cabecalho.sem_valor_pagas,
  ]
  const descartes: Descartes | null = d.every(n => n !== null)
    ? {
        naoEntendidasUnicred: Number(d[0]),
        naoEntendidasItau: Number(d[1]),
        semValorRecebidas: Number(d[2]),
        semValorPagas: Number(d[3]),
      }
    : null

  // Também tudo ou nada, mas POR BANCO: um extrato pode imprimir os dois saldos
  // e o outro não. Faltando qualquer uma das três parcelas, a prova daquele
  // banco é `null` — com duas parcelas não se calcula resíduo, e um resíduo
  // chutado seria pior que nenhum.
  const prova = (
    abertura: string | null,
    soma: string | null,
    fechamento: string | null
  ): ConferenciaSaldo | null => {
    if (abertura === null || soma === null || fechamento === null) return null
    const a = centavos(abertura)
    const s = centavos(soma)
    const f = centavos(fechamento)
    return { abertura: a, soma: s, fechamento: f, residuo: a + s - f }
  }

  return {
    mes: cabecalho.mes,
    criadoEm: new Date(cabecalho.created_at).toISOString(),
    criadoPor: cabecalho.created_by,
    descartes,
    conferencias: {
      unicred: prova(
        cabecalho.saldo_abertura_unicred,
        cabecalho.saldo_soma_unicred,
        cabecalho.saldo_fechamento_unicred
      ),
      itau: prova(cabecalho.saldo_abertura_itau, cabecalho.saldo_soma_itau, cabecalho.saldo_fechamento_itau),
    },
    s3: {
      recebidas: cabecalho.recebidas_s3_key,
      pagas: cabecalho.pagas_s3_key,
      unicred: cabecalho.unicred_s3_key,
      itau: cabecalho.itau_s3_key,
    },
    sistema: sistema.map(l => ({
      data: l.data,
      competencia: l.competencia,
      centavos: centavos(l.valor_centavos),
      banco: l.banco,
      nome: l.nome,
      descricao: l.descricao,
      categoria: l.categoria,
    })),
    extrato: extrato.map(l => ({
      banco: l.banco,
      data: l.data,
      centavos: centavos(l.valor_centavos),
      descricao: l.descricao,
    })),
  }
}

/** Os meses já enviados, do mais novo para o mais antigo. */
export async function listarMeses(): Promise<MesEnviado[]> {
  await initSchema()
  const linhas = await sql<{ mes: string; created_at: Date; created_by: string | null }[]>`
    SELECT to_char(mes, 'YYYY-MM') AS mes, created_at, created_by
    FROM conciliacao_meses ORDER BY mes DESC
  `
  return linhas.map(l => ({
    mes: l.mes,
    criadoEm: new Date(l.created_at).toISOString(),
    criadoPor: l.created_by,
  }))
}
