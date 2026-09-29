import { chaveNome, chavesDePessoa, type PessoaImplante } from '@/lib/implantes'

const imp = (patient_id: number | null, patient_name: string) => ({ patient_id, patient_name })

describe('chaveNome', () => {
  it('ignora caixa, acento e espaço sobrando', () => {
    expect(chaveNome('Daniela Berquo Rodrigues da Cunha')).toBe(chaveNome('DANIELA BERQUO RODRIGUES DA CUNHA'))
    expect(chaveNome('Andréa Gonzalez')).toBe(chaveNome('Andrea  Gonzalez '))
  })

  it('nomes diferentes continuam diferentes', () => {
    expect(chaveNome('Ana Caroline Caixeta Silva')).not.toBe(chaveNome('Ana Carolina Caixeta Silva'))
  })

  it('aguenta vazio', () => {
    expect(chaveNome('')).toBe('')
    expect(chaveNome('   ')).toBe('')
  })
})

describe('chavesDePessoa', () => {
  it('linha sem vínculo e renovação vinculada são a MESMA pessoa', () => {
    // O caso real: implante de 12/03 lançado sem patient_id, renovação de
    // 28/09 já vinculada ao paciente 190. Antes viravam dois cards.
    const lista = [imp(null, 'Daniela Berquo Rodrigues da Cunha'), imp(190, 'Daniela Berquo Rodrigues da Cunha')]
    const chave = chavesDePessoa(lista)
    expect(chave(lista[0])).toBe(chave(lista[1]))
  })

  it('mesmo id nas duas linhas continua sendo uma pessoa só', () => {
    const lista = [imp(12, 'Mariana Esther Bueno Lima'), imp(12, 'Mariana Esther Bueno Lima')]
    const chave = chavesDePessoa(lista)
    expect(chave(lista[0])).toBe(chave(lista[1]))
  })

  it('pessoas diferentes nunca se juntam', () => {
    const lista = [imp(190, 'Daniela Berquo Rodrigues da Cunha'), imp(174, 'Andréa Gonzalez de Souza Pinto')]
    const chave = chavesDePessoa(lista)
    expect(chave(lista[0])).not.toBe(chave(lista[1]))
  })

  it('dois PACIENTES diferentes com o mesmo nome continuam separados', () => {
    // O cadastro afirma que são dois: juntar esconderia o implante de um deles.
    const lista = [imp(12, 'Mariana Esther Bueno Lima'), imp(21, 'Mariana Esther Bueno Lima')]
    const chave = chavesDePessoa(lista)
    expect(chave(lista[0])).not.toBe(chave(lista[1]))
  })

  it('no nome ambíguo, a linha sem vínculo fica sozinha — não dá para adivinhar de quem é', () => {
    const lista = [
      imp(12, 'Mariana Esther Bueno Lima'),
      imp(21, 'Mariana Esther Bueno Lima'),
      imp(null, 'Mariana Esther Bueno Lima'),
    ]
    const chave = chavesDePessoa(lista)
    expect(new Set(lista.map(chave)).size).toBe(3)
  })

  it('duas linhas sem vínculo e mesmo nome são a mesma pessoa', () => {
    const lista = [imp(null, 'Ana Caroline Caixeta Silva'), imp(null, 'Ana Caroline Caixeta Silva')]
    const chave = chavesDePessoa(lista)
    expect(chave(lista[0])).toBe(chave(lista[1]))
  })

  it('a ambiguidade de um nome não contamina os outros', () => {
    const lista = [
      imp(12, 'Mariana Esther Bueno Lima'),
      imp(21, 'Mariana Esther Bueno Lima'),
      imp(null, 'Daniela Berquo Rodrigues da Cunha'),
      imp(190, 'Daniela Berquo Rodrigues da Cunha'),
    ]
    const chave = chavesDePessoa(lista)
    expect(chave(lista[2])).toBe(chave(lista[3]))
  })

  it('lista vazia devolve uma função que ainda funciona', () => {
    expect(chavesDePessoa<PessoaImplante>([])(imp(null, 'Fulano'))).toBe(chaveNome('Fulano'))
  })
})
