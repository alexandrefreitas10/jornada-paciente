// Ativos que a clínica controla de perto. Os registros de estoque são LOTES —
// o mesmo ativo aparece em vários, de propósito, e assim continua na aba
// Estoque Atual. Este módulo existe só para o relatório de reposição, onde
// olhar lote a lote faz o sistema mentir: hoje ele pede HMB duas vezes
// alegando estoque zero, com 21 unidades em "HIDROXIMETILBUTIRATO 2,5% 2ML".

export const LIMITE_PADRAO = 5
export const LIMITE_CONTROLADO = 30

export interface AtivoControlado {
  nome: string
  limite: number
  padroes: RegExp[]
}

// Minúsculas, sem acento, e qualquer coisa que não seja letra ou número vira
// espaço. É o que faz "POOL COGNICAO - 2ML" e "Pool Cognição 2ml" caírem no
// mesmo lugar sem precisar de uma entrada para cada variação.
export function normalizarNome(nome: string): string {
  return nome
    .normalize('NFD')
    .replace(/\p{M}/gu, '')   // tira os acentos que o NFD separou
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

// A ORDEM IMPORTA: o mais específico vem primeiro. Se "vitamina d 600 ui"
// fosse testado antes, engoliria "vitamina d 600 ui k2" e "vitamina d 600 adek".
export const ATIVOS: AtivoControlado[] = [
  // O ".*" cobre "600 UI + K2", "600 UI com K2" e "600 + K2" — o que importa é
  // que estes dois sejam testados ANTES do padrão da D600 pura, logo abaixo.
  { nome: 'Vitamina D 600 UI + K2', limite: LIMITE_CONTROLADO, padroes: [/vitamina d 600.*k2/] },
  { nome: 'Vitamina D 600 ADEK', limite: LIMITE_CONTROLADO, padroes: [/vitamina d 600.*adek/] },
  { nome: 'Vitamina D 600 UI', limite: LIMITE_CONTROLADO, padroes: [/vitamina d 600 ui/] },

  { nome: 'Vitamina C 440 mg', limite: LIMITE_CONTROLADO, padroes: [/vitamina c 440/] },
  { nome: 'Vitamina C 20%', limite: LIMITE_CONTROLADO, padroes: [/vitamina c 20\b/] },

  // Sais diferentes, compras diferentes — decisão do dono.
  { nome: 'Sulfato de Magnésio', limite: LIMITE_CONTROLADO, padroes: [/sulfato de magnesio/] },
  { nome: 'Magnésio 400 mg', limite: LIMITE_CONTROLADO, padroes: [/^magnesio 400/] },

  { nome: 'HMB', limite: LIMITE_CONTROLADO, padroes: [/\bhmb\b/, /hidroximetilbutirato/] },
  { nome: 'NAC', limite: LIMITE_CONTROLADO, padroes: [/\bnac\b/, /acetilcisteina/] },
  { nome: 'L-carnitina', limite: LIMITE_CONTROLADO, padroes: [/\bl carnitina\b/, /\blcarnitina\b/] },
  { nome: 'L-baiba', limite: LIMITE_CONTROLADO, padroes: [/baiba/] },
  { nome: 'Metilcobalamina', limite: LIMITE_CONTROLADO, padroes: [/metilcobalamina/] },
  { nome: 'Coenzima Q10', limite: LIMITE_CONTROLADO, padroes: [/coenzima q\s?10/, /\bcoq10\b/] },
  { nome: 'Curcumina', limite: LIMITE_CONTROLADO, padroes: [/curcumina/] },
  { nome: 'Pill Food', limite: LIMITE_CONTROLADO, padroes: [/pill food/] },
  { nome: 'Resveratrol', limite: LIMITE_CONTROLADO, padroes: [/resveratrol/] },

  { nome: 'Complexo B com B1', limite: LIMITE_CONTROLADO, padroes: [/complexo b com b1/] },
  { nome: 'Complexo B sem B1', limite: LIMITE_CONTROLADO, padroes: [/complexo b sem b1/] },

  { nome: 'Pool Cognição', limite: LIMITE_CONTROLADO, padroes: [/pool cognicao/, /pool cognitivo/] },
  { nome: 'Pool Coenzimático', limite: LIMITE_CONTROLADO, padroes: [/pool coenzimatico/] },
  { nome: 'Pool de Aminoácidos', limite: LIMITE_CONTROLADO, padroes: [/pool de aminoacidos/, /pool aminoacidos/] },
  { nome: 'Pool de Minerais', limite: LIMITE_CONTROLADO, padroes: [/pool de minerais/, /pool minerais/] },
]

export function acharAtivo(nome: string): AtivoControlado | null {
  const n = normalizarNome(nome)
  if (!n) return null
  return ATIVOS.find(a => a.padroes.some(p => p.test(n))) ?? null
}

// O que o relatório precisa de cada item de estoque. Deliberadamente mínimo:
// o módulo não conhece o resto do StockItem.
export interface ItemParaAgrupar {
  id: number
  name: string
  quantity: number
  unit: string
  lot: string | null
  expiry_date: string | null
}

export interface LinhaReposicao {
  chave: string
  nome: string
  quantidade: number
  // Vazia quando a linha juntou lotes com unidades diferentes: nenhuma delas
  // descreve a soma, então nenhuma é exibida.
  unit: string
  limite: number
  // Cadastros que efetivamente têm saldo. Um lote zerado entra na soma (não
  // muda nada) mas não conta aqui — senão o relatório diz "3 cadastros somados"
  // para um ativo que tem um lote só na prateleira e dois cadastros vazios.
  registros: number
  // Zerado de ativo controlado entra na lista de compra; zerado de qualquer
  // outro item não, senão o relatório enche de cadastro de teste antigo.
  controlado: boolean
  // Só fazem sentido quando a linha veio de um registro só: somados vários
  // lotes, exibir o lote de um deles seria informação errada.
  lot: string | null
  expiry_date: string | null
}

export function agruparParaReposicao(items: ItemParaAgrupar[]): LinhaReposicao[] {
  const porChave = new Map<string, LinhaReposicao>()

  for (const item of items) {
    const ativo = acharAtivo(item.name)
    const chave = ativo ? `ativo:${ativo.nome}` : `item:${item.id}`

    let linha = porChave.get(chave)
    if (!linha) {
      linha = {
        chave,
        nome: ativo ? ativo.nome : item.name.trim(),
        quantidade: 0,
        // Semente: vale só enquanto nenhum lote com saldo aparecer, o que é o
        // caso de um ativo inteiro zerado.
        unit: item.unit,
        limite: ativo ? ativo.limite : LIMITE_PADRAO,
        registros: 0,
        controlado: ativo !== null,
        lot: null,
        expiry_date: null,
      }
      porChave.set(chave, linha)
    }

    linha.quantidade += item.quantity

    // Lote vazio não é lote que você tem: não conta como cadastro e não apaga
    // o lote nem a validade de quem ainda tem saldo.
    if (item.quantity === 0) continue

    if (linha.registros === 0) {
      linha.unit = item.unit
      linha.lot = item.lot
      linha.expiry_date = item.expiry_date
    } else {
      linha.lot = null
      linha.expiry_date = null
      // Lotes com unidades diferentes: nenhuma delas descreve a soma, então
      // não exibe nenhuma. Sem caixa porque "un" e "UN" são a mesma coisa.
      if (linha.unit.toLowerCase() !== item.unit.toLowerCase()) linha.unit = ''
    }
    linha.registros += 1
  }

  return [...porChave.values()]
}

// Regra da lista de compra, num lugar onde dá para testar. O zerado só entra se
// for ativo do catálogo: os demais cadastros zerados são cadastro velho e de
// teste, e só sujariam a lista. Saldo negativo entra sempre — é erro de
// lançamento e o relatório marca como tal.
export function precisaRepor(l: LinhaReposicao): boolean {
  return l.quantidade < l.limite && (l.quantidade !== 0 || l.controlado)
}
