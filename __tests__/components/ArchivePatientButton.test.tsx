// __tests__/components/ArchivePatientButton.test.tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ArchivePatientButton } from '@/components/ArchivePatientButton'

const mockRefresh = jest.fn()
jest.mock('next/navigation', () => ({ useRouter: () => ({ refresh: mockRefresh }) }))

let fetchMock: jest.Mock

beforeEach(() => {
  mockRefresh.mockClear()
  fetchMock = jest.fn(async () => ({ ok: true, status: 200, json: async () => ({ ok: true }) }))
  global.fetch = fetchMock as unknown as typeof fetch
})

const abrir = () => userEvent.click(screen.getByRole('button', { name: /Mover Ana Souza para Pacientes Antigos/ }))

describe('ArchivePatientButton', () => {
  it('abre a janela pedindo o motivo, com Confirmar bloqueado', async () => {
    render(<ArchivePatientButton patientId={3} patientName="Ana Souza" />)
    await abrir()
    const janela = screen.getByRole('dialog')
    expect(janela).toHaveTextContent('Mover Ana Souza para Pacientes Antigos?')
    expect(screen.getByRole('button', { name: 'Confirmar' })).toBeDisabled()
  })

  it('arquiva com o motivo limpo, fecha a janela e atualiza a página', async () => {
    render(<ArchivePatientButton patientId={3} patientName="Ana Souza" />)
    await abrir()
    await userEvent.type(screen.getByLabelText(/Observações/), '  Mudou de cidade ')
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar' }))

    expect(fetchMock).toHaveBeenCalledWith('/api/patients/3/archive', expect.objectContaining({ method: 'POST' }))
    expect(JSON.parse(String(fetchMock.mock.calls[0][1].body))).toEqual({ motivo: 'Mudou de cidade', origem: 'card_paciente' })
    expect(await screen.findByRole('button', { name: /Mover Ana Souza/ })).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(mockRefresh).toHaveBeenCalled()
  })

  it('se falhar, mostra o erro e mantém a janela aberta', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({}) })
    render(<ArchivePatientButton patientId={3} patientName="Ana Souza" />)
    await abrir()
    await userEvent.type(screen.getByLabelText(/Observações/), 'Mudou de cidade')
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível mover para Pacientes Antigos')
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(mockRefresh).not.toHaveBeenCalled()
  })

  it('Cancelar fecha sem chamar o servidor', async () => {
    render(<ArchivePatientButton patientId={3} patientName="Ana Souza" />)
    await abrir()
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('clicar dentro da janela não fecha nem propaga', async () => {
    const aoClicarFora = jest.fn()
    render(
      <div onClick={aoClicarFora}>
        <ArchivePatientButton patientId={3} patientName="Ana Souza" />
      </div>
    )
    await abrir()
    await userEvent.click(screen.getByLabelText(/Observações/))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(aoClicarFora).not.toHaveBeenCalled()
  })
})
