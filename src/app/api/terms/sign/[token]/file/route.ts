import { NextRequest, NextResponse } from 'next/server'
import { getTermByToken } from '@/lib/patient-terms'
import { getSignedDownloadUrl } from '@/lib/s3'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params
  const term = await getTermByToken(token)
  if (!term?.file_s3_key) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 })
  const url = await getSignedDownloadUrl(term.file_s3_key)
  return NextResponse.redirect(url)
}
