import { normalizarNomePessoa, acharPacientePorNome } from '@/lib/patient-match'

describe('normalizarNomePessoa', () => {
  it('ignora acento, caixa e espaço sobrando', () => {
    expect(normalizarNomePessoa('José Eduardo Paganini')).toBe('jose eduardo paganini')
    expect(normalizarNomePessoa('Bruno Augusto De Leles Carvalho'))
      .toBe(normalizarNomePessoa('Bruno Augusto de Leles Carvalho'))
    expect(normalizarNomePessoa('  Ana   Caroline  ')).toBe('ana caroline')
  })

  it('não confunde pessoas diferentes', () => {
    expect(normalizarNomePessoa('Ana Caroline Caixeta Silva'))
      .not.toBe(normalizarNomePessoa('Ana Carolina Caixeta Silva'))
  })
})

describe('acharPacientePorNome', () => {
  const cadastro = [
    { id: 135, name: 'Ana Caroline Caixeta Silva' },
    { id: 149, name: 'Jose Eduardo Paganini' },
    { id: 137, name: 'Bruno Augusto De Leles Carvalho' },
  ]

  it('acha o paciente mesmo quando o acento difere', () => {
    // O caso real: o implante foi digitado "José", o cadastro tem "Jose".
    expect(acharPacientePorNome('José Eduardo Paganini', cadastro)).toBe(149)
  })

  it('acha o paciente quando só a caixa difere', () => {
    expect(acharPacientePorNome('Bruno Augusto de Leles Carvalho', cadastro)).toBe(137)
  })

  it('acha pelo nome idêntico', () => {
    expect(acharPacientePorNome('Ana Caroline Caixeta Silva', cadastro)).toBe(135)
  })

  it('devolve null quando ninguém casa — implante de quem não é paciente', () => {
    // Caso legítimo e comum: 12 dos implantes de hoje são dessas pessoas.
    expect(acharPacientePorNome('Bianca Barbosa Alencar', cadastro)).toBeNull()
  })

  it('devolve null quando dois pacientes têm o mesmo nome', () => {
    // Chutar aqui vincularia a ficha clínica errada. Melhor deixar sem vínculo.
    const homonimos = [
      { id: 1, name: 'Maria Silva' },
      { id: 2, name: 'maria  silva' },
    ]
    expect(acharPacientePorNome('Maria Silva', homonimos)).toBeNull()
  })

  it('devolve null para nome vazio, em branco ou ausente', () => {
    expect(acharPacientePorNome('', cadastro)).toBeNull()
    expect(acharPacientePorNome('   ', cadastro)).toBeNull()
    expect(acharPacientePorNome(null, cadastro)).toBeNull()
    expect(acharPacientePorNome(undefined, cadastro)).toBeNull()
  })

  it('não estoura com cadastro vazio', () => {
    expect(acharPacientePorNome('Ana Caroline Caixeta Silva', [])).toBeNull()
  })
})
