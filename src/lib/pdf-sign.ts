import { PDFDocument, rgb, StandardFonts, PDFPage } from 'pdf-lib'

// pdf-lib standard fonts only support ASCII — remove diacritics
function lat(str: string): string {
  return str.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\x20-\x7E]/g, '')
}

const PAGE_W = 595, PAGE_H = 842, MARGIN = 50, LINE_H = 16, FONT_SIZE = 11

/** Generates a PDF from plain text content (replaces {{field}} with filled values). */
export async function generatePdfFromText(
  title: string,
  content: string,
): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)
  const maxW = PAGE_W - MARGIN * 2

  function newPage(): PDFPage {
    return doc.addPage([PAGE_W, PAGE_H])
  }

  function wrapLine(text: string, fnt: typeof font, size: number): string[] {
    const safe = lat(text)
    const words = safe.split(' ')
    const lines: string[] = []
    let current = ''
    for (const word of words) {
      const test = current ? `${current} ${word}` : word
      if (fnt.widthOfTextAtSize(test, size) > maxW) {
        if (current) lines.push(current)
        current = word
      } else {
        current = test
      }
    }
    if (current) lines.push(current)
    return lines.length ? lines : ['']
  }

  let page = newPage()
  let y = PAGE_H - MARGIN

  // Title
  for (const line of wrapLine(title, bold, 14)) {
    page.drawText(line, { x: MARGIN, y, size: 14, font: bold, color: rgb(0.1, 0.1, 0.1) })
    y -= 20
  }
  y -= 8
  page.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE_W - MARGIN, y }, thickness: 0.5, color: rgb(0.8, 0.8, 0.8) })
  y -= 16

  // Body paragraphs
  for (const para of content.split('\n')) {
    if (!para.trim()) { y -= LINE_H; continue }
    for (const line of wrapLine(para, font, FONT_SIZE)) {
      if (y < MARGIN + 60) { page = newPage(); y = PAGE_H - MARGIN }
      page.drawText(line, { x: MARGIN, y, size: FONT_SIZE, font, color: rgb(0.15, 0.15, 0.15) })
      y -= LINE_H
    }
    y -= 6
  }

  return doc.save()
}

export interface SignatureBlock {
  termTitle: string
  signerName: string
  signedAt: string
  signatureDataUrl: string
  filledFields?: Record<string, string>
}

/** Embeds filled fields + signature on the first page (overlay style) */
export async function embedSignatureInPdf(
  pdfBytes: Uint8Array,
  block: SignatureBlock,
): Promise<Uint8Array> {
  const doc = await PDFDocument.load(pdfBytes)
  const page = doc.getPage(0)
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)

  const { width, height } = page.getSize()
  const m = 30
  let y = height - m - 20

  // Render filled fields at top
  const fieldEntries = Object.entries(block.filledFields ?? {}).filter(([, v]) => v?.trim())
  if (fieldEntries.length > 0) {
    page.drawText('Dados preenchidos:', { x: m, y, size: 10, font: bold, color: rgb(0.1, 0.1, 0.1) })
    y -= 18
    for (const [key, value] of fieldEntries) {
      page.drawText(`${lat(key)}: ${lat(value)}`, { x: m, y, size: 9, font, color: rgb(0.15, 0.15, 0.15), maxWidth: width - m * 2 })
      y -= 14
    }
    y -= 10
  }

  // Render signature
  const base64 = block.signatureDataUrl.replace(/^data:image\/png;base64,/, '')
  const sigBytes = Buffer.from(base64, 'base64')
  const sigImage = await doc.embedPng(sigBytes)
  page.drawText('Assinado por:', { x: m, y, size: 9, font: bold, color: rgb(0.3, 0.3, 0.3) })
  y -= 14
  page.drawText(lat(block.signerName), { x: m, y, size: 9, font: bold, color: rgb(0.1, 0.1, 0.1) })
  y -= 16

  const dateStr = new Date(block.signedAt).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo',
  })
  page.drawText(lat(`${dateStr}`), { x: m, y, size: 8, font, color: rgb(0.5, 0.5, 0.5) })
  y -= 20

  const sigDims = sigImage.scaleToFit(150, 60)
  page.drawImage(sigImage, { x: m, y: y - sigDims.height, width: sigDims.width, height: sigDims.height })

  return doc.save()
}

/** Creates a standalone 1-page signature certificate PDF. */
export async function buildSignatureCertificate(
  block: SignatureBlock,
): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  await buildSignaturePage(doc, block)
  return doc.save()
}

async function buildSignaturePage(doc: PDFDocument, block: SignatureBlock) {
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)

  const base64 = block.signatureDataUrl.replace(/^data:image\/png;base64,/, '')
  const sigBytes = Buffer.from(base64, 'base64')
  const sigImage = await doc.embedPng(sigBytes)

  const W = 595, H = 842
  const m = 50

  let y = H - m

  const page = doc.addPage([W, H])

  // Header bar
  page.drawRectangle({ x: 0, y: H - 70, width: W, height: 70, color: rgb(0.1, 0.35, 0.65) })
  page.drawText('Comprovante de Assinatura Eletronica', {
    x: m, y: H - 42, size: 15, font: bold, color: rgb(1, 1, 1),
  })
  page.drawText('Documento gerado automaticamente pelo sistema', {
    x: m, y: H - 58, size: 8, font, color: rgb(0.8, 0.9, 1),
  })

  y = H - 100

  page.drawText('Termo:', { x: m, y, size: 9, font, color: rgb(0.5, 0.5, 0.5) })
  y -= 16
  page.drawText(lat(block.termTitle), { x: m, y, size: 12, font: bold, color: rgb(0.1, 0.1, 0.1), maxWidth: W - m * 2 })
  y -= 30

  page.drawLine({ start: { x: m, y }, end: { x: W - m, y }, thickness: 0.5, color: rgb(0.8, 0.8, 0.8) })
  y -= 20

  page.drawText('Assinado por', { x: m, y, size: 9, font, color: rgb(0.5, 0.5, 0.5) })
  y -= 16
  page.drawText(lat(block.signerName), { x: m, y, size: 13, font: bold, color: rgb(0.1, 0.1, 0.1) })
  y -= 18

  const dateStr = new Date(block.signedAt).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo',
  })
  page.drawText(lat(`Data e hora: ${dateStr} (horario de Brasilia)`), {
    x: m, y, size: 9, font, color: rgb(0.3, 0.3, 0.3),
  })
  y -= 30

  const fieldEntries = Object.entries(block.filledFields ?? {}).filter(([, v]) => v?.trim())
  if (fieldEntries.length > 0) {
    page.drawLine({ start: { x: m, y }, end: { x: W - m, y }, thickness: 0.5, color: rgb(0.8, 0.8, 0.8) })
    y -= 20
    page.drawText('Campos preenchidos pelo signatario', { x: m, y, size: 9, font: bold, color: rgb(0.3, 0.3, 0.3) })
    y -= 16
    for (const [key, value] of fieldEntries) {
      page.drawText(`${lat(key)}:`, { x: m, y, size: 8, font: bold, color: rgb(0.4, 0.4, 0.4) })
      page.drawText(lat(value), { x: m + 130, y, size: 8, font, color: rgb(0.1, 0.1, 0.1), maxWidth: W - m - 140 })
      y -= 16
    }
    y -= 10
  }

  page.drawLine({ start: { x: m, y }, end: { x: W - m, y }, thickness: 0.5, color: rgb(0.8, 0.8, 0.8) })
  y -= 20

  page.drawText('Assinatura:', { x: m, y, size: 9, font, color: rgb(0.5, 0.5, 0.5) })
  y -= 8
  const sigDims = sigImage.scaleToFit(220, 80)
  page.drawRectangle({
    x: m, y: y - sigDims.height,
    width: sigDims.width, height: sigDims.height,
    color: rgb(0.98, 0.98, 0.98),
    borderColor: rgb(0.85, 0.85, 0.85),
    borderWidth: 0.5,
  })
  page.drawImage(sigImage, { x: m, y: y - sigDims.height, width: sigDims.width, height: sigDims.height })
  y -= sigDims.height + 30

  page.drawLine({ start: { x: m, y }, end: { x: W - m, y }, thickness: 0.5, color: rgb(0.8, 0.8, 0.8) })
  y -= 14
  page.drawText(
    'Este comprovante e prova da assinatura eletronica registrada no sistema.',
    { x: m, y, size: 7, font, color: rgb(0.55, 0.55, 0.55), maxWidth: W - m * 2 },
  )

  return page
}
