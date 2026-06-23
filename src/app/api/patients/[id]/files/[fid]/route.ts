import { NextRequest } from 'next/server'
import { auth } from '@/auth'
import { softDeletePatientFile } from '@/lib/patient-files'
import { logAudit } from '@/lib/audit'

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; fid: string }> }
) {
  const { id, fid } = await params
  const session = await auth()
  const userName = session?.user?.name ?? 'Desconhecido'
  // Soft-delete: mantém o arquivo no S3 para que possa ser restaurado
  const fileRecord = await softDeletePatientFile(Number(fid))
  await logAudit({ userName, action: 'DELETE', entityType: 'file', entityId: fid, patientId: Number(id), details: fileRecord?.original_name, deletedData: fileRecord ?? undefined })
  return new Response(null, { status: 204 })
}
