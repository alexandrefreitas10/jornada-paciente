import { NextRequest } from 'next/server'
import { auth } from '@/auth'
import { deletePatientFile } from '@/lib/patient-files'
import { deleteFile } from '@/lib/s3'
import { logAudit } from '@/lib/audit'

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; fid: string }> }
) {
  const { id, fid } = await params
  const session = await auth()
  const userName = session?.user?.name ?? 'Desconhecido'
  const s3Key = await deletePatientFile(Number(fid))
  await deleteFile(s3Key)
  await logAudit({ userName, action: 'DELETE', entityType: 'file', entityId: fid, patientId: Number(id) })
  return new Response(null, { status: 204 })
}
