import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PatientSearch } from '@/components/PatientSearch'
import type { PatientListItem } from '@/lib/patients'

// O card embute o `ArchivePatientButton`, que chama `useRouter()`.
jest.mock('next/navigation', () => ({ useRouter: () => ({ refresh: jest.fn(), push: jest.fn() }) }))
jest.mock('next/link', () => {
  return function MockLink({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) {
    return <a href={href} className={className}>{children}</a>
  }
})

// Nomes INVENTADOS.
function paciente(p: Partial<PatientListItem> & { id: number; name: string }): PatientListItem {
  return {
    tipo: 'nutrologia',
    phone: null,
    start_date: '2026-06-01',
    duration: '12',
    notes: '',
    created_at: '2026-06-01',
    created_by: null,
    completed_count: 0,
    tem_prescricao: false,
    ...p,
  }
}

const PACIENTES: PatientListItem[] = [
  paciente({ id: 1, name: 'Ana Prado', tipo: 'nutrologia', tem_prescricao: true }),
  paciente({ id: 2, name: 'Bruno Lemos', tipo: 'nutrologia', tem_prescricao: false }),
  paciente({ id: 3, name: 'Carla Dias', tipo: 'estetica', tem_prescricao: true }),
  paciente({ id: 4, name: 'Dario Melo', tipo: 'estetica', tem_prescricao: false }),
]

function cardDe(nome: string): HTMLElement {
  return screen.getByText(nome).closest('a') as HTMLElement
}
function grupo(nome: RegExp) {
  return within(screen.getByRole('group', { name: nome }))
}

describe('lista de pacientes — quem já tem folha de prescrição', () => {
  it('marca só o card de quem tem', () => {
    // 192 dos 193 pacientes não têm folha nenhuma. Marcar quem NÃO tem
    // encheria a lista de etiqueta; a marca é no caso raro, que cresce
    // conforme a equipe sobe as folhas.
    render(<PatientSearch patients={PACIENTES} />)

    expect(within(cardDe('Ana Prado')).getByText(/prescrição/i)).toBeInTheDocument()
    expect(within(cardDe('Bruno Lemos')).queryByText(/prescrição/i)).toBeNull()
  })

  it('filtra por quem ainda não tem, dentro do tipo escolhido', async () => {
    // É a pergunta de todo dia enquanto a equipe estiver subindo as folhas:
    // "de quem ainda falta?"
    const user = userEvent.setup()
    render(<PatientSearch patients={PACIENTES} />)

    await user.click(grupo(/prescrição/i).getByRole('button', { name: /^Sem prescrição/ }))

    expect(screen.getByText('Bruno Lemos')).toBeInTheDocument()
    expect(screen.queryByText('Ana Prado')).toBeNull()
  })

  it('vale junto com o filtro de tipo, não no lugar dele', async () => {
    const user = userEvent.setup()
    render(<PatientSearch patients={PACIENTES} />)

    await user.click(grupo(/prescrição/i).getByRole('button', { name: /^Sem prescrição/ }))
    await user.click(grupo(/tipo/i).getByRole('button', { name: /^Estética/ }))

    // Só quem é dos dois: estética E sem prescrição.
    expect(screen.getByText('Dario Melo')).toBeInTheDocument()
    expect(screen.queryByText('Carla Dias')).toBeNull()
    expect(screen.queryByText('Bruno Lemos')).toBeNull()
  })

  it('a contagem de prescrição conta dentro do tipo escolhido', async () => {
    // Número que não bate com o que a tela mostra ao clicar é pior que
    // número nenhum: a pessoa deixa de confiar na lista inteira.
    const user = userEvent.setup()
    render(<PatientSearch patients={PACIENTES} />)

    expect(grupo(/prescrição/i).getByRole('button', { name: /^Com prescrição \(1\)/ })).toBeInTheDocument()

    await user.click(grupo(/tipo/i).getByRole('button', { name: /^Todos/ }))
    expect(grupo(/prescrição/i).getByRole('button', { name: /^Com prescrição \(2\)/ })).toBeInTheDocument()
  })

  it('a contagem de tipo conta dentro do filtro de prescrição', async () => {
    const user = userEvent.setup()
    render(<PatientSearch patients={PACIENTES} />)

    expect(grupo(/tipo/i).getByRole('button', { name: /^Nutrologia \(2\)/ })).toBeInTheDocument()

    await user.click(grupo(/prescrição/i).getByRole('button', { name: /^Com prescrição/ }))
    expect(grupo(/tipo/i).getByRole('button', { name: /^Nutrologia \(1\)/ })).toBeInTheDocument()
  })

  it('a busca por nome continua funcionando junto', async () => {
    const user = userEvent.setup()
    render(<PatientSearch patients={PACIENTES} />)

    await user.type(screen.getByPlaceholderText(/Buscar paciente/), 'bru')
    expect(screen.getByText('Bruno Lemos')).toBeInTheDocument()
    expect(screen.queryByText('Ana Prado')).toBeNull()
  })
})
