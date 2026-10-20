import { podeVerMontagem } from '@/lib/fotos-regras'

// Só os campos que a regra olha. Nenhum dado real de paciente.
const daPessoa = (patientId: number | null, pessoaId: number | null = null) =>
  ({ patient_id: patientId, pessoa_id: pessoaId })

describe('podeVerMontagem', () => {
  it('deixa ver a montagem do próprio paciente', () => {
    expect(podeVerMontagem(daPessoa(7), 7)).toBe(true)
  })

  it('NÃO deixa ver a montagem de outro paciente', () => {
    // Trocar o id na URL não pode mostrar o corpo de outra pessoa.
    expect(podeVerMontagem(daPessoa(8), 7)).toBe(false)
  })

  it('NÃO deixa ver montagem de pessoa sem card por um caminho de paciente', () => {
    expect(podeVerMontagem(daPessoa(null, 3), 7)).toBe(false)
  })

  it('recusa quando a montagem não existe', () => {
    expect(podeVerMontagem(null, 7)).toBe(false)
  })

  it('recusa id de paciente inválido', () => {
    expect(podeVerMontagem(daPessoa(7), Number.NaN)).toBe(false)
    expect(podeVerMontagem(daPessoa(7), 0)).toBe(false)
  })
})
