import { STATUS_AGENDAMENTO } from '@/lib/agenda-db'
import { filtrarPorStatus, resumoDoPeriodo } from '@/lib/agenda-relatorio'

const LISTA = [
  { status: 'atendido' },
  { status: 'atendido' },
  { status: 'faltou' },
  { status: 'desmarcou' },
  { status: 'agendado' },
]

describe('números do período', () => {
  it('conta cada status e o total', () => {
    const r = resumoDoPeriodo(LISTA)
    expect(r.atendido).toBe(2)
    expect(r.faltou).toBe(1)
    expect(r.desmarcou).toBe(1)
    expect(r.agendado).toBe(1)
    // Zero aparece, não some: é a diferença entre "ninguém remarcou" e
    // "esqueci de contar".
    expect(r.remarcou).toBe(0)
    expect(r.total).toBe(5)
  })

  it('lista vazia tem todos os status em zero', () => {
    // A tela mostra os números sempre. Faltar chave viraria "undefined" na
    // cara do dono num mês sem movimento.
    const r = resumoDoPeriodo([])
    expect(r.total).toBe(0)
    for (const s of STATUS_AGENDAMENTO) expect(r[s]).toBe(0)
  })

  it('status desconhecido não derruba a conta', () => {
    // Se um dia entrar um sexto status no banco antes do código saber dele,
    // o relatório tem que continuar somando o que conhece em vez de quebrar
    // a tela inteira.
    const r = resumoDoPeriodo([...LISTA, { status: 'inventado' }])
    expect(r.total).toBe(6)
    expect(r.atendido).toBe(2)
  })
})

describe('filtro por status', () => {
  it('"todos" não filtra nada', () => {
    expect(filtrarPorStatus(LISTA, 'todos')).toHaveLength(5)
  })

  it('filtra por um status', () => {
    expect(filtrarPorStatus(LISTA, 'atendido')).toHaveLength(2)
    expect(filtrarPorStatus(LISTA, 'remarcou')).toHaveLength(0)
  })

  it('devolve os mesmos objetos, não cópias', () => {
    // A tela usa o id de cada linha para mandar a correção de status. Clonar
    // aqui abriria espaço para a lista filtrada e a original saírem de sincronia.
    const [primeiro] = filtrarPorStatus(LISTA, 'faltou')
    expect(primeiro).toBe(LISTA[2])
  })
})
