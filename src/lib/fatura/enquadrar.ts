import type { CompraCartao } from './tipos'

// Enquadramento das compras da fatura em categorias. Função PURA: nada de IA,
// nada de banco. A chamada da IA mora em `ia.ts` e entra aqui só como um mapa
// de sugestões — assim a regra de quem vence quem pode ser testada sem gastar
// um centavo de API.

/** A categoria que o BPO usa hoje para a fatura inteira — a linha opaca de
 *  R$ 25 mil que esta aba existe para abrir. Nunca é destino de uma compra:
 *  mandar a compra de volta para ela não informaria nada. */
export const CATEGORIA_CARTAO = 'Cartão de Crédito'

export const NAO_IDENTIFICADO = 'Cartão de crédito (não identificado)'

export type OrigemCategoria = 'memoria' | 'ia' | 'manual' | 'nao_identificado'

export interface CompraEnquadrada extends CompraCartao {
  categoria: string
  origem: OrigemCategoria
}

/**
 * Minúsculas, sem acento, e qualquer coisa que não seja letra ou número vira
 * espaço — a mesma ideia de `normalizarNome` em `stock-actives.ts`. É uma CÓPIA
 * de propósito: lá a normalização serve a nomes de produto e pode mudar quando
 * o estoque mudar; aqui ela é a chave de uma memória GRAVADA, e se mudar o dono
 * perde as correções que já fez.
 */
function normalizar(nome: string): string {
  return nome
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/** Pelo menos um dígito e 6+ caracteres: o formato do id de transação. */
const ID_DE_TRANSACAO = (token: string) => token.length >= 6 && /\d/.test(token)

/**
 * Nome do estabelecimento só para COMPARAR: "MP*APIONEIRA" e "MP* APIONEIRA"
 * são o mesmo lugar.
 *
 * Além de normalizar, derruba o último token quando ele parece id de transação.
 * MEDIDO nas duas faturas reais: 141 compras, 91 nomes crus distintos, e o
 * descritor do cartão cola um id no fim do nome do mesmo anunciante 19 vezes
 * ("FACEBK*D8VBD4NJX4", "FACEBK*7LGVB42KX4", ...). Sem o corte, a memória
 * erraria justamente quem mais repete; com ele, 91 nomes caem para 73 chaves.
 *
 * O piso de 6 caracteres é o que impede o corte de comer "LOJA 2" e "LOJA 3",
 * que são lugares diferentes. E o corte nunca se aplica a um nome de um único
 * token: chave vazia juntaria estabelecimentos sem nenhuma relação.
 */
export function chaveEstabelecimento(nome: string): string {
  const tokens = normalizar(nome).split(' ').filter(Boolean)
  if (tokens.length > 1 && ID_DE_TRANSACAO(tokens[tokens.length - 1])) tokens.pop()
  return tokens.join(' ')
}

/**
 * É a linha opaca do BPO? Comparação normalizada: "Cartão de Crédito" e
 * "cartao de credito" são a MESMA linha, e quem lê a planilha não controla a
 * grafia que o BPO digitou. Mora aqui porque `CATEGORIA_CARTAO` e a
 * normalização moram aqui — duas regras de "é o cartão?" divergiriam no dia
 * em que uma delas mudasse.
 */
export function ehCategoriaCartao(categoria: string | null | undefined): boolean {
  const nome = categoria?.trim()
  return !!nome && normalizar(nome) === normalizar(CATEGORIA_CARTAO)
}

/**
 * As categorias oferecidas são as que o BPO JÁ USA no mês (mais o "não
 * identificado"). Não existe lista fixa no código de propósito: se a IA pudesse
 * devolver uma categoria que não está nos lançamentos, a comparação mês a mês
 * compararia contra uma categoria que não existe do outro lado.
 */
export function categoriasDisponiveis(categoriasDoMes: Iterable<string>): string[] {
  // A linha do cartão nunca é destino: oferecê-la de volta não informa nada.
  const vistas = new Set<string>()
  for (const c of categoriasDoMes) {
    const nome = c?.trim()
    if (!nome || ehCategoriaCartao(nome)) continue
    vistas.add(nome)
  }
  return [...vistas, NAO_IDENTIFICADO]
}

/**
 * Casa o que a IA devolveu com a grafia que o BPO usa. Tolera caixa e acento
 * diferentes ("alimentacao" → "Alimentação") porque o relatório soma por
 * categoria e duas grafias viram duas linhas. O que não casar com nenhuma
 * categoria do mês devolve null: ignorar é certo, inventar não.
 */
function resolverCategoria(valor: string | null | undefined, canonicas: Map<string, string>): string | null {
  const bruto = valor?.trim()
  if (!bruto) return null
  return canonicas.get(normalizar(bruto)) ?? null
}

/** Reindexa um mapa pela chave do estabelecimento: aceita tanto um mapa já
 *  gravado por chave quanto um com o nome cru do descritor. */
function porChave<T>(entradas: Iterable<[string, T]>): Map<string, T> {
  const saida = new Map<string, T>()
  for (const [nome, valor] of entradas) saida.set(chaveEstabelecimento(nome), valor)
  return saida
}

/**
 * Três camadas, nesta ordem: o que o dono já corrigiu vence sempre; depois o
 * que a IA sugeriu; o resto é "não identificado".
 *
 * A IA nunca sobrepõe uma escolha do dono — é isso que faz a aba melhorar com
 * o uso em vez de pedir a mesma correção todo mês. Por isso a memória também
 * NÃO é filtrada pela lista do mês: se o BPO renomear uma categoria, descartar
 * a correção do dono seria cobrá-la de novo. Só a sugestão da IA passa pelo
 * filtro, porque ela é um palpite, não uma decisão.
 *
 * Falha da IA custa sugestão, nunca compra: toda compra que entra sai, com o
 * mesmo valor, e no máximo cai em "não identificado".
 */
export function enquadrar(
  compras: CompraCartao[],
  memoria: Map<string, string>,
  sugestaoIa: Map<string, string | null>,
  categorias: Iterable<string>,
): CompraEnquadrada[] {
  const canonicas = new Map<string, string>()
  for (const c of categoriasDisponiveis(categorias)) {
    const k = normalizar(c)
    if (!canonicas.has(k)) canonicas.set(k, c)
  }

  const lembrada = porChave(memoria)
  const sugerida = porChave(sugestaoIa)

  return compras.map(compra => {
    const chave = chaveEstabelecimento(compra.estabelecimento)
    // Compra sem nome legível não tem identidade: se caísse na chave vazia,
    // uma correção do dono numa linha dessas se espalharia para todas as
    // outras linhas sem nome, que não têm relação entre si.
    if (!chave) return { ...compra, categoria: NAO_IDENTIFICADO, origem: 'nao_identificado' as const }

    const doDono = lembrada.get(chave)?.trim()
    if (doDono) return { ...compra, categoria: doDono, origem: 'memoria' as const }

    const daIa = resolverCategoria(sugerida.get(chave), canonicas)
    if (daIa && daIa !== NAO_IDENTIFICADO) return { ...compra, categoria: daIa, origem: 'ia' as const }

    return { ...compra, categoria: NAO_IDENTIFICADO, origem: 'nao_identificado' as const }
  })
}
