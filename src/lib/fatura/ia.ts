import Anthropic from '@anthropic-ai/sdk'
import { NAO_IDENTIFICADO, categoriasDisponiveis, chaveEstabelecimento } from './enquadrar'

// A ÚNICA parte da fatura que usa IA. Os valores são lidos de forma
// determinística (`ler-fatura.ts`) e provados pelo resíduo; aqui não existe
// resposta exata — "o que é PADARIA X?" é palpite, e palpite é o que a IA faz.
//
// Esta é a 5ª função de IA do projeto e divide o MESMO saldo Anthropic das
// outras quatro. Duas consequências, as duas tratadas abaixo:
//   1. pergunta-se uma vez por ESTABELECIMENTO, não por compra;
//   2. qualquer falha (erro, bloco não-texto, JSON quebrado, resposta
//      truncada) devolve mapa vazio — a tela mostra tudo em "não identificado"
//      e o dono resolve em um clique por linha. O envio da fatura nunca cai
//      por causa da IA.

/** Só o pedaço do cliente Anthropic que este módulo usa, para o teste poder
 *  injetar um dublê sem tocar na API de verdade. */
export interface ClienteIa {
  messages: {
    create(params: Anthropic.MessageCreateParamsNonStreaming): Promise<Anthropic.Message>
  }
}

// Mesmo padrão das outras quatro funções (ver `estoque/scan-nf/route.ts`).
const clientePadrao = (): ClienteIa => new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

/** Mesmo modelo do leitor de nota fiscal: classificar estabelecimento pede
 *  conhecimento de mundo, e errar aqui gasta o tempo do dono corrigindo. */
const MODELO = 'claude-sonnet-4-6'

function prompt(estabelecimentos: string[], categorias: string[]): string {
  return `Estes são nomes de estabelecimento como aparecem na fatura de um cartão de crédito corporativo de uma CLÍNICA MÉDICA no Brasil. O nome vem abreviado e às vezes com prefixo de adquirente ("MP*", "PG *") ou de plataforma.

Para cada nome, diga em qual categoria contábil a despesa deve entrar.

CATEGORIAS PERMITIDAS (use EXATAMENTE uma destas grafias):
${categorias.map(c => `- ${c}`).join('\n')}

ESTABELECIMENTOS:
${estabelecimentos.map(e => `- ${e}`).join('\n')}

Responda SOMENTE com um objeto JSON, sem texto antes ou depois, sem markdown:
{"NOME DO ESTABELECIMENTO": "Categoria", ...}

Regras:
- Use o nome do estabelecimento EXATAMENTE como está na lista acima, como chave.
- O valor tem que ser uma das categorias permitidas, copiada letra por letra.
- Se você não reconhece o estabelecimento ou está em dúvida, responda "${NAO_IDENTIFICADO}". NÃO adivinhe: um palpite errado custa mais tempo do que um "não identificado", porque engana quem confere.
- Uma entrada para cada estabelecimento da lista, nem mais nem menos.`
}

/** O modelo às vezes embrulha em ```json. Pega do primeiro { ao último }. */
function objetoDoTexto(texto: string): Record<string, unknown> | null {
  const inicio = texto.indexOf('{')
  const fim = texto.lastIndexOf('}')
  if (inicio === -1 || fim <= inicio) return null
  try {
    const bruto: unknown = JSON.parse(texto.slice(inicio, fim + 1))
    if (!bruto || typeof bruto !== 'object' || Array.isArray(bruto)) return null
    return bruto as Record<string, unknown>
  } catch {
    return null
  }
}

/**
 * Recebe os estabelecimentos desconhecidos (nomes crus, podem repetir) e as
 * categorias que o BPO usa no mês; devolve `Map<chave, categoria | null>`.
 *
 * `null` quer dizer "a IA não sabe" — é resposta válida e esperada. Mapa vazio
 * quer dizer "a IA não respondeu"; quem chama trata os dois do mesmo jeito
 * (`enquadrar` manda para "não identificado"), mas a tela pode avisar que a
 * sugestão falhou quando o mapa vem vazio com estabelecimentos para perguntar.
 */
export async function sugerirCategorias(
  estabelecimentos: string[],
  categoriasDoMes: Iterable<string>,
  cliente: ClienteIa = clientePadrao(),
): Promise<Map<string, string | null>> {
  // Uma pergunta por estabelecimento, não por compra: na fatura real isso é a
  // diferença entre 67 nomes e ~54 chaves.
  const representante = new Map<string, string>()
  for (const nome of estabelecimentos) {
    const chave = chaveEstabelecimento(nome)
    if (!chave || representante.has(chave)) continue
    representante.set(chave, nome)
  }

  const categorias = categoriasDisponiveis(categoriasDoMes)
  // Só o "não identificado" na lista: não há resposta que valha a chamada.
  if (representante.size === 0 || categorias.length <= 1) return new Map()

  const nomes = [...representante.values()]

  let texto: string
  try {
    const msg = await cliente.messages.create({
      model: MODELO,
      max_tokens: 4096,
      messages: [{ role: 'user', content: prompt(nomes, categorias) }],
    })

    // Truncada = metade dos estabelecimentos sem resposta. Descartar inteira é
    // melhor que entregar meia fatura categorizada sem dizer qual metade.
    if (msg.stop_reason === 'max_tokens') return new Map()

    const bloco = msg.content.find(b => b.type === 'text')
    if (!bloco || bloco.type !== 'text' || !bloco.text) return new Map()
    texto = bloco.text
  } catch {
    // Saldo zerado, rede, chave errada: tudo cai aqui e nada disso pode
    // impedir o dono de subir a fatura.
    return new Map()
  }

  const objeto = objetoDoTexto(texto)
  if (!objeto) return new Map()

  // Começa com todos em null: estabelecimento que a IA deixou de fora fica
  // registrado como "perguntei e não sei", não como "nem perguntei".
  const saida = new Map<string, string | null>()
  for (const chave of representante.keys()) saida.set(chave, null)

  // Sem acento também: o modelo responde "alimentacao" com frequência, e
  // descartar a resposta certa por causa do acento custa uma sugestão à toa.
  const semAcento = (t: string) => t.normalize('NFD').replace(/\p{M}/gu, '').trim().toLowerCase()
  const validas = new Map(categorias.map(c => [semAcento(c), c]))
  for (const [nome, valor] of Object.entries(objeto)) {
    const chave = chaveEstabelecimento(nome)
    // Nome que ninguém perguntou (modelo inventou uma linha) é descartado.
    if (!saida.has(chave)) continue
    if (typeof valor !== 'string') continue
    const categoria = validas.get(semAcento(valor))
    if (!categoria || categoria === NAO_IDENTIFICADO) continue
    saida.set(chave, categoria)
  }
  return saida
}
