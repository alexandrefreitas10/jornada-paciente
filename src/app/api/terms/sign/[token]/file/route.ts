import { NextRequest, NextResponse } from 'next/server'
import { getTermByToken } from '@/lib/patient-terms'
import { getFileStream } from '@/lib/s3'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params
    const term = await getTermByToken(token)
    if (!term) return NextResponse.json({ error: 'Termo não encontrado' }, { status: 404 })

    // After signing: serve the signed PDF; before signing: serve original
    const signed = req.nextUrl.searchParams.get('signed') === '1'
    const s3Key = (signed && term.signed_file_s3_key) ? term.signed_file_s3_key : term.file_s3_key
    const fileName = term.file_name || `termo-${token}.pdf`

    if (!s3Key) {
      return NextResponse.json({ error: 'Arquivo não encontrado' }, { status: 404 })
    }

    const { body, contentType } = await getFileStream(s3Key)
    return new NextResponse(body, {
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `inline; filename="${fileName}"`,
      },
    })
  } catch (err) {
    console.error('[download file error]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
