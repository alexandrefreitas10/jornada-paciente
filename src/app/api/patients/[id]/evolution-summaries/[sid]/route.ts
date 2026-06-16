import { NextRequest, NextResponse } from 'next/server'
import { deleteEvolutionSummary, getEvolutionSummaryAudioKey } from '@/lib/evolution-summaries'
import { deleteFile } from '@/lib/s3'

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; sid: string }> }
) {
  const { sid } = await params
  const audioKey = await getEvolutionSummaryAudioKey(Number(sid))
  await deleteEvolutionSummary(Number(sid))
  if (audioKey) await deleteFile(audioKey).catch(() => {})
  return new Response(null, { status: 204 })
}
