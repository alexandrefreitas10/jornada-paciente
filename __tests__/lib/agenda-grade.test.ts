// __tests__/lib/agenda-grade.test.ts
import { fatiasDoDia, cabeNoExpediente } from '@/lib/agenda-grade'

describe('fatiasDoDia', () => {
  it('segunda tem 36 fatias, das 14:00 às 19:50', () => {
    const f = fatiasDoDia('2026-11-16') // segunda
    expect(f).toHaveLength(36)
    expect(f[0]).toBe('14:00')
    expect(f.at(-1)).toBe('19:50')
  })
  it('quarta é o dia curto: 18 fatias', () => {
    expect(fatiasDoDia('2026-11-18')).toHaveLength(18)
  })
  it('sexta abre mais cedo: começa 12:00', () => {
    // 20/11 é sexta mas é feriado (Consciência Negra): usa a sexta seguinte.
    expect(fatiasDoDia('2026-11-27')[0]).toBe('12:00')
  })
  // Terça, quinta e sexta: sem isso um dígito errado no `fecha` passaria calado.
  it('terça: 36 fatias, das 14:00 às 19:50', () => {
    const f = fatiasDoDia('2026-11-17')
    expect(f).toHaveLength(36)
    expect(f[0]).toBe('14:00')
    expect(f.at(-1)).toBe('19:50')
  })
  it('quinta: 42 fatias, das 13:00 às 19:50', () => {
    const f = fatiasDoDia('2026-11-19')
    expect(f).toHaveLength(42)
    expect(f[0]).toBe('13:00')
    expect(f.at(-1)).toBe('19:50')
  })
  it('sexta: 42 fatias, das 12:00 às 18:50', () => {
    const f = fatiasDoDia('2026-11-27')
    expect(f).toHaveLength(42)
    expect(f[0]).toBe('12:00')
    expect(f.at(-1)).toBe('18:50')
  })
  // Documenta por que o teste da sexta usa 27/11: 20/11 é sexta de expediente
  // cheio, mas feriado vence o expediente. Se a clínica decidir atender, este
  // teste falha e aponta a decisão a rever.
  it('20/11 é sexta, mas a Consciência Negra fecha a clínica', () => {
    expect(fatiasDoDia('2026-11-20')).toEqual([])
  })
  it('sábado e domingo não têm fatia', () => {
    expect(fatiasDoDia('2026-11-21')).toEqual([])
    expect(fatiasDoDia('2026-11-22')).toEqual([])
  })
  it('feriado nacional não tem fatia, mesmo caindo em dia útil', () => {
    expect(fatiasDoDia('2026-12-25')).toEqual([])
  })
  // Review Focus 3: dia puro NUNCA pode recuar por fuso.
  it('o dia é o do calendário, não o instante convertido', () => {
    expect(fatiasDoDia('2026-11-16')).not.toEqual([]) // segunda continua segunda
    expect(fatiasDoDia('2026-11-15')).toEqual([]) // domingo continua domingo
  })
})

describe('cabeNoExpediente', () => {
  it('40 min não cabe nas últimas 3 fatias da segunda', () => {
    for (const h of ['19:30', '19:40', '19:50']) expect(cabeNoExpediente('2026-11-16', h, 40)).toBe(false)
    expect(cabeNoExpediente('2026-11-16', '19:20', 40)).toBe(true)
  })
  it('10 min cabe até a última fatia', () => {
    expect(cabeNoExpediente('2026-11-16', '19:50', 10)).toBe(true)
  })
  it('hora fora do expediente não cabe de jeito nenhum', () => {
    expect(cabeNoExpediente('2026-11-16', '13:50', 10)).toBe(false)
  })
})
