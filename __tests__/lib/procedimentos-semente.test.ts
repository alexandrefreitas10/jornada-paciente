import { chaveProcedimento } from '@/lib/estetica-relatorio'

// A lista inicial, copiada de `procedimentos-esteticos-db.ts`. Se as duas
// listas divergirem, este teste não protege nada — por isso ele também confere
// o tamanho, que é o sinal mais barato de alguém ter mexido num lado só.
const SEMENTE = [
  'Blindagem Capilar',
  'Criolipólise de Placas',
  'Criolipolise Dinâmica',
  'DEPILAÇÃO A LASER',
  'Fortalize',
  'Radiofrequência',
  'T-SCULPTOR',
]

describe('lista inicial de procedimentos', () => {
  it('tem 7 nomes', () => {
    expect(SEMENTE).toHaveLength(7)
  })

  it('produz 7 chaves DISTINTAS', () => {
    // Duas chaves iguais fariam duas opções do menu virarem o mesmo
    // procedimento no relatório, e a coluna UNIQUE recusaria a segunda.
    const chaves = new Set(SEMENTE.map(chaveProcedimento))
    expect(chaves.size).toBe(7)
  })

  it('a grafia de quem digita volta para a grafia da lista', () => {
    // É isto que acaba com a unificação manual: quem escreve "T sculptor"
    // cai no "T-SCULPTOR" que já existe.
    expect(chaveProcedimento('T sculptor')).toBe(chaveProcedimento('T-SCULPTOR'))
    expect(chaveProcedimento('depilacao a laser')).toBe(chaveProcedimento('DEPILAÇÃO A LASER'))
    expect(chaveProcedimento('criolipólise dinâmica')).toBe(chaveProcedimento('Criolipolise Dinâmica'))
  })

  it('nome sem letra nem número não vira procedimento', () => {
    expect(chaveProcedimento('   ')).toBe('')
    expect(chaveProcedimento('---')).toBe('')
  })
})
