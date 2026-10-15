import type { LancamentoSistema } from './tipos'

// O comparativo mês a mês: o que subiu e o que caiu, em reais.
//
// Duas armadilhas moram aqui, e as duas estão fixadas por teste:
//
// 1. DESPESA É NEGATIVA. A categoria que mais subiu é a que ficou MAIS
//    negativa. Ordenar despesa por `diferenca` decrescente, como se ordena
//    receita, devolve a lista exatamente ao contrário — e o relatório aponta
//    como "maior alta" justamente o gasto que caiu.
// 2. ORDEM É EM REAIS, NÃO EM PERCENTUAL. 100 → 400 é +300% e são 300 reais;
//    30.000 → 38.000 é +26% e são 8.000 reais. Quem decide onde cortar custo
//    olha o real.
//
// E uma regra de honestidade: categoria que existe num mês e não no outro
// entra com zero do outro lado. Omiti-la esconderia justamente o gasto que
// nasceu ou morreu no mês.

export interface LinhaComparativo {
  /** Categoria, ou nome do fornecedor quando se abre o detalhe de uma. */
  chave: string
  /** Centavos do mês atual. */
  atual: number
  /** Centavos do mês anterior. */
  anterior: number
  /** `atual - anterior`. Em despesa, negativo = gasto subiu. */
  diferenca: number
  /** Variação sobre o mês anterior, em %, duas casas. Em despesa, positivo =
   *  gasto subiu. `null` quando o mês anterior era zero: não há base de
   *  comparação, e isso não é "infinito" nem "100%". */
  percentual: number | null
}

type Soma = Map<string, number>

function somarPor(
  lancamentos: LancamentoSistema[],
  chaveDe: (l: LancamentoSistema) => string,
  aceita: (centavos: number) => boolean,
): Soma {
  const m: Soma = new Map()
  for (const l of lancamentos) {
    if (!aceita(l.centavos)) continue
    m.set(chaveDe(l), (m.get(chaveDe(l)) ?? 0) + l.centavos)
  }
  return m
}

function linha(chave: string, atual: number, anterior: number): LinhaComparativo {
  const diferenca = atual - anterior
  return {
    chave,
    atual,
    anterior,
    diferenca,
    // Divide pelo anterior COM sinal: numa lista de despesa (anterior < 0) isso
    // faz "gasto subiu" sair positivo, que é como se lê um comparativo de
    // custo. Sem base (anterior zero) não há percentual.
    percentual: anterior === 0 ? null : Math.round((diferenca / anterior) * 10000) / 100,
  }
}

/**
 * Monta as linhas do par de meses e ordena pela maior alta em reais.
 * `receita` diz de que lado a alta está: em receita, alta é subir; em despesa,
 * alta é ficar mais negativo.
 */
function montar(atual: Soma, anterior: Soma, receita: boolean): LinhaComparativo[] {
  const chaves = new Set([...atual.keys(), ...anterior.keys()])
  const alta = (l: LinhaComparativo) => (receita ? l.diferenca : -l.diferenca)
  return [...chaves]
    .map(c => linha(c, atual.get(c) ?? 0, anterior.get(c) ?? 0))
    .sort((a, b) => alta(b) - alta(a) || a.chave.localeCompare(b.chave, 'pt-BR'))
}

/**
 * Receitas e despesas por categoria, cada lista ordenada pela maior alta em
 * reais. A separação é por lançamento: entrada (> 0) vira receita, saída (< 0)
 * vira despesa. Uma categoria que tem os dois (estorno, por exemplo) aparece
 * nas duas listas com o seu lado — somar tudo num número só esconderia o
 * estorno dentro do gasto. Lançamento de valor zero não move nada e não cria
 * linha.
 */
export function compararCategorias(atual: LancamentoSistema[], anterior: LancamentoSistema[]): {
  receitas: LinhaComparativo[]
  despesas: LinhaComparativo[]
} {
  const cat = (l: LancamentoSistema) => l.categoria
  const entrada = (c: number) => c > 0
  const saida = (c: number) => c < 0
  return {
    receitas: montar(somarPor(atual, cat, entrada), somarPor(anterior, cat, entrada), true),
    despesas: montar(somarPor(atual, cat, saida), somarPor(anterior, cat, saida), false),
  }
}

/**
 * O detalhe de uma categoria: quanto cada fornecedor (a coluna "Nome") pesou
 * nos dois meses, ordenado pela maior alta em reais.
 *
 * Aqui o valor é o LÍQUIDO do fornecedor dentro da categoria — é um detalhe de
 * uma categoria que já tem lado, e quem pagou e foi estornado pesou a
 * diferença. A orientação da ordem vem do próprio dinheiro: se o total da
 * categoria nos dois meses é negativo, a lista é de gasto e "alta" é ficar
 * mais negativo.
 */
export function compararFornecedores(
  atual: LancamentoSistema[],
  anterior: LancamentoSistema[],
  categoria: string,
): LinhaComparativo[] {
  const daCategoria = (l: LancamentoSistema) => l.categoria === categoria
  const nome = (l: LancamentoSistema) => l.nome
  const tudo = () => true
  const a = somarPor(atual.filter(daCategoria), nome, tudo)
  const b = somarPor(anterior.filter(daCategoria), nome, tudo)
  const total = [...a.values(), ...b.values()].reduce((x, y) => x + y, 0)
  return montar(a, b, total >= 0).filter(l => l.atual !== 0 || l.anterior !== 0)
}

/**
 * Soma um bloco inteiro (receitas OU despesas) numa linha só, para o rodapé da
 * tabela. Mantém a mesma regra de percentual das categorias: sem base, sem
 * percentual.
 */
export function totalizar(linhas: LinhaComparativo[], chave = 'Total'): LinhaComparativo {
  const soma = (f: (l: LinhaComparativo) => number) => linhas.reduce((s, l) => s + f(l), 0)
  return linha(chave, soma(l => l.atual), soma(l => l.anterior))
}

/**
 * O resultado de caixa do mês: tudo que entrou menos tudo que saiu. Como
 * despesa já vem negativa, é uma soma.
 *
 * Decisão do dono (15/10): é o resultado de CAIXA, sem excluir nada — inclui
 * distribuição de lucros, aporte de capital e amortização de empréstimo. É o
 * número que conversa com o extrato; não é lucro contábil.
 *
 * O percentual some quando o sinal vira: de +10.000 para -5.000 "−150%" não
 * informa nada, e um número que não informa nada numa tela de dinheiro é pior
 * que um traço.
 */
export function resultadoDoMes(
  receitas: LinhaComparativo[],
  despesas: LinhaComparativo[],
): LinhaComparativo {
  const r = totalizar(receitas)
  const d = totalizar(despesas)
  const bruto = linha('Resultado do mês', r.atual + d.atual, r.anterior + d.anterior)
  const virouDeSinal = bruto.anterior !== 0 && Math.sign(bruto.atual) !== Math.sign(bruto.anterior)
  return virouDeSinal ? { ...bruto, percentual: null } : bruto
}
