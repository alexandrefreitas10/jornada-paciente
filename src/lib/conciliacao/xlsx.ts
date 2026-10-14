import JSZip from 'jszip'

// Leitor de .xlsx escrito à mão sobre o `jszip`, só para as duas planilhas que
// o BPO exporta. Existe porque as bibliotecas prontas NÃO abrem esses
// arquivos:
//
// - `exceljs@4.4.0` estoura com "Cannot read properties of undefined (reading
//   'sheets')" nos dois, e `read-excel-file` falha do mesmo jeito, porque o
//   export escreve o XML com prefixo de namespace (`<x:workbook>`, `<x:row>`,
//   `<x:c>`) e os dois esperam as tags sem prefixo;
// - SheetJS (`xlsx`) abre, mas a versão publicada no npm (0.18.5) carrega duas
//   CVEs conhecidas — não entra num sistema de saúde por causa de um leitor de
//   planilha.
//
// A forma dos arquivos foi MEDIDA (setembro/2026, os dois exports):
// uma única aba `Table1`; 84 linhas (1 cabeçalho + 83); **nenhum**
// `sharedStrings.xml` — todo texto é inline, `t="str"`, dentro de `<x:v>`; a
// coluna de valor é numérica (`t="n"`); as datas são texto `DD/MM/AAAA`; e
// nenhuma linha ou célula traz atributo `r`, então a posição é a ordem do
// documento.
//
// A regra de ouro deste arquivo: **estourar alto**. Devolver matriz vazia ou
// pela metade faria a aba dizer "nada para conciliar" sobre um arquivo que ela
// simplesmente não conseguiu ler — a pior resposta possível. Toda mensagem diz
// o que estava errado. A segunda rede é o `lerPlanilha`, que estoura quando o
// cabeçalho não é o do BPO.

/** Teto do XML de uma aba já descomprimida, para limitar o estrago de um zip
 *  inflado de propósito. Em setembro a aba tem 62 KB. */
const MAX_XML = 32 * 1024 * 1024

interface Elemento {
  atributos: string
  conteudo: string
}

/**
 * Os elementos de nome `nome` (com ou sem prefixo de namespace) na ordem do
 * documento. Vale porque nenhum dos elementos procurados aqui (`sheet`, `row`,
 * `c`, `v`, `is`, `t`, `Relationship`) aparece dentro de outro do mesmo nome —
 * então o primeiro fechamento depois da abertura é o fechamento dela.
 */
function elementos(xml: string, nome: string): Elemento[] {
  const abre = new RegExp(`<(?:[A-Za-z_][\\w.-]*:)?${nome}(\\s[^>]*?)?(/?)>`, 'g')
  const fecha = new RegExp(`</(?:[A-Za-z_][\\w.-]*:)?${nome}\\s*>`)
  const achados: Elemento[] = []
  let m: RegExpExecArray | null
  while ((m = abre.exec(xml)) !== null) {
    const atributos = m[1] ?? ''
    if (m[2] === '/') {
      achados.push({ atributos, conteudo: '' })
      continue
    }
    const resto = xml.slice(abre.lastIndex)
    const f = fecha.exec(resto)
    if (!f) throw new Error(`XLSX ilegível: o elemento <${nome}> não tem fechamento (XML truncado?).`)
    achados.push({ atributos, conteudo: resto.slice(0, f.index) })
    abre.lastIndex += f.index + f[0].length
  }
  return achados
}

/** O valor de um atributo, aceitando prefixo de namespace (`r:id` casa com `id`). */
function atributo(atributos: string, nome: string): string | null {
  const m = new RegExp(`(?:^|\\s)(?:[A-Za-z_][\\w.-]*:)?${nome}\\s*=\\s*("([^"]*)"|'([^']*)')`).exec(atributos)
  return m ? (m[2] ?? m[3] ?? null) : null
}

const ENTIDADES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }

function decodificar(texto: string): string {
  return texto.replace(/&(#x?[0-9A-Fa-f]+|[a-z]+);/g, (tudo, corpo: string) => {
    if (corpo.startsWith('#')) {
      const n = corpo[1] === 'x' || corpo[1] === 'X' ? parseInt(corpo.slice(2), 16) : Number(corpo.slice(1))
      return Number.isFinite(n) && n > 0 ? String.fromCodePoint(n) : tudo
    }
    return ENTIDADES[corpo] ?? tudo
  })
}

/** "AB12" → 27 (índice da coluna, base zero). */
function colunaDeRef(ref: string): number | null {
  const m = /^([A-Za-z]+)\d*$/.exec(ref)
  if (!m) return null
  let n = 0
  for (const letra of m[1].toUpperCase()) n = n * 26 + (letra.charCodeAt(0) - 64)
  return n - 1
}

/**
 * O conteúdo de uma célula. Texto vira string, número vira number (é o que o
 * `pontoParaCentavos` do `lerPlanilha` espera), célula sem valor vira string
 * vazia. Qualquer coisa fora disso estoura.
 */
function valorDaCelula(celula: Elemento): unknown {
  // Sem `t` o padrão do formato é numérico, mas aqui a leitura é tolerante: se
  // o conteúdo não é número, vale como texto. Já um `t="n"` explícito com
  // conteúdo não numérico é o arquivo se contradizendo, e aí estoura.
  const t = atributo(celula.atributos, 't')

  if (t === 's') {
    throw new Error('XLSX ilegível: a célula aponta para sharedStrings (t="s"), e este leitor só abre o export do BPO, que escreve o texto embutido (t="str").')
  }
  if (t === 'inlineStr') {
    const is = elementos(celula.conteudo, 'is')
    return is.length ? elementos(is[0].conteudo, 't').map(x => decodificar(x.conteudo)).join('') : ''
  }
  if (t !== null && t !== 'n' && t !== 'str' && t !== 'd' && t !== 'b' && t !== 'e') {
    throw new Error(`XLSX ilegível: tipo de célula não suportado (t="${t}").`)
  }

  const v = elementos(celula.conteudo, 'v')
  if (!v.length) return ''
  const texto = decodificar(v[0].conteudo).trim()
  if (texto === '') return ''
  if (t === 'n' || t === null) {
    const n = Number(texto)
    if (Number.isFinite(n)) return n
    if (t === 'n') throw new Error(`XLSX ilegível: célula marcada como numérica (t="n") com o conteúdo "${texto}".`)
  }
  return texto
}

function celulasDaLinha(linha: string): unknown[] {
  const saida: unknown[] = []
  for (const celula of elementos(linha, 'c')) {
    const ref = atributo(celula.atributos, 'r')
    // Sem `r` (o caso dos arquivos do BPO) a posição é a ordem do documento.
    // Com `r`, a coluna é a do próprio atributo: respeitá-lo evita que uma
    // célula pulada empurre as outras para a esquerda, o que faria o
    // `lerPlanilha` ler o valor de uma coluna como se fosse de outra.
    const indice = ref ? colunaDeRef(ref) : null
    if (indice !== null && indice >= 0) {
      while (saida.length < indice) saida.push('')
      saida[indice] = valorDaCelula(celula)
    } else {
      saida.push(valorDaCelula(celula))
    }
  }
  return saida
}

async function parte(zip: JSZip, caminho: string): Promise<string> {
  const arquivo = zip.file(caminho)
  if (!arquivo) throw new Error(`XLSX ilegível: falta a parte ${caminho} dentro do arquivo.`)
  const texto = await arquivo.async('string')
  if (texto.length > MAX_XML) {
    throw new Error(`XLSX ilegível: a parte ${caminho} tem ${texto.length} caracteres, acima do teto de ${MAX_XML}.`)
  }
  return texto
}

/** O caminho da aba dentro do zip, pelo `r:id` que o workbook declara. */
async function caminhoDaAba(zip: JSZip, rid: string | null): Promise<string> {
  const padrao = 'xl/worksheets/sheet1.xml'
  const rels = zip.file('xl/_rels/workbook.xml.rels')
  if (!rels || !rid) return padrao
  const xml = await rels.async('string')
  for (const rel of elementos(xml, 'Relationship')) {
    if (atributo(rel.atributos, 'Id') !== rid) continue
    const alvo = atributo(rel.atributos, 'Target')
    if (!alvo) break
    // O arquivo real traz o Target com barra inicial ("/xl/worksheets/sheet1.xml");
    // o formato também admite relativo à pasta do workbook ("worksheets/sheet1.xml").
    return alvo.startsWith('/') ? alvo.slice(1) : alvo.startsWith('xl/') ? alvo : `xl/${alvo.replace(/^\.\//, '')}`
  }
  return padrao
}

/** XLSX (bytes) → matriz de linhas, para `lerPlanilha`. */
export async function matrizDoXlsx(bytes: Uint8Array): Promise<unknown[][]> {
  const zip = await JSZip.loadAsync(bytes).catch((err: unknown) => {
    const motivo = err instanceof Error ? err.message : String(err)
    throw new Error(`O arquivo não parece ser um .xlsx: ${motivo}`)
  })

  const workbook = await parte(zip, 'xl/workbook.xml')
  const abas = elementos(workbook, 'sheet')
  if (!abas.length) throw new Error('XLSX ilegível: o arquivo não declara nenhuma aba (nenhum <sheet> em xl/workbook.xml).')
  const nomeDaAba = atributo(abas[0].atributos, 'name') ?? 'sem nome'

  const caminho = await caminhoDaAba(zip, atributo(abas[0].atributos, 'id'))
  const aba = await parte(zip, caminho)

  const dados = elementos(aba, 'sheetData')
  if (!dados.length) throw new Error(`XLSX ilegível: a aba "${nomeDaAba}" (${caminho}) não tem <sheetData>.`)

  const matriz = elementos(dados[0].conteudo, 'row').map(linha => celulasDaLinha(linha.conteudo))
  if (!matriz.length) throw new Error(`XLSX ilegível: a aba "${nomeDaAba}" não tem nenhuma linha.`)
  return matriz
}
