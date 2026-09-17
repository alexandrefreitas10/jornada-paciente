// __tests__/components/ArchivedPatientsList.test.tsx
import { render, screen } from '@testing-library/react'
import { ArchivedPatientsList } from '@/components/ArchivedPatientsList'
import type { ArchivedPatientItem } from '@/lib/patients'

jest.mock('next/navigation', () => ({ useRouter: () => ({ refresh: jest.fn() }) }))

const base = {
  start_date: '2026-07-01', duration: '12', notes: '', created_at: '2026-07-01T12:00:00.000Z',
  created_by: 'Carlos', completed_count: 0,
}

const pacientes: ArchivedPatientItem[] = [
  { ...base, id: 1, name: 'Ana Souza', archive_reason: 'Parou por custo', archived_by: 'Carlos', archive_event_at: '2026-09-17T17:00:00.000Z' },
  { ...base, id: 2, name: 'Bruno Lima', archive_reason: null, archived_by: null, archive_event_at: null },
]

describe('ArchivedPatientsList', () => {
  it('mostra o motivo, quem arquivou e a data', () => {
    render(<ArchivedPatientsList patients={pacientes} />)
    expect(screen.getByText('📝 Parou por custo — Carlos, 17/09/2026')).toBeInTheDocument()
  })

  it('quem foi arquivado sem motivo registrado não mostra a linha', () => {
    render(<ArchivedPatientsList patients={pacientes} />)
    expect(screen.getAllByText(/📝/)).toHaveLength(1)
  })
})
