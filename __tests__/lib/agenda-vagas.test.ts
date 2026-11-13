import { vagasDoDia, motivoDeRecusa } from '@/lib/agenda-vagas'

const SEG = '2026-11-16'

describe('vagasDoDia', () => {
  it('sem nada marcado, 10 min oferece todas as 36 fatias', () => {
    expect(vagasDoDia(SEG, 10, [], [])).toHaveLength(36)
  })
  // Review Focus 2
  it('40 min não oferece as últimas 3 fatias', () => {
    const v = vagasDoDia(SEG, 40, [], [])
    expect(v).toHaveLength(33)
    expect(v).not.toContain('19:30')
  })
  it('fatia ocupada sai da lista', () => {
    expect(vagasDoDia(SEG, 10, [{ hora: '15:10' }], [])).not.toContain('15:10')
  })
  it('só a fatia de INÍCIO é ocupada — soro de 40 min não bloqueia as 3 seguintes', () => {
    // As 4 cadeiras se protegem pela aritmética (40 min = 4 fatias = 4 cadeiras);
    // reservar as 4 fatias cortaria a capacidade da sala em 4x, sem motivo.
    const v = vagasDoDia(SEG, 10, [{ hora: '15:00' }], [])
    expect(v).toContain('15:10'); expect(v).toContain('15:20'); expect(v).toContain('15:30')
  })
  it('bloqueio tira a faixa inteira', () => {
    const v = vagasDoDia(SEG, 10, [], [{ de: '15:00', ate: '16:00' }])
    expect(v).not.toContain('15:00'); expect(v).not.toContain('15:50')
    expect(v).toContain('16:00')
  })
  it('dia fechado não tem vaga', () => {
    expect(vagasDoDia('2026-11-22', 10, [], [])).toEqual([])
  })
})

describe('motivoDeRecusa', () => {
  it('diz quando a fatia já tem gente', () => {
    expect(motivoDeRecusa(SEG, '15:10', 10, [{ hora: '15:10' }], [])).toMatch(/ocupad/i)
  })
  it('diz quando passa do fim do expediente', () => {
    expect(motivoDeRecusa(SEG, '19:40', 40, [], [])).toMatch(/fecha/i)
  })
  it('devolve null quando a fatia serve', () => {
    expect(motivoDeRecusa(SEG, '15:10', 40, [], [])).toBeNull()
  })
  it('diz quando a fatia está bloqueada', () => {
    expect(motivoDeRecusa(SEG, '15:30', 10, [], [{ de: '15:00', ate: '16:00' }])).toMatch(/bloquead/i)
  })
  it('diz quando o dia está fechado', () => {
    expect(motivoDeRecusa('2026-11-22', '15:00', 10, [], [])).toMatch(/fechad|não atende/i)
  })
})
