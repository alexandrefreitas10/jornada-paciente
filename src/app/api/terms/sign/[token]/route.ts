import { NextRequest } from 'next/server'
import { getTermByToken, signTerm, signTermWithFile } from '@/lib/patient-terms'
import { uploadFile, downloadFile } from '@/lib/s3'
import { embedSignatureInPdf, buildSignatureCertificate } from '@/lib/pdf-sign'
import { embedSignatureInDocx } from '@/lib/docx-sign'
import { randomUUID } from 'crypto'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params
  const term = await getTermByToken(token)
  if (!term) return Response.json({ error: 'Link inválido ou expirado' }, { status: 404 })
  return Response.json(term)
}

const WORD_MIMES = [
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]

async function generateSignedFile(
  sourceS3Key: string | null,
  sourceMime: string | null,
  signerName: string,
  signatureData: string,
  filledFields: Record<string, string>,
  termTitle: string,
  signedAt: string,
): Promise<{ key: string; mime: string; name: string } | null> {
  try {
    const block = {
      termTitle,
      signerName,
      signedAt,
      signatureDataUrl: signatureData,
      filledFields,
    }

    let fileBytes: Buffer
    let mime: string
    let ext: string
    let nameSuffix: string

    if (sourceS3Key && sourceMime === 'application/pdf') {
      // Embed signature page into the PDF
      const original = await downloadFile(sourceS3Key)
      const signed = await embedSignatureInPdf(new Uint8Array(original), block)
      fileBytes = Buffer.from(signed)
      mime = 'application/pdf'
      ext = 'pdf'
      nameSuffix = '_assinado.pdf'
    } else if (sourceS3Key && WORD_MIMES.includes(sourceMime ?? '')) {
      // Embed signature block into the Word document
      const original = await downloadFile(sourceS3Key)
      fileBytes = await embedSignatureInDocx(original, signerName, signedAt, signatureData, filledFields)
      mime = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      ext = 'docx'
      nameSuffix = '_assinado.docx'
    } else {
      // Fallback: standalone PDF certificate
      const cert = await buildSignatureCertificate(block)
      fileBytes = Buffer.from(cert)
      mime = 'application/pdf'
      ext = 'pdf'
      nameSuffix = '_comprovante.pdf'
    }

    const key = `terms/signed/${randomUUID()}.${ext}`
    await uploadFile(key, fileBytes, mime)
    console.log('[terms] signed file generated:', key)
    return { key, mime, name: nameSuffix }
  } catch (err) {
    console.error('[terms] Failed to generate signed file:', err)
    return null
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params
  const term = await getTermByToken(token)
  if (!term) return Response.json({ error: 'Link inválido' }, { status: 404 })
  if (term.status === 'signed') return Response.json({ error: 'Termo já assinado' }, { status: 409 })

  const contentType = req.headers.get('content-type') ?? ''
  const signedAt = new Date().toISOString()

  if (contentType.includes('multipart/form-data')) {
    const fd = await req.formData()
    const signerName = (fd.get('signerName') as string | null)?.trim()
    const signatureData = fd.get('signatureData') as string | null
    const filledFile = fd.get('filledFile') as File | null
    const filledFieldsRaw = (fd.get('filledFields') as string | null) ?? '{}'
    const filledFields: Record<string, string> = JSON.parse(filledFieldsRaw)

    if (!signerName || !signatureData) {
      return Response.json({ error: 'Nome e assinatura obrigatórios' }, { status: 400 })
    }

    if (filledFile && filledFile.size > 0) {
      const ext = filledFile.name.split('.').pop() ?? 'pdf'
      const s3Key = `terms/filled/${randomUUID()}.${ext}`
      const buffer = Buffer.from(await filledFile.arrayBuffer())
      await uploadFile(s3Key, buffer, filledFile.type as never)

      const signed = await generateSignedFile(s3Key, filledFile.type, signerName, signatureData, filledFields, term.title, signedAt)
      const updated = await signTermWithFile(token, signerName, signatureData, s3Key, filledFile.name, filledFields, signed?.key ?? null)
      return Response.json(updated)
    }

    const signed = await generateSignedFile(term.file_s3_key, term.file_mime, signerName, signatureData, filledFields, term.title, signedAt)
    const updated = await signTerm(token, signerName, signatureData, filledFields, signed?.key ?? null)
    return Response.json(updated)
  }

  // fallback JSON
  const { signerName, signatureData } = await req.json()
  if (!signerName?.trim() || !signatureData) {
    return Response.json({ error: 'Nome e assinatura obrigatórios' }, { status: 400 })
  }
  const signed = await generateSignedFile(term.file_s3_key, term.file_mime, signerName.trim(), signatureData, {}, term.title, signedAt)
  const updated = await signTerm(token, signerName.trim(), signatureData, {}, signed?.key ?? null)
  return Response.json(updated)
}
