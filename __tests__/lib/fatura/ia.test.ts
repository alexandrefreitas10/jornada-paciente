import type Anthropic from '@anthropic-ai/sdk'
import { chaveEstabelecimento } from '@/lib/fatura/enquadrar'
import { sugerirCategorias, type ClienteIa } from '@/lib/fatura/ia'

// NUNCA chama a API de verdade: o cliente é injetado. É a 5ª função de IA do
// projeto e divide o mesmo saldo das outras quatro.
const resposta = (texto: string, stopReason = 'end_turn') =>
  ({
    content: [{ type: 'text', text: texto }],
    stop_reason: stopReason,
  }) as unknown as Anthropic.Message

function clienteQue(impl: () => Promise<Anthropic.Message>): { cliente: ClienteIa; chamadas: number } {
  const estado = { chamadas: 0 }
  const cliente: ClienteIa = {
    messages: {
      create: async () => {
        estado.chamadas++
        return impl()
      },
    },
  }
  return { cliente, get chamadas() { return estado.chamadas } }
}

const CATEGORIAS = ['Alimentação', 'Marketing', 'Material de consumo']

describe('sugerirCategorias', () => {
  it('sem estabelecimento desconhecido não gasta chamada', async () => {
    const c = clienteQue(async () => resposta('{}'))
    expect(await sugerirCategorias([], CATEGORIAS, c.cliente)).toEqual(new Map())
    expect(c.chamadas).toBe(0)
  })

  it('sem categoria do BPO não gasta chamada (não haveria resposta aceitável)', async () => {
    const c = clienteQue(async () => resposta('{}'))
    expect(await sugerirCategorias(['LOJA EXEMPLO'], [], c.cliente)).toEqual(new Map())
    expect(c.chamadas).toBe(0)
  })

  it('devolve a sugestão indexada pela chave do estabelecimento', async () => {
    const c = clienteQue(async () => resposta('{"ANUNCIO*K1QWE8ZP2M":"Marketing","PADARIA EXEMPLO":"Alimentação"}'))
    const m = await sugerirCategorias(['ANUNCIO*K1QWE8ZP2M', 'PADARIA EXEMPLO'], CATEGORIAS, c.cliente)
    expect(m.get(chaveEstabelecimento('ANUNCIO*K1QWE8ZP2M'))).toBe('Marketing')
    expect(m.get(chaveEstabelecimento('PADARIA EXEMPLO'))).toBe('Alimentação')
  })

  it('pergunta uma vez por estabelecimento, não por compra', async () => {
    const c = clienteQue(async () => resposta('{"ANUNCIO*K1QWE8ZP2M":"Marketing"}'))
    const m = await sugerirCategorias(
      ['ANUNCIO*K1QWE8ZP2M', 'ANUNCIO*R4TYU7HN5B', 'ANUNCIO*V9XCZ2LK6D'],
      CATEGORIAS,
      c.cliente,
    )
    expect(c.chamadas).toBe(1)
    expect(m.size).toBe(1)
    expect(m.get('anuncio')).toBe('Marketing')
  })

  it('categoria fora da lista não vira sugestão', async () => {
    const c = clienteQue(async () => resposta('{"LOJA EXEMPLO":"Categoria inventada"}'))
    const m = await sugerirCategorias(['LOJA EXEMPLO'], CATEGORIAS, c.cliente)
    expect(m.get(chaveEstabelecimento('LOJA EXEMPLO'))).toBeNull()
  })

  it('erro na chamada não derruba o envio: mapa vazio', async () => {
    const c = clienteQue(async () => { throw new Error('sem crédito') })
    await expect(sugerirCategorias(['LOJA EXEMPLO'], CATEGORIAS, c.cliente)).resolves.toEqual(new Map())
  })

  it('bloco que não é texto não derruba o envio', async () => {
    const c = clienteQue(async () => ({ content: [{ type: 'thinking' }], stop_reason: 'end_turn' }) as unknown as Anthropic.Message)
    await expect(sugerirCategorias(['LOJA EXEMPLO'], CATEGORIAS, c.cliente)).resolves.toEqual(new Map())
  })

  it('resposta sem bloco nenhum não derruba o envio', async () => {
    const c = clienteQue(async () => ({ content: [], stop_reason: 'end_turn' }) as unknown as Anthropic.Message)
    await expect(sugerirCategorias(['LOJA EXEMPLO'], CATEGORIAS, c.cliente)).resolves.toEqual(new Map())
  })

  it('JSON quebrado não derruba o envio', async () => {
    const c = clienteQue(async () => resposta('{"LOJA EXEMPLO":"Marke'))
    await expect(sugerirCategorias(['LOJA EXEMPLO'], CATEGORIAS, c.cliente)).resolves.toEqual(new Map())
  })

  it('texto sem JSON nenhum não derruba o envio', async () => {
    const c = clienteQue(async () => resposta('Não consigo classificar esses estabelecimentos.'))
    await expect(sugerirCategorias(['LOJA EXEMPLO'], CATEGORIAS, c.cliente)).resolves.toEqual(new Map())
  })

  it('resposta truncada é descartada inteira (meia fatura categorizada é pior que nenhuma)', async () => {
    const c = clienteQue(async () => resposta('{"LOJA EXEMPLO":"Marketing"}', 'max_tokens'))
    await expect(sugerirCategorias(['LOJA EXEMPLO'], CATEGORIAS, c.cliente)).resolves.toEqual(new Map())
  })

  it('JSON que não é objeto não derruba o envio', async () => {
    const c = clienteQue(async () => resposta('["Marketing"]'))
    await expect(sugerirCategorias(['LOJA EXEMPLO'], CATEGORIAS, c.cliente)).resolves.toEqual(new Map())
  })

  it('aceita o JSON embrulhado em markdown', async () => {
    const c = clienteQue(async () => resposta('```json\n{"LOJA EXEMPLO":"Marketing"}\n```'))
    const m = await sugerirCategorias(['LOJA EXEMPLO'], CATEGORIAS, c.cliente)
    expect(m.get(chaveEstabelecimento('LOJA EXEMPLO'))).toBe('Marketing')
  })

  it('valor null do modelo vira "sem palpite", não erro', async () => {
    const c = clienteQue(async () => resposta('{"LOJA EXEMPLO":null}'))
    const m = await sugerirCategorias(['LOJA EXEMPLO'], CATEGORIAS, c.cliente)
    expect(m.get(chaveEstabelecimento('LOJA EXEMPLO'))).toBeNull()
  })

  it('estabelecimento que ninguém perguntou é descartado', async () => {
    const c = clienteQue(async () => resposta('{"OUTRA COISA":"Marketing"}'))
    const m = await sugerirCategorias(['LOJA EXEMPLO'], CATEGORIAS, c.cliente)
    expect(m.has(chaveEstabelecimento('OUTRA COISA'))).toBe(false)
    expect(m.get(chaveEstabelecimento('LOJA EXEMPLO'))).toBeNull()
  })

  it('o prompt leva os estabelecimentos e as categorias do mês', async () => {
    let corpo: { messages?: unknown } = {}
    const cliente: ClienteIa = {
      messages: {
        create: async (params) => {
          corpo = params as { messages?: unknown }
          return resposta('{}')
        },
      },
    }
    await sugerirCategorias(['PADARIA EXEMPLO'], CATEGORIAS, cliente)
    const texto = JSON.stringify(corpo.messages)
    expect(texto).toContain('PADARIA EXEMPLO')
    expect(texto).toContain('Material de consumo')
  })
})
