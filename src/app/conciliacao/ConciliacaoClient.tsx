'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { resultadoDoMes, totalizar, type LinhaComparativo } from '@/lib/conciliacao/comparativo'
import type { ResultadoConciliacao } from '@/lib/conciliacao/conciliar'
import { mesValido } from '@/lib/conciliacao/periodo'
import type { CategoriaComparativo, Leitura, LeituraPlanilha, ResultadoMes } from '@/lib/conciliacao/resultado'
import type { Banco, ConferenciaSaldo } from '@/lib/conciliacao/tipos'
import { ehCategoriaCartao, NAO_IDENTIFICADO } from '@/lib/fatura/enquadrar'
import { AJUSTES_CARTAO } from '@/lib/fatura/substituir'
import type { FaturaDaTela } from '@/lib/fatura/tela'

// A aba Conciliação: uma vez por mês entram quatro arquivos e saem duas
// respostas — o que o BPO lançou e o banco não tem, e o que o banco tem e o
// BPO não lançou.
//
// As duas listas de diferença são o produto. Tudo o mais é moldura, e por isso
// fica deliberadamente discreto: num mês bom existe UMA linha, e a tela não
// pode enterrá-la em cartões bonitos. Por isso também as listas são `<table>`
// com `select-text`: o dono seleciona com o mouse e cola no WhatsApp para
// cobrar o BPO, e tabela sobrevive à seleção melhor que um monte de `div`.

interface MesEnviado {
  mes: string
  criadoEm: string
  criadoPor: string | null
}

/** O que a rota do mês devolve: o resultado, quem enviou (só na releitura) e a
 *  fatura do cartão do mês quando o dono já a subiu. */
type Resultado = ResultadoMes & {
  enviadoEm?: string
  enviadoPor?: string | null
  fatura?: FaturaDaTela | null
}

// `accept` é só conforto no seletor de arquivo: quem valida o conteúdo é o
// servidor, que lê os quatro e recusa nomeando o arquivo que não deu para ler.
const CAMPOS = [
  { campo: 'recebidas', rotulo: 'Planilha de contas recebidas', ext: '.xlsx', accept: '.xlsx' },
  { campo: 'pagas', rotulo: 'Planilha de contas pagas', ext: '.xlsx', accept: '.xlsx' },
  { campo: 'unicred', rotulo: 'Extrato do Unicred', ext: '.pdf', accept: '.pdf,application/pdf' },
  { campo: 'itau', rotulo: 'Extrato do Itaú', ext: '.pdf', accept: '.pdf,application/pdf' },
] as const

type Campo = (typeof CAMPOS)[number]['campo']

const SEM_ARQUIVO: Record<Campo, File | null> = { recebidas: null, pagas: null, unicred: null, itau: null }

const BANCO_NOME: Record<Banco, string> = { unicred: 'Unicred', itau: 'Itaú' }

// ── Formato ────────────────────────────────────────────────────
// Dinheiro em centavos inteiros, como no resto do projeto. O sinal vai ANTES do
// "R$" ("-R$ 3.750,00"), que é como extrato e balanço escrevem saída — e o
// débito chega negativo do servidor, então nada aqui inverte sinal por conta
// própria.
const valor = (centavos: number) =>
  (Math.abs(centavos) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const reais = (centavos: number) => `${centavos < 0 ? '-' : ''}R$ ${valor(centavos)}`
/** Com `+` explícito: usado só em variação, onde a direção é a informação. */
const reaisComSinal = (centavos: number) =>
  `${centavos < 0 ? '-' : centavos > 0 ? '+' : ''}R$ ${valor(centavos)}`
/** `percentual` já vem em porcentagem com duas casas — não multiplicar por 100. */
const pct = (p: number | null) => (p === null ? '—' : `${p > 0 ? '+' : ''}${p.toFixed(2).replace('.', ',')}%`)
/** AAAA-MM-DD → DD/MM/AAAA, por texto: data de dia não pode passar por fuso. */
const dia = (iso: string) => iso.split('-').reverse().join('/')
/** AAAA-MM → MM/AAAA. */
const mesBr = (m: string) => m.split('-').reverse().join('/')
const plural = (n: number, um: string, muitos: string) => `${n} ${n === 1 ? um : muitos}`

/** O `error` do servidor, ou '' quando o corpo não explica nada. */
function motivoDo(corpo: unknown): string {
  return corpo && typeof corpo === 'object' && typeof (corpo as { error?: unknown }).error === 'string'
    ? (corpo as { error: string }).error.trim()
    : ''
}

/**
 * O corpo tem a forma que a tela sabe desenhar? Não há error boundary nesta
 * árvore: um 200 com corpo inesperado (deploy no meio do caminho, proxy que
 * devolve HTML) derrubaria a aba inteira no `.map`. Melhor uma mensagem.
 */
function resultadoValido(corpo: unknown): corpo is Resultado {
  if (!corpo || typeof corpo !== 'object') return false
  const r = corpo as Partial<ResultadoMes>
  if (typeof r.mes !== 'string' || !Array.isArray(r.bancos)) return false
  if (!r.bancos.every(b => b && Array.isArray(b.soNoSistema) && Array.isArray(b.soNoExtrato))) return false
  if (!r.comparativo || !Array.isArray(r.comparativo.receitas) || !Array.isArray(r.comparativo.despesas)) return false
  // A fatura é opcional (mês sem fatura é o normal), mas quando vem tem de ter
  // a lista de compras e a de categorias: as duas são percorridas com `.map`.
  const f = (corpo as { fatura?: unknown }).fatura
  if (f !== undefined && f !== null) {
    const fat = f as Partial<FaturaDaTela>
    if (!Array.isArray(fat.compras) || !Array.isArray(fat.categorias)) return false
    if (typeof fat.somaCompras !== 'number' || typeof fat.identificado !== 'number') return false
  }
  const l = r.leitura
  return !l || !!(l.recebidas && l.pagas && l.unicred && l.itau)
}

const porData = <T extends { data: string }>(lista: T[]): T[] =>
  [...lista].sort((a, b) => a.data.localeCompare(b.data))

const TH = 'text-left font-medium text-gray-500 px-2 py-1'
const TD = 'px-2 py-1 align-top text-gray-700'

// ── Leitura dos arquivos (só no envio) ─────────────────────────

function descartes(l: LeituraPlanilha): string[] {
  const partes: string[] = []
  if (l.semDataPagamento) partes.push(`${l.semDataPagamento} sem data de pagamento`)
  if (l.bancoDesconhecido) partes.push(`${l.bancoDesconhecido} de outro banco`)
  if (l.semValor) partes.push(`${l.semValor} sem valor legível`)
  if (l.foraDoMes) partes.push(`${l.foraDoMes} fora do mês`)
  return partes
}

/**
 * Quantas linhas entraram e quantas ficaram de fora.
 *
 * No envio o cartão vem inteiro. Ao reabrir um mês gravado só voltam do banco
 * os quatro descartes que acendem o AVISO — então as linhas de detalhe
 * desaparecem e o aviso continua. É essa a razão de ser do cartão na releitura:
 * ver as mesmas diferenças sem lembrar que o leitor tropeçou é o caminho curto
 * para cobrar do BPO um bug nosso. O que não foi guardado não é desenhado:
 * "0 lançamentos" ou "período não declarado" seria invenção, não informação.
 */
function CartaoLeitura({ leitura }: { leitura: Leitura }) {
  const avisos: string[] = []
  for (const banco of ['unicred', 'itau'] as const) {
    const n = leitura[banco].naoEntendidas
    if (n) avisos.push(`${plural(n, 'registro', 'registros')} do extrato do ${BANCO_NOME[banco]}`)
  }
  for (const [campo, rotulo] of [['recebidas', 'contas recebidas'], ['pagas', 'contas pagas']] as const) {
    const n = leitura[campo].semValor
    if (n) avisos.push(`${plural(n, 'linha', 'linhas')} sem valor legível na planilha de ${rotulo}`)
  }

  const linha = (rotulo: string, principal: string, extra: string[]) => (
    <li key={rotulo} className="text-gray-600">
      <span className="text-gray-800">{rotulo}:</span> {[principal, ...extra].join(' · ')}
    </li>
  )

  const linhasPlanilha = ([['recebidas', 'Contas recebidas'], ['pagas', 'Contas pagas']] as const).flatMap(
    ([campo, rotulo]) => {
      const n = leitura[campo].lancamentos
      return n === undefined ? [] : [linha(rotulo, plural(n, 'lançamento', 'lançamentos'), descartes(leitura[campo]))]
    }
  )

  const linhasExtrato = (['unicred', 'itau'] as const).flatMap(banco => {
    const { movimentos, periodo, foraDoMes } = leitura[banco]
    if (movimentos === undefined) return []
    return [
      linha(`Extrato do ${BANCO_NOME[banco]}`, plural(movimentos, 'movimento', 'movimentos'), [
        // `undefined` é "não guardado" e não aparece; `null` é "o arquivo não
        // declarou período", que é informação do envio e aparece.
        ...(periodo === undefined
          ? []
          : [periodo ? `${dia(periodo.inicio)} a ${dia(periodo.fim)}` : 'período não declarado']),
        ...(foraDoMes ? [`${foraDoMes} fora do mês`] : []),
      ]),
    ]
  })

  const linhas = [...linhasPlanilha, ...linhasExtrato]
  // Nada guardado e nada a avisar: um cartão só com título sugeriria que a
  // leitura foi conferida agora, o que na releitura não aconteceu.
  if (linhas.length === 0 && avisos.length === 0) return null

  return (
    <section className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm space-y-2">
      <h2 className="text-sm font-semibold text-gray-700">Leitura dos arquivos</h2>
      {linhas.length > 0 && <ul className="text-xs space-y-1">{linhas}</ul>}
      {avisos.length > 0 && (
        <p role="alert" className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2">
          O leitor não entendeu {avisos.join(' e ')}. Diferença causada por falha de leitura não é erro do BPO —
          confira o arquivo antes de cobrar.
        </p>
      )}
    </section>
  )
}

// ── Conciliação ───────────────────────────────────────────────

/**
 * A prova de que a leitura do extrato não perdeu nenhum movimento:
 *
 *     saldo de abertura impresso + movimentos lidos = saldo final impresso
 *
 * Fica aqui, dentro do bloco do banco, porque é aqui que estão as diferenças
 * que ela pode explicar. São três estados e nenhum deles se confunde com
 * outro:
 *
 * - `undefined`: nada foi guardado para este mês (mês antigo). Não se desenha
 *   nada — frase nenhuma é melhor que uma causa inventada.
 * - `null`: não há prova. Dito com essas palavras, sem sugerir que fecha.
 * - resíduo zero: fecha, e a confirmação é discreta.
 * - resíduo diferente de zero: aviso graúdo. É o caso que justifica o resto:
 *   sem ele, uma diferença causada pelo leitor viraria cobrança ao BPO.
 */
function ProvaDeSaldo({ conferencia }: { conferencia: ConferenciaSaldo | null | undefined }) {
  if (conferencia === undefined) return null

  if (conferencia === null) {
    return (
      <p className="text-xs text-gray-500">
        Não foi possível provar a leitura deste extrato: os dois saldos impressos (o de abertura e o do final do
        período) não foram lidos — o arquivo não os traz, ou o mês foi gravado antes desta conferência. Nada aqui
        garante que a leitura pegou todos os movimentos.
      </p>
    )
  }

  const { abertura, soma, fechamento, residuo } = conferencia

  if (residuo === 0) {
    return (
      <p className="text-xs text-gray-500">
        Leitura conferida: o extrato fecha — saldo de abertura ({reais(abertura)}) + movimentos lidos (
        {reaisComSinal(soma)}) = saldo final impresso ({reais(fechamento)}).
      </p>
    )
  }

  return (
    <p role="alert" className="text-sm text-red-800 bg-red-50 border border-red-200 rounded-lg p-3">
      <strong>A leitura deste extrato não fecha.</strong> Saldo de abertura ({reais(abertura)}) + movimentos lidos (
      {reaisComSinal(soma)}) dá {reais(abertura + soma)}, mas o extrato imprime {reais(fechamento)} no final do
      período: sobram {reaisComSinal(residuo)} sem explicação. Uma diferença deste banco neste mês pode vir da
      leitura do extrato, e não do BPO — confira o arquivo antes de cobrar.
    </p>
  )
}

function Totais({ r }: { r: ResultadoConciliacao }) {
  const linhas: { rotulo: string; sistema: number; extrato: number }[] = [
    { rotulo: 'Entradas', sistema: r.totalSistemaCredito, extrato: r.totalExtratoCredito },
    { rotulo: 'Saídas', sistema: r.totalSistemaDebito, extrato: r.totalExtratoDebito },
    {
      rotulo: 'Resultado',
      sistema: r.totalSistemaCredito + r.totalSistemaDebito,
      extrato: r.totalExtratoCredito + r.totalExtratoDebito,
    },
  ]
  return (
    <table className="w-full text-xs select-text">
      <thead>
        <tr className="border-b border-gray-100">
          <th className={TH}>Totais</th>
          <th className={`${TH} text-right`}>Sistema</th>
          <th className={`${TH} text-right`}>Extrato</th>
          <th className={`${TH} text-right`}>Diferença</th>
        </tr>
      </thead>
      <tbody>
        {linhas.map(l => {
          const dif = l.sistema - l.extrato
          return (
            <tr key={l.rotulo} className="border-b border-gray-50 last:border-0">
              <th scope="row" className={`${TD} font-medium text-gray-600`}>{l.rotulo}</th>
              <td className={`${TD} text-right whitespace-nowrap`}>{reais(l.sistema)}</td>
              <td className={`${TD} text-right whitespace-nowrap`}>{reais(l.extrato)}</td>
              <td className={`${TD} text-right whitespace-nowrap font-medium ${dif === 0 ? 'text-gray-400' : 'text-red-700'}`}>
                {reais(dif)}
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

function BlocoBanco({
  r,
  conferencia,
}: {
  r: ResultadoConciliacao
  /** `undefined` = nada guardado para este mês; `null` = sem prova possível. */
  conferencia: ConferenciaSaldo | null | undefined
}) {
  const nome = BANCO_NOME[r.banco]
  const doSistema = r.conciliados + r.soNoSistema.length
  const doExtrato = r.conciliados + r.soNoExtrato.length
  // Banco sem nenhum lançamento dos dois lados não está "todo conferido": não
  // há nada para conferir, e dizer que confere é mentira tranquilizadora.
  const vazio = doSistema === 0 && doExtrato === 0
  const diferencas = r.soNoSistema.length + r.soNoExtrato.length

  const legenda = `Só no sistema (${r.soNoSistema.length}) — ${nome}: o BPO lançou e o dinheiro não se moveu`
  const legendaExtrato = `Só no extrato (${r.soNoExtrato.length}) — ${nome}: o dinheiro se moveu e o BPO não lançou`

  return (
    <section className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm space-y-3">
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <h2 className="text-base font-semibold text-gray-800">{nome}</h2>
        {!vazio && (
          <span
            className={`text-xs font-semibold px-2 py-1 rounded-full border ${
              diferencas === 0
                ? 'text-green-700 bg-green-50 border-green-200'
                : 'text-red-700 bg-red-50 border-red-200'
            }`}
          >
            {diferencas === 0 ? 'sem diferença' : plural(diferencas, 'diferença', 'diferenças')}
          </span>
        )}
      </div>

      {/* Antes dos números: se a leitura não fecha, nenhum número abaixo é
          confiável — inclusive o "nada a conciliar" de um banco vazio. */}
      <ProvaDeSaldo conferencia={conferencia} />

      {vazio ? (
        <p className="text-sm text-gray-500">Nenhum lançamento deste banco no mês — nada a conciliar.</p>
      ) : (
        <>
          <p className="text-xs text-gray-500">
            Conciliados: {r.conciliados} de {doSistema} lançamentos do sistema · {r.conciliados} de {doExtrato}{' '}
            movimentos do extrato.
          </p>
          <Totais r={r} />

          {diferencas === 0 ? (
            <p className="text-sm text-green-800 bg-green-50 border border-green-200 rounded-lg p-3">
              Nenhuma diferença: os {doSistema} lançamentos do sistema conferem com o extrato, um a um.
            </p>
          ) : (
            // `overflow-x-auto`: cinco colunas não cabem em 375 px, e encolher a
            // fonte até caber tornaria a lista ilegível justamente no celular,
            // onde ele lê e copia.
            <div className="space-y-4 pt-1 overflow-x-auto">
              {r.soNoSistema.length > 0 && (
                <table aria-label={legenda} className="w-full min-w-[34rem] text-xs select-text">
                  <caption className="text-left text-xs font-semibold text-gray-700 pb-1">{legenda}</caption>
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className={TH}>Data</th>
                      <th className={`${TH} text-right`}>Valor</th>
                      <th className={TH}>Nome</th>
                      <th className={TH}>Descrição</th>
                      <th className={TH}>Categoria</th>
                    </tr>
                  </thead>
                  <tbody>
                    {porData(r.soNoSistema).map((l, i) => (
                      <tr key={i} className="border-b border-gray-50 last:border-0">
                        <td className={`${TD} whitespace-nowrap`}>{dia(l.data)}</td>
                        <td className={`${TD} text-right whitespace-nowrap font-medium text-gray-900`}>{reais(l.centavos)}</td>
                        <td className={`${TD} break-words`}>{l.nome}</td>
                        <td className={`${TD} break-words`}>{l.descricao ?? '—'}</td>
                        <td className={`${TD} break-words`}>{l.categoria}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              {r.soNoExtrato.length > 0 && (
                <table aria-label={legendaExtrato} className="w-full text-xs select-text">
                  <caption className="text-left text-xs font-semibold text-gray-700 pb-1">{legendaExtrato}</caption>
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className={TH}>Data</th>
                      <th className={`${TH} text-right`}>Valor</th>
                      <th className={TH}>Descrição</th>
                    </tr>
                  </thead>
                  <tbody>
                    {porData(r.soNoExtrato).map((l, i) => (
                      <tr key={i} className="border-b border-gray-50 last:border-0">
                        <td className={`${TD} whitespace-nowrap`}>{dia(l.data)}</td>
                        <td className={`${TD} text-right whitespace-nowrap font-medium text-gray-900`}>{reais(l.centavos)}</td>
                        <td className={`${TD} break-words`}>{l.descricao}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </>
      )}
    </section>
  )
}

// ── Custos ────────────────────────────────────────────────────

/**
 * O resultado de CAIXA do mês: tudo que entrou menos tudo que saiu.
 *
 * Decisão do dono (15/10): nada é excluído — distribuição de lucros, aporte de
 * capital e amortização de empréstimo entram. É o número que conversa com o
 * extrato, e por isso o rodapé diz em voz alta o que ele inclui: um mês de
 * retirada grande aparece negativo sem que a clínica tenha dado prejuízo.
 */
function ResultadoDoMes({
  receitas,
  despesas,
  mes,
  mesAnterior,
}: {
  receitas: CategoriaComparativo[]
  despesas: CategoriaComparativo[]
  mes: string
  mesAnterior: string | null
}) {
  const r = resultadoDoMes(receitas, despesas)
  const positivo = r.atual >= 0
  return (
    <section className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm space-y-3">
      <h2 className="text-base font-semibold text-gray-800">Resultado do mês</h2>
      <div className="flex flex-wrap items-end gap-x-8 gap-y-3">
        <div>
          <p className="text-xs text-gray-500">{mesBr(mes)}</p>
          <p className={`text-2xl font-bold ${positivo ? 'text-green-700' : 'text-red-700'}`}>
            {reais(r.atual)}
          </p>
        </div>
        {mesAnterior && (
          <>
            <div>
              <p className="text-xs text-gray-500">{mesBr(mesAnterior)}</p>
              <p className="text-lg font-semibold text-gray-700">{reais(r.anterior)}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Diferença</p>
              <p className={`text-lg font-semibold ${r.diferenca >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                {reaisComSinal(r.diferenca)}
                {r.percentual !== null && (
                  <span className="text-sm font-normal"> ({pct(r.percentual)})</span>
                )}
              </p>
            </div>
          </>
        )}
      </div>
      <p className="text-xs text-gray-500">
        Entradas menos saídas do mês, como aconteceram no banco. Inclui distribuição de lucros, aporte de
        capital e pagamento de empréstimo — não é lucro contábil.
      </p>
    </section>
  )
}

/**
 * Um bloco de categorias (receitas OU despesas).
 *
 * **Despesa aparece como número positivo.** O servidor manda saída negativa, e
 * mostrar "-R$ 3.000,00" ao lado de "+60%" na mesma linha faria a tela se
 * contradizer. Num relatório de custo o que se lê é "o aluguel subiu R$ 3.000
 * (+60%)", então o bloco de despesa inverte o sinal dos valores exibidos
 * (`fator = -1`) e a variação passa a apontar para o mesmo lado do percentual,
 * que já vem com essa orientação do servidor.
 */
function BlocoCategorias({
  titulo,
  linhas,
  receita,
  mes,
  mesAnterior,
  aberta,
  abrir,
}: {
  titulo: string
  linhas: CategoriaComparativo[]
  receita: boolean
  mes: string
  mesAnterior: string | null
  aberta: string | null
  abrir: (chave: string | null) => void
}) {
  const fator = receita ? 1 : -1
  const exibe = (centavos: number) => fator * centavos
  const colunas = mesAnterior ? 5 : 2
  const total = totalizar(linhas)

  const cor = (c: LinhaComparativo) => {
    const alta = exibe(c.diferenca)
    if (alta === 0) return 'text-gray-400'
    const sobe = alta > 0
    return sobe === receita ? 'text-green-700' : 'text-red-700'
  }

  if (linhas.length === 0) {
    return (
      <section className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm space-y-2">
        <h2 className="text-base font-semibold text-gray-800">{titulo}</h2>
        <p className="text-sm text-gray-500">Nenhuma categoria com movimento neste mês.</p>
      </section>
    )
  }

  return (
    <section className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm overflow-x-auto">
      <table aria-label={titulo} className="w-full min-w-[30rem] text-xs select-text">
        <caption className="text-left text-base font-semibold text-gray-800 pb-2">{titulo}</caption>
        <thead>
          <tr className="border-b border-gray-200">
            <th className={TH}>Categoria</th>
            <th className={`${TH} text-right whitespace-nowrap`}>{mesBr(mes)}</th>
            {mesAnterior && (
              <>
                <th className={`${TH} text-right whitespace-nowrap`}>{mesBr(mesAnterior)}</th>
                <th className={`${TH} text-right whitespace-nowrap`}>Variação</th>
                <th className={`${TH} text-right whitespace-nowrap`}>Variação %</th>
              </>
            )}
          </tr>
        </thead>
        {linhas.map(c => {
          // A chave inclui o bloco: uma categoria com estorno aparece em
          // Receitas E em Despesas, e abrir uma não pode abrir a outra.
          const id = `${titulo}:${c.chave}`
          const abertaAqui = aberta === id
          const fornecedores = c.fornecedores ?? []
          return (
            <tbody key={c.chave}>
              <tr className="border-b border-gray-50">
                <td className={TD}>
                  <span aria-hidden="true" className="text-gray-400 mr-1">{abertaAqui ? '▲' : '▼'}</span>
                  <button
                    type="button"
                    onClick={() => abrir(abertaAqui ? null : id)}
                    aria-expanded={abertaAqui}
                    className="text-left font-medium text-violet-700 hover:text-violet-900 break-words"
                  >
                    {c.chave}
                  </button>
                </td>
                <td className={`${TD} text-right whitespace-nowrap font-medium text-gray-900`}>{reais(exibe(c.atual))}</td>
                {mesAnterior && (
                  <>
                    <td className={`${TD} text-right whitespace-nowrap`}>{reais(exibe(c.anterior))}</td>
                    <td className={`${TD} text-right whitespace-nowrap font-medium ${cor(c)}`}>
                      {reaisComSinal(exibe(c.diferenca))}
                    </td>
                    <td className={`${TD} text-right whitespace-nowrap ${cor(c)}`} title={c.percentual === null ? 'Sem base de comparação: o mês anterior era zero' : undefined}>
                      {pct(c.percentual)}
                    </td>
                  </>
                )}
              </tr>
              {abertaAqui && fornecedores.length === 0 && (
                <tr className="bg-gray-50 border-b border-gray-100">
                  <td className={`${TD} text-gray-500`} colSpan={colunas}>Sem detalhe por fornecedor nesta categoria.</td>
                </tr>
              )}
              {abertaAqui &&
                fornecedores.map(f => (
                  <tr key={f.chave} className="bg-gray-50 border-b border-gray-100 last:border-0">
                    <td className={`${TD} pl-6 break-words text-gray-600`}>{f.chave}</td>
                    <td className={`${TD} text-right whitespace-nowrap`}>{reais(exibe(f.atual))}</td>
                    {mesAnterior && (
                      <>
                        <td className={`${TD} text-right whitespace-nowrap`}>{reais(exibe(f.anterior))}</td>
                        <td className={`${TD} text-right whitespace-nowrap ${cor(f)}`}>{reaisComSinal(exibe(f.diferenca))}</td>
                        <td className={`${TD} text-right whitespace-nowrap ${cor(f)}`}>{pct(f.percentual)}</td>
                      </>
                    )}
                  </tr>
                ))}
            </tbody>
          )
        })}
        <tfoot>
          <tr className="border-t-2 border-gray-300 bg-gray-50 font-semibold text-gray-900">
            <td className={`${TD} py-2`}>Total</td>
            <td className={`${TD} py-2 text-right whitespace-nowrap`}>{reais(exibe(total.atual))}</td>
            {mesAnterior && (
              <>
                <td className={`${TD} py-2 text-right whitespace-nowrap`}>{reais(exibe(total.anterior))}</td>
                <td className={`${TD} py-2 text-right whitespace-nowrap ${cor(total)}`}>
                  {reaisComSinal(exibe(total.diferenca))}
                </td>
                <td className={`${TD} py-2 text-right whitespace-nowrap ${cor(total)}`}>{pct(total.percentual)}</td>
              </>
            )}
          </tr>
        </tfoot>
      </table>
    </section>
  )
}

// ── Fatura do cartão ──────────────────────────────────────────

/** A linha opaca "Cartão de Crédito" do mês, em centavos POSITIVOS, ou 0 quando
 *  ela não existe. É o tamanho do que a fatura vai abrir — e é o que diz ao
 *  dono se vale a pena ir buscar o PDF. */
function lancadoNoCartao(despesas: CategoriaComparativo[]): number {
  return Math.abs(despesas.filter(d => ehCategoriaCartao(d.chave)).reduce((s, d) => s + d.atual, 0))
}

/** Qual ação da fatura está em voo: o envio, a remoção, ou o id da compra cuja
 *  categoria está sendo gravada. `null` = nenhuma. */
type AcaoFatura = 'envio' | 'remocao' | number | null

/**
 * A fatura do cartão dentro do Custos.
 *
 * Três coisas que esta tela PRECISA dizer, e por quê:
 *
 * 1. **Quanto da fatura foi identificado** ("R$ 23.100,00 de R$ 20.020,00 —
 *    91%"). Sem isso o dono não sabe se vale a pena abrir a lista; com isso ele
 *    decide em dois segundos.
 * 2. **Que abrir a fatura sobe o total de Despesas E o de Receitas, no mesmo
 *    valor.** As compras somam mais que o pagamento (estorno que só aparece na
 *    fatura seguinte): as categorias que entram somam mais que a linha opaca
 *    que saiu, e a diferença vira a linha de créditos e ajustes, em Receitas.
 *    Quem não sabe disso lê os dois totais subindo como bug — então a tela diz,
 *    com os números, que o RESULTADO do mês é que não muda.
 * 3. **Que uma fatura cujo resíduo não é zero NÃO está sendo usada.** Uma
 *    abertura incompleta faz uma categoria parecer menor do que é, e isso é
 *    pior que a linha opaca, porque parece informação.
 *
 * Só a categoria é editável. Valor, data e estabelecimento vêm da fatura: se
 * estiverem errados, o errado é a leitura, e o lugar de consertar é o leitor.
 */
function CartaoFatura({
  fatura,
  lancadoFechado,
  mesAnterior,
  arquivo,
  escolher,
  inputRef,
  enviar,
  remover,
  trocar,
  acao,
  erro,
}: {
  fatura: FaturaDaTela | null
  /** A linha "Cartão de Crédito" que AINDA está no comparativo, em centavos
   *  positivos. Zero quando a fatura já a substituiu (ou quando o mês não tem
   *  essa linha) — é por ela que a tela sabe se a fatura entrou no Custos de
   *  verdade, em vez de supor que entrou por estar gravada. */
  lancadoFechado: number
  /** AAAA-MM comparado, ou `null` no primeiro mês. */
  mesAnterior: string | null
  arquivo: File | null
  escolher: (f: File | null) => void
  inputRef: (el: HTMLInputElement | null) => void
  enviar: () => void
  remover: () => void
  trocar: (compraId: number, categoria: string) => void
  acao: AcaoFatura
  erro: string | null
}) {
  const [confirmando, setConfirmando] = useState(false)

  const alerta = erro && (
    <p role="alert" className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-3 whitespace-pre-line">
      {erro}
    </p>
  )

  if (!fatura) {
    return (
      <section className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm space-y-3">
        <h2 className="text-base font-semibold text-gray-800">Fatura do cartão</h2>
        <p className="text-sm text-gray-600">
          {lancadoFechado > 0 ? (
            <>
              O cartão aparece aqui numa linha só, de <strong>{reais(lancadoFechado)}</strong>, que não diz o que tem
              dentro. Envie o PDF da fatura paga neste mês para abrir essa linha nas categorias de verdade.
            </>
          ) : (
            <>
              Este mês não tem lançamento na categoria &ldquo;Cartão de Crédito&rdquo;. Envie o PDF da fatura paga
              neste mês se quiser a leitura guardada — sem essa linha não há valor para substituir no Custos.
            </>
          )}
        </p>
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <label htmlFor="fatura-arquivo" className="text-xs font-medium text-gray-600">
              PDF da fatura (.pdf)
            </label>
            <input
              id="fatura-arquivo"
              ref={inputRef}
              type="file"
              accept=".pdf,application/pdf"
              onChange={e => escolher(e.target.files?.[0] ?? null)}
              className="block w-full text-xs text-gray-600 file:mr-2 file:py-1 file:px-2 file:rounded-lg file:border file:border-gray-300 file:bg-gray-50 file:text-xs file:text-gray-700"
            />
          </div>
          <button
            type="button"
            onClick={enviar}
            disabled={!arquivo || acao !== null}
            className="px-3 py-1.5 rounded-lg text-sm font-medium bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-50"
          >
            {acao === 'envio' ? 'Lendo a fatura...' : 'Enviar a fatura'}
          </button>
        </div>
        <p className="text-xs text-gray-500">
          A fatura vai à parte dos quatro arquivos: reenviar o mês não apaga a fatura, e enviar a fatura não exige
          reenviar o mês.
        </p>
        {alerta}
      </section>
    )
  }

  // As opções de CADA linha são as categorias do mês mais, se faltar, a
  // categoria daquela compra. A memória do dono não é filtrada por mês (se o
  // BPO renomear uma categoria, a correção dele continua valendo), e um
  // `select` controlado cujo valor não está entre as opções apareceria vazio.
  // Por LINHA, e não uma lista só: oferecer a categoria de fora do mês de uma
  // compra às outras ofereceria uma escolha que o servidor recusa — a troca
  // grava na memória, que vale para todos os meses seguintes.
  const opcoesDe = (categoria: string) =>
    fatura.categorias.includes(categoria) ? fatura.categorias : [...fatura.categorias, categoria]
  const pctIdentificado =
    fatura.somaCompras > 0 ? Math.round((fatura.identificado / fatura.somaCompras) * 100) : 0
  /** Positivo = crédito, e vai para Receitas. Ver `substituirCartao`. */
  const ajuste = fatura.somaCompras - fatura.lancado
  const ocupado = acao !== null

  return (
    <section className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm space-y-3">
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <h2 className="text-base font-semibold text-gray-800">Fatura do cartão</h2>
        <span className="text-xs text-gray-500">
          ref. {mesBr(fatura.referencia)} · {plural(fatura.compras.length, 'compra', 'compras')}
        </span>
      </div>

      {/* Três motivos de a fatura estar gravada e NÃO estar abrindo o Custos.
          Dizer qual é não é detalhe: o cartão é 13% do mês, e "a fatura está
          lá" sem o efeito é a única coisa pior que a linha opaca. */}
      {fatura.residuo !== 0 ? (
        <p role="alert" className="text-sm text-red-800 bg-red-50 border border-red-200 rounded-lg p-3">
          <strong>A leitura desta fatura não fecha:</strong> sobram {reaisComSinal(fatura.residuo)} entre as compras
          lidas e o total que a própria fatura declara. Ela <strong>não está sendo usada no Custos</strong> — uma
          abertura incompleta faria uma categoria parecer menor do que é. Remova e envie o PDF completo.
        </p>
      ) : lancadoFechado > 0 ? (
        <p role="alert" className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-3">
          <strong>As compras abaixo ainda não entraram no Custos:</strong> a linha &ldquo;Cartão de Crédito&rdquo; de{' '}
          {reais(lancadoFechado)} continua lá. O comparativo abre <strong>os dois meses ou nenhum</strong> — envie
          também a fatura de {mesAnterior ? mesBr(mesAnterior) : 'mês anterior'}, senão toda categoria do cartão
          apareceria como se tivesse nascido neste mês, com alta de 100%.
        </p>
      ) : fatura.lancado === 0 ? (
        <p className="text-xs text-gray-600 bg-gray-50 border border-gray-200 rounded-lg p-2">
          Este mês não tem lançamento na categoria &ldquo;Cartão de Crédito&rdquo;: a leitura está guardada, mas não
          substitui nada no Custos — não haveria de onde tirar o valor, e pôr as compras do mesmo jeito contaria a
          fatura duas vezes.
        </p>
      ) : null}

      <p className="text-sm text-gray-700">
        <strong>{reais(fatura.identificado)}</strong> de {reais(fatura.somaCompras)} em compras —{' '}
        {pctIdentificado}% identificado.
        {fatura.identificado < fatura.somaCompras && (
          <> O resto está em &ldquo;{NAO_IDENTIFICADO}&rdquo; até alguém escolher a categoria abaixo.</>
        )}
      </p>

      {fatura.lancado > 0 && fatura.totalFatura !== fatura.lancado && (
        <p role="alert" className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-3">
          A fatura declara {reais(fatura.totalFatura)} de saldo total, e o BPO lançou {reais(fatura.lancado)} em
          &ldquo;Cartão de Crédito&rdquo; neste mês — diferença de {reaisComSinal(fatura.totalFatura - fatura.lancado)}.
          Confira se esta é a fatura paga neste mês. A fatura continua sendo usada, com o valor do BPO como total:
          um estorno de anuidade faz o pago diferir do comprado sem que nada esteja errado.
        </p>
      )}

      {fatura.lancado > 0 && ajuste !== 0 && (
        <p className="text-xs text-gray-600 bg-gray-50 border border-gray-200 rounded-lg p-2">
          {ajuste > 0 ? (
            <>
              As compras somam {reais(fatura.somaCompras)} e o pagamento foi de {reais(fatura.lancado)}: a diferença
              de {reais(ajuste)} é crédito (um estorno que só aparece na fatura seguinte) e entra no Custos como
              &ldquo;{AJUSTES_CARTAO}&rdquo;, em <strong>Receitas</strong>. Por isso abrir a fatura{' '}
              <strong>sobe</strong> o total de Despesas em {reais(ajuste)} (as compras somam mais que a linha do cartão
              que saiu) e sobe o de Receitas no mesmo valor: <strong>o resultado do mês não muda</strong>. Não é erro.
            </>
          ) : (
            <>
              A fatura cobrou {reais(-ajuste)} além das compras lidas (encargos, por exemplo). Esse valor entra no
              Custos como &ldquo;{AJUSTES_CARTAO}&rdquo;, em <strong>Despesas</strong>, em vez de ser diluído nas
              categorias: <strong>o resultado do mês não muda</strong>.
            </>
          )}
        </p>
      )}

      <div className="overflow-x-auto">
        <table aria-label="Compras da fatura" className="w-full min-w-[32rem] text-xs select-text">
          <thead>
            <tr className="border-b border-gray-200">
              <th className={TH}>Data</th>
              <th className={TH}>Estabelecimento</th>
              <th className={`${TH} text-right`}>Valor</th>
              <th className={TH}>Categoria</th>
            </tr>
          </thead>
          <tbody>
            {fatura.compras.map(c => {
              const extras = [c.parcela ? `parcela ${c.parcela}` : '', c.internacional ? 'internacional' : '']
                .filter(Boolean)
                .join(' · ')
              return (
                <tr key={c.id} className="border-b border-gray-50 last:border-0">
                  <td className={`${TD} whitespace-nowrap`}>{dia(c.data)}</td>
                  <td className={`${TD} break-words`}>
                    {c.estabelecimento || '—'}
                    {extras && <span className="text-gray-400"> · {extras}</span>}
                  </td>
                  <td className={`${TD} text-right whitespace-nowrap font-medium text-gray-900`}>
                    {reais(c.centavos)}
                  </td>
                  <td className={TD}>
                    <div className="flex items-center gap-2 flex-wrap">
                      <select
                        aria-label={`Categoria de ${c.estabelecimento || 'compra sem nome'}`}
                        value={c.categoria}
                        disabled={ocupado}
                        onChange={e => trocar(c.id, e.target.value)}
                        className="border border-gray-300 rounded-lg px-1.5 py-1 text-xs max-w-[14rem] focus:outline-none focus:ring-2 focus:ring-violet-400 disabled:opacity-60"
                      >
                        {opcoesDe(c.categoria).map(o => (
                          <option key={o} value={o}>
                            {o}
                          </option>
                        ))}
                      </select>
                      {acao === c.id && <span className="text-gray-500">gravando...</span>}
                      {/* De onde veio a categoria. "Sua escolha" é a que não se
                          repete: ela já está gravada para o mês que vem. */}
                      {acao !== c.id && c.origem === 'manual' && <span className="text-violet-700">sua escolha</span>}
                      {acao !== c.id && c.origem === 'memoria' && <span className="text-gray-400">lembrada</span>}
                      {acao !== c.id && c.origem === 'ia' && <span className="text-gray-400">sugerida</span>}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-gray-500">
        Trocar a categoria vale para todas as compras do mesmo estabelecimento nesta fatura — o descritor do cartão
        repete o mesmo lugar muitas vezes — e também para os meses seguintes: o estabelecimento fica gravado e, no
        mês que vem, vai sozinho para onde você mandou.
      </p>

      {alerta}

      <div className="flex items-center gap-3 flex-wrap border-t border-gray-100 pt-3">
        {confirmando ? (
          <>
            <button
              type="button"
              onClick={() => {
                setConfirmando(false)
                remover()
              }}
              disabled={ocupado}
              className="px-3 py-1.5 rounded-lg text-sm font-medium bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
            >
              {acao === 'remocao' ? 'Removendo...' : 'Confirmar a remoção'}
            </button>
            <button
              type="button"
              onClick={() => setConfirmando(false)}
              className="px-3 py-1.5 rounded-lg text-sm font-medium border border-gray-300 text-gray-700 hover:bg-gray-50"
            >
              Cancelar
            </button>
            <p className="text-xs text-gray-500">
              A leitura e as categorias desta fatura saem, e a linha &ldquo;Cartão de Crédito&rdquo; volta. O que você
              ensinou sobre cada estabelecimento continua gravado.
            </p>
          </>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmando(true)}
            disabled={ocupado}
            className="px-3 py-1.5 rounded-lg text-sm font-medium border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            Remover a fatura
          </button>
        )}
      </div>
    </section>
  )
}

// ── A aba ─────────────────────────────────────────────────────

export function ConciliacaoClient() {
  const [meses, setMeses] = useState<MesEnviado[]>([])
  const [erroMeses, setErroMeses] = useState<string | null>(null)
  const [mes, setMes] = useState('')
  const [resultado, setResultado] = useState<Resultado | null>(null)
  const [erroMes, setErroMes] = useState<string | null>(null)
  const [carregando, setCarregando] = useState(false)
  const [aba, setAba] = useState<'conciliacao' | 'custos'>('conciliacao')
  const [arquivos, setArquivos] = useState<Record<Campo, File | null>>(SEM_ARQUIVO)
  const [enviando, setEnviando] = useState(false)
  const [erroEnvio, setErroEnvio] = useState<string | null>(null)
  const [aberta, setAberta] = useState<string | null>(null)
  const [faturaArquivo, setFaturaArquivo] = useState<File | null>(null)
  const [acaoFatura, setAcaoFatura] = useState<AcaoFatura>(null)
  const [erroFatura, setErroFatura] = useState<string | null>(null)

  const inputs = useRef<Partial<Record<Campo, HTMLInputElement | null>>>({})
  /** Os meses que já têm conciliação gravada. Em ref, e não só no estado,
   *  porque quem decide se vale buscar o mês é um callback estável. */
  const enviados = useRef<Set<string>>(new Set())
  /** Qual busca é a atual: trocar de mês duas vezes rápido não pode deixar a
   *  resposta mais lenta sobrescrever a mais nova. O envio também avança este
   *  contador, senão um GET em voo apagaria o resultado recém-enviado. */
  const pedido = useRef(0)
  /** Trava do envio em ref, e não só no estado: dois cliques no mesmo tique
   *  veriam `enviando` ainda falso (o estado só muda no próximo render) e
   *  gravariam o mês duas vezes. */
  const enviandoAgora = useRef(false)
  const inputFatura = useRef<HTMLInputElement | null>(null)
  /** A mesma trava, para as três ações da fatura: dois cliques no mesmo tique
   *  no "Enviar a fatura" subiriam o PDF duas vezes. */
  const faturaOcupada = useRef(false)

  const carregarMes = useCallback(async (m: string) => {
    const id = ++pedido.current
    setErroMes(null)
    setAberta(null)
    setErroFatura(null)
    // Mês nunca enviado: não há o que buscar, e 404 não é erro para mostrar em
    // vermelho — é o estado normal de quem acabou de escolher o mês.
    if (!mesValido(m) || !enviados.current.has(m)) {
      setResultado(null)
      setCarregando(false)
      return
    }
    setCarregando(true)
    try {
      const res = await fetch(`/api/conciliacao/${m}`)
      const corpo: unknown = await res.json().catch(() => null)
      if (id !== pedido.current) return
      if (!res.ok) {
        setResultado(null)
        setErroMes(motivoDo(corpo) || `Não foi possível carregar a conciliação de ${mesBr(m)}.`)
        return
      }
      if (!resultadoValido(corpo)) {
        setResultado(null)
        setErroMes(`A resposta da conciliação de ${mesBr(m)} veio fora do formato. Recarregue a página.`)
        return
      }
      setResultado(corpo)
    } catch {
      if (id === pedido.current) {
        setResultado(null)
        setErroMes(`Não foi possível carregar a conciliação de ${mesBr(m)}. Tente de novo.`)
      }
    } finally {
      if (id === pedido.current) setCarregando(false)
    }
  }, [])

  useEffect(() => {
    let vivo = true
    ;(async () => {
      try {
        const res = await fetch('/api/conciliacao')
        if (!res.ok) {
          // O motivo do servidor (sessão expirada, sem permissão) chega à tela;
          // um erro de rede cai na genérica.
          throw new Error(motivoDo(await res.json().catch(() => null)))
        }
        const dados: unknown = await res.json()
        if (!Array.isArray(dados)) throw new Error('')
        if (!vivo) return
        // O servidor já devolve do mais novo para o mais antigo; ordenar aqui
        // deixa a aba certa mesmo se isso mudar lá.
        const lista = (dados as MesEnviado[])
          .filter(m => m && mesValido(m.mes))
          .sort((a, b) => b.mes.localeCompare(a.mes))
        enviados.current = new Set(lista.map(m => m.mes))
        setMeses(lista)
        // O mês mais novo é o que o dono quer ver ao abrir a aba.
        if (lista.length > 0) {
          setMes(lista[0].mes)
          await carregarMes(lista[0].mes)
        }
      } catch (err) {
        const motivo = err instanceof Error ? err.message.trim() : ''
        if (vivo) {
          setErroMeses(motivo || 'Não foi possível carregar os meses já enviados. O envio abaixo continua funcionando.')
        }
      }
    })()
    return () => { vivo = false }
  }, [carregarMes])

  function trocarMes(valor: string) {
    setMes(valor)
    setErroEnvio(null)
    // O PDF escolhido é de um mês: levá-lo para outro mês subiria a fatura de
    // setembro como se fosse a de outubro.
    limparArquivoDaFatura()
    carregarMes(valor)
  }

  function limparArquivoDaFatura() {
    setFaturaArquivo(null)
    if (inputFatura.current) inputFatura.current.value = ''
  }

  /**
   * As três ações da fatura (enviar, trocar a categoria de uma compra, remover)
   * terminam igual: o servidor devolve o MÊS INTEIRO remontado do banco e a
   * tela só troca o resultado.
   *
   * É de propósito que nada seja atualizado antes da resposta. Trocar a
   * categoria na tela e só depois tentar gravar deixaria, numa falha, a
   * categoria errada na frente do dono como se estivesse salva — e é desta
   * tela que ele tira o custo do mês.
   */
  async function acaoDaFatura(qual: Exclude<AcaoFatura, null>, url: string, init: RequestInit, generico: string) {
    if (faturaOcupada.current) return false
    faturaOcupada.current = true
    setAcaoFatura(qual)
    setErroFatura(null)
    try {
      const res = await fetch(url, init)
      const corpo: unknown = await res.json().catch(() => null)
      if (!res.ok) {
        setErroFatura(motivoDo(corpo) || generico)
        return false
      }
      if (!resultadoValido(corpo)) {
        setErroFatura('A ação foi aceita, mas a resposta veio fora do formato. Recarregue a página.')
        return false
      }
      // Um GET de mês em voo não pode sobrescrever o que a ação devolveu.
      pedido.current++
      setResultado(corpo)
      return true
    } catch {
      setErroFatura(generico)
      return false
    } finally {
      faturaOcupada.current = false
      setAcaoFatura(null)
    }
  }

  async function enviarFatura() {
    // O mês é o do resultado na tela, fixado aqui: é o mês a que a fatura vai
    // pertencer, e ele não pode mudar no meio do envio.
    if (!faturaArquivo || !resultado) return
    const form = new FormData()
    form.append('fatura', faturaArquivo)
    const ok = await acaoDaFatura(
      'envio',
      `/api/conciliacao/${resultado.mes}/fatura`,
      { method: 'POST', body: form },
      'Não foi possível enviar a fatura. Tente de novo.'
    )
    if (ok) limparArquivoDaFatura()
  }

  async function removerFatura() {
    if (!resultado) return
    await acaoDaFatura(
      'remocao',
      `/api/conciliacao/${resultado.mes}/fatura`,
      { method: 'DELETE' },
      'Não foi possível remover a fatura. Tente de novo.'
    )
  }

  async function trocarCategoriaDaCompra(compraId: number, categoria: string) {
    if (!resultado) return
    await acaoDaFatura(
      compraId,
      `/api/conciliacao/${resultado.mes}/fatura/${compraId}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ categoria }),
      },
      'Não foi possível gravar a categoria. Tente de novo.'
    )
  }

  const faltando = CAMPOS.filter(c => !arquivos[c.campo]).map(c => c.rotulo)
  const podeEnviar = mesValido(mes) && faltando.length === 0

  async function enviar() {
    // O botão já está desabilitado nesses casos; a guarda existe para que dois
    // cliques em corrida não gravem o mês duas vezes.
    if (enviandoAgora.current || !podeEnviar) return
    enviandoAgora.current = true
    setEnviando(true)
    setErroEnvio(null)
    // O mês do envio é o do clique, fixado aqui. O campo fica desabilitado
    // enquanto sobe, mas ler `mes` de novo lá embaixo deixaria o resultado
    // rotulado com um mês diferente do que foi enviado se ele mudasse no meio.
    const mesEnvio = mes
    try {
      const form = new FormData()
      form.append('mes', mesEnvio)
      for (const { campo } of CAMPOS) form.append(campo, arquivos[campo]!)

      const res = await fetch('/api/conciliacao', { method: 'POST', body: form })
      const corpo: unknown = await res.json().catch(() => null)
      if (!res.ok) {
        // O motivo do servidor é a única coisa que diz o que fazer: "o extrato
        // do Itaú cobre 14/09 a 14/10" manda reexportar, "erro ao enviar" não
        // manda nada. A genérica só entra quando o corpo não explica.
        setErroEnvio(motivoDo(corpo) || 'Não foi possível enviar os arquivos. Tente de novo.')
        return
      }
      if (!resultadoValido(corpo)) {
        // Gravou (o servidor respondeu 200), mas a tela não entendeu o corpo.
        setErroEnvio('O envio foi aceito, mas a resposta veio fora do formato. Recarregue a página para ver o mês.')
        return
      }
      // Um GET de mês em voo não pode sobrescrever o que o envio devolveu (e
      // levar embora o detalhe da leitura, que só existe aqui — o aviso o
      // banco guarda, as contagens linha por linha não).
      pedido.current++
      enviados.current.add(mesEnvio)
      setMeses(p =>
        p.some(x => x.mes === mesEnvio)
          ? p
          : [...p, { mes: mesEnvio, criadoEm: new Date().toISOString(), criadoPor: null }].sort((a, b) => b.mes.localeCompare(a.mes))
      )
      setResultado(corpo)
      setAberta(null)
      setArquivos(SEM_ARQUIVO)
      for (const { campo } of CAMPOS) {
        const el = inputs.current[campo]
        if (el) el.value = ''
      }
    } catch {
      setErroEnvio('Não foi possível enviar os arquivos. Tente de novo.')
    } finally {
      enviandoAgora.current = false
      setEnviando(false)
    }
  }

  const abaBotao = (chave: 'conciliacao' | 'custos', rotulo: string) => (
    <button
      type="button"
      onClick={() => setAba(chave)}
      aria-pressed={aba === chave}
      className={`px-3 py-1.5 text-sm font-medium rounded-t-lg border-b-2 transition-colors ${
        aba === chave
          ? 'border-violet-600 text-violet-700'
          : 'border-transparent text-gray-500 hover:text-gray-700'
      }`}
    >
      {rotulo}
    </button>
  )

  return (
    <div className="space-y-4">
      {/* Envio. Fica em cima e sempre visível: é a única ação da aba, e não pode
          desaparecer quando a leitura do mês falha. */}
      <section className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm space-y-3">
        <div className="flex flex-wrap items-end gap-4">
          <div className="flex flex-col gap-1">
            <label htmlFor="conc-mes" className="text-xs font-medium text-gray-600">Mês de referência</label>
            {/* Travado enquanto sobe: trocar o mês no meio do envio faria o
                resultado que volta aparecer debaixo do mês errado. */}
            <input
              id="conc-mes"
              type="month"
              value={mes}
              disabled={enviando}
              onChange={e => trocarMes(e.target.value)}
              className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400 disabled:opacity-60"
            />
          </div>
          {meses.length > 0 && (
            <p className="text-xs text-gray-500 flex flex-wrap items-center gap-2">
              <span>Já enviados:</span>
              {meses.map(m => (
                <button
                  key={m.mes}
                  type="button"
                  disabled={enviando}
                  onClick={() => trocarMes(m.mes)}
                  className={`px-2 py-0.5 rounded-full border text-xs disabled:opacity-60 ${
                    m.mes === mes
                      ? 'border-violet-300 bg-violet-50 text-violet-700'
                      : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  {mesBr(m.mes)}
                </button>
              ))}
            </p>
          )}
        </div>

        {erroMeses && <p className="text-xs text-amber-800">{erroMeses}</p>}

        <div className="grid gap-3 sm:grid-cols-2 border-t border-gray-100 pt-3">
          {CAMPOS.map(({ campo, rotulo, ext, accept }) => (
            <div key={campo} className="flex flex-col gap-1">
              <label htmlFor={`conc-${campo}`} className="text-xs font-medium text-gray-600">
                {rotulo} ({ext})
              </label>
              <input
                id={`conc-${campo}`}
                ref={el => { inputs.current[campo] = el }}
                type="file"
                accept={accept}
                onChange={e => {
                  const f = e.target.files?.[0] ?? null
                  setArquivos(a => ({ ...a, [campo]: f }))
                  setErroEnvio(null)
                }}
                className="block w-full text-xs text-gray-600 file:mr-2 file:py-1 file:px-2 file:rounded-lg file:border file:border-gray-300 file:bg-gray-50 file:text-xs file:text-gray-700"
              />
            </div>
          ))}
        </div>

        {faltando.length > 0 && faltando.length < CAMPOS.length && (
          <p className="text-xs text-amber-800">Falta anexar: {faltando.join(', ')}.</p>
        )}
        {!mesValido(mes) && <p className="text-xs text-amber-800">Escolha o mês de referência dos arquivos.</p>}

        <div className="flex items-center gap-3 flex-wrap">
          <button
            type="button"
            onClick={enviar}
            disabled={enviando || !podeEnviar}
            className="px-3 py-1.5 rounded-lg text-sm font-medium bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-50"
          >
            {enviando ? 'Conciliando...' : 'Enviar e conciliar'}
          </button>
          <p className="text-xs text-gray-500">Reenviar um mês substitui a conciliação anterior.</p>
        </div>

        {erroEnvio && (
          <p role="alert" className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-3 whitespace-pre-line">
            {erroEnvio}
          </p>
        )}
      </section>

      {resultado?.leitura && <CartaoLeitura leitura={resultado.leitura} />}

      {erroMes && <p role="alert" className="text-sm text-red-600">{erroMes}</p>}

      {!resultado ? (
        // Com `erroMes` já há a mensagem vermelha acima: um cartão vazio ao
        // lado dela só ocuparia a tela.
        erroMes ? null : (
          <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm text-center text-sm text-gray-500">
            {carregando
              ? 'Carregando...'
              : mesValido(mes)
                ? `A conciliação de ${mesBr(mes)} ainda não foi enviada. Escolha os quatro arquivos acima e envie.`
                : 'Escolha um mês para ver a conciliação, ou envie os quatro arquivos de um mês novo.'}
          </div>
        )
      ) : (
        <>
          <div className="flex items-center gap-1 border-b border-gray-200">
            {abaBotao('conciliacao', 'Conciliação')}
            {abaBotao('custos', 'Custos')}
          </div>

          {resultado.enviadoEm && (
            <p className="text-xs text-gray-400">
              {mesBr(resultado.mes)} enviado em{' '}
              {new Date(resultado.enviadoEm).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
              {resultado.enviadoPor ? ` por ${resultado.enviadoPor}` : ''}.
            </p>
          )}

          {aba === 'conciliacao' ? (
            <div className="space-y-4">
              {/* `leitura` ausente é mês gravado antes da conferência: passa
                  `undefined` e o bloco não diz nada sobre saldo. */}
              {resultado.bancos.map(b => (
                <BlocoBanco key={b.banco} r={b} conferencia={resultado.leitura?.[b.banco].conferenciaSaldo} />
              ))}
            </div>
          ) : (
            <div className="space-y-4">
              {resultado.comparativo.mesAnterior === null && (
                <p className="text-sm text-gray-600 bg-gray-50 border border-gray-200 rounded-xl p-3">
                  Este é o primeiro mês conciliado: não há mês anterior para comparar. Os valores abaixo são só
                  deste mês.
                </p>
              )}
              {/* Antes das categorias: é a fatura que explica por que o total
                  de Despesas abaixo é menor (e o de Receitas maior) do que
                  antes de ela ser enviada. */}
              <CartaoFatura
                fatura={resultado.fatura ?? null}
                lancadoFechado={lancadoNoCartao(resultado.comparativo.despesas)}
                mesAnterior={resultado.comparativo.mesAnterior}
                arquivo={faturaArquivo}
                escolher={f => {
                  setFaturaArquivo(f)
                  setErroFatura(null)
                }}
                inputRef={el => {
                  inputFatura.current = el
                }}
                enviar={enviarFatura}
                remover={removerFatura}
                trocar={trocarCategoriaDaCompra}
                acao={acaoFatura}
                erro={erroFatura}
              />
              <BlocoCategorias
                titulo="Despesas"
                linhas={resultado.comparativo.despesas}
                receita={false}
                mes={resultado.mes}
                mesAnterior={resultado.comparativo.mesAnterior}
                aberta={aberta}
                abrir={setAberta}
              />
              <BlocoCategorias
                titulo="Receitas"
                linhas={resultado.comparativo.receitas}
                receita
                mes={resultado.mes}
                mesAnterior={resultado.comparativo.mesAnterior}
                aberta={aberta}
                abrir={setAberta}
              />
              <ResultadoDoMes
                receitas={resultado.comparativo.receitas}
                despesas={resultado.comparativo.despesas}
                mes={resultado.mes}
                mesAnterior={resultado.comparativo.mesAnterior}
              />
            </div>
          )}
        </>
      )}
    </div>
  )
}
