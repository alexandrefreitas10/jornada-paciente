import { NextRequest, NextResponse } from 'next/server'
import { getTermById } from '@/lib/patient-terms'
import { getSignedDownloadUrl } from '@/lib/s3'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ tid: string }> }
) {
  const { tid } = await params
  const term = await getTermById(Number(tid))
  if (!term?.file_s3_key) return NextResponse.json({ error: 'Arquivo não encontrado' }, { status: 404 })

  // Prefer the signed version (with embedded signature) when available
  const key = term.signed_file_s3_key ?? term.file_s3_key
  const isSignedDocx = term.signed_file_s3_key?.endsWith('.docx')
  const fileName = isSignedDocx
    ? (term.file_name?.replace(/\.[^.]+$/, '') ?? 'termo') + '_assinado.docx'
    : term.file_name ?? 'documento'

  const url = await getSignedDownloadUrl(key)
  return NextResponse.redirect(url)
}
