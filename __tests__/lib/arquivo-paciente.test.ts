// __tests__/lib/arquivo-paciente.test.ts
import { validarMotivo, idPacienteValido, MOTIVO_MIN, MOTIVO_MAX } from '@/lib/arquivo-paciente'

describe('validarMotivo', () => {
  it('limpa os espaços das pontas', () => {
    expect(validarMotivo('  Parou por custo  ')).toBe('Parou por custo')
  })

  it('exige de 3 a 500 caracteres depois de limpar', () => {
    expect(MOTIVO_MIN).toBe(3)
    expect(MOTIVO_MAX).toBe(500)
    expect(validarMotivo('ab')).toBeNull()
    expect(validarMotivo('   ab   ')).toBeNull()
    expect(validarMotivo(' abc ')).toBe('abc')
    expect(validarMotivo('x'.repeat(500))).toBe('x'.repeat(500))
    expect(validarMotivo('x'.repeat(501))).toBeNull()
  })

  it('recusa o que não é texto', () => {
    expect(validarMotivo(123)).toBeNull()
    expect(validarMotivo(null)).toBeNull()
    expect(validarMotivo(undefined)).toBeNull()
    expect(validarMotivo({})).toBeNull()
  })
})

describe('idPacienteValido', () => {
  it('aceita inteiro positivo em número ou texto', () => {
    expect(idPacienteValido(135)).toBe(135)
    expect(idPacienteValido('135')).toBe(135)
    expect(idPacienteValido('2147483647')).toBe(2147483647)
  })

  it('recusa zero, negativo, fração, texto e vazio', () => {
    for (const v of ['0', '-1', '1.5', 'abc', '', ' ', 0, -3, 2.5, '1e3', '0x10', ' 12 ', '1.0', '+5']) {
      expect(idPacienteValido(v)).toBeNull()
    }
  })

  it('recusa acima do INTEGER do Postgres e tipos estranhos', () => {
    expect(idPacienteValido(2147483648)).toBeNull()
    expect(idPacienteValido(true)).toBeNull()
    expect(idPacienteValido(null)).toBeNull()
    expect(idPacienteValido(undefined)).toBeNull()
  })
})
