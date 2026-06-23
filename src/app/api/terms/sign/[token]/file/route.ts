import { NextRequest, NextResponse } from 'next/server'
import { getTermByToken } from '@/lib/patient-terms'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params
    const term = await getTermByToken(token)
    if (!term) return NextResponse.json({ error: 'Termo não encontrado' }, { status: 404 })

    // After signing: serve the PDF with embedded signature; before signing: serve original
    const signed = req.nextUrl.searchParams.get('signed') === '1'
    const fileData = (signed && term.signed_file_s3_key) ? Buffer.from(term.signed_file_s3_key) : term.file_s3_key
    const fileName = term.file_name || `termo-${token}.pdf`
    const mimeType = term.file_mime || 'application/pdf'

    if (!fileData) {
      return NextResponse.json({ error: 'Arquivo não encontrado' }, { status: 404 })
    }

    return new NextResponse(fileData, {
      headers: {
        'Content-Type': mimeType,
        'Content-Disposition': `inline; filename="${fileName}"`,
        'Content-Length': fileData.length.toString(),
      },
    })
  } catch (err) {
    console.error('[download file error]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
