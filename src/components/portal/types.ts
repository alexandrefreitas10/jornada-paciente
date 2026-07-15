// Contrato de dados do Portal do Paciente (montado no servidor e passado ao PortalApp).

export type Screen =
  | 'home' | 'fotos' | 'exames' | 'bio'
  | 'dieta' | 'med' | 'termos' | 'estetica' | 'perfil' | 'ouvidoria'

export interface PortalFile {
  id: number
  original_name: string
  created_at: string
  url: string
  summary?: string | null
}

export interface PortalTerm {
  id: number
  title: string
  status: 'draft' | 'sent' | 'signed'
  signed_at: string | null
  sent_at: string | null
  sign_token: string | null
  hasSignedFile: boolean
}

export interface PortalMedication {
  id: number
  item_name: string
  quantity: number
  lot: string | null
  expiry_date: string | null
  created_at: string
  observation: string | null
}

export interface PortalSession {
  id: number
  name: string
  total_sessions: number
  created_at: string
  completedCount: number
}

export interface PortalMeasurement {
  week: number | null
  date: string | null
  weight: number | null
  abdominal_circumference: number | null
  waist_circumference: number | null
}

export interface PortalData {
  patientId: number
  name: string
  startDate: string | null
  tasksDone: number
  tasksTotal: number
  hasEstetica: boolean
  photos: PortalFile[]
  exams: PortalFile[]
  bioimpedances: PortalFile[]
  diets: PortalFile[]
  medications: PortalMedication[]
  sessions: PortalSession[]
  terms: PortalTerm[]
  measurements: PortalMeasurement[]
}
