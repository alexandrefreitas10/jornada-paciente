import { getDocumentProxy } from 'unpdf'

/** "A N D R A D E" → "ANDRADE". Só quando o item INTEIRO é caractere-espaço. */
const juntarLetras = (s: string) => (/^(\S )+\S?$/.test(s) ? s.replace(/ /g, '') : s)

/**
 * A fatura tem as letras separadas no conteúdo do PDF, então o texto corrido
 * vem inútil. Aqui cada item é reposicionado: agrupa por linha (y) e ordena por
 * x, inserindo espaço só quando há vão de verdade entre dois itens.
 *
 * Diferente dos extratos bancários (`conciliacao/pdf.ts`), que funcionam no
 * texto corrido: aqui a posição é a única informação confiável.
 */
export async function linhasDaFatura(bytes: Uint8Array): Promise<string[]> {
  const pdf = await getDocumentProxy(bytes)
  const saida: string[] = []
  for (let p = 1; p <= pdf.numPages; p++) {
    const conteudo = await (await pdf.getPage(p)).getTextContent()
    const porLinha = new Map<number, { x: number; t: string; w: number }[]>()
    for (const item of conteudo.items as { str?: string; width?: number; transform?: number[] }[]) {
      if (!item.str?.trim() || !item.transform) continue
      const y = Math.round(item.transform[5])
      porLinha.set(y, [...(porLinha.get(y) ?? []), { x: item.transform[4], t: juntarLetras(item.str), w: item.width ?? 0 }])
    }
    for (const [, itens] of [...porLinha.entries()].sort((a, b) => b[0] - a[0])) {
      itens.sort((a, b) => a.x - b.x)
      let linha = ''
      let fim: number | null = null
      for (const i of itens) {
        if (fim !== null && i.x - fim > 1.5) linha += ' '
        linha += i.t
        fim = i.x + i.w
      }
      saida.push(linha.replace(/\s+/g, ' ').trim())
    }
  }
  return saida
}
