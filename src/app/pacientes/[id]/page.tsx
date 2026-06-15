import { notFound } from 'next/navigation'
import { getPatient } from '@/lib/patients'
import { listMeasurements } from '@/lib/measurements'
import { PatientDetailClient } from '@/components/PatientDetailClient'

export const dynamic = 'force-dynamic'

export default async function PatientPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [patient, measurements] = await Promise.all([
    getPatient(Number(id)),
    listMeasurements(Number(id)),
  ])
  if (!patient) notFound()
  return <PatientDetailClient patient={patient} initialMeasurements={measurements} />
}
