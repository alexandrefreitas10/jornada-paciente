import {
  CATEGORIA_CARTAO,
  NAO_IDENTIFICADO,
  categoriasDisponiveis,
  chaveEstabelecimento,
  enquadrar,
} from '@/lib/fatura/enquadrar'
import type { CompraCartao } from '@/lib/fatura/tipos'

// Nomes de estabelecimento INVENTADOS, mas com a MESMA forma dos reais: o
// descritor do cartão cola o id da transação no fim do nome. Medido nas duas
// faturas: 141 compras, 91 nomes crus distintos, 73 chaves.
const compra = (estabelecimento: string, centavos = 10000): CompraCartao => ({
  data: '2026-09-03',
  estabelecimento,
  parcela: null,
  centavos,
  internacional: false,
})

const CATEGORIAS = ['Alimentação', 'Marketing', 'Material de consumo']

describe('chaveEstabelecimento é idempotente', () => {
  it('aplicar duas vezes dá o mesmo resultado', () => {
    // A chave é a chave primária da tabela que guarda as correções do dono, e
    // `porChave` reindexa mapas já indexados. Se a segunda aplicação mudasse
    // o valor, a correção dele seria procurada numa chave inexistente.
    for (const nome of ['ABC 123456 789012', 'ANUNCIO*K1QWE8ZP2M', 'LOJA 2', 'MP*APIONEIRA', 'SO 999999']) {
      expect(chaveEstabelecimento(chaveEstabelecimento(nome))).toBe(chaveEstabelecimento(nome))
    }
  })
})

describe('chaveEstabelecimento', () => {
  it('ignora pontuação, espaço e caixa: é o mesmo lugar', () => {
    expect(chaveEstabelecimento('MP*APIONEIRA')).toBe(chaveEstabelecimento('MP* APIONEIRA'))
    expect(chaveEstabelecimento('PADARIA PÃO QUENTE')).toBe(chaveEstabelecimento('padaria pao quente'))
  })

  it('derruba o id da transação colado no fim do nome', () => {
    // Na fatura real um único anunciante aparece com 19 nomes crus diferentes,
    // todos variando só neste sufixo. Sem o corte, a memória nunca acertaria
    // justamente o estabelecimento que mais repete.
    const a = chaveEstabelecimento('ANUNCIO*K1QWE8ZP2M')
    expect(chaveEstabelecimento('ANUNCIO*R4TYU7HN5B')).toBe(a)
    expect(chaveEstabelecimento('ANUNCIO*527385EJX4')).toBe(a)
    expect(a).toBe('anuncio')

    expect(chaveEstabelecimento('BUSCADOR ADS1234567890')).toBe('buscador')
    expect(chaveEstabelecimento('BUSCADOR ADS1111111111')).toBe('buscador')
  })

  it('NÃO derruba token curto com número: LOJA 2 e LOJA 3 são lojas diferentes', () => {
    expect(chaveEstabelecimento('LOJA 2')).not.toBe(chaveEstabelecimento('LOJA 3'))
    expect(chaveEstabelecimento('POSTO 24H')).toBe('posto 24h')
    // o piso de 6 caracteres é o que separa os dois casos
    expect(chaveEstabelecimento('FARMACIA 123456')).toBe('farmacia')
    expect(chaveEstabelecimento('FARMACIA 12345')).toBe('farmacia 12345')
  })

  it('token longo SEM número não é id de transação: fica no nome', () => {
    expect(chaveEstabelecimento('MERCADO CENTRAL')).toBe('mercado central')
    expect(chaveEstabelecimento('DROGARIA POPULAR')).toBe('drogaria popular')
  })

  it('nome de um único token nunca vira chave vazia', () => {
    // senão todo estabelecimento assim cairia na MESMA chave ('') e a memória
    // de um viraria a categoria de todos.
    expect(chaveEstabelecimento('ABC9876543')).toBe('abc9876543')
    expect(chaveEstabelecimento('UBER*TRIP')).toBe('uber trip')
  })

  it('nome vazio devolve chave vazia, sem explodir', () => {
    expect(chaveEstabelecimento('')).toBe('')
    expect(chaveEstabelecimento('   ---   ')).toBe('')
  })
})

describe('categoriasDisponiveis', () => {
  it('são as do BPO mais o "não identificado"', () => {
    const cats = categoriasDisponiveis(CATEGORIAS)
    expect(cats).toContain('Alimentação')
    expect(cats).toContain('Marketing')
    expect(cats).toContain(NAO_IDENTIFICADO)
  })

  it('não repete categoria nem devolve a linha do próprio cartão', () => {
    const cats = categoriasDisponiveis(['Marketing', 'Marketing', CATEGORIA_CARTAO, '  '])
    expect(cats.filter(c => c === 'Marketing')).toHaveLength(1)
    expect(cats).not.toContain(CATEGORIA_CARTAO)
    expect(cats).not.toContain('  ')
  })

  it('a linha do cartão sai mesmo escrita com outra caixa/acento', () => {
    expect(categoriasDisponiveis(['cartao de credito', 'Marketing']))
      .toEqual(['Marketing', NAO_IDENTIFICADO])
  })
})

describe('enquadrar', () => {
  it('lista vazia devolve lista vazia', () => {
    expect(enquadrar([], new Map(), new Map(), CATEGORIAS)).toEqual([])
  })

  it('a memória do dono vence a IA', () => {
    const memoria = new Map([[chaveEstabelecimento('PADARIA EXEMPLO'), 'Alimentação']])
    const ia = new Map([[chaveEstabelecimento('PADARIA EXEMPLO'), 'Marketing']])
    const [r] = enquadrar([compra('PADARIA EXEMPLO')], memoria, ia, CATEGORIAS)
    expect(r).toMatchObject({ categoria: 'Alimentação', origem: 'memoria' })
  })

  it('a IA preenche o que a memória não sabe', () => {
    const ia = new Map([[chaveEstabelecimento('ANUNCIO*K1QWE8ZP2M'), 'Marketing']])
    const [r] = enquadrar([compra('ANUNCIO*K1QWE8ZP2M')], new Map(), ia, CATEGORIAS)
    expect(r).toMatchObject({ categoria: 'Marketing', origem: 'ia' })
  })

  it('sem memória e sem IA vira não identificado', () => {
    const [r] = enquadrar([compra('LUGAR DESCONHECIDO')], new Map(), new Map(), CATEGORIAS)
    expect(r).toMatchObject({ categoria: NAO_IDENTIFICADO, origem: 'nao_identificado' })
  })

  it('categoria que a IA inventou é IGNORADA — não entra categoria que o BPO não usa', () => {
    const ia = new Map([[chaveEstabelecimento('LUGAR NOVO'), 'Despesas diversas do cartão']])
    const [r] = enquadrar([compra('LUGAR NOVO')], new Map(), ia, CATEGORIAS)
    expect(r).toMatchObject({ categoria: NAO_IDENTIFICADO, origem: 'nao_identificado' })
  })

  it('categoria certa com caixa/acento diferentes vira a grafia do BPO', () => {
    // o relatório compara categoria por categoria: 'alimentacao' e 'Alimentação'
    // não podem virar duas linhas.
    const ia = new Map([[chaveEstabelecimento('MERCADO EXEMPLO'), 'alimentacao']])
    const [r] = enquadrar([compra('MERCADO EXEMPLO')], new Map(), ia, CATEGORIAS)
    expect(r).toMatchObject({ categoria: 'Alimentação', origem: 'ia' })
  })

  it('IA sem palpite (null) e IA dizendo "não identificado" caem no mesmo lugar', () => {
    const ia = new Map<string, string | null>([
      [chaveEstabelecimento('SEM PALPITE'), null],
      [chaveEstabelecimento('ASSUMIU QUE NAO SABE'), NAO_IDENTIFICADO],
    ])
    const rs = enquadrar([compra('SEM PALPITE'), compra('ASSUMIU QUE NAO SABE')], new Map(), ia, CATEGORIAS)
    expect(rs.every(r => r.categoria === NAO_IDENTIFICADO && r.origem === 'nao_identificado')).toBe(true)
  })

  it('MP*APIONEIRA e MP* APIONEIRA usam a mesma memória', () => {
    const memoria = new Map([[chaveEstabelecimento('MP*APIONEIRA'), 'Material de consumo']])
    const rs = enquadrar([compra('MP*APIONEIRA'), compra('MP* APIONEIRA')], memoria, new Map(), CATEGORIAS)
    expect(rs.map(r => r.categoria)).toEqual(['Material de consumo', 'Material de consumo'])
    expect(rs.every(r => r.origem === 'memoria')).toBe(true)
  })

  it('memória gravada com o nome cru também casa (a chave é aplicada na entrada)', () => {
    const memoria = new Map([['MP* APIONEIRA', 'Material de consumo']])
    const [r] = enquadrar([compra('MP*APIONEIRA')], memoria, new Map(), CATEGORIAS)
    expect(r).toMatchObject({ categoria: 'Material de consumo', origem: 'memoria' })
  })

  it('todas as variações do mesmo anunciante herdam a única correção do dono', () => {
    // é isto que faz o dono não recategorizar 19 linhas todo mês
    const memoria = new Map([[chaveEstabelecimento('ANUNCIO*K1QWE8ZP2M'), 'Marketing']])
    const compras = ['ANUNCIO*K1QWE8ZP2M', 'ANUNCIO*R4TYU7HN5B', 'ANUNCIO*V9XCZ2LK6D'].map(n => compra(n))
    expect(enquadrar(compras, memoria, new Map(), CATEGORIAS).map(r => r.categoria))
      .toEqual(['Marketing', 'Marketing', 'Marketing'])
  })

  it('memória vazia ou só espaço não conta como escolha do dono', () => {
    const memoria = new Map([[chaveEstabelecimento('LOJA EXEMPLO'), '   ']])
    const ia = new Map([[chaveEstabelecimento('LOJA EXEMPLO'), 'Marketing']])
    const [r] = enquadrar([compra('LOJA EXEMPLO')], memoria, ia, CATEGORIAS)
    expect(r).toMatchObject({ categoria: 'Marketing', origem: 'ia' })
  })

  it('a memória do dono vale mesmo que a categoria não esteja na lista do mês', () => {
    // o BPO renomeou/parou de usar a categoria: descartar a correção dele seria
    // pedir a mesma correção de novo — exatamente o que mata a aba.
    const memoria = new Map([[chaveEstabelecimento('LOJA EXEMPLO'), 'Categoria de outro mês']])
    const [r] = enquadrar([compra('LOJA EXEMPLO')], memoria, new Map(), CATEGORIAS)
    expect(r).toMatchObject({ categoria: 'Categoria de outro mês', origem: 'memoria' })
  })

  it('IA falhando não perde compra nenhuma: só perde a sugestão', () => {
    const compras = [compra('UM', 100), compra('DOIS', 200), compra('TRES', 300)]
    const rs = enquadrar(compras, new Map(), new Map(), CATEGORIAS)
    expect(rs).toHaveLength(3)
    expect(rs.reduce((s, r) => s + r.centavos, 0)).toBe(600)
    expect(rs.map(r => r.estabelecimento)).toEqual(['UM', 'DOIS', 'TRES'])
  })

  it('compra sem nome legível não divide memória com as outras', () => {
    // a chave vazia não pode ser um balde onde cabe todo mundo
    const memoria = new Map([['', 'Marketing']])
    const rs = enquadrar([compra(''), compra('  ***  ')], memoria, new Map(), CATEGORIAS)
    expect(rs.every(r => r.categoria === NAO_IDENTIFICADO && r.origem === 'nao_identificado')).toBe(true)
  })

  it('os campos da compra atravessam intactos', () => {
    const c: CompraCartao = {
      data: '2026-08-27',
      estabelecimento: 'FORNECEDOR EXEMPLO',
      parcela: '2/5',
      centavos: 123456,
      internacional: true,
    }
    expect(enquadrar([c], new Map(), new Map(), CATEGORIAS)[0]).toMatchObject(c)
  })
})
