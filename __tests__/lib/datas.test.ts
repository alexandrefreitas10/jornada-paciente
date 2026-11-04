import { fmtDiaPuro, fmtInstante } from '@/lib/datas'

// O defeito que estes testes travam: a aba Relatórios › Estética mostrava as
// datas UM DIA ANTES do que está no banco. `2026-08-01` é um dia de calendário;
// `new Date` sobre ele dá meia-noite UTC, e formatar isso em Brasília (UTC-3)
// recua para as 21h de 31/07.
//
// Nenhum dado de paciente aqui: só datas.

describe('fmtDiaPuro: coluna `date` (dia de calendário)', () => {
  it('mostra o dia digitado, não o anterior', () => {
    expect(fmtDiaPuro('2026-08-01')).toBe('01/08/2026')
  })

  it('mostra o mesmo dia quando o valor chega pelo `fetch`, já como ISO com Z', () => {
    // É exatamente o que o postgres.js + `NextResponse.json` entregam para uma
    // coluna `date`: o dia puro virou meia-noite UTC no caminho.
    expect(fmtDiaPuro('2026-08-01T00:00:00.000Z')).toBe('01/08/2026')
  })

  it('mostra o mesmo dia quando o valor chega como `Date`, direto do postgres.js', () => {
    expect(fmtDiaPuro(new Date('2026-08-01'))).toBe('01/08/2026')
  })

  it('não recua o dia na virada do mês, que é onde o erro aparecia', () => {
    expect(fmtDiaPuro('2026-01-01')).toBe('01/01/2026')
    expect(fmtDiaPuro('2026-03-01')).toBe('01/03/2026')
  })

  it('vazio e data inválida viram travessão, não "Invalid Date"', () => {
    expect(fmtDiaPuro(null)).toBe('—')
    expect(fmtDiaPuro(undefined)).toBe('—')
    expect(fmtDiaPuro('')).toBe('—')
    expect(fmtDiaPuro('nem data')).toBe('—')
  })
})

describe('fmtInstante: coluna `timestamptz` (instante)', () => {
  it('converte para Brasília — é por isso que não dá para usar a mesma função', () => {
    // Sessão lançada às 22h30 de 28/10 em Brasília: o banco guarda 01h30 UTC
    // de 29/10. Quem lê o relatório precisa ver 28/10, o dia do atendimento.
    expect(fmtInstante('2026-10-29T01:30:00.000Z')).toBe('28/10/2026')
  })

  it('não mexe no dia quando o horário não cruza a meia-noite', () => {
    expect(fmtInstante('2026-10-28T15:00:00.000Z')).toBe('28/10/2026')
  })

  it('vazio e data inválida viram travessão', () => {
    expect(fmtInstante(null)).toBe('—')
    expect(fmtInstante('nem data')).toBe('—')
  })
})

describe('as duas funções juntas', () => {
  it('discordam de propósito no mesmo texto, porque os campos são diferentes', () => {
    // O mesmo texto `2026-08-01T00:00:00.000Z` significa "dia 1º de agosto"
    // quando vem de `start_date` e "31/07 às 21h" quando vem de um
    // `timestamptz`. Unificar as duas funções quebraria um dos dois lados.
    expect(fmtDiaPuro('2026-08-01T00:00:00.000Z')).toBe('01/08/2026')
    expect(fmtInstante('2026-08-01T00:00:00.000Z')).toBe('31/07/2026')
  })
})
