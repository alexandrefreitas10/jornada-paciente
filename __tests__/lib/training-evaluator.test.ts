// __tests__/lib/training-evaluator.test.ts
import { parseReport, REPORT_SCHEMA, CRITERION_LABELS, evaluatorFailureReason } from '@/lib/training/evaluator'

const good = {
  outcome: 'AGENDOU',
  redFlags: [],
  scores: {
    acolhimento: 9, qualificacao: 7, argumentos: 9,
    objecoes: 8.5, fechamento: 9, precisao: 8, risco: 10,
  },
  rationales: {
    acolhimento: 'Usou o nome da paciente várias vezes.',
    qualificacao: 'Perguntou o objetivo, não perguntou a origem do lead.',
    argumentos: 'Explicou a duração e o time multidisciplinar.',
    objecoes: 'Validou a experiência ruim anterior.',
    fechamento: 'Ofereceu quarta às 16h e criou o próximo passo.',
    precisao: 'Falou o preço correto conforme o cadastro.',
    risco: 'Não cruzou nenhuma linha vermelha.',
  },
  strengths: ['Paciência sem pressionar'],
  improvements: [{ quote: 'tenho certeza que voce vai adorar', problem: 'Assertivo demais para um paciente indeciso.' }],
  practicalTip: 'Valide primeiro: "Entendo perfeitamente sua cautela".',
  nextTraining: 'Nível 3, cenário G — qualificação foi o critério mais fraco.',
}

describe('training/evaluator — validação do JSON', () => {
  it('aceita um relatório completo', () => {
    expect(parseReport(good).outcome).toBe('AGENDOU')
  })

  it('rejeita desfecho fora da lista', () => {
    expect(() => parseReport({ ...good, outcome: 'TALVEZ' })).toThrow(/desfecho/i)
  })

  it('rejeita relatório sem algum dos 7 critérios', () => {
    const rest: Record<string, number> = { ...good.scores }
    delete rest.precisao
    expect(() => parseReport({ ...good, scores: rest })).toThrow(/precisao/i)
  })

  it('rejeita nota fora de 0 a 10', () => {
    expect(() => parseReport({ ...good, scores: { ...good.scores, risco: 11 } })).toThrow(/0 e 10/i)
    expect(() => parseReport({ ...good, scores: { ...good.scores, risco: -1 } })).toThrow(/0 e 10/i)
  })

  it('rejeita alerta vermelho sem a frase citada', () => {
    const bad = { ...good, redFlags: [{ quote: '', redLine: 'Promessa de resultado', why: 'grave' }] }
    expect(() => parseReport(bad)).toThrow(/frase/i)
  })

  it('aceita alerta vermelho completo', () => {
    const flagged = {
      ...good,
      redFlags: [{
        quote: 'quase 99% dos pacientes mantêm o peso',
        redLine: 'Citar estatística de sucesso inventada',
        why: 'Número não existe no cadastro e configura promessa de resultado.',
      }],
    }
    expect(parseReport(flagged).redFlags).toHaveLength(1)
  })

  it('rejeita item de melhoria sem citação literal', () => {
    const bad = { ...good, improvements: [{ quote: '', problem: 'texto longo' }] }
    expect(() => parseReport(bad)).toThrow(/cita/i)
  })

  it('rejeita entrada que não é objeto', () => {
    expect(() => parseReport(null)).toThrow()
    expect(() => parseReport('{}')).toThrow()
  })
})

describe('training/evaluator — schema e rótulos', () => {
  it('o schema exige os 7 critérios em scores', () => {
    const scores = REPORT_SCHEMA.properties.scores
    expect(scores.required).toHaveLength(7)
    expect(scores.additionalProperties).toBe(false)
  })

  it('há rótulo em português para cada um dos 7 critérios', () => {
    expect(Object.keys(CRITERION_LABELS)).toHaveLength(7)
  })

  it('scoreProp não usa minimum/maximum — não suportado no structured output da Anthropic', () => {
    const scoreProp = REPORT_SCHEMA.properties.scores.properties.acolhimento as Record<string, unknown>
    expect(scoreProp).toEqual({ type: 'number' })
  })
})

describe('training/evaluator — evaluatorFailureReason (item 3: recusa/corte antes do JSON.parse)', () => {
  it('recusa de segurança não é retryable', () => {
    expect(evaluatorFailureReason('refusal', '')).toBe('refusal')
  })

  it('max_tokens é retryable, mesmo com algum texto parcial', () => {
    expect(evaluatorFailureReason('max_tokens', '{"outcome": "AGE')).toBe('incomplete')
  })

  it('resposta vazia sem stop_reason de recusa também é retryable', () => {
    expect(evaluatorFailureReason('end_turn', '')).toBe('incomplete')
  })

  it('resposta normal e completa não é falha', () => {
    expect(evaluatorFailureReason('end_turn', '{"outcome":"AGENDOU"}')).toBeNull()
  })
})
