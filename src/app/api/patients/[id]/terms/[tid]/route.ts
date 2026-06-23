import { NextRequest } from 'next/server'
import { auth } from '@/auth'
import { deletePatientTerm, getPatientTermById } from '@/lib/patient-terms'
import { deleteFile } from '@/lib/s3'
import { logAudit } from '@/lib/audit'

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; tid: string }> }
) {
  const { id, tid } = await params
  const session = await auth()
  const userName = session?.user?.name ?? 'Desconhecido'
  const term = await getPatientTermById(Number(tid))
  const { file_s3_key } = await deletePatientTerm(Number(tid))
  if (file_s3_key) await deleteFile(file_s3_key).catch(() => {})
  await logAudit({ userName, action: 'DELETE', entityType: 'term', entityId: tid, patientId: Number(id), details: term?.title, deletedData: term ?? undefined })
  return new Response(null, { status: 204 })
}
