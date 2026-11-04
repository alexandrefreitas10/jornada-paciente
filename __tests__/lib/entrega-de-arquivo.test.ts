import { cabecalhosDeArquivo, PRIMEIROS_BYTES } from '@/lib/entrega-de-arquivo'

const bytes = (...n: number[]) => new Uint8Array(n)
const texto = (s: string) => new TextEncoder().encode(s)

const JPEG = bytes(0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01)
const PNG = bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d)
const WEBP = texto('RIFF____WEBPVP8 ')
const PDF = texto('%PDF-1.7\n%âãÏÓ')

describe('cabecalhosDeArquivo: o que pode ser servido inline', () => {
  it('JPEG, PNG e WebP saem inline, com o tipo exato', () => {
    for (const [conteudo, tipo] of [[JPEG, 'image/jpeg'], [PNG, 'image/png'], [WEBP, 'image/webp']] as const) {
      const h = cabecalhosDeArquivo(conteudo, 'foto.jpg')
      expect(h['Content-Type']).toBe(tipo)
      expect(h['Content-Disposition']).toMatch(/^inline;/)
    }
  })

  it('PDF sai inline, para o botão "Abrir" de exame e dieta continuar abrindo na tela', () => {
    const h = cabecalhosDeArquivo(PDF, 'exame.pdf')
    expect(h['Content-Type']).toBe('application/pdf')
    expect(h['Content-Disposition']).toMatch(/^inline;/)
  })

  it('todo arquivo leva nosniff, inclusive o que vai como anexo', () => {
    for (const conteudo of [JPEG, PDF, texto('<svg xmlns="http://www.w3.org/2000/svg"><script/></svg>')]) {
      expect(cabecalhosDeArquivo(conteudo, 'x')['X-Content-Type-Options']).toBe('nosniff')
    }
  })
})

describe('cabecalhosDeArquivo: o furo que isto fecha', () => {
  it('SVG nunca sai inline nem como image/svg+xml', () => {
    // O ataque: SVG carrega <script>. Servido inline na origem do app, roda com
    // a sessão de quem abriu — um login da equipe escalando para o do dono.
    const svg = texto('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>')
    const h = cabecalhosDeArquivo(svg, 'inocente.jpg')

    expect(h['Content-Type']).toBe('application/octet-stream')
    expect(h['Content-Type']).not.toMatch(/svg/)
    expect(h['Content-Disposition']).toMatch(/^attachment;/)
  })

  it('SVG com declaração XML antes da tag também não passa', () => {
    const svg = texto('<?xml version="1.0"?>\n<svg xmlns="http://www.w3.org/2000/svg"><script/></svg>')
    const h = cabecalhosDeArquivo(svg, 'x.png')

    expect(h['Content-Type']).toBe('application/octet-stream')
    expect(h['Content-Disposition']).toMatch(/^attachment;/)
  })

  it('HTML não sai inline', () => {
    const h = cabecalhosDeArquivo(texto('<!DOCTYPE html><html><script>alert(1)</script>'), 'x.png')
    expect(h['Content-Type']).toBe('application/octet-stream')
    expect(h['Content-Disposition']).toMatch(/^attachment;/)
  })

  it('o nome do arquivo não decide nada: quem manda são os bytes', () => {
    // Um SVG chamado "foto.png" continua sendo anexo, e um JPEG chamado
    // "virus.exe" continua sendo imagem inline.
    expect(cabecalhosDeArquivo(texto('<svg/>'), 'foto.png')['Content-Disposition']).toMatch(/^attachment;/)
    expect(cabecalhosDeArquivo(JPEG, 'virus.exe')['Content-Disposition']).toMatch(/^inline;/)
  })
})

describe('cabecalhosDeArquivo: documento e desconhecido', () => {
  it('DOCX e XLSX saem como anexo, que já é como o navegador os trata', () => {
    // Começam com a assinatura de ZIP.
    const zip = bytes(0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x06, 0x00, 0x08, 0x00, 0x00, 0x00)
    const h = cabecalhosDeArquivo(zip, 'dieta.docx')

    expect(h['Content-Type']).toBe('application/octet-stream')
    expect(h['Content-Disposition']).toMatch(/^attachment;/)
  })

  it('arquivo vazio ou curto demais para ter assinatura vira anexo, nunca inline', () => {
    for (const conteudo of [bytes(), bytes(0xff), bytes(0xff, 0xd8)]) {
      expect(cabecalhosDeArquivo(conteudo, 'x')['Content-Disposition']).toMatch(/^attachment;/)
    }
  })
})

describe('cabecalhosDeArquivo: o nome no cabeçalho', () => {
  it('não deixa CR, LF nem aspas chegarem ao cabeçalho', () => {
    // Quebra de linha num cabeçalho é injeção de cabeçalho; aspas encerram o
    // valor mais cedo e o resto do nome vira parâmetro.
    const h = cabecalhosDeArquivo(JPEG, 'a"b\r\nSet-Cookie: x=1\nc.jpg')

    // Uma linha só: sem CR nem LF não há como nascer um cabeçalho novo.
    expect(h['Content-Disposition']).not.toMatch(/[\r\n]/)
    // E nenhuma aspa DENTRO do valor — as de fora delimitam e são esperadas.
    const entreAspas = /filename="([^"]*)"/.exec(h['Content-Disposition'])
    expect(entreAspas).not.toBeNull()
    expect(entreAspas![1]).not.toContain('"')
  })

  it('guarda a extensão, para o arquivo salvo abrir no programa certo', () => {
    expect(cabecalhosDeArquivo(PDF, 'resultado do exame.pdf')['Content-Disposition']).toMatch(/\.pdf/)
  })

  it('acento sobrevive, no parâmetro que carrega UTF-8', () => {
    const h = cabecalhosDeArquivo(PDF, 'prescrição.pdf')
    // `filename=` fica em ASCII (compatibilidade) e `filename*` leva o original.
    expect(h['Content-Disposition']).toContain("filename*=UTF-8''")
    expect(h['Content-Disposition']).toContain(encodeURIComponent('prescrição.pdf'))
  })

  it('nome vazio ou só pontuação não gera cabeçalho quebrado', () => {
    for (const nome of ['', '   ', '///', '..']) {
      const h = cabecalhosDeArquivo(JPEG, nome)
      expect(h['Content-Disposition']).toMatch(/^inline; filename="[^"]+"/)
    }
  })

  it('nome gigante é cortado: cabeçalho tem limite no servidor', () => {
    const h = cabecalhosDeArquivo(PDF, 'x'.repeat(5000) + '.pdf')
    expect(h['Content-Disposition'].length).toBeLessThan(600)
  })
})

describe('PRIMEIROS_BYTES', () => {
  it('é suficiente para todas as assinaturas que a lista reconhece', () => {
    // WebP é a mais longa: "RIFF" nos bytes 0-3 e "WEBP" nos 8-11.
    expect(PRIMEIROS_BYTES).toBeGreaterThanOrEqual(12)
  })
})

// ── espiarInicio ──────────────────────────────────────────────

import { espiarInicio } from '@/lib/entrega-de-arquivo'

/** Um stream que entrega os pedaços na ordem dada. */
function stream(...pedacos: Uint8Array[]): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(c) {
      for (const p of pedacos) c.enqueue(p)
      c.close()
    },
  })
}

async function tudo(s: ReadableStream<Uint8Array>): Promise<Uint8Array> {
  const partes: Uint8Array[] = []
  const leitor = s.getReader()
  for (;;) {
    const { done, value } = await leitor.read()
    if (done) break
    partes.push(value)
  }
  const total = partes.reduce((n, p) => n + p.length, 0)
  const saida = new Uint8Array(total)
  let i = 0
  for (const p of partes) { saida.set(p, i); i += p.length }
  return saida
}

describe('espiarInicio', () => {
  it('devolve o começo e um corpo que ainda tem o arquivo inteiro', async () => {
    const original = new Uint8Array(100).map((_, i) => i)
    const { primeirosBytes, corpo } = await espiarInicio(stream(original))

    expect(Array.from(primeirosBytes)).toEqual(Array.from(original.subarray(0, PRIMEIROS_BYTES)))
    // O corpo não pode perder os bytes espiados: é ele que vai para o navegador.
    expect(Array.from(await tudo(corpo))).toEqual(Array.from(original))
  })

  it('junta pedaços pequenos até ter assinatura suficiente', async () => {
    // Um stream pode entregar 1 byte por vez; olhar só o primeiro pedaço
    // classificaria um PNG como desconhecido e o mandaria como anexo.
    const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48]
    const { primeirosBytes, corpo } = await espiarInicio(stream(...png.map(b => new Uint8Array([b]))))

    expect(primeirosBytes.length).toBe(PRIMEIROS_BYTES)
    expect(cabecalhosDeArquivo(primeirosBytes, 'x.png')['Content-Type']).toBe('image/png')
    expect(Array.from(await tudo(corpo))).toEqual(png)
  })

  it('arquivo menor que a assinatura não trava nem inventa bytes', async () => {
    const { primeirosBytes, corpo } = await espiarInicio(stream(new Uint8Array([0xff, 0xd8])))

    expect(Array.from(primeirosBytes)).toEqual([0xff, 0xd8])
    expect(Array.from(await tudo(corpo))).toEqual([0xff, 0xd8])
  })

  it('arquivo vazio vira anexo, sem estourar', async () => {
    const { primeirosBytes, corpo } = await espiarInicio(stream())

    expect(primeirosBytes.length).toBe(0)
    expect(cabecalhosDeArquivo(primeirosBytes, 'x')['Content-Disposition']).toMatch(/^attachment;/)
    expect((await tudo(corpo)).length).toBe(0)
  })
})

// ── tipoDeConteudo ────────────────────────────────────────────

import { tipoDeConteudo } from '@/lib/entrega-de-arquivo'

describe('tipoDeConteudo: o que o upload grava no S3', () => {
  it('reconhece os formatos que podem ser servidos inline', () => {
    expect(tipoDeConteudo(JPEG)).toBe('image/jpeg')
    expect(tipoDeConteudo(PNG)).toBe('image/png')
    expect(tipoDeConteudo(WEBP)).toBe('image/webp')
    expect(tipoDeConteudo(PDF)).toBe('application/pdf')
  })

  it('devolve null para o resto, para o upload gravar octet-stream', () => {
    // SVG é o caso que importa: é ele que não pode chegar ao S3 marcado como
    // imagem, porque é assim que ele voltaria renderizável na nossa origem.
    expect(tipoDeConteudo(texto('<svg xmlns="http://www.w3.org/2000/svg"/>'))).toBeNull()
    expect(tipoDeConteudo(texto('<!DOCTYPE html>'))).toBeNull()
    expect(tipoDeConteudo(bytes(0x50, 0x4b, 0x03, 0x04))).toBeNull()
    expect(tipoDeConteudo(bytes())).toBeNull()
  })
})
