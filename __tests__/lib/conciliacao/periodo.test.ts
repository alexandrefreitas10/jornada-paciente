import { conferirPeriodo, dentroDoMes, limitesDoMes, mesAnterior, mesValido } from '@/lib/conciliacao/periodo'

describe('mesValido', () => {
  it('aceita AAAA-MM', () => {
    expect(mesValido('2026-09')).toBe(true)
    expect(mesValido('2026-01')).toBe(true)
    expect(mesValido('2026-12')).toBe(true)
  })

  it('recusa mês fora do calendário, formato errado e lixo', () => {
    for (const m of ['2026-00', '2026-13', '2026-9', '202609', '2026-09-01', '', 'abc', '1899-09', '2200-09']) {
      expect(mesValido(m)).toBe(false)
    }
  })
})

describe('limitesDoMes', () => {
  it('vai do dia 1 ao último dia, inclusive em mês de 30 e em fevereiro bissexto', () => {
    expect(limitesDoMes('2026-09')).toEqual({ inicio: '2026-09-01', fim: '2026-09-30' })
    expect(limitesDoMes('2026-10')).toEqual({ inicio: '2026-10-01', fim: '2026-10-31' })
    expect(limitesDoMes('2028-02')).toEqual({ inicio: '2028-02-01', fim: '2028-02-29' })
    expect(limitesDoMes('2026-02')).toEqual({ inicio: '2026-02-01', fim: '2026-02-28' })
  })
})

describe('mesAnterior', () => {
  it('volta um mês, virando o ano em janeiro', () => {
    expect(mesAnterior('2026-09')).toBe('2026-08')
    expect(mesAnterior('2026-01')).toBe('2025-12')
    expect(mesAnterior('2026-10')).toBe('2026-09')
  })
})

describe('dentroDoMes', () => {
  it('aceita o primeiro e o último dia e recusa a vizinhança', () => {
    expect(dentroDoMes('2026-09-01', '2026-09')).toBe(true)
    expect(dentroDoMes('2026-09-30', '2026-09')).toBe(true)
    expect(dentroDoMes('2026-08-31', '2026-09')).toBe(false)
    expect(dentroDoMes('2026-10-01', '2026-09')).toBe(false)
  })
})

describe('conferirPeriodo', () => {
  it('aprova o extrato que cobre o mês exatamente', () => {
    expect(conferirPeriodo('Unicred', { inicio: '2026-09-01', fim: '2026-09-30' }, '2026-09')).toBeNull()
  })

  it('aprova o extrato que cobre mais do que o mês', () => {
    // Cobrir demais não esconde nada: o que está fora do mês é separado depois,
    // e contado, pela rota.
    expect(conferirPeriodo('Unicred', { inicio: '2026-08-01', fim: '2026-10-31' }, '2026-09')).toBeNull()
  })

  it('recusa o extrato que começa depois do dia 1, dizendo o que veio e o que falta', () => {
    // Foi exatamente o erro do extrato do Itaú de setembro: últimos 30 dias.
    const erro = conferirPeriodo('Itaú', { inicio: '2026-09-14', fim: '2026-10-14' }, '2026-09')
    expect(erro).toContain('Itaú')
    expect(erro).toContain('14/09/2026')
    expect(erro).toContain('14/10/2026')
    expect(erro).toContain('01/09/2026')
    expect(erro).toContain('30/09/2026')
  })

  it('recusa o extrato que termina antes do último dia', () => {
    expect(conferirPeriodo('Unicred', { inicio: '2026-09-01', fim: '2026-09-29' }, '2026-09')).toContain('29/09/2026')
  })

  it('recusa quando não deu para ler o período', () => {
    const erro = conferirPeriodo('Unicred', null, '2026-09')
    expect(erro).toMatch(/período/i)
    expect(erro).toContain('Unicred')
    expect(erro).toContain('01/09/2026')
  })
})
