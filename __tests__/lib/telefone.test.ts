import { digitosTelefone, formatarTelefone, validarTelefone } from '@/lib/telefone'

describe('digitosTelefone', () => {
  it('fica só com os dígitos', () => {
    expect(digitosTelefone('(62) 98149-1277')).toBe('62981491277')
    expect(digitosTelefone(' 62 3241 1277 ')).toBe('6232411277')
  })

  it('tira o 55 do Brasil quando ele sobra na frente', () => {
    expect(digitosTelefone('+55 62 98149-1277')).toBe('62981491277')
    expect(digitosTelefone('556232411277')).toBe('6232411277')
  })

  it('NÃO tira o 55 quando ele é o DDD', () => {
    // DDD 55 é Santa Maria/RS: 11 dígitos não podem perder o começo.
    expect(digitosTelefone('(55) 99876-5432')).toBe('55998765432')
    expect(digitosTelefone('(55) 3221-5432')).toBe('5532215432')
  })

  it('aguenta vazio', () => {
    expect(digitosTelefone('')).toBe('')
    expect(digitosTelefone('abc')).toBe('')
  })
})

describe('validarTelefone', () => {
  it('aceita celular e fixo com DDD, digitados de qualquer jeito', () => {
    expect(validarTelefone('(62) 98149-1277')).toEqual({ ok: true, digitos: '62981491277' })
    expect(validarTelefone('62981491277')).toEqual({ ok: true, digitos: '62981491277' })
    expect(validarTelefone('+55 62 98149 1277')).toEqual({ ok: true, digitos: '62981491277' })
    expect(validarTelefone('(62) 3241-1277')).toEqual({ ok: true, digitos: '6232411277' })
  })

  it('recusa vazio', () => {
    expect(validarTelefone('').ok).toBe(false)
    expect(validarTelefone('   ').ok).toBe(false)
  })

  it('recusa curto demais e longo demais', () => {
    expect(validarTelefone('981491277').ok).toBe(false)      // 9 dígitos
    expect(validarTelefone('629814912770').ok).toBe(false)   // 12 dígitos sem 55
  })

  it('recusa DDD inválido', () => {
    expect(validarTelefone('01981491277').ok).toBe(false)
    expect(validarTelefone('10981491277').ok).toBe(false)
  })

  it('recusa celular de 11 dígitos que não começa com 9', () => {
    expect(validarTelefone('62881491277').ok).toBe(false)
  })

  it('diz o motivo', () => {
    const r = validarTelefone('')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.motivo).toMatch(/DDD/i)
  })
})

describe('formatarTelefone', () => {
  it('formata celular e fixo', () => {
    expect(formatarTelefone('62981491277')).toBe('(62) 98149-1277')
    expect(formatarTelefone('6232411277')).toBe('(62) 3241-1277')
  })

  it('formata também o que veio com +55', () => {
    expect(formatarTelefone('+5562981491277')).toBe('(62) 98149-1277')
  })

  it('valor antigo em formato livre volta como está', () => {
    // Os 4 telefones que já existem foram digitados pelo paciente no portal.
    expect(formatarTelefone('whatsapp 9999')).toBe('whatsapp 9999')
    expect(formatarTelefone('981491277')).toBe('981491277')
  })

  it('vazio e nulo viram string vazia', () => {
    expect(formatarTelefone(null)).toBe('')
    expect(formatarTelefone('')).toBe('')
    expect(formatarTelefone(undefined)).toBe('')
  })
})
