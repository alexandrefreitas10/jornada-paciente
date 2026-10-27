import { abaInicial, ehTipoPaciente, podeMudarTipo, podeVerAba, tipoDe } from '@/lib/tipo-paciente'

describe('tipoDe', () => {
  it('linha antiga, sem tipo gravado, é da nutrologia', () => {
    // Os 170 pacientes que já existem foram todos cadastrados como pacientes
    // da Dra. Francielle — o padrão tem de preservar isso.
    expect(tipoDe(null)).toBe('nutrologia')
    expect(tipoDe(undefined)).toBe('nutrologia')
  })

  it('valor estranho no banco não quebra a tela', () => {
    expect(tipoDe('qualquer-coisa')).toBe('nutrologia')
  })

  it('reconhece os dois tipos', () => {
    expect(ehTipoPaciente('estetica')).toBe(true)
    expect(ehTipoPaciente('nutrologia')).toBe(true)
    expect(ehTipoPaciente('dermato')).toBe(false)
  })
})

describe('podeVerAba', () => {
  it('nutrologia vê tudo', () => {
    for (const aba of ['tasks', 'evolution', 'photos', 'bioimpedance', 'exams', 'diet', 'prescricao', 'terms', 'medications', 'estetica']) {
      expect(podeVerAba('nutrologia', aba)).toBe(true)
    }
  })

  it('estética vê só estética e fotos', () => {
    expect(podeVerAba('estetica', 'estetica')).toBe(true)
    expect(podeVerAba('estetica', 'photos')).toBe(true)
  })

  it('estética NÃO vê as abas do tratamento da nutrologia', () => {
    // Aba que nunca terá conteúdo faz quem usa procurar o que não existe.
    for (const aba of ['tasks', 'evolution', 'bioimpedance', 'exams', 'diet', 'prescricao', 'terms', 'medications']) {
      expect(podeVerAba('estetica', aba)).toBe(false)
    }
  })
})

describe('abaInicial', () => {
  it('abre a estética para quem é só estética', () => {
    // Sem isso o card abriria numa aba que não existe para ela.
    expect(abaInicial('estetica', 'tasks')).toBe('estetica')
  })

  it('não muda nada para a nutrologia', () => {
    expect(abaInicial('nutrologia', 'tasks')).toBe('tasks')
    expect(abaInicial('nutrologia', 'evolution')).toBe('evolution')
  })
})

describe('podeMudarTipo', () => {
  it('estética vira nutrologia: é o funil de quem veio da internet', () => {
    expect(podeMudarTipo('estetica', 'nutrologia')).toBe(true)
  })

  it('nutrologia NÃO vira estética', () => {
    // O card guarda todo o histórico do paciente; virar estética esconderia
    // evolução, exames, prescrições e termos por um clique no lugar errado.
    expect(podeMudarTipo('nutrologia', 'estetica')).toBe(false)
  })

  it('manter o mesmo tipo é sempre permitido', () => {
    // Importante: salvar uma correção de nome não pode ser recusado.
    expect(podeMudarTipo('nutrologia', 'nutrologia')).toBe(true)
    expect(podeMudarTipo('estetica', 'estetica')).toBe(true)
  })
})
