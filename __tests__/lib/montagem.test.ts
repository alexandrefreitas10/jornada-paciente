import { calcularLayout, RECORTE_CHEIO, type Identidade, type Recorte } from '@/lib/montagem'

// Fotos de proporções diferentes, com números que dão conta redonda: a conta
// que importa (as duas saindo com a MESMA altura) fica legível na asserção.
const RETRATO = { largura: 1000, altura: 2000 }
const MENOR = { largura: 600, altura: 1000 }
const LOGO = { largura: 800, altura: 400 }
const DATA_A = '2026-09-10T13:45:00.000Z'
const DATA_B = '2026-10-10T13:45:00.000Z'

function layout(identidade: Identidade, recorteA: Recorte = RECORTE_CHEIO) {
  return calcularLayout({
    identidade,
    antes: { medidas: RETRATO, recorte: recorteA, data: DATA_A },
    depois: { medidas: MENOR, recorte: RECORTE_CHEIO, data: DATA_B },
    logo: LOGO,
  })
}

describe('identidade "fotos" (card › Fotos, logo da dra.)', () => {
  // GEOMETRIA DE HOJE. Se algum número abaixo mudar, a imagem que o dono manda
  // para o paciente mudou — é para o teste quebrar.
  const l = layout('fotos')

  it('tem a largura e a altura de hoje', () => {
    // 1000 + 1200 + GAP 20 + PADDING 40*2
    expect(l.largura).toBe(2300)
    // LOGO_H 400 + LOGO_GAP 16 + LABEL_H 80 + maxH 2000 + PADDING 40*2 + 24
    expect(l.altura).toBe(2600)
    expect(l.fundo).toBe('#ffffff')
    expect(l.logoSrc).toBe('/logo-dra.png')
  })

  it('põe a logo centralizada no topo', () => {
    expect(l.logo).toEqual({ x: 750, y: 40, w: 800, h: 400 })
  })

  it('desenha as duas fotos com a mesma altura, cada uma na sua proporção', () => {
    expect(l.fotos[0]).toEqual({ sx: 0, sy: 0, sw: 1000, sh: 2000, dx: 40, dy: 536, dw: 1000, dh: 2000 })
    expect(l.fotos[1]).toEqual({ sx: 0, sy: 0, sw: 600, sh: 1000, dx: 1060, dy: 536, dw: 1200, dh: 2000 })
  })

  it('escreve ANTES, DEPOIS e as duas datas nas posições de hoje', () => {
    expect(l.textos[0]).toMatchObject({ texto: 'ANTES', x: 540, y: 512, fonte: 'bold 48px sans-serif', cor: '#374151' })
    expect(l.textos[1]).toMatchObject({ texto: 'DEPOIS', x: 1660, y: 512, fonte: 'bold 48px sans-serif', cor: '#374151' })
    expect(l.textos[2]).toMatchObject({ x: 540, y: 2586, fonte: 'bold 36px sans-serif', cor: '#374151' })
    expect(l.textos[3]).toMatchObject({ x: 1660, y: 2586, fonte: 'bold 36px sans-serif', cor: '#374151' })
  })

  it('mostra data e hora, como hoje', () => {
    // Valor exato depende do fuso de quem roda o teste; o FORMATO é o contrato.
    expect(l.textos[2].texto).toMatch(/^\d{2}\/\d{2}\/\d{4},? \d{2}:\d{2}$/)
  })

  it('aplica o recorte e iguala as alturas', () => {
    const r = layout('fotos', { x: 0.1, y: 0.2, w: 0.5, h: 0.5 })
    // Recorte pela metade: a foto de antes vira 500x1000, e agora é a MENOR,
    // então as duas saem com altura 1000.
    expect(r.fotos[0]).toEqual({ sx: 100, sy: 400, sw: 500, sh: 1000, dx: 40, dy: 536, dw: 500, dh: 1000 })
    expect(r.fotos[1]).toEqual({ sx: 0, sy: 0, sw: 600, sh: 1000, dx: 560, dy: 536, dw: 600, dh: 1000 })
    expect(r.largura).toBe(1200)
    expect(r.altura).toBe(1600)
  })

  it('recorta o DEPOIS com as medidas do depois, não as do antes', () => {
    // O cálculo da segunda foto é cópia do da primeira: é o lugar exato onde se
    // troca `a` por `b` sem querer. Aqui as duas fotos têm medidas diferentes
    // (1000x2000 e 600x1000) e só o depois é recortado, então qualquer mistura
    // entre as duas dá um número diferente destes.
    const r = calcularLayout({
      identidade: 'fotos',
      antes: { medidas: RETRATO, recorte: RECORTE_CHEIO, data: DATA_A },
      depois: { medidas: MENOR, recorte: { x: 0.25, y: 0.5, w: 0.5, h: 0.25 }, data: DATA_B },
      logo: LOGO,
    })
    // Antes intacto: a foto mais alta (2000) continua mandando na altura.
    expect(r.fotos[0]).toEqual({ sx: 0, sy: 0, sw: 1000, sh: 2000, dx: 40, dy: 536, dw: 1000, dh: 2000 })
    // Depois: recorte de 300x250 dentro de 600x1000, esticado até os 2000 de
    // altura do antes, o que dá 2400 de largura.
    expect(r.fotos[1]).toEqual({ sx: 150, sy: 500, sw: 300, sh: 250, dx: 1060, dy: 536, dw: 2400, dh: 2000 })
    expect(r.largura).toBe(3500)
    expect(r.altura).toBe(2600)
  })
})

describe('identidade "estetica" (card › Estética, logo do Instituto)', () => {
  const l = layout('estetica')

  it('tem a largura e a altura de hoje', () => {
    // 1000 + 1200 + GAP 16 + PADDING 24*2
    expect(l.largura).toBe(2264)
    // PADDING 24*2 + LOGO_H 80 + LOGO_GAP 12 + LABEL_H 60 + maxH 2000 + 50
    expect(l.altura).toBe(2250)
    expect(l.logoSrc).toBe('/logo-it.png')
  })

  it('usa a logo pequena, as fontes e as cores de hoje', () => {
    expect(l.logo).toEqual({ x: 1052, y: 24, w: 160, h: 80 })
    expect(l.fotos[0]).toEqual({ sx: 0, sy: 0, sw: 1000, sh: 2000, dx: 24, dy: 176, dw: 1000, dh: 2000 })
    expect(l.fotos[1]).toEqual({ sx: 0, sy: 0, sw: 600, sh: 1000, dx: 1040, dy: 176, dw: 1200, dh: 2000 })
    expect(l.textos[0]).toMatchObject({ texto: 'ANTES', x: 524, y: 160, fonte: 'bold 40px sans-serif', cor: '#374151' })
    expect(l.textos[1]).toMatchObject({ texto: 'DEPOIS', x: 1640, y: 160 })
    expect(l.textos[2]).toMatchObject({ x: 524, y: 2216, fonte: '28px sans-serif', cor: '#6b7280' })
  })

  it('mostra só a data, sem hora, como hoje', () => {
    expect(l.textos[2].texto).toBe('10/09/2026')
    expect(l.textos[3].texto).toBe('10/10/2026')
  })
})
