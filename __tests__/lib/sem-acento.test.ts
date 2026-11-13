import { semAcento } from '@/lib/sem-acento'

describe('semAcento', () => {
  // Nomes INVENTADOS, como manda a regra do projeto.
  it('tira acento e baixa a caixa', () => {
    expect(semAcento('Lúcia')).toBe('lucia')
    expect(semAcento('LÚCIA')).toBe('lucia')
    expect(semAcento('lucia')).toBe('lucia')
  })

  it('cobre os acentos que aparecem em nome brasileiro', () => {
    expect(semAcento('João Antônio')).toBe('joao antonio')
    expect(semAcento('Conceição')).toBe('conceicao')
    expect(semAcento('Ângela Müller')).toBe('angela muller')
    expect(semAcento('Agnès')).toBe('agnes')
  })

  it('não mexe em nome sem acento', () => {
    expect(semAcento('Carlos Pereira')).toBe('carlos pereira')
  })

  it('a faixa pega a PRIMEIRA e a ÚLTIMA posição, não só o meio', () => {
    // Guarda contra alguém "simplificar" a faixa e cortar as pontas: U+0300 é
    // a crase combinante e U+036F o último da tabela. Se a faixa encolher, uma
    // dessas duas sobra no resultado e o teste acusa.
    const comPrimeiro = 'a' + String.fromCharCode(0x300)
    const comUltimo = 'a' + String.fromCharCode(0x36f)
    expect(semAcento(comPrimeiro)).toBe('a')
    expect(semAcento(comUltimo)).toBe('a')
  })

  it('não come caractere que está FORA da faixa', () => {
    // U+0370 é o primeiro ponto depois do fim da faixa: tem que sobreviver,
    // senão a faixa está larga demais e comendo coisa que não é acento.
    const foraDaFaixa = String.fromCharCode(0x370)
    expect(semAcento('a' + foraDaFaixa)).toBe('a' + foraDaFaixa.toLowerCase())
  })
})
