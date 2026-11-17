import { STATUS_AGENDAMENTO } from '@/lib/agenda-db'
import { filtrarPorStatus, periodoPadrao, resumoDoPeriodo } from '@/lib/agenda-relatorio'
import { diasEntre } from '@/lib/datas'

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

describe('período padrão', () => {
  it('nunca passa do teto que o servidor aceita, em nenhum dia do ano', () => {
    // O servidor recusa acima de 62 dias (MAX_DIAS_CONSULTA em
    // src/app/api/agenda/route.ts). Se esta conta estourar, a aba abre com
    // "Período longo demais" — e só em alguns dias do mês, que é a falha que
    // ninguém reproduz. Varre 2026 e 2028 (bissexto) dia a dia.
    for (const ano of [2026, 2028]) {
      for (let mes = 1; mes <= 12; mes++) {
        const ultimo = new Date(Date.UTC(ano, mes, 0)).getUTCDate()
        for (let d = 1; d <= ultimo; d++) {
          const hoje = `${ano}-${String(mes).padStart(2, '0')}-${String(d).padStart(2, '0')}`
          const { de, ate } = periodoPadrao(hoje)
          expect(diasEntre(de, ate)).toBeLessThanOrEqual(62)
        }
      }
    }
  })

  it('é o MÊS FECHADO: do dia 1 ao último dia', () => {
    // Decisão do dono em 17/11: a aba serve para fechar o mês, então os
    // números do topo têm que ser do mês — misturar dias do mês seguinte
    // fazia "Agendado (40)" responder uma pergunta que ninguém fez.
    expect(periodoPadrao('2026-11-16')).toEqual({ de: '2026-11-01', ate: '2026-11-30' })
    expect(periodoPadrao('2026-11-30')).toEqual({ de: '2026-11-01', ate: '2026-11-30' })
  })

  it('acerta meses de 31 dias e fevereiro, inclusive bissexto', () => {
    expect(periodoPadrao('2026-01-15').ate).toBe('2026-01-31')
    expect(periodoPadrao('2026-02-10').ate).toBe('2026-02-28')
    expect(periodoPadrao('2028-02-10').ate).toBe('2028-02-29')
  })
})
