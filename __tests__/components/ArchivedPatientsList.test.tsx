// __tests__/components/ArchivedPatientsList.test.tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
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

describe('ArchivedPatientsList › reativar', () => {
  let confirmSpy: jest.SpyInstance
  let alertSpy: jest.SpyInstance
  let fetchMock: jest.Mock

  beforeEach(() => {
    confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(true)
    alertSpy = jest.spyOn(window, 'alert').mockImplementation(() => {})
    fetchMock = jest.fn(async () => ({ ok: true, status: 200 }))
    global.fetch = fetchMock as unknown as typeof fetch
  })

  afterEach(() => {
    confirmSpy.mockRestore()
    alertSpy.mockRestore()
  })

  it('200: remove a linha da lista', async () => {
    render(<ArchivedPatientsList patients={pacientes} />)
    fireEvent.click(screen.getAllByRole('button', { name: '↩ Reativar' })[0])
    await waitFor(() => expect(screen.queryByText('Ana Souza')).not.toBeInTheDocument())
  })

  it('500: mantém a linha e mostra o alerta de erro', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 500 })
    render(<ArchivedPatientsList patients={pacientes} />)
    fireEvent.click(screen.getAllByRole('button', { name: '↩ Reativar' })[0])
    await waitFor(() => expect(alertSpy).toHaveBeenCalledWith('Não foi possível reativar. Tente de novo.'))
    expect(screen.getByText('Ana Souza')).toBeInTheDocument()
  })

  it('404: remove a linha (já não estava arquivado)', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 404 })
    render(<ArchivedPatientsList patients={pacientes} />)
    fireEvent.click(screen.getAllByRole('button', { name: '↩ Reativar' })[0])
    await waitFor(() => expect(screen.queryByText('Ana Souza')).not.toBeInTheDocument())
  })

  it('erro de rede: mantém a linha, mostra o alerta e reabilita o botão', async () => {
    fetchMock.mockRejectedValueOnce(new Error('network'))
    render(<ArchivedPatientsList patients={pacientes} />)
    const botao = screen.getAllByRole('button', { name: '↩ Reativar' })[0]
    fireEvent.click(botao)
    await waitFor(() => expect(alertSpy).toHaveBeenCalledWith('Não foi possível reativar. Tente de novo.'))
    expect(screen.getByText('Ana Souza')).toBeInTheDocument()
    expect(botao).toHaveTextContent('↩ Reativar')
  })
})
