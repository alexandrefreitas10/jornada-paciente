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
  /** O que o dono baixa no clique: PNG, sem perda, exatamente como sempre foi. */
  png: Blob
  /** O que vai para a aba Fotos: a MESMA imagem em JPEG de resolução cheia.
   *  Ver `QUALIDADE_GUARDADA` para o porquê de não ser o PNG. */
  guardada: Blob
  thumb: Blob
  largura: number
  altura: number
}

/**
 * Qualidade do JPEG guardado. Alta o bastante para ser indistinguível na tela e
 * no WhatsApp, que recomprime tudo de qualquer jeito.
 *
 * POR QUE NÃO GUARDAR O PNG: PNG é sem perda, e a montagem é feita de duas
 * fotos de celular lado a lado. MEDIDO no navegador, com as dimensões reais
 * deste fluxo: foto inteira de 3024x4032 dá um PNG de 60 MB; recorte de 70%,
 * 29,5 MB; de 50%, 17,6 MB. O limite de corpo de requisição deste projeto é 30
 * MB (`proxyClientMaxBodySize` em `next.config.ts`), e ao passar dele o Next
 * **corta o corpo em silêncio** — o multipart chega truncado, a leitura falha e
 * a montagem não é gravada, depois de o download já ter acontecido. Foi
 * exatamente isso que fez 7 de 14 montagens sumirem no primeiro dia de uso: o
 * limite caía no meio do jeito de enquadrar do dono, então salvava quem tinha
 * recorte fechado e perdia quem tinha recorte aberto.
 *
 * O mesmo canvas em JPEG dá ~4-6 MB. Guardar foto sem perda era o formato
 * errado para a tarefa, não um limite pequeno demais.
 */
const QUALIDADE_GUARDADA = 0.92

/** Teto de segurança para o que vai pela requisição, bem abaixo do limite de 30
 *  MB. Se um dia o JPEG de qualidade alta passar disto (foto gigante), a
 *  qualidade cai em degraus até caber, em vez de a montagem sumir calada. */
const GUARDADA_MAX_BYTES = 20 * 1024 * 1024
const QUALIDADES_DE_RECUO = [0.85, 0.75, 0.6]

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

  // A mesma imagem, em resolução cheia, no formato que cabe na requisição.
  let guardada = await paraBlob(canvas, 'image/jpeg', QUALIDADE_GUARDADA)
  for (const q of QUALIDADES_DE_RECUO) {
    if (guardada.size <= GUARDADA_MAX_BYTES) break
    guardada = await paraBlob(canvas, 'image/jpeg', q)
  }

  const escala = Math.min(1, THUMB_MAX_W / layout.largura)
  const mini = document.createElement('canvas')
  mini.width = Math.max(1, Math.round(layout.largura * escala))
  mini.height = Math.max(1, Math.round(layout.altura * escala))
  const miniCtx = mini.getContext('2d')!
  miniCtx.fillStyle = layout.fundo
  miniCtx.fillRect(0, 0, mini.width, mini.height)
  miniCtx.drawImage(canvas, 0, 0, mini.width, mini.height)
  const thumb = await paraBlob(mini, 'image/jpeg', 0.8)

  return { png, guardada, thumb, largura: layout.largura, altura: layout.altura }
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
  /** A montagem em JPEG de resolução cheia (`guardada` de `gerarMontagem`), não
   *  o PNG do download: ver `QUALIDADE_GUARDADA`. */
  imagem: Blob
  thumb: Blob
  identidade: Identidade
  patientId?: number | null
  pessoaId?: number | null
  dataAntes: string
  dataDepois: string
}): Promise<number> {
  const fd = new FormData()
  fd.append('imagem', entrada.imagem, 'montagem.jpg')
  fd.append('thumb', entrada.thumb, 'montagem-thumb.jpg')
  fd.append('identidade', entrada.identidade)
  if (entrada.patientId != null) fd.append('patientId', String(entrada.patientId))
  if (entrada.pessoaId != null) fd.append('pessoaId', String(entrada.pessoaId))
  fd.append('dataAntes', entrada.dataAntes)
  fd.append('dataDepois', entrada.dataDepois)

  // Avisa o servidor de que ESTA montagem não foi guardada, qualquer que tenha
  // sido o motivo — inclusive os que o servidor não tem como perceber sozinho
  // (rede caindo, aba fechada no meio do envio, resposta que nunca volta).
  // Melhor-esforço: se o aviso também falhar, segue em frente. A tarja na tela
  // continua sendo o que o dono vê; isto é para o registro não sumir quando ele
  // não estiver olhando.
  const avisarFalha = (motivo: string) => {
    try {
      void fetch('/api/fotos/montagens/falha', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          motivo,
          patientId: entrada.patientId ?? null,
          pessoaId: entrada.pessoaId ?? null,
          identidade: entrada.identidade,
          bytes: entrada.imagem.size,
        }),
        keepalive: true, // sobrevive à navegação para o próximo paciente
      }).catch(() => {})
    } catch {}
  }

  let res: Response
  try {
    res = await fetch('/api/fotos/montagens', { method: 'POST', body: fd })
  } catch (err) {
    avisarFalha(`requisição não completou: ${err instanceof Error ? err.message : String(err)}`)
    throw new Error('Não foi possível guardar na aba Fotos')
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    const motivo = body.error || `resposta ${res.status}`
    avisarFalha(motivo)
    throw new Error(body.error || 'Não foi possível guardar na aba Fotos')
  }
  const row = await res.json()
  return row.id as number
}
