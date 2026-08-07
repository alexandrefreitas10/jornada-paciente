// __tests__/lib/training-pricing.test.ts
import { PRICING_USD_PER_MTOK, sessionCostUsd, formatUsd } from '@/lib/training/pricing'

describe('training/pricing — sessionCostUsd', () => {
  it('calcula o custo do paciente (haiku) a partir de tokens conhecidos', () => {
    const usage = { patientInputTokens: 1_000_000, patientOutputTokens: 0, evalInputTokens: 0, evalOutputTokens: 0 }
    const result = sessionCostUsd(usage)
    expect(result.patient).toBeCloseTo(1.0, 6) // 1M de entrada a US$1,00/MTok
    expect(result.grader).toBe(0)
    expect(result.total).toBeCloseTo(1.0, 6)
  })

  it('calcula o custo do avaliador (opus) a partir de tokens conhecidos', () => {
    const usage = { patientInputTokens: 0, patientOutputTokens: 0, evalInputTokens: 1_000_000, evalOutputTokens: 0 }
    const result = sessionCostUsd(usage)
    expect(result.grader).toBeCloseTo(5.0, 6) // 1M de entrada a US$5,00/MTok
    expect(result.patient).toBe(0)
  })

  it('paciente e avaliador são cobrados a preços diferentes pelo mesmo volume de tokens de saída', () => {
    const patientOnly = sessionCostUsd({
      patientInputTokens: 0, patientOutputTokens: 1_000_000, evalInputTokens: 0, evalOutputTokens: 0,
    })
    const graderOnly = sessionCostUsd({
      patientInputTokens: 0, patientOutputTokens: 0, evalInputTokens: 0, evalOutputTokens: 1_000_000,
    })
    expect(patientOnly.total).not.toBe(graderOnly.total)
    // Opus (avaliador) é 5x mais caro que Haiku (paciente) na saída.
    expect(graderOnly.total).toBeGreaterThan(patientOnly.total)
  })

  it('zero tokens é zero, nunca NaN', () => {
    const result = sessionCostUsd({ patientInputTokens: 0, patientOutputTokens: 0, evalInputTokens: 0, evalOutputTokens: 0 })
    expect(result.total).toBe(0)
    expect(result.patient).toBe(0)
    expect(result.grader).toBe(0)
    expect(Number.isNaN(result.total)).toBe(false)
  })

  it('o total é sempre a soma de paciente + avaliador', () => {
    const usage = { patientInputTokens: 542_000, patientOutputTokens: 118_000, evalInputTokens: 6_200, evalOutputTokens: 3_100 }
    const result = sessionCostUsd(usage)
    expect(result.total).toBeCloseTo(result.patient + result.grader, 10)
  })
})

describe('training/pricing — PRICING_USD_PER_MTOK', () => {
  it('haiku (paciente) e opus (avaliador) têm tarifas diferentes', () => {
    expect(PRICING_USD_PER_MTOK['claude-haiku-4-5'].input).not.toBe(PRICING_USD_PER_MTOK['claude-opus-5'].input)
    expect(PRICING_USD_PER_MTOK['claude-haiku-4-5'].output).not.toBe(PRICING_USD_PER_MTOK['claude-opus-5'].output)
  })
})

describe('training/pricing — formatUsd', () => {
  it('formata um valor comum em reais... com vírgula, estilo brasileiro', () => {
    expect(formatUsd(0.17)).toBe('US$ 0,17')
  })

  it('zero é "US$ 0,00"', () => {
    expect(formatUsd(0)).toBe('US$ 0,00')
  })

  it('um custo pequeno de verdade não pode virar "US$ 0,00" (perderia a informação)', () => {
    expect(formatUsd(0.004)).not.toBe('US$ 0,00')
    expect(formatUsd(0.0004)).not.toBe('US$ 0,00')
  })

  it('mantém 2 casas quando isso já é suficiente para mostrar o valor', () => {
    expect(formatUsd(1.5)).toBe('US$ 1,50')
  })
})
