import { extractText, getDocumentProxy } from 'unpdf'

/**
 * PDF → linhas de texto, já sem as vazias. Isolado num arquivo só porque é a
 * única parte que depende da biblioteca: os leitores de cada banco recebem
 * linhas e são testáveis sem PDF nenhum.
 */
export async function linhasDoPdf(bytes: Uint8Array): Promise<string[]> {
  const pdf = await getDocumentProxy(bytes)
  const { text } = await extractText(pdf, { mergePages: true })
  return text.split('\n').map(l => l.trim()).filter(Boolean)
}
