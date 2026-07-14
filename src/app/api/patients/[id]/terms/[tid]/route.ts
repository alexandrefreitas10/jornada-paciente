import { NextRequest } from 'next/server'
import { auth } from '@/auth'
import { deletePatientTerm, getPatientTermById } from '@/lib/patient-terms'
import { ownsResource } from '@/lib/authz'
import { logAudit } from '@/lib/audit'

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; tid: string }> }
) {
  const { id, tid } = await params
  const session = await auth()
  const userName = session?.user?.name ?? 'Desconhecido'
  const term = await getPatientTermById(Number(tid))
  // Anti-IDOR: o termo tem que pertencer ao paciente do path
  if (!ownsResource(term, Number(id))) {
    return new Response(null, { status: 404 })
  }
  await deletePatientTerm(Number(tid))
  await logAudit({ userName, action: 'DELETE', entityType: 'term', entityId: tid, patientId: Number(id), details: term?.title, deletedData: term ?? undefined })
  return new Response(null, { status: 204 })
}
