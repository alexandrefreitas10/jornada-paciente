import { FILTRO_ROTULO, type FiltroAtraso } from '@/lib/estetica-atraso'
import { fmtInstanteComHora } from '@/lib/datas'

// O nome do arquivo que o navegador salva. PURO: sem React.
//
// O Chrome usa o título da página como nome do PDF. Sem isto, dois relatórios
// diferentes da mesma aba nasciam os dois "Instituto Torres.pdf", e quem
// baixou os dois não tinha como saber qual era qual sem abrir.

/** Acento e barra fora: `1/2` viraria uma PASTA "1" com um arquivo "2". */
function seguroEmArquivo(texto: string): string {
  return texto
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[\/:*?"<>|]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
}

export function nomeDoRelatorio({ visao, grupo, filtro, quando }: {
  visao: 'procedimento' | 'atraso'
  /** O procedimento aberto, ou `null` quando não há nenhum. */
  grupo: string | null
  filtro: FiltroAtraso
  quando: Date
}): string {
  const recorte = visao === 'atraso'
    ? ['Quem esta atrasado', FILTRO_ROTULO[filtro]]
    : grupo ? [grupo] : []
  const quandoTexto = fmtInstanteComHora(quando).replace(/\//g, '-')
  return ['Estetica', ...recorte.map(seguroEmArquivo), quandoTexto].join(' - ')
}
