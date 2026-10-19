import type { Montagem, PastaComContagem } from '@/lib/fotos-db'

// O que a galeria (`FotosClient`) e o montador (`Montador`) usam em comum:
// formatação de data e os tipos que os dois trocam entre si.
//
// Mora num arquivo próprio para não haver import circular entre os dois
// componentes. Antes, o montador importava os helpers de dentro da galeria e a
// galeria importava o montador — um ciclo que funciona em desenvolvimento, por
// hoisting de `function`, mas que é exatamente o tipo de coisa que quebra só no
// bundle de produção, com um "não é uma função" longe da causa. Esta tela só
// pode ser aberta com sessão da equipe, então não dá para testá-la aqui: o
// ciclo foi desfeito em vez de verificado.

export interface Paciente { id: number; name: string }

/** O contrato do montador de 4 passos. */
export interface MontadorProps {
  /** Pacientes do sistema, para o passo "de quem é?". Vem da página. */
  pacientes: Paciente[]
  /** Pastas de quem não tem card, já carregadas. */
  pessoas: PastaComContagem[]
  /** Pasta já escolhida, quando o montador abriu de dentro de uma pasta. */
  pessoaInicial: number | null
  /** Chamado no salvar: acrescenta a montagem no topo da galeria. */
  onPronto: (montagem: Montagem) => void
  onFechar: () => void
}

// Fuso explícito em TODA data desta tela. O banco grava em UTC e, sem o fuso,
// montagem feita de noite em Brasília aparece com o dia seguinte — foi o defeito
// que já apareceu nos filtros dos relatórios.
const FUSO = 'America/Sao_Paulo'

/**
 * Os campos de data chegam `Date` quando a página server passa a linha como
 * prop e string ISO quando vêm por `fetch` de uma rota (ver o AVISO no topo de
 * `src/lib/fotos-db.ts`). `new Date(valor)` funciona nos dois casos — nunca
 * chamar método de string (`.slice`, `.startsWith`) nesses campos.
 */
function dataValida(valor: string | Date | null | undefined): Date | null {
  if (!valor) return null
  const d = new Date(valor)
  return Number.isNaN(d.getTime()) ? null : d
}

/**
 * A mesma data em ISO, para passar ao canvas e ao POST da montagem. Devolve
 * `null` em data impossível, para quem chama decidir o que fazer em vez de
 * mandar "Invalid Date" para o servidor.
 */
export function isoDaData(valor: string | Date | null | undefined): string | null {
  const d = dataValida(valor)
  return d ? d.toISOString() : null
}

export function fmtData(valor: string | Date | null | undefined): string {
  const d = dataValida(valor)
  if (!d) return '—'
  return d.toLocaleDateString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric', timeZone: FUSO,
  })
}

/** O montador mostra a data de cada foto na mesma tela que a galeria: uma
 *  segunda formatação lá dentro poderia divergir no fuso. */
export function fmtDataHora(valor: string | Date | null | undefined): string {
  const d = dataValida(valor)
  if (!d) return '—'
  return d.toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', timeZone: FUSO,
  })
}
