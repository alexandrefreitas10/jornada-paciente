// __tests__/components/PatientCard.test.tsx
import { render, screen } from '@testing-library/react'
import { PatientCard } from '@/components/PatientCard'
import type { PatientListItem } from '@/lib/patients'
import { ALL_TASK_KEYS } from '@/lib/task-definitions'

// O card embute o `ArchivePatientButton`, que chama `useRouter()`. Sem este
// mock a suíte inteira morre em "expected app router to be mounted" — foi o que
// a deixou vermelha quando o botão de arquivar entrou no card.
jest.mock('next/navigation', () => ({ useRouter: () => ({ refresh: jest.fn(), push: jest.fn() }) }))

jest.mock('next/link', () => {
  return function MockLink({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) {
    return <a href={href} className={className}>{children}</a>
  }
})

// Nome INVENTADO. `tipo` e `created_by` entraram em `PatientListItem` depois
// que este teste foi escrito, e faltarem aqui era o que travava o
// `tsc --noEmit` em quatro linhas.
const patient: PatientListItem = {
  id: 1,
  name: 'Maria Souza',
  tipo: 'nutrologia',
  start_date: '2026-06-01',
  duration: '3 meses',
  notes: '',
  phone: null,
  created_at: '2026-06-01',
  created_by: null,
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
    // O total vem de `ALL_TASK_KEYS`, não escrito à mão: o número estava
    // fixado em 18 e hoje são 22, então o teste do card quebrava por uma
    // mudança que não é dele. Quantas tarefas DEVEM existir é pergunta de
    // `__tests__/lib/task-definitions.test.ts`, e lá ela continua sendo feita.
    expect(screen.getByText(`7 / ${ALL_TASK_KEYS.length} tarefas`)).toBeInTheDocument()
  })

  it('tem link para a página de detalhe', () => {
    render(<PatientCard patient={patient} />)
    const link = screen.getByRole('link')
    expect(link).toHaveAttribute('href', '/pacientes/1')
  })

  it('o início é o dia cadastrado, não o anterior', () => {
    render(<PatientCard patient={patient} />)

    // `start_date` é um dia de calendário. Lido com `new Date` sem fuso
    // declarado, virava meia-noite UTC no fuso do navegador e o card mostrava
    // 31/05/2026 — um dia antes do que foi digitado.
    expect(screen.getByText(/Início: 01\/06\/2026/)).toBeInTheDocument()
    expect(screen.queryByText(/31\/05\/2026/)).toBeNull()
  })
})
