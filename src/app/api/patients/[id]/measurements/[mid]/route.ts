import { NextRequest } from 'next/server'
import { auth } from '@/auth'
import { updateMeasurement, deleteMeasurement, getMeasurementById } from '@/lib/measurements'
import { logAudit } from '@/lib/audit'

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; mid: string }> }
) {
  const { mid } = await params
  const body = await req.json()
  const measurement = await updateMeasurement(Number(mid), body)
  return Response.json(measurement)
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; mid: string }> }
) {
  const { id, mid } = await params
  const session = await auth()
  const userName = session?.user?.name ?? 'Desconhecido'
  const measurement = await getMeasurementById(Number(mid))
  await deleteMeasurement(Number(mid))
  await logAudit({ userName, action: 'DELETE', entityType: 'measurement', entityId: mid, patientId: Number(id), details: `Semana ${measurement?.week ?? '—'}`, deletedData: measurement as unknown as Record<string, unknown> ?? undefined })
  return new Response(null, { status: 204 })
}
