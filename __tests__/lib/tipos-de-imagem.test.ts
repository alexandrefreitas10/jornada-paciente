// __tests__/lib/tipos-de-imagem.test.ts
//
// Este arquivo existe para TRAVAR a lista fechada de formatos. Sem ele, a única
// coisa que impede alguém de trocar a validação de volta por
// `file.type.startsWith('image/')` é um comentário pedindo para não fazer — e
// `image/svg+xml` começa com `image/`. A foto solta é servida INLINE na origem
// do app, então um SVG com script aceito aqui rodaria no navegador de outro
// login da equipe, com a sessão dele.
import {
  ACCEPT_IMAGENS,
  contentTypeSeguro,
  extensaoDoTipo,
  tipoDeImagemDeclarado,
  tipoDeImagemDosBytes,
} from '@/lib/tipos-de-imagem'

// Arquivos de mentira, montados aqui: nada de foto de paciente em teste.
const SVG = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>')
const HTML = Buffer.from('<!doctype html><html><body><script>alert(1)</script></body></html>')
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13])
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(16)])
const WEBP = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBP'), Buffer.alloc(8)])

/** O que o POST faz: tipo declarado na lista E bytes na lista. */
function uploadAceito(declarado: string | null, bytes: Buffer): string | null {
  if (!tipoDeImagemDeclarado(declarado)) return null
  return tipoDeImagemDosBytes(bytes)
}

describe('tipo declarado pelo cliente', () => {
  it('recusa image/svg+xml, que passaria por um startsWith("image/")', () => {
    expect(tipoDeImagemDeclarado('image/svg+xml')).toBeNull()
    expect(uploadAceito('image/svg+xml', SVG)).toBeNull()
  })

  it('recusa os outros "image/" que não são foto de celular', () => {
    expect(tipoDeImagemDeclarado('image/gif')).toBeNull()
    expect(tipoDeImagemDeclarado('image/bmp')).toBeNull()
    expect(tipoDeImagemDeclarado('image/tiff')).toBeNull()
  })

  it('recusa tipo que não é imagem nenhuma', () => {
    expect(tipoDeImagemDeclarado('text/html')).toBeNull()
    expect(tipoDeImagemDeclarado('application/pdf')).toBeNull()
    expect(tipoDeImagemDeclarado('')).toBeNull()
    expect(tipoDeImagemDeclarado(null)).toBeNull()
    expect(tipoDeImagemDeclarado(undefined)).toBeNull()
  })

  it('aceita os três formatos de verdade, com caixa e parâmetro', () => {
    expect(tipoDeImagemDeclarado('image/jpeg')).toBe('image/jpeg')
    expect(tipoDeImagemDeclarado('image/png')).toBe('image/png')
    expect(tipoDeImagemDeclarado('image/webp')).toBe('image/webp')
    // O navegador pode mandar parâmetro no Content-Type da parte do formulário.
    expect(tipoDeImagemDeclarado('image/jpeg; charset=utf-8')).toBe('image/jpeg')
    expect(tipoDeImagemDeclarado('IMAGE/PNG')).toBe('image/png')
    expect(uploadAceito('image/jpeg; charset=utf-8', JPEG)).toBe('image/jpeg')
  })
})

describe('assinatura dos bytes', () => {
  it('pega o SVG que MENTE o tipo declarado', () => {
    // O cliente diz `image/png`; os bytes dizem outra coisa. Quem decide são os
    // bytes — é o caminho que um atacante com login da equipe tentaria.
    expect(tipoDeImagemDeclarado('image/png')).toBe('image/png')
    expect(uploadAceito('image/png', SVG)).toBeNull()
  })

  it('pega HTML enviado como se fosse imagem', () => {
    expect(uploadAceito('image/png', HTML)).toBeNull()
    expect(tipoDeImagemDosBytes(HTML)).toBeNull()
  })

  it('pega texto puro e arquivo curto demais para ter assinatura', () => {
    expect(tipoDeImagemDosBytes(Buffer.from('nao sou imagem'))).toBeNull()
    expect(tipoDeImagemDosBytes(Buffer.alloc(0))).toBeNull()
    expect(tipoDeImagemDosBytes(Buffer.from([0xff, 0xd8]))).toBeNull()
    // "RIFF" sem "WEBP" é outro formato de container (áudio, por exemplo).
    expect(tipoDeImagemDosBytes(Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(8)]))).toBeNull()
  })

  it('reconhece os três formatos pela assinatura', () => {
    expect(tipoDeImagemDosBytes(PNG)).toBe('image/png')
    expect(tipoDeImagemDosBytes(JPEG)).toBe('image/jpeg')
    expect(tipoDeImagemDosBytes(WEBP)).toBe('image/webp')
  })

  it('REGISTRA o comportamento com arquivo poliglota: assinatura de JPEG manda', () => {
    // Assinatura de JPEG seguida de script. Hoje isto é aceito como JPEG, e o
    // teste registra o comportamento real em vez de fingir que é recusado.
    // Não é caminho de execução: o arquivo é guardado e servido como
    // `image/jpeg`, com `nosniff` e `Content-Disposition: inline`, então o
    // navegador não interpreta o que vem depois da assinatura. Se um dia alguém
    // apertar isso (decodificar a imagem de verdade), é este teste que muda.
    const poliglota = Buffer.concat([
      Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
      Buffer.from('<script>alert(document.cookie)</script>'),
    ])
    expect(tipoDeImagemDosBytes(poliglota)).toBe('image/jpeg')
    expect(uploadAceito('image/jpeg', poliglota)).toBe('image/jpeg')
  })
})

describe('contentTypeSeguro, usado pelas rotas de imagem', () => {
  it('nunca deixa um tipo executável sair no cabeçalho', () => {
    expect(contentTypeSeguro('image/svg+xml')).toBe('application/octet-stream')
    expect(contentTypeSeguro('text/html')).toBe('application/octet-stream')
    expect(contentTypeSeguro('application/javascript')).toBe('application/octet-stream')
    expect(contentTypeSeguro(null)).toBe('application/octet-stream')
    expect(contentTypeSeguro(undefined)).toBe('application/octet-stream')
  })

  it('devolve igual o que está na lista', () => {
    expect(contentTypeSeguro('image/jpeg')).toBe('image/jpeg')
    expect(contentTypeSeguro('image/png')).toBe('image/png')
    expect(contentTypeSeguro('image/webp')).toBe('image/webp')
  })
})

describe('extensão e accept saem da MESMA lista', () => {
  it('a extensão da chave do S3 vem do tipo validado', () => {
    expect(extensaoDoTipo('image/jpeg')).toBe('jpg')
    expect(extensaoDoTipo('image/png')).toBe('png')
    expect(extensaoDoTipo('image/webp')).toBe('webp')
  })

  it('o accept do seletor de arquivo é derivado, não escrito à mão', () => {
    expect(ACCEPT_IMAGENS).toBe('image/jpeg,image/png,image/webp')
    // Todo tipo do accept é aceito pelo servidor: os dois lados não divergem.
    for (const tipo of ACCEPT_IMAGENS.split(',')) {
      expect(tipoDeImagemDeclarado(tipo)).toBe(tipo)
    }
    expect(ACCEPT_IMAGENS).not.toContain('svg')
  })
})
