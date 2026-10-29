import {
  cadenciaEmDias, classificarAtraso, filtrarAtrasos, montarAtrasos,
} from '@/lib/estetica-atraso'
import type { SessaoEstetica } from '@/lib/estetica-relatorio'

const HOJE = new Date('2026-10-29T12:00:00.000Z')

// Nome de paciente inventado; nome de procedimento é real de propósito.
const sessao = (over: Partial<SessaoEstetica>): SessaoEstetica => ({
  id: 1, patientId: 1, patientName: 'Fulana de Tal',
  procedimento: 'T-SCULPTOR', totalSessoes: 10, feitas: 3,
  inicio: '2026-09-01', ultimaFeita: '2026-10-25T12:00:00.000Z',
  sessions_per_week: 1, intervalo_valor: null, intervalo_unidade: null,
  ...over,
} as SessaoEstetica)

describe('cadenciaEmDias', () => {
  it('2x por semana é aproximadamente de 4 em 4 dias', () => {
    // Não é exato (a clínica marca terça e quinta), mas para decidir "faz
    // quanto tempo que sumiu" basta — e é melhor que tratar tudo como semanal.
    expect(cadenciaEmDias({ sessions_per_week: 2 })).toBe(4)
    expect(cadenciaEmDias({ sessions_per_week: 1 })).toBe(7)
  })

  it('intervalo em dias, semanas e meses', () => {
    expect(cadenciaEmDias({ intervalo_valor: 60, intervalo_unidade: 'dias' })).toBe(60)
    expect(cadenciaEmDias({ intervalo_valor: 2, intervalo_unidade: 'semanas' })).toBe(14)
    expect(cadenciaEmDias({ intervalo_valor: 1, intervalo_unidade: 'meses' })).toBe(30)
  })

  it('unidade estranha no banco cai na contagem por semana', () => {
    expect(cadenciaEmDias({ intervalo_valor: 3, intervalo_unidade: 'luas', sessions_per_week: 2 })).toBe(4)
  })
})

describe('classificarAtraso', () => {
  it('procedimento finalizado não entra: quem terminou não está atrasado', () => {
    expect(classificarAtraso(sessao({ feitas: 10, totalSessoes: 10 }), HOJE)).toBeNull()
  })

  it('semanal: 4 dias é verde, 10 é amarela, 20 é vermelha', () => {
    const em = (ultimaFeita: string) =>
      classificarAtraso(sessao({ sessions_per_week: 1, ultimaFeita }), HOJE)?.etiqueta
    expect(em('2026-10-25T12:00:00.000Z')).toBe('verde')    // 4 dias
    expect(em('2026-10-19T12:00:00.000Z')).toBe('amarela')  // 10 dias
    expect(em('2026-10-09T12:00:00.000Z')).toBe('vermelha') // 20 dias
  })

  it('mensal: 20 dias ainda é verde — o que é abandono num, é normal no outro', () => {
    const mensal = sessao({
      sessions_per_week: 1, intervalo_valor: 1, intervalo_unidade: 'meses',
      ultimaFeita: '2026-10-09T12:00:00.000Z', // 20 dias
    })
    expect(classificarAtraso(mensal, HOJE)?.etiqueta).toBe('verde')
  })

  it('protocolo diário não fica vermelho em três dias', () => {
    // Piso de 7 dias no amarelo: sem ele a tela viraria um mar de vermelho.
    const diario = sessao({
      intervalo_valor: 1, intervalo_unidade: 'dias',
      ultimaFeita: '2026-10-26T12:00:00.000Z', // 3 dias
    })
    expect(classificarAtraso(diario, HOJE)?.etiqueta).toBe('amarela')
  })

  it('quem nunca fez sessão nenhuma é "nunca veio", contando do início', () => {
    const r = classificarAtraso(sessao({ feitas: 0, ultimaFeita: null, inicio: '2026-09-29' }), HOJE)
    expect(r?.etiqueta).toBe('nunca_veio')
    expect(r?.diasSemVir).toBe(30)
  })

  it('sem data de início, "nunca veio" não inventa um número de dias', () => {
    const r = classificarAtraso(sessao({ feitas: 0, ultimaFeita: null, inicio: null }), HOJE)
    expect(r?.etiqueta).toBe('nunca_veio')
    expect(r?.diasSemVir).toBe(0)
  })
})

describe('montarAtrasos', () => {
  it('põe o mais abandonado primeiro e deixa os finalizados de fora', () => {
    const linhas = montarAtrasos([
      sessao({ id: 1, patientName: 'Verde', sessions_per_week: 1, ultimaFeita: '2026-10-27T12:00:00.000Z' }),
      sessao({ id: 2, patientName: 'Vermelha', sessions_per_week: 1, ultimaFeita: '2026-09-01T12:00:00.000Z' }),
      sessao({ id: 3, patientName: 'Terminou', feitas: 10, totalSessoes: 10 }),
      sessao({ id: 4, patientName: 'Nunca', feitas: 0, ultimaFeita: null, inicio: '2026-10-01' }),
    ], HOJE)

    expect(linhas.map(l => l.patientName)).toEqual(['Vermelha', 'Nunca', 'Verde'])
  })
})

describe('filtrarAtrasos', () => {
  const linhas = montarAtrasos([
    sessao({ id: 1, patientName: 'Verde', ultimaFeita: '2026-10-27T12:00:00.000Z' }),
    sessao({ id: 2, patientName: 'Vermelha', ultimaFeita: '2026-09-01T12:00:00.000Z' }),
    sessao({ id: 3, patientName: 'Amarela', ultimaFeita: '2026-10-19T12:00:00.000Z' }),
    sessao({ id: 4, patientName: 'Nunca', feitas: 0, ultimaFeita: null }),
  ], HOJE)

  it('"atrasados" junta amarela e vermelha: é a lista de quem precisa de contato', () => {
    expect(filtrarAtrasos(linhas, 'atrasados').map(l => l.patientName).sort())
      .toEqual(['Amarela', 'Vermelha'])
  })

  it('cada filtro devolve só o seu', () => {
    expect(filtrarAtrasos(linhas, 'em_dia').map(l => l.patientName)).toEqual(['Verde'])
    expect(filtrarAtrasos(linhas, 'nunca_veio').map(l => l.patientName)).toEqual(['Nunca'])
    expect(filtrarAtrasos(linhas, 'todos')).toHaveLength(4)
  })
})
