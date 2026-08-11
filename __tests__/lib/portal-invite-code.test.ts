// __tests__/lib/portal-invite-code.test.ts
import {
  ALFABETO, TAMANHO, VALIDADE_DIAS,
  sortearCodigo, normalizarCodigo, classificarCodigo,
} from '@/lib/portal-invite-code'

describe('portal-invite-code — alfabeto', () => {
  it('não tem nenhum caractere que se confunde ao ditar', () => {
    for (const proibido of ['O', '0', 'I', '1', 'L', 'S', '5', 'U', 'V']) {
      expect(ALFABETO).not.toContain(proibido)
    }
  })

  it('tem 27 símbolos e código de 6 posições', () => {
    expect(ALFABETO).toHaveLength(27)
    expect(new Set(ALFABETO).size).toBe(27)
    expect(TAMANHO).toBe(6)
    expect(VALIDADE_DIAS).toBe(30)
  })
})

describe('portal-invite-code — sorteio', () => {
  it('sempre gera 6 caracteres do alfabeto permitido', () => {
    for (let i = 0; i < 200; i++) {
      const c = sortearCodigo()
      expect(c).toHaveLength(TAMANHO)
      expect([...c].every(ch => ALFABETO.includes(ch))).toBe(true)
    }
  })
})

describe('portal-invite-code — normalização', () => {
  it('aceita o que o paciente realmente digita', () => {
    // Minúscula, hífen, espaço e ponto colado pelo teclado do celular.
    expect(normalizarCodigo('k7p2m9')).toBe('K7P2M9')
    expect(normalizarCodigo('K7P2-M9')).toBe('K7P2M9')
    expect(normalizarCodigo('K7P2 M9')).toBe('K7P2M9')
    expect(normalizarCodigo(' k7p2m9. ')).toBe('K7P2M9')
  })

  it('rejeita tamanho errado', () => {
    expect(normalizarCodigo('K7P2M')).toBeNull()
    expect(normalizarCodigo('K7P2M99')).toBeNull()
    expect(normalizarCodigo('')).toBeNull()
  })

  it('rejeita caractere ambíguo, mesmo com tamanho certo', () => {
    expect(normalizarCodigo('K7P2MO')).toBeNull() // letra O
    expect(normalizarCodigo('K7P2M0')).toBeNull() // zero
    expect(normalizarCodigo('K7P2MI')).toBeNull()
    expect(normalizarCodigo('K7P2ML')).toBeNull()
    expect(normalizarCodigo('K7P2MS')).toBeNull()
    expect(normalizarCodigo('K7P2M5')).toBeNull()
    expect(normalizarCodigo('K7P2MU')).toBeNull()
    expect(normalizarCodigo('K7P2MV')).toBeNull()
  })

  it('não estoura com entrada nula', () => {
    expect(normalizarCodigo(null as unknown as string)).toBeNull()
    expect(normalizarCodigo(undefined as unknown as string)).toBeNull()
  })
})

describe('portal-invite-code — estado', () => {
  const agora = new Date('2026-08-10T12:00:00Z')
  const futuro = '2026-09-09T12:00:00Z'
  const passado = '2026-08-01T12:00:00Z'

  it('linha ausente é inválido', () => {
    expect(classificarCodigo(null, agora)).toBe('invalido')
  })

  it('já usado tem precedência sobre expirado', () => {
    // Quem ativou e voltou no link precisa ler "já usado", não "expirado".
    expect(classificarCodigo(
      { invite_used_at: '2026-08-02T10:00:00Z', invite_expires_at: passado }, agora,
    )).toBe('usado')
  })

  it('expirado quando a validade já passou', () => {
    expect(classificarCodigo({ invite_used_at: null, invite_expires_at: passado }, agora)).toBe('expirado')
  })

  it('a fronteira exata da expiração já conta como expirado', () => {
    expect(classificarCodigo(
      { invite_used_at: null, invite_expires_at: agora.toISOString() }, agora,
    )).toBe('expirado')
  })

  it('válido quando não foi usado e ainda está no prazo', () => {
    expect(classificarCodigo({ invite_used_at: null, invite_expires_at: futuro }, agora)).toBe('valido')
  })

  it('sem data de validade é inválido, não eterno', () => {
    // Linha antiga (convite por link) não tem invite_expires_at — não pode virar
    // um código válido para sempre por omissão.
    expect(classificarCodigo({ invite_used_at: null, invite_expires_at: null }, agora)).toBe('invalido')
  })
})
