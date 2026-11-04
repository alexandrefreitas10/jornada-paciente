import { render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import { PatientDetailClient } from '@/components/PatientDetailClient'
import type { PatientDetail } from '@/lib/patients'

// Suíte nova, e de propósito estreita: cobre só o cabeçalho do card, que é onde
// a data aparece. O componente carrega onze abas; montar todas aqui só geraria
// mock que não prova nada sobre a data.
jest.mock('next/navigation', () => ({ useRouter: () => ({ refresh: jest.fn(), push: jest.fn() }) }))

// A aba inicial busca dados ao montar. Não é o que se testa aqui, mas sem isto
// o render morre em "fetch is not defined" antes de chegar ao cabeçalho.
beforeEach(() => {
  global.fetch = jest.fn(async () => ({ ok: true, json: async () => [] })) as unknown as typeof fetch
})

// Nome INVENTADO: nada de paciente real em teste.
const paciente: PatientDetail = {
  id: 1,
  name: 'Marcela Quintiliano Reis',
  tipo: 'nutrologia',
  phone: null,
  start_date: '2026-06-01',
  duration: '12',
  notes: '',
  created_at: '2026-06-01T12:00:00.000Z',
  created_by: null,
  completed_task_keys: [],
}

function montar(extra: Partial<PatientDetail> = {}) {
  return render(
    <PatientDetailClient
      patient={{ ...paciente, ...extra }}
      initialMeasurements={[]}
      initialPhotos={[]}
      initialBioimpedances={[]}
      initialExams={[]}
      initialDiets={[]}
      initialEvolutionPhotos={[]}
      initialPrescriptions={[]}
      currentUserName="Secretaria de Teste"
    />
  )
}

describe('PatientDetailClient › data de início', () => {
  it('mostra a data formatada, não o formato do banco', () => {
    montar()

    // Antes saía literalmente "Início: 2026-06-01" — o formato da coluna, não
    // o que se lê.
    expect(screen.getByText(/Início: 01\/06\/2026/)).toBeInTheDocument()
    expect(screen.queryByText(/2026-06-01/)).toBeNull()
  })

  it('o dia é o cadastrado, não o anterior', () => {
    montar()

    // `start_date` é dia de calendário: formatar em Brasília recuaria para
    // 31/05/2026, que é o defeito consertado nas outras telas.
    expect(screen.queryByText(/31\/05\/2026/)).toBeNull()
  })

  it('sem data de início não escreve "Início:" nenhum', () => {
    montar({ start_date: '' })

    expect(screen.queryByText(/Início:/)).toBeNull()
  })
})
