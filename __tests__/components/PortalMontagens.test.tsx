import { render, screen } from '@testing-library/react'
import { Fotos } from '@/components/portal/screens/Fotos'
import type { PortalData } from '@/components/portal/types'

// Paciente inventado: nada real entra em teste.
const base = {
  patientId: 42, name: 'Fulana de Tal', startDate: null, birthDate: null,
  phone: null, email: null, avatarUrl: null, tasksDone: 0, tasksTotal: 0,
  hasEstetica: false, photos: [], exams: [], bioimpedances: [], diets: [],
  medications: [], sessions: [], terms: [], measurements: [], prescricoes: [],
  prescricaoIndicacao: null, montagens: [],
} as unknown as PortalData

const comMontagens = (montagens: PortalData['montagens']): PortalData =>
  ({ ...base, montagens })

it('mostra a seção com a montagem do próprio paciente', () => {
  render(<Fotos data={comMontagens([
    { id: 9, dataAntes: '2026-06-18T15:00:00.000Z', dataDepois: '2026-09-29T15:00:00.000Z' },
  ])} onBack={() => {}} />)

  const img = screen.getByRole('img', { name: /antes e depois/i })
  // Miniatura, e do caminho do PRÓPRIO paciente: o id na URL é o que impede
  // uma montagem de outra pessoa de ser pedida daqui.
  expect(img).toHaveAttribute('src', '/api/patients/42/montagens/9/imagem?thumb=1')
})

it('mostra a mais recente primeiro, na ordem que o servidor mandou', () => {
  render(<Fotos data={comMontagens([
    { id: 20, dataAntes: '2026-09-01T15:00:00.000Z', dataDepois: '2026-10-01T15:00:00.000Z' },
    { id: 10, dataAntes: '2026-06-01T15:00:00.000Z', dataDepois: '2026-07-01T15:00:00.000Z' },
  ])} onBack={() => {}} />)

  const imgs = screen.getAllByRole('img', { name: /antes e depois/i })
  expect(imgs[0]).toHaveAttribute('src', expect.stringContaining('/montagens/20/'))
  expect(imgs[1]).toHaveAttribute('src', expect.stringContaining('/montagens/10/'))
})

it('não renderiza a seção quando não há montagem', () => {
  // Sem montagem a seção some inteira — nada de espaço vazio explicando ao
  // paciente o que ele não tem.
  render(<Fotos data={comMontagens([])} onBack={() => {}} />)
  expect(screen.queryByText(/antes e depois/i)).not.toBeInTheDocument()
})

it('não quebra com data ausente', () => {
  render(<Fotos data={comMontagens([
    { id: 5, dataAntes: null, dataDepois: null },
  ])} onBack={() => {}} />)
  expect(screen.getByRole('img', { name: /antes e depois/i })).toBeInTheDocument()
})
