// __tests__/lib/training-kb.test.ts
import { validateKb, formatKbForPrompt, EMPTY_KB } from '@/lib/training/kb'
import type { TrainingKb } from '@/lib/training/types'

const valid: TrainingKb = {
  doctors: [{
    name: 'Dra. Francielle Torres', nickname: 'Dra. Fran', specialty: 'Nutrologia',
    yearsExperience: 10, education: 'Título de especialista em Nutrologia',
    focus: 'Emagrecimento, menopausa, estética corporal',
  }],
  consultation: {
    priceCents: 90000, durationLabel: '1h30 a 2h',
    includes: ['Bioimpedância', 'Avaliação de exames', 'Planejamento alimentar com a nutricionista'],
    returnWeeks: 8,
  },
  plans: [{ name: 'Acompanhamento 6 meses', months: 6, priceCents: 600000 }],
  payment: { methods: ['PIX', 'Cartão'], installments: '3x sem juros', discountPolicy: 'Não há desconto.' },
  insurance: { accepts: false, note: 'Não atendemos convênio. Emitimos nota para reembolso.' },
  procedures: [{ name: 'Criolipólise', priceCents: 80000 }],
  weightLossDrugsPolicy: 'Só a médica avalia se há indicação, na consulta.',
  noShowPolicy: 'Sem taxa. Duas tentativas de recuperação antes de liberar o horário.',
  links: { site: 'https://exemplo.com', instagram: 'https://instagram.com/exemplo', google: 'https://g.co/exemplo' },
  redLines: ['Prometer quantidade de peso ou prazo'],
  modelAnswers: ['Entendo perfeitamente sua cautela.'],
}

describe('training/kb', () => {
  it('aceita uma base completa', () => {
    expect(() => validateKb(valid)).not.toThrow()
    expect(validateKb(valid).consultation.priceCents).toBe(90000)
  })

  it('rejeita base sem médico cadastrado', () => {
    expect(() => validateKb({ ...valid, doctors: [] })).toThrow(/médico/i)
  })

  it('rejeita preço de consulta zerado ou negativo', () => {
    expect(() => validateKb({ ...valid, consultation: { ...valid.consultation, priceCents: 0 } })).toThrow(/preço/i)
  })

  it('rejeita base sem nenhuma linha vermelha', () => {
    expect(() => validateKb({ ...valid, redLines: [] })).toThrow(/linha vermelha/i)
  })

  it('rejeita objeto que não é base de conhecimento', () => {
    expect(() => validateKb(null)).toThrow()
    expect(() => validateKb({ foo: 1 })).toThrow()
  })

  it('EMPTY_KB não passa na validação (serve só para o formulário vazio)', () => {
    expect(() => validateKb(EMPTY_KB)).toThrow()
  })

  it('formatKbForPrompt traz preço em reais, anos de experiência e linhas vermelhas', () => {
    const text = formatKbForPrompt(valid)
    expect(text).toContain('R$ 900,00')
    expect(text).toContain('10 anos')
    expect(text).toContain('Prometer quantidade de peso ou prazo')
  })
})
