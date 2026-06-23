import { NextRequest } from 'next/server'
import { auth } from '@/auth'
import { deleteEvolutionSummary, getEvolutionSummaryAudioKey } from '@/lib/evolution-summaries'
import { deleteFile } from '@/lib/s3'
import { logAudit } from '@/lib/audit'

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; sid: string }> }
) {
  const { id, sid } = await params
  const session = await auth()
  const userName = session?.user?.name ?? 'Desconhecido'
  const audioKey = await getEvolutionSummaryAudioKey(Number(sid))
  await deleteEvolutionSummary(Number(sid))
  if (audioKey) await deleteFile(audioKey).catch(() => {})
  await logAudit({ userName, action: 'DELETE', entityType: 'evolution_summary', entityId: sid, patientId: Number(id) })
  return new Response(null, { status: 204 })
}
