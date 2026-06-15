import { NextRequest, NextResponse } from 'next/server'
import { getFileById } from '@/lib/patient-files'
import { getSignedDownloadUrlWithFilename } from '@/lib/s3'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; fid: string }> }
) {
  const { fid } = await params
  const file = await getFileById(Number(fid))
  if (!file) return NextResponse.json({ error: 'Arquivo não encontrado' }, { status: 404 })

  const url = await getSignedDownloadUrlWithFilename(file.s3_key, file.original_name)
  return NextResponse.redirect(url)
}
