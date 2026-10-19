// __tests__/lib/fotos-regras.test.ts
import { chaveDaPasta, origemDaMontagem } from '@/lib/fotos-regras'

describe('chaveDaPasta', () => {
  it('trata nome idêntico com grafia diferente como a mesma pessoa', () => {
    const esperada = chaveDaPasta('Ana Paula')
    expect(chaveDaPasta('ana paula')).toBe(esperada)
    expect(chaveDaPasta('ANA PAULA')).toBe(esperada)
    expect(chaveDaPasta('  Ana   Paula  ')).toBe(esperada)
    expect(chaveDaPasta('Ana Páula')).toBe(esperada)
  })

  it('NÃO junta nome parecido: adivinhar semelhança é como o card duplicou', () => {
    expect(chaveDaPasta('Ana P.')).not.toBe(chaveDaPasta('Ana Paula'))
    expect(chaveDaPasta('Ana Paula Souza')).not.toBe(chaveDaPasta('Ana Paula'))
  })

  it('recusa nome vazio — pasta sem nome não tem como ser achada depois', () => {
    expect(() => chaveDaPasta('')).toThrow()
    expect(() => chaveDaPasta('   ')).toThrow()
  })
})

describe('origemDaMontagem', () => {
  it('aceita só paciente', () => {
    expect(origemDaMontagem({ patientId: 7 })).toEqual({ patientId: 7, pessoaId: null })
  })

  it('aceita só pessoa sem card', () => {
    expect(origemDaMontagem({ pessoaId: 3 })).toEqual({ patientId: null, pessoaId: 3 })
  })

  it('aceita número que chegou como texto do formulário', () => {
    expect(origemDaMontagem({ patientId: '7' })).toEqual({ patientId: 7, pessoaId: null })
  })

  it('recusa os dois ao mesmo tempo — origem ambígua ninguém conserta depois', () => {
    expect(() => origemDaMontagem({ patientId: 7, pessoaId: 3 })).toThrow()
  })

  it('recusa nenhum dos dois', () => {
    expect(() => origemDaMontagem({})).toThrow()
    expect(() => origemDaMontagem({ patientId: null, pessoaId: null })).toThrow()
  })

  it('recusa lixo no lugar do id', () => {
    expect(() => origemDaMontagem({ patientId: 'abc' })).toThrow()
    expect(() => origemDaMontagem({ patientId: 0 })).toThrow()
    expect(() => origemDaMontagem({ patientId: -1 })).toThrow()
  })

  it('aceita pessoa que chegou como texto do formulário', () => {
    expect(origemDaMontagem({ pessoaId: '3' })).toEqual({ patientId: null, pessoaId: 3 })
  })

  it('recusa lixo no lugar do id da pessoa', () => {
    expect(() => origemDaMontagem({ pessoaId: 'abc' })).toThrow('Pessoa inválida')
    expect(() => origemDaMontagem({ pessoaId: 0 })).toThrow('Pessoa inválida')
  })

  it('id válido com lixo no outro campo continua recusado, dizendo qual campo', () => {
    expect(() => origemDaMontagem({ patientId: 7, pessoaId: 'abc' })).toThrow('Pessoa inválida')
    expect(() => origemDaMontagem({ patientId: 'abc', pessoaId: 3 })).toThrow('Paciente inválido')
  })

  it('campo em branco do formulário vale como ausente, não como erro', () => {
    expect(origemDaMontagem({ patientId: ' ', pessoaId: 3 })).toEqual({ patientId: null, pessoaId: 3 })
    expect(origemDaMontagem({ patientId: '\n', pessoaId: 3 })).toEqual({ patientId: null, pessoaId: 3 })
    expect(origemDaMontagem({ patientId: 7, pessoaId: '  ' })).toEqual({ patientId: 7, pessoaId: null })
  })

  it('só-espaço nos dois campos é "nenhum dos dois"', () => {
    expect(() => origemDaMontagem({ patientId: ' ', pessoaId: '' })).toThrow('Escolha um paciente')
  })

  it.each([
    ['0x10', '0x10'],
    ['0b11', '0b11'],
    ['1e3', '1e3'],
    ['true', true],
    ['[5]', [5]],
    ['7.5 (texto)', '7.5'],
    ['7.5 (número)', 7.5],
    ['acima do INTEGER do Postgres', '2147483648'],
    ['NaN', NaN],
  ])('recusa forma que o Number() deixaria passar: %s', (_nome, valor) => {
    expect(() => origemDaMontagem({ patientId: valor })).toThrow('Paciente inválido')
    expect(() => origemDaMontagem({ pessoaId: valor })).toThrow('Pessoa inválida')
  })

  it('aceita o maior id do INTEGER do Postgres', () => {
    expect(origemDaMontagem({ patientId: '2147483647' })).toEqual({ patientId: 2147483647, pessoaId: null })
  })
})
