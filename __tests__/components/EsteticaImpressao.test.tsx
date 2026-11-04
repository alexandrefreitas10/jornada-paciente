import { render, screen, within } from '@testing-library/react'
import '@testing-library/jest-dom'
import { EsteticaImpressao } from '@/app/relatorios/EsteticaImpressao'
import type { LinhaAtraso } from '@/lib/estetica-atraso'
import type { SessaoEstetica } from '@/lib/estetica-relatorio'

// Nomes INVENTADOS: nada de paciente real em teste.
function sessao(extra: Partial<SessaoEstetica> = {}): SessaoEstetica {
  return {
    id: 1,
    patientId: 10,
    patientName: 'Conceição Açaí Brandão',
    procedimento: 'DEPILAÇÃO A LASER',
    totalSessoes: 6,
    feitas: 4,
    inicio: '2026-08-01',
    ultimaFeita: '2026-10-28',
    sessions_per_week: null,
    intervalo_valor: 1,
    intervalo_unidade: 'meses',
    ...extra,
  } as SessaoEstetica
}

function atraso(extra: Partial<LinhaAtraso> = {}): LinhaAtraso {
  return {
    ...sessao(),
    etiqueta: 'verde',
    diasSemVir: 7,
    ...extra,
  } as LinhaAtraso
}

const EMITIDO = new Date('2026-11-04T12:00:00Z')

describe('EsteticaImpressao: visão de atraso', () => {
  it('traz o cabeçalho com o filtro, a contagem e a data de emissão', () => {
    render(
      <EsteticaImpressao
        visao="atraso"
        filtro="em_dia"
        atrasos={[atraso(), atraso({ id: 2, patientName: 'Thaís Gonçalves Müller' })]}
        grupo={null}
        emitidoEm={EMITIDO}
      />
    )

    const papel = screen.getByRole('region', { name: /relatório de estética/i })
    expect(papel).toHaveTextContent(/quem está atrasado/i)
    expect(papel).toHaveTextContent(/Em dia/)
    expect(papel).toHaveTextContent(/2 pacientes/)
    expect(papel).toHaveTextContent('04/11/2026')
  })

  it('lista cada paciente com procedimento, cadência, sessões e tempo', () => {
    render(
      <EsteticaImpressao visao="atraso" filtro="em_dia" atrasos={[atraso()]} grupo={null} emitidoEm={EMITIDO} />
    )

    const linha = screen.getByRole('row', { name: /Conceição Açaí Brandão/ })
    expect(linha).toHaveTextContent('DEPILAÇÃO A LASER')
    expect(linha).toHaveTextContent('a cada 1 mês')
    expect(linha).toHaveTextContent('4 de 6')
    expect(linha).toHaveTextContent('há 7 dias')
  })

  it('a etiqueta sai como texto, não como pílula colorida', () => {
    render(
      <EsteticaImpressao
        visao="atraso"
        filtro="todos"
        atrasos={[atraso({ etiqueta: 'vermelha', diasSemVir: 90 })]}
        grupo={null}
        emitidoEm={EMITIDO}
      />
    )

    const linha = screen.getByRole('row', { name: /Conceição Açaí Brandão/ })
    expect(linha).toHaveTextContent(/muito atrasada/i)
    // Papel em preto e branco: cor de fundo não é informação que sobreviva.
    expect(linha.querySelector('[class*="bg-red"]')).toBeNull()
  })

  it('nome de paciente é texto no papel, nunca link', () => {
    render(
      <EsteticaImpressao visao="atraso" filtro="todos" atrasos={[atraso()]} grupo={null} emitidoEm={EMITIDO} />
    )

    const papel = screen.getByRole('region', { name: /relatório de estética/i })
    expect(papel).toHaveTextContent('Conceição Açaí Brandão')
    expect(within(papel).queryByRole('link')).toBeNull()
  })

  it('quem nunca veio sai com o texto próprio, não com "há N dias"', () => {
    render(
      <EsteticaImpressao
        visao="atraso"
        filtro="nunca_veio"
        atrasos={[atraso({ etiqueta: 'nunca_veio', diasSemVir: 30 })]}
        grupo={null}
        emitidoEm={EMITIDO}
      />
    )

    expect(screen.getByRole('row', { name: /Conceição Açaí Brandão/ })).toHaveTextContent(/30 dias sem iniciar/)
  })

  it('lista vazia não finge que há gente', () => {
    render(<EsteticaImpressao visao="atraso" filtro="atrasados" atrasos={[]} grupo={null} emitidoEm={EMITIDO} />)

    expect(screen.getByRole('region', { name: /relatório de estética/i })).toHaveTextContent(/ninguém/i)
  })
})

describe('EsteticaImpressao: visão por procedimento', () => {
  const grupo = {
    chave: 'depilacao a laser',
    nome: 'DEPILAÇÃO A LASER',
    pacientes: 2,
    emAberto: [sessao()],
    finalizados: [sessao({ id: 3, patientName: 'Otávio Nunes Sá', feitas: 6 })],
  }

  it('usa o nome do procedimento no cabeçalho', () => {
    render(<EsteticaImpressao visao="procedimento" filtro="todos" atrasos={[]} grupo={grupo} emitidoEm={EMITIDO} />)

    expect(screen.getByRole('region', { name: /relatório de estética/i })).toHaveTextContent('DEPILAÇÃO A LASER')
  })

  it('separa em aberto e finalizados, com as contagens', () => {
    render(<EsteticaImpressao visao="procedimento" filtro="todos" atrasos={[]} grupo={grupo} emitidoEm={EMITIDO} />)

    const emAberto = screen.getByRole('table', { name: /em aberto/i })
    expect(emAberto).toHaveTextContent('Conceição Açaí Brandão')
    expect(emAberto).not.toHaveTextContent('Otávio Nunes Sá')

    const finalizados = screen.getByRole('table', { name: /finalizados/i })
    expect(finalizados).toHaveTextContent('Otávio Nunes Sá')
  })

  it('sem procedimento escolhido não quebra', () => {
    render(<EsteticaImpressao visao="procedimento" filtro="todos" atrasos={[]} grupo={null} emitidoEm={EMITIDO} />)

    expect(screen.getByRole('region', { name: /relatório de estética/i })).toBeInTheDocument()
  })
})
