import { dataBrasilia, fmtDiaPuro, fmtInstante, somarDiasAoDia } from '@/lib/datas'

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

describe('somarDiasAoDia: dia puro + N dias', () => {
  it('soma 12 semanas sem escorregar', () => {
    expect(somarDiasAoDia('2026-06-01', 12 * 7)).toBe('2026-08-24')
  })

  it('atravessa virada de mês e de ano', () => {
    expect(somarDiasAoDia('2026-01-31', 1)).toBe('2026-02-01')
    expect(somarDiasAoDia('2026-12-31', 1)).toBe('2027-01-01')
  })

  it('acerta fevereiro em ano bissexto e em ano comum', () => {
    expect(somarDiasAoDia('2028-02-28', 1)).toBe('2028-02-29')
    expect(somarDiasAoDia('2026-02-28', 1)).toBe('2026-03-01')
  })

  it('zero dias devolve o mesmo dia', () => {
    expect(somarDiasAoDia('2026-06-01', 0)).toBe('2026-06-01')
  })

  it('o que não é AAAA-MM-DD vira null, não data inventada', () => {
    // O relatório trata `null` como "não dá para dizer", e o paciente não entra
    // na lista por prazo — mesmo comportamento de antes, quando `new Date` de
    // lixo dava Invalid Date e a comparação saía falsa.
    expect(somarDiasAoDia('', 7)).toBeNull()
    expect(somarDiasAoDia(null, 7)).toBeNull()
    expect(somarDiasAoDia('01/06/2026', 7)).toBeNull()
    expect(somarDiasAoDia('2026-06', 7)).toBeNull()
  })
})

describe('prazo de tratamento encerrado: a fronteira que estava errada', () => {
  // A regra do relatório de Concluídos, composta das duas funções exatamente
  // como a rota faz: `somarDiasAoDia(start_date, semanas*7) <= dataBrasilia(agora)`.
  const encerrado = (inicio: string, semanas: number, agora: Date) => {
    const fim = somarDiasAoDia(inicio, semanas * 7)
    return fim !== null && fim <= dataBrasilia(agora)
  }

  // Início 01/06/2026 + 12 semanas = termina em 24/08/2026.
  const INICIO = '2026-06-01'
  const SEMANAS = 12

  it('às 21h de Brasília do dia ANTERIOR o prazo NÃO está encerrado', () => {
    // Era o defeito: 2026-08-24T00:00:00Z é meia-noite UTC, mas 21h do dia 23
    // em Brasília. Comparando instantes, o "Prazo encerrado" acendia aqui.
    expect(encerrado(INICIO, SEMANAS, new Date('2026-08-24T00:30:00Z'))).toBe(false)
  })

  it('às 23h59 de Brasília do dia anterior ainda NÃO está encerrado', () => {
    expect(encerrado(INICIO, SEMANAS, new Date('2026-08-24T02:59:00Z'))).toBe(false)
  })

  it('a partir da meia-noite de Brasília do dia do fim, está encerrado', () => {
    // 2026-08-24T03:00:00Z = 00h do dia 24 em Brasília.
    expect(encerrado(INICIO, SEMANAS, new Date('2026-08-24T03:00:00Z'))).toBe(true)
  })

  it('depois do dia do fim segue encerrado', () => {
    expect(encerrado(INICIO, SEMANAS, new Date('2026-09-10T15:00:00Z'))).toBe(true)
  })

  it('bem antes do fim não está encerrado', () => {
    expect(encerrado(INICIO, SEMANAS, new Date('2026-07-01T15:00:00Z'))).toBe(false)
  })

  it('sem data de início não encerra por prazo', () => {
    expect(encerrado('', SEMANAS, new Date('2030-01-01T12:00:00Z'))).toBe(false)
  })
})
