import { dataBrParaIso, type Banco, type LancamentoSistema, type PlanilhaLida } from './tipos'

// Leitor das duas planilhas que o BPO exporta do sistema contábil: contas
// recebidas e contas pagas. Têm o MESMO cabeçalho, exceto a última coluna
// ("Número NFS-e" só existe nas recebidas) — por isso 15 colunas numa e 16 na
// outra, e por isso cada coluna é achada pelo NOME, nunca pela posição.
//
// Este arquivo não abre arquivo nenhum: recebe a matriz de linhas que o leitor
// de xlsx já devolveu. Fica puro, testável sem fixture binária, e o lugar que
// depende de biblioteca continua sendo só a rota.
//
// O CPF/CNPJ existe na planilha e NÃO é lido: não serve a nada na conciliação
// e é dado pessoal de terceiro. O que não entra não vaza.

/** Nomes de coluna, como aparecem no arquivo real. */
const COL = {
  pagamento: 'data de pagamento',
  competencia: 'competência',
  nome: 'nome',
  descricao: 'descrição',
  categoria: 'categoria',
  banco: 'banco',
} as const

const BANCOS: Record<string, Banco> = {
  unicred: 'unicred',
  'itaú': 'itau',
  itau: 'itau',
}

function texto(celula: unknown): string {
  if (celula === null || celula === undefined) return ''
  if (typeof celula === 'string') return celula.trim()
  if (typeof celula === 'number' || typeof celula === 'boolean') return String(celula)
  return '' // objeto (fórmula, rich text, data): não é texto que se saiba ler
}

function chave(celula: unknown): string {
  return texto(celula).toLowerCase()
}

/**
 * "362.80" → 36280, "-10000" → -1000000. A coluna de valor vem com PONTO
 * decimal (é o que o sistema do BPO exporta), e a conta é feita em inteiros:
 * parte inteira × 100 + centavos. Passar por `parseFloat(x) * 100` é o
 * caminho conhecido para perder um centavo em arredondamento binário, e num
 * relatório de conciliação um centavo é uma divergência.
 *
 * Devolve null quando não é um número — a linha é descartada e contada, nunca
 * lida como zero. Formato brasileiro ("1.234,56") cai aqui de propósito: com
 * ponto de milhar e vírgula decimal no mesmo texto, adivinhar qual é qual erra
 * por um fator de mil. Melhor a tela avisar que a planilha mudou de formato.
 */
export function pontoParaCentavos(bruto: unknown): number | null {
  // Number → string pela representação curta ("362.80"), que é exata; depois a
  // conta é só com inteiros.
  const t = typeof bruto === 'number' ? (Number.isFinite(bruto) ? String(bruto) : '') : texto(bruto)
  const m = /^(-)?(\d+)(?:\.(\d+))?$/.exec(t.replace(/\s/g, ''))
  if (!m) return null
  const [, sinal, inteiro, decimal = ''] = m
  const centavos = Number((decimal + '00').slice(0, 2))
  // 3ª casa decimal arredonda para cima a partir de 5 (dinheiro não tem
  // milésimo, mas truncar em silêncio comeria um centavo se aparecer).
  const extra = decimal.length > 2 && Number(decimal[2]) >= 5 ? 1 : 0
  const total = Number(inteiro) * 100 + centavos + extra
  if (!Number.isSafeInteger(total)) return null
  // `total !== 0` evita devolver -0, que soma como zero mas não é igual a zero
  // em comparação estrita e só serviria para confundir quem debugar depois.
  return sinal && total !== 0 ? -total : total
}

export function lerPlanilha(linhas: unknown[][]): PlanilhaLida {
  const vazio: PlanilhaLida = { lancamentos: [], semDataPagamento: 0, bancoDesconhecido: 0, semValor: 0 }
  const [cabecalho, ...dados] = linhas
  if (!cabecalho) return vazio

  const onde = (nome: string) => cabecalho.findIndex(c => chave(c) === nome)
  const i = {
    pagamento: onde(COL.pagamento),
    competencia: onde(COL.competencia),
    nome: onde(COL.nome),
    descricao: onde(COL.descricao),
    categoria: onde(COL.categoria),
    banco: onde(COL.banco),
    // A coluna de valor é a que COMEÇA com "Valor": o nome completo no arquivo
    // real é "Valor categoria/centro de custo" e não vale apostar nele.
    valor: cabecalho.findIndex(c => chave(c).startsWith('valor')),
  }

  // Sem as colunas essenciais não é a planilha do BPO. Estourar é melhor que
  // devolver lista vazia: quem subiu o arquivo errado precisa ser avisado, e
  // não ver uma conciliação "sem divergências".
  const faltando = (['pagamento', 'valor', 'banco', 'categoria', 'nome'] as const).filter(k => i[k] < 0)
  if (faltando.length) {
    throw new Error(`Planilha não reconhecida: faltam as colunas ${faltando.join(', ')}. Esperado o export de contas recebidas/pagas do sistema contábil.`)
  }

  const r: PlanilhaLida = { ...vazio, lancamentos: [] }
  for (const linha of dados) {
    // Linha inteiramente vazia é rodapé/sobra do export, não é descarte.
    if (!linha || linha.every(c => texto(c) === '')) continue

    const data = dataBrParaIso(texto(linha[i.pagamento]))
    if (!data) {
      r.semDataPagamento++
      continue
    }
    const banco = BANCOS[chave(linha[i.banco])]
    if (!banco) {
      r.bancoDesconhecido++
      continue
    }
    const centavos = pontoParaCentavos(linha[i.valor])
    if (centavos === null) {
      r.semValor++
      continue
    }
    r.lancamentos.push({
      data,
      competencia: i.competencia < 0 ? null : dataBrParaIso(texto(linha[i.competencia])),
      centavos,
      banco,
      nome: texto(linha[i.nome]),
      descricao: i.descricao < 0 ? null : texto(linha[i.descricao]) || null,
      categoria: texto(linha[i.categoria]),
    })
  }
  return r
}
