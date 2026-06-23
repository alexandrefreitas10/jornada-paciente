import { NextRequest, NextResponse } from 'next/server'
import { getTermByToken } from '@/lib/patient-terms'
import { getSignedDownloadUrl } from '@/lib/s3'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params
    const term = await getTermByToken(token)
    if (!term?.file_s3_key) return NextResponse.json({ error: 'Termo não encontrado' }, { status: 404 })

    // After signing: serve the PDF with embedded signature; before signing: serve original
    const signed = req.nextUrl.searchParams.get('signed') === '1'
    const key = (signed && term.signed_file_s3_key) ? term.signed_file_s3_key : term.file_s3_key
    console.log('[download file] token:', token, 'signed:', signed, 'key:', key)

    try {
      const url = await getSignedDownloadUrl(key!)
      return NextResponse.redirect(url)
    } catch (err) {
      console.error('[getSignedDownloadUrl error] key:', key, 'error:', err)
      return NextResponse.json({ error: 'Erro ao baixar arquivo: ' + String(err) }, { status: 500 })
    }
  } catch (err) {
    console.error('[download file error]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
