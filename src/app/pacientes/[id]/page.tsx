import { notFound } from 'next/navigation'
import { getPatient } from '@/lib/patients'
import { listMeasurements } from '@/lib/measurements'
import { listPatientFiles } from '@/lib/patient-files'
import { getSignedDownloadUrl } from '@/lib/s3'
import { PatientDetailClient } from '@/components/PatientDetailClient'

export const dynamic = 'force-dynamic'

export default async function PatientPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const patientId = Number(id)

  const [patient, measurements, photos, bioimpedances, exams, diets] = await Promise.all([
    getPatient(patientId),
    listMeasurements(patientId),
    listPatientFiles(patientId, 'photo'),
    listPatientFiles(patientId, 'bioimpedance'),
    listPatientFiles(patientId, 'exam'),
    listPatientFiles(patientId, 'diet'),
  ])

  if (!patient) notFound()

  const withUrls = async (files: typeof photos) =>
    Promise.all(files.map(async (f) => ({ ...f, url: await getSignedDownloadUrl(f.s3_key) })))

  const [initialPhotos, initialBioimpedances, initialExams, initialDiets] = await Promise.all([
    withUrls(photos),
    withUrls(bioimpedances),
    withUrls(exams),
    withUrls(diets),
  ])

  return (
    <PatientDetailClient
      patient={patient}
      initialMeasurements={measurements}
      initialPhotos={initialPhotos}
      initialBioimpedances={initialBioimpedances}
      initialExams={initialExams}
      initialDiets={initialDiets}
    />
  )
}
