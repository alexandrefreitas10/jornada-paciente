import { NextRequest, NextResponse } from 'next/server'
import { getTermByToken } from '@/lib/patient-terms'
import { getSignedDownloadUrl } from '@/lib/s3'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params
  const term = await getTermByToken(token)
  if (!term?.file_s3_key) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 })

  // After signing: serve the PDF with embedded signature; before signing: serve original
  const signed = req.nextUrl.searchParams.get('signed') === '1'
  const key = (signed && term.signed_file_s3_key) ? term.signed_file_s3_key : term.file_s3_key
  const url = await getSignedDownloadUrl(key!)
  return NextResponse.redirect(url)
}
