import { render, screen } from '@testing-library/react'
import { Tabela } from '@/components/portal/screens/Tabela'
import { Home } from '@/components/portal/screens/Home'
import type { PortalData, PortalFile } from '@/components/portal/types'

// Paciente inventado: nada real entra em teste.
const base = {
  patientId: 42, name: 'Fulana de Tal', startDate: null, birthDate: null,
  phone: null, email: null, avatarUrl: null, tasksDone: 0, tasksTotal: 0,
  hasEstetica: false, photos: [], tabelas: [], exams: [], bioimpedances: [],
  diets: [], medications: [], sessions: [], terms: [], measurements: [],
  prescricoes: [], prescricaoIndicacao: null, montagens: [],
} as unknown as PortalData

const tabela = (id: number, created_at: string): PortalFile =>
  ({ id, original_name: `tabela-${id}.jpg`, created_at, url: `https://exemplo/assinada/${id}` })

const com = (tabelas: PortalFile[]): PortalData => ({ ...base, tabelas })

it('lista as tabelas na ordem recebida, do próprio paciente', () => {
  render(<Tabela data={com([
    tabela(20, '2026-10-01T15:00:00.000Z'),
    tabela(10, '2026-07-15T15:00:00.000Z'),
  ])} onBack={() => {}} />)

  const imgs = screen.getAllByRole('img', { name: /tabela de/i })
  expect(imgs).toHaveLength(2)
  // A ordem vem do servidor e não pode ser refeita na tela.
  expect(imgs[0]).toHaveAttribute('src', 'https://exemplo/assinada/20')
  expect(imgs[1]).toHaveAttribute('src', 'https://exemplo/assinada/10')
})

it('mostra a data de cada tabela', () => {
  render(<Tabela data={com([tabela(7, '2026-07-15T15:00:00.000Z')])} onBack={() => {}} />)
  // O formato exato é do helper do portal; o que importa é o ano aparecer.
  expect(screen.getAllByText(/2026/).length).toBeGreaterThan(0)
})

it('sem tabela, avisa em vez de mostrar tela em branco', () => {
  render(<Tabela data={com([])} onBack={() => {}} />)
  expect(screen.getByText(/nenhuma tabela enviada/i)).toBeInTheDocument()
})

describe('bloco na Início', () => {
  it('aparece quando o paciente tem tabela', () => {
    render(<Home data={com([tabela(1, '2026-07-15T15:00:00.000Z')])} go={() => {}} />)
    expect(screen.getByText('Minha tabela')).toBeInTheDocument()
  })

  it('NÃO aparece quando não tem — bloco que abre tela vazia é promessa quebrada', () => {
    render(<Home data={com([])} go={() => {}} />)
    expect(screen.queryByText('Minha tabela')).not.toBeInTheDocument()
  })
})
