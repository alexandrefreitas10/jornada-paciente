import { NextRequest } from 'next/server'
import { auth } from '@/auth'
import { deletePatientFileAndReturn } from '@/lib/patient-files'
import { deleteFile } from '@/lib/s3'
import { logAudit } from '@/lib/audit'

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; fid: string }> }
) {
  const { id, fid } = await params
  const session = await auth()
  const userName = session?.user?.name ?? 'Desconhecido'
  const fileRecord = await deletePatientFileAndReturn(Number(fid))
  if (fileRecord) await deleteFile(fileRecord.s3_key)
  await logAudit({ userName, action: 'DELETE', entityType: 'file', entityId: fid, patientId: Number(id), details: fileRecord?.original_name, deletedData: fileRecord as unknown as Record<string, unknown> ?? undefined })
  return new Response(null, { status: 204 })
}
