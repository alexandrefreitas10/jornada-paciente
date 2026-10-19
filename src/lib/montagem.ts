// Layout da montagem antes-e-depois. Função PURA: nada de canvas, nada de DOM.
// O desenho mora em `montagem-canvas.ts` e só executa o que esta função decidiu.
//
// Existe por uma razão: a imagem que sai hoje do card tem de continuar saindo
// IGUAL. As constantes abaixo são cópia literal do que estava embutido em
// `FilesTab.tsx` e `EsteticaTab.tsx`, e `__tests__/lib/montagem.test.ts` fixa a
// geometria que elas produzem — se um pixel mudar de lugar, o teste quebra.
//
// As duas identidades são DIFERENTES de propósito: Fotos é a marca da dra. com
// logo grande, Estética é a do Instituto com logo pequena. Unificar mudaria a
// imagem que o dono manda para o paciente.

/** Recorte em coordenadas relativas (0–1) sobre a imagem original. */
export interface Recorte { x: number; y: number; w: number; h: number }

/** Congelado no tipo porque é valor padrão compartilhado entre as telas: uma
 *  mutação acidental em um lugar corromperia o enquadramento de todos. */
export const RECORTE_CHEIO: Readonly<Recorte> = { x: 0, y: 0, w: 1, h: 1 }

export interface Medidas { largura: number; altura: number }

/** Um `drawImage` pronto: recorte na origem (s*) e destino no canvas (d*). */
export interface Desenho {
  sx: number; sy: number; sw: number; sh: number
  dx: number; dy: number; dw: number; dh: number
}

/** Um `fillText` pronto. `x` é o CENTRO do texto, não a borda esquerda, porque
 *  quem desenha usa `textAlign: 'center'`; `y` é a linha de base alfabética, o
 *  padrão do canvas (`textBaseline: 'alphabetic'`), e não o topo da letra. */
export interface Texto { texto: string; x: number; y: number; fonte: string; cor: string }

/** dd/mm/aaaa, hh:mm no fuso de quem abriu a tela — o que `FilesTab` imprime.
 *  Sem guarda para string vazia, ao contrário de `dataSemHora`: é fiel ao que o
 *  componente faz hoje (`new Date('')` imprime "Invalid Date"), não esquecimento
 *  — pôr a guarda aqui mudaria a imagem de hoje. */
function dataComHora(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

/** dd/mm/aaaa fatiado da string ISO — o que `EsteticaTab` imprime. Fatiar a ISO
 *  lê a data em UTC, então foto enviada à noite em Brasília aparece com o dia
 *  seguinte. É defeito conhecido (spec §8) e fica como está de propósito:
 *  consertar aqui mudaria a imagem que o dono já manda hoje. */
function dataSemHora(iso: string): string {
  if (!iso) return ''
  const [y, m, d] = iso.slice(0, 10).split('-')
  return `${d}/${m}/${y}`
}

interface Estilo {
  gap: number
  labelH: number
  padding: number
  logoH: number
  logoGap: number
  logoSrc: string
  rotuloFonte: string
  rotuloCor: string
  /** Distância do topo do conteúdo até a linha de base do rótulo. */
  rotuloDy: number
  dataFonte: string
  dataCor: string
  /** Distância do fim da foto até a linha de base da data. */
  dataDy: number
  /** Espaço entre o fim da foto e o padding de baixo, DENTRO do qual a data é
   *  desenhada (ver `dataDy`) — não uma sobra depois dela. Valor herdado do
   *  código antigo, não derivado de nada. Cuidado: se `alturaExtra + padding`
   *  ficar menor que `dataDy` mais a altura da fonte, a data sai cortada na
   *  borda do canvas e nada avisa. */
  alturaExtra: number
  formatarData: (iso: string) => string
}

// `satisfies` em vez de anotar como `Record<Identidade, Estilo>`: assim
// `Identidade` é DERIVADA daqui (abaixo) em vez de escrita à mão em dois
// lugares. Acrescentar uma identidade nova passa a atualizar o tipo, a lista e
// o guard de uma vez — antes, `IDENTIDADES` ficava desatualizada em silêncio e
// `ehIdentidade` recusava em runtime uma identidade que o tipo já aceitava.
// Anotar com `Record<Identidade, Estilo>` aqui seria circular; `satisfies
// Record<string, Estilo>` mantém a cobrança de que cada estilo esteja completo.
const ESTILOS = {
  fotos: {
    gap: 20, labelH: 80, padding: 40, logoH: 400, logoGap: 16,
    logoSrc: '/logo-dra.png',
    rotuloFonte: 'bold 48px sans-serif', rotuloCor: '#374151', rotuloDy: 56,
    dataFonte: 'bold 36px sans-serif', dataCor: '#374151', dataDy: 50,
    alturaExtra: 24,
    formatarData: dataComHora,
  },
  estetica: {
    gap: 16, labelH: 60, padding: 24, logoH: 80, logoGap: 12,
    logoSrc: '/logo-it.png',
    rotuloFonte: 'bold 40px sans-serif', rotuloCor: '#374151', rotuloDy: 44,
    dataFonte: '28px sans-serif', dataCor: '#6b7280', dataDy: 40,
    alturaExtra: 50,
    formatarData: dataSemHora,
  },
} satisfies Record<string, Estilo>

export type Identidade = keyof typeof ESTILOS

export const IDENTIDADES = Object.keys(ESTILOS) as readonly Identidade[]

export function ehIdentidade(valor: unknown): valor is Identidade {
  return typeof valor === 'string' && (IDENTIDADES as readonly string[]).includes(valor)
}

/** O caminho da logo de cada identidade. Existe para quem precisa carregar a
 *  logo ANTES de calcular o layout (o layout precisa das medidas dela). */
export function logoDaIdentidade(identidade: Identidade): string {
  return ESTILOS[identidade].logoSrc
}

export interface Layout {
  largura: number
  altura: number
  fundo: string
  logoSrc: string
  logo: { x: number; y: number; w: number; h: number }
  /** [antes, depois] */
  fotos: [Desenho, Desenho]
  /** ANTES, DEPOIS, data do antes, data do depois — nesta ordem. */
  textos: [Texto, Texto, Texto, Texto]
}

export interface FotoDaMontagem {
  medidas: Medidas
  recorte: Recorte
  /** ISO do `created_at` da foto de origem. */
  data: string
}

export interface EntradaLayout {
  identidade: Identidade
  /** A primeira foto escolhida. */
  antes: FotoDaMontagem
  depois: FotoDaMontagem
  /** Medidas naturais da logo da identidade (ver `logoDaIdentidade`). */
  logo: Medidas
}

/**
 * Calcula onde cada coisa vai na montagem, sem desenhar nada.
 *
 * Unidades da entrada: `medidas` em pixels NATURAIS da imagem
 * (`naturalWidth`/`naturalHeight`, não o tamanho que ela aparenta na tela);
 * `recorte` em coordenadas RELATIVAS (0–1) sobre essas medidas; `logo` nas
 * medidas naturais da logo.
 *
 * Unidades do retorno: pixels do canvas. Quem chama faz `canvas.width =
 * largura` e `canvas.height = altura`, e depois só executa os `Desenho` e os
 * `Texto` na ordem em que vêm.
 *
 * Exige medidas e recortes MAIORES QUE ZERO. Altura efetiva zero — imagem que
 * não carregou (`naturalHeight === 0`) ou recorte com `h: 0` — divide por zero e
 * sai como `Infinity` ou `NaN` sem lançar erro; é o chamador que tem de garantir
 * que as duas imagens carregaram antes de pedir o layout.
 */
export function calcularLayout(entrada: EntradaLayout): Layout {
  const e = ESTILOS[entrada.identidade]
  const a = entrada.antes
  const b = entrada.depois

  // Dimensões efetivas depois do recorte, em pixels da imagem original.
  const efA = { w: a.medidas.largura * a.recorte.w, h: a.medidas.altura * a.recorte.h }
  const efB = { w: b.medidas.largura * b.recorte.w, h: b.medidas.altura * b.recorte.h }

  // As duas saem com a MESMA altura — é isso que torna antes e depois
  // comparáveis. Cada uma mantém a proporção, então a largura é que varia.
  const maxH = Math.max(efA.h, efB.h)
  const wA = efA.w * (maxH / efA.h)
  const wB = efB.w * (maxH / efB.h)

  const largura = wA + wB + e.gap + e.padding * 2
  const altura = e.padding * 2 + e.logoH + e.logoGap + e.labelH + maxH + e.alturaExtra
  const logoW = entrada.logo.largura * (e.logoH / entrada.logo.altura)
  const topoConteudo = e.padding + e.logoH + e.logoGap
  const topoFotos = topoConteudo + e.labelH
  const xA = e.padding + wA / 2
  const xB = e.padding + wA + e.gap + wB / 2
  const yData = topoFotos + maxH + e.dataDy

  return {
    largura,
    altura,
    fundo: '#ffffff',
    logoSrc: e.logoSrc,
    logo: { x: (largura - logoW) / 2, y: e.padding, w: logoW, h: e.logoH },
    fotos: [
      {
        sx: a.recorte.x * a.medidas.largura, sy: a.recorte.y * a.medidas.altura,
        sw: efA.w, sh: efA.h,
        dx: e.padding, dy: topoFotos, dw: wA, dh: maxH,
      },
      {
        sx: b.recorte.x * b.medidas.largura, sy: b.recorte.y * b.medidas.altura,
        sw: efB.w, sh: efB.h,
        dx: e.padding + wA + e.gap, dy: topoFotos, dw: wB, dh: maxH,
      },
    ],
    textos: [
      { texto: 'ANTES', x: xA, y: topoConteudo + e.rotuloDy, fonte: e.rotuloFonte, cor: e.rotuloCor },
      { texto: 'DEPOIS', x: xB, y: topoConteudo + e.rotuloDy, fonte: e.rotuloFonte, cor: e.rotuloCor },
      { texto: e.formatarData(a.data), x: xA, y: yData, fonte: e.dataFonte, cor: e.dataCor },
      { texto: e.formatarData(b.data), x: xB, y: yData, fonte: e.dataFonte, cor: e.dataCor },
    ],
  }
}
