import { validarEdicao } from '@/lib/estetica-edicao'

const base = { nome: 'T-SCULPTOR', totalSessoes: 10, inicio: '2026-10-27', fim: '2026-11-30' }

describe('validarEdicao', () => {
  it('deixa salvar uma edição comum', () => {
    expect(validarEdicao(base, 3)).toBeNull()
  })

  it('deixa reduzir o total até o que já foi feito', () => {
    expect(validarEdicao({ ...base, totalSessoes: 6 }, 6)).toBeNull()
  })

  it('NÃO deixa o total cair abaixo das sessões já realizadas', () => {
    // Senão as marcações 5 e 6 ficariam órfãs, sem lugar na barra e sem como
    // serem desmarcadas pela tela.
    expect(validarEdicao({ ...base, totalSessoes: 4 }, 6))
      .toBe('Já existem 6 sessões realizadas: desmarque as que sobram antes de reduzir o total')
  })

  it('fala no singular quando é uma só', () => {
    expect(validarEdicao({ ...base, totalSessoes: 0 }, 1))
      .toBe('A quantidade de sessões precisa ser pelo menos 1')
    expect(validarEdicao({ ...base, totalSessoes: 1 }, 1)).toBeNull()
  })

  it('recusa procedimento sem nome', () => {
    expect(validarEdicao({ ...base, nome: '   ' }, 0)).toBe('Escolha o procedimento')
  })

  it('recusa data final antes da inicial', () => {
    expect(validarEdicao({ ...base, fim: '2026-10-01' }, 0))
      .toBe('A data final não pode ser antes da inicial')
  })

  it('aceita data final vazia: ela é opcional', () => {
    expect(validarEdicao({ ...base, fim: '' }, 0)).toBeNull()
  })
})
