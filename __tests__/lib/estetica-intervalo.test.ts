import {
  dataDaUltimaSessao, descreverCadencia, descreverIntervalo, somarIntervalo,
} from '@/lib/estetica-intervalo'

describe('dataDaUltimaSessao', () => {
  it('semanal: 10 sessões a partir de 27/10 terminam no dia da décima', () => {
    // O cálculo antigo dava 04/01/2027, o fim do último bloco de semana — um
    // domingo em que nada acontece. Este é o dia da sessão de verdade.
    expect(dataDaUltimaSessao('2026-10-27', 10, 1, 'semanas')).toBe('2026-12-29')
  })

  it('uma sessão só termina no próprio dia de início', () => {
    expect(dataDaUltimaSessao('2026-10-27', 1, 1, 'meses')).toBe('2026-10-27')
  })

  it('a cada 60 dias, 3 sessões: início mais 120 dias', () => {
    expect(dataDaUltimaSessao('2026-01-01', 3, 60, 'dias')).toBe('2026-05-01')
  })

  it('mensal soma mês de calendário e encolhe o dia em mês curto', () => {
    // 31/01 + 1 mês é 28/02, não 03/03: somar 30 dias faria a data escorregar
    // ao longo do ano, e a clínica marca "todo dia 31".
    expect(somarIntervalo('2026-01-31', 1, 1, 'meses')).toBe('2026-02-28')
    // E o mês seguinte volta a ter 31.
    expect(somarIntervalo('2026-01-31', 2, 1, 'meses')).toBe('2026-03-31')
  })

  it('mensal atravessa o ano', () => {
    expect(dataDaUltimaSessao('2026-11-15', 4, 1, 'meses')).toBe('2027-02-15')
  })

  it('data impossível devolve o próprio início em vez de inventar', () => {
    expect(dataDaUltimaSessao('nao-e-data', 5, 1, 'semanas')).toBe('nao-e-data')
  })
})

describe('descreverIntervalo', () => {
  it('escreve em português, no singular e no plural', () => {
    expect(descreverIntervalo(1, 'meses')).toBe('a cada 1 mês')
    expect(descreverIntervalo(2, 'meses')).toBe('a cada 2 meses')
    expect(descreverIntervalo(1, 'semanas')).toBe('a cada 1 semana')
    expect(descreverIntervalo(60, 'dias')).toBe('a cada 60 dias')
  })
})

describe('descreverCadencia', () => {
  it('procedimento novo mostra o intervalo', () => {
    expect(descreverCadencia({ intervalo_valor: 1, intervalo_unidade: 'meses' }))
      .toBe('a cada 1 mês')
  })

  it('procedimento antigo continua como era: intervalo nulo é "leia sessions_per_week"', () => {
    expect(descreverCadencia({ intervalo_valor: null, intervalo_unidade: null, sessions_per_week: 2 }))
      .toBe('2×/semana')
  })

  it('unidade estranha no banco não vira texto quebrado na tela', () => {
    expect(descreverCadencia({ intervalo_valor: 3, intervalo_unidade: 'luas', sessions_per_week: 1 }))
      .toBe('1×/semana')
  })
})
