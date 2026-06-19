import { PDFDocument, rgb, StandardFonts } from 'pdf-lib'

export interface SignatureBlock {
  termTitle: string
  signerName: string
  signedAt: string
  signatureDataUrl: string
  filledFields?: Record<string, string>
}

// pdf-lib standard fonts only support ASCII — remove diacritics
function lat(str: string): string {
  return str.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\x20-\x7E]/g, '')
}

/** Appends a signature page to an existing PDF and returns the new bytes. */
export async function embedSignatureInPdf(
  pdfBytes: Uint8Array,
  block: SignatureBlock,
): Promise<Uint8Array> {
  const doc = await PDFDocument.load(pdfBytes)
  await buildSignaturePage(doc, block)
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

  const W = 595, H = 842 // A4
  const page = doc.addPage([W, H])
  const m = 50

  let y = H - m

  // Header bar
  page.drawRectangle({ x: 0, y: H - 70, width: W, height: 70, color: rgb(0.1, 0.35, 0.65) })
  page.drawText('Comprovante de Assinatura Eletronica', {
    x: m, y: H - 42, size: 15, font: bold, color: rgb(1, 1, 1),
  })
  page.drawText('Documento gerado automaticamente pelo sistema', {
    x: m, y: H - 58, size: 8, font, color: rgb(0.8, 0.9, 1),
  })

  y = H - 100

  // Term title
  page.drawText('Termo:', { x: m, y, size: 9, font, color: rgb(0.5, 0.5, 0.5) })
  y -= 16
  page.drawText(lat(block.termTitle), { x: m, y, size: 12, font: bold, color: rgb(0.1, 0.1, 0.1), maxWidth: W - m * 2 })
  y -= 30

  // Divider
  page.drawLine({ start: { x: m, y }, end: { x: W - m, y }, thickness: 0.5, color: rgb(0.8, 0.8, 0.8) })
  y -= 20

  // Signer info
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

  // Filled fields
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

  // Divider before signature
  page.drawLine({ start: { x: m, y }, end: { x: W - m, y }, thickness: 0.5, color: rgb(0.8, 0.8, 0.8) })
  y -= 20

  // Signature image
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

  // Footer note
  page.drawLine({ start: { x: m, y }, end: { x: W - m, y }, thickness: 0.5, color: rgb(0.8, 0.8, 0.8) })
  y -= 14
  page.drawText(
    'Este comprovante e prova da assinatura eletronica registrada no sistema.',
    { x: m, y, size: 7, font, color: rgb(0.55, 0.55, 0.55), maxWidth: W - m * 2 },
  )

  return page
}
