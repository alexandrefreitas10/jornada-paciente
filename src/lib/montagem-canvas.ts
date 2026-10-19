import { calcularLayout, logoDaIdentidade, type Identidade, type Recorte } from './montagem'

// O desenho da montagem. Vive separado de `montagem.ts` porque depende de
// canvas e de Image: a geometria é testada sem navegador, aqui só se executa o
// que ela decidiu.

/** Largura máxima da miniatura da galeria. A montagem de duas fotos de celular
 *  passa de 4000px de altura e o PNG tem dezenas de MB; uma grade com 30 deles
 *  travaria o navegador. O que o dono baixa continua sendo o PNG inteiro. */
const THUMB_MAX_W = 700

function carregarImagem(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error(`Não foi possível carregar ${src}`))
    img.src = src
  })
}

function paraBlob(canvas: HTMLCanvasElement, tipo: string, qualidade?: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      blob => (blob ? resolve(blob) : reject(new Error('Canvas não gerou imagem'))),
      tipo,
      qualidade,
    )
  })
}

export interface FotoParaMontar {
  /** Imagem já carregada, servida pela PRÓPRIA origem — imagem de outro domínio
   *  suja o canvas ("tainted") e faz `toBlob` lançar erro de segurança.
   *
   *  Quem carrega é o chamador, porque cada tela tem a sua rota: os cards usam
   *  `/api/patients/<id>/files/<fid>/download?proxy=1` e a aba Fotos usa
   *  `/api/fotos/...`. NÃO troque por URL assinada do S3 para "simplificar":
   *  ela é de outro domínio, a montagem para de ser gerada, e o erro aparece
   *  só no `toBlob`, longe de onde a troca foi feita. */
  img: HTMLImageElement
  recorte: Recorte
  /** ISO do `created_at` da foto. */
  data: string
}

export interface MontagemGerada {
  png: Blob
  thumb: Blob
  largura: number
  altura: number
}

export async function gerarMontagem(entrada: {
  identidade: Identidade
  antes: FotoParaMontar
  depois: FotoParaMontar
}): Promise<MontagemGerada> {
  const { identidade, antes, depois } = entrada
  const medidas = (img: HTMLImageElement) => ({ largura: img.naturalWidth, altura: img.naturalHeight })

  // A logo de cada identidade é decidida pela identidade, não pelo chamador — e
  // tem de ser carregada antes do cálculo, porque o layout precisa das medidas
  // dela para centralizá-la.
  const logo = await carregarImagem(logoDaIdentidade(identidade))

  const layout = calcularLayout({
    identidade,
    antes: { medidas: medidas(antes.img), recorte: antes.recorte, data: antes.data },
    depois: { medidas: medidas(depois.img), recorte: depois.recorte, data: depois.data },
    logo: medidas(logo),
  })

  const canvas = document.createElement('canvas')
  canvas.width = layout.largura
  canvas.height = layout.altura
  const ctx = canvas.getContext('2d')!

  // Ordem importa: fundo, depois logo, depois fotos, depois textos. A logo fica
  // acima das fotos no canvas (o layout reserva `logoH + logoGap` no topo), então
  // não há sobreposição — mas desenhar foto antes do fundo apagaria a foto.
  ctx.fillStyle = layout.fundo
  ctx.fillRect(0, 0, layout.largura, layout.altura)
  ctx.drawImage(logo, layout.logo.x, layout.logo.y, layout.logo.w, layout.logo.h)

  const fontes: [FotoParaMontar, FotoParaMontar] = [antes, depois]
  layout.fotos.forEach((d, i) => {
    ctx.drawImage(fontes[i].img, d.sx, d.sy, d.sw, d.sh, d.dx, d.dy, d.dw, d.dh)
  })

  // O layout devolve `Texto.x` como CENTRO e `Texto.y` como linha de base
  // alfabética. Os dois alinhamentos são declarados aqui, mesmo `alphabetic`
  // sendo o padrão do canvas: sem isso, quem mexer depois não tem como saber
  // que o `y` não é o topo da letra, e trocar para `'top'` desceria todo texto.
  ctx.textAlign = 'center'
  ctx.textBaseline = 'alphabetic'
  for (const t of layout.textos) {
    ctx.fillStyle = t.cor
    ctx.font = t.fonte
    ctx.fillText(t.texto, t.x, t.y)
  }

  const png = await paraBlob(canvas, 'image/png')

  const escala = Math.min(1, THUMB_MAX_W / layout.largura)
  const mini = document.createElement('canvas')
  mini.width = Math.max(1, Math.round(layout.largura * escala))
  mini.height = Math.max(1, Math.round(layout.altura * escala))
  const miniCtx = mini.getContext('2d')!
  miniCtx.fillStyle = layout.fundo
  miniCtx.fillRect(0, 0, mini.width, mini.height)
  miniCtx.drawImage(canvas, 0, 0, mini.width, mini.height)
  const thumb = await paraBlob(mini, 'image/jpeg', 0.8)

  return { png, thumb, largura: layout.largura, altura: layout.altura }
}

/** Dispara o download no navegador. Separado de `gerarMontagem` porque a tela
 *  baixa PRIMEIRO e salva depois: se o POST falhar, o dono já está com a
 *  imagem na mão, que é o que ele precisa no momento. */
export function baixarBlob(blob: Blob, nomeArquivo: string): void {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = nomeArquivo
  link.click()
  URL.revokeObjectURL(url)
}

/** Sobe a montagem para a aba Fotos. Devolve o id gravado; quem chama guarda o
 *  id para o segundo clique não gravar uma segunda cópia. */
export async function salvarMontagem(entrada: {
  png: Blob
  thumb: Blob
  identidade: Identidade
  patientId?: number | null
  pessoaId?: number | null
  dataAntes: string
  dataDepois: string
}): Promise<number> {
  const fd = new FormData()
  fd.append('png', entrada.png, 'montagem.png')
  fd.append('thumb', entrada.thumb, 'montagem-thumb.jpg')
  fd.append('identidade', entrada.identidade)
  if (entrada.patientId != null) fd.append('patientId', String(entrada.patientId))
  if (entrada.pessoaId != null) fd.append('pessoaId', String(entrada.pessoaId))
  fd.append('dataAntes', entrada.dataAntes)
  fd.append('dataDepois', entrada.dataDepois)

  const res = await fetch('/api/fotos/montagens', { method: 'POST', body: fd })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error || 'Não foi possível guardar na aba Fotos')
  }
  const row = await res.json()
  return row.id as number
}
