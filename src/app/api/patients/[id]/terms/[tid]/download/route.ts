import { NextRequest, NextResponse } from 'next/server'
import { getTermById } from '@/lib/patient-terms'
import { getSignedDownloadUrl } from '@/lib/s3'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ tid: string }> }
) {
  const { tid } = await params
  const term = await getTermById(Number(tid))

  // Text-based terms have no file_s3_key but may have a signed_file_s3_key after signing
  const key = term?.signed_file_s3_key ?? term?.file_s3_key
  if (!term || !key) return NextResponse.json({ error: 'Arquivo não encontrado' }, { status: 404 })

  const isSignedDocx = term?.signed_file_s3_key?.endsWith('.docx')
  const fileName = term?.signed_file_s3_key
    ? (isSignedDocx
        ? (term.file_name?.replace(/\.[^.]+$/, '') ?? term.title) + '_assinado.docx'
        : (term.file_name?.replace(/\.[^.]+$/, '') ?? term.title) + '_assinado.pdf')
    : term.file_name ?? 'documento'

  const url = await getSignedDownloadUrl(key)
  return NextResponse.redirect(url)
}
