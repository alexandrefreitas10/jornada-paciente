import { redirect } from 'next/navigation'
import { getPatient } from '@/lib/patients'
import { listMeasurements } from '@/lib/measurements'
import { listPatientFiles } from '@/lib/patient-files'
import { getSignedDownloadUrl } from '@/lib/s3'
import { PatientDetailClient } from '@/components/PatientDetailClient'
import { portalAuth } from '@/auth-portal'
import { logoutPortal } from './actions'

export const dynamic = 'force-dynamic'

export default async function PortalPatientPage() {
  const session = await portalAuth()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const patientId = (session?.user as any)?.patient_id as number | undefined

  if (!patientId) redirect('/portal/login')

  const [patient, measurements, photos, bioimpedances, exams, diets, evolutionPhotos, prescriptions] = await Promise.all([
    getPatient(patientId),
    listMeasurements(patientId),
    listPatientFiles(patientId, 'photo'),
    listPatientFiles(patientId, 'bioimpedance'),
    listPatientFiles(patientId, 'exam'),
    listPatientFiles(patientId, 'diet'),
    listPatientFiles(patientId, 'evolution'),
    listPatientFiles(patientId, 'prescription'),
  ])

  if (!patient) redirect('/portal/login')

  const withUrls = async (files: typeof photos) =>
    Promise.all(files.map(async (f) => ({ ...f, url: await getSignedDownloadUrl(f.s3_key) })))

  const [initialPhotos, initialBioimpedances, initialExams, initialDiets, initialEvolutionPhotos, initialPrescriptions] = await Promise.all([
    withUrls(photos),
    withUrls(bioimpedances),
    withUrls(exams),
    withUrls(diets),
    withUrls(evolutionPhotos),
    withUrls(prescriptions),
  ])

  return (
    <div>
      <div className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between">
        <span className="text-sm font-semibold text-gray-700">🌸 Minha Área</span>
        <form action={logoutPortal}>
          <button type="submit" className="text-xs text-gray-500 hover:text-gray-700">Sair</button>
        </form>
      </div>
      <PatientDetailClient
        patient={patient}
        initialMeasurements={measurements}
        initialPhotos={initialPhotos}
        initialBioimpedances={initialBioimpedances}
        initialExams={initialExams}
        initialDiets={initialDiets}
        initialEvolutionPhotos={initialEvolutionPhotos}
        initialPrescriptions={initialPrescriptions}
        currentUserName=""
        readOnly={true}
      />
    </div>
  )
}
