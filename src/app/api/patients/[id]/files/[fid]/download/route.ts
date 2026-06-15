import { NextRequest, NextResponse } from 'next/server'
import { getFileById } from '@/lib/patient-files'
import { getSignedDownloadUrlWithFilename, getFileStream } from '@/lib/s3'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; fid: string }> }
) {
  const { fid } = await params
  const file = await getFileById(Number(fid))
  if (!file) return NextResponse.json({ error: 'Arquivo não encontrado' }, { status: 404 })

  // ?proxy=1 → stream direto (usado pelo canvas para evitar CORS)
  if (req.nextUrl.searchParams.get('proxy') === '1') {
    const { body, contentType } = await getFileStream(file.s3_key)
    return new NextResponse(body, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'private, max-age=60',
      },
    })
  }

  // padrão → redirect para URL assinada com Content-Disposition
  const url = await getSignedDownloadUrlWithFilename(file.s3_key, file.original_name)
  return NextResponse.redirect(url)
}
