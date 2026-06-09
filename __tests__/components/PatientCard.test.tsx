// __tests__/components/PatientCard.test.tsx
import { render, screen } from '@testing-library/react'
import { PatientCard } from '@/components/PatientCard'

jest.mock('next/link', () => {
  return function MockLink({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) {
    return <a href={href} className={className}>{children}</a>
  }
})

const patient = {
  id: 1,
  name: 'Maria Souza',
  start_date: '2026-06-01',
  duration: '3 meses',
  notes: '',
  created_at: '2026-06-01',
  completed_count: 7,
}

describe('PatientCard', () => {
  it('exibe nome do paciente', () => {
    render(<PatientCard patient={patient} />)
    expect(screen.getByText('Maria Souza')).toBeInTheDocument()
  })

  it('exibe inicial do nome no avatar', () => {
    render(<PatientCard patient={patient} />)
    expect(screen.getByText('M')).toBeInTheDocument()
  })

  it('exibe contagem de tarefas', () => {
    render(<PatientCard patient={patient} />)
    expect(screen.getByText('7 / 18 tarefas')).toBeInTheDocument()
  })

  it('tem link para a página de detalhe', () => {
    render(<PatientCard patient={patient} />)
    const link = screen.getByRole('link')
    expect(link).toHaveAttribute('href', '/pacientes/1')
  })
})
