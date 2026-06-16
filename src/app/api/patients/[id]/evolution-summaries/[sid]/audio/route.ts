import { NextRequest, NextResponse } from 'next/server'
import { getEvolutionSummaryAudioKey } from '@/lib/evolution-summaries'
import { getSignedDownloadUrl } from '@/lib/s3'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; sid: string }> }
) {
  const { sid } = await params
  const audioKey = await getEvolutionSummaryAudioKey(Number(sid))
  if (!audioKey) return NextResponse.json({ error: 'Áudio não encontrado' }, { status: 404 })
  const url = await getSignedDownloadUrl(audioKey)
  return NextResponse.redirect(url)
}
