import JSZip from 'jszip'
import { matrizDoXlsx } from '@/lib/conciliacao/xlsx'
import { lerPlanilha } from '@/lib/conciliacao/planilha'

// As planilhas do BPO têm uma forma muito particular, MEDIDA nos arquivos
// reais de setembro: XML com prefixo de namespace (`<x:workbook>`, `<x:row>`,
// `<x:c>`), uma única aba chamada `Table1`, NENHUM `sharedStrings.xml` (todo
// texto é inline, `t="str"`, dentro de `<x:v>`), e nenhuma célula com atributo
// `r` — a posição é só a ordem do documento. Este teste monta um .xlsx com
// essa mesma forma, sem copiar dado real da clínica para dentro do repositório.

const NS = 'xmlns:x="http://schemas.openxmlformats.org/spreadsheetml/2006/main"'

const texto = (v: string) => `<x:c s="1" t="str"><x:v>${v}</x:v></x:c>`
const numero = (v: string) => `<x:c s="2" t="n"><x:v>${v}</x:v></x:c>`
const vazia = () => `<x:c s="2" t="str"><x:v></x:v></x:c>`
const linha = (celulas: string[]) => `<x:row ht="17" customHeight="1">${celulas.join('')}</x:row>`

function planilhaXml(linhas: string[]): string {
  return `<?xml version="1.0" encoding="utf-8"?><x:worksheet ${NS}><x:sheetData>${linhas.join('')}</x:sheetData></x:worksheet>`
}

const WORKBOOK = `<?xml version="1.0" encoding="utf-8"?><x:workbook ${NS}><x:sheets><x:sheet name="Table1" sheetId="1" r:id="Rc00be84d14f94abc" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" /></x:sheets></x:workbook>`

// O Target vem com barra inicial no arquivo real ("/xl/worksheets/sheet1.xml").
const RELS = `<?xml version="1.0" encoding="utf-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="/xl/worksheets/sheet1.xml" Id="Rc00be84d14f94abc" /></Relationships>`

async function montar(partes: Record<string, string>): Promise<Uint8Array> {
  const zip = new JSZip()
  for (const [nome, conteudo] of Object.entries(partes)) zip.file(nome, conteudo)
  return zip.generateAsync({ type: 'uint8array' })
}

/** Um .xlsx completo no formato do BPO, com as linhas dadas. */
function arquivo(linhas: string[], extra: Record<string, string> = {}) {
  return montar({
    'xl/workbook.xml': WORKBOOK,
    'xl/_rels/workbook.xml.rels': RELS,
    'xl/worksheets/sheet1.xml': planilhaXml(linhas),
    ...extra,
  })
}

describe('matrizDoXlsx', () => {
  it('lê a matriz na ordem do documento, com número no lugar de número', async () => {
    const bytes = await arquivo([
      linha([texto('Data de pagamento'), texto('Nome'), texto('Valor categoria/centro de custo')]),
      linha([texto('01/09/2026'), texto('FORNECEDOR EXEMPLO'), numero('407.23')]),
      linha([texto('02/09/2026'), vazia(), numero('-10000')]),
    ])
    expect(await matrizDoXlsx(bytes)).toEqual([
      ['Data de pagamento', 'Nome', 'Valor categoria/centro de custo'],
      ['01/09/2026', 'FORNECEDOR EXEMPLO', 407.23],
      ['02/09/2026', '', -10000],
    ])
  })

  it('desfaz as entidades XML (um "&" no nome do fornecedor)', async () => {
    const bytes = await arquivo([linha([texto('A &amp; B &lt;LTDA&gt;')])])
    expect(await matrizDoXlsx(bytes)).toEqual([['A & B <LTDA>']])
  })

  it('respeita o atributo r quando ele existe, deixando vazio o que foi pulado', async () => {
    // Os arquivos do BPO não têm `r`; se um dia tiverem, a coluna não pode
    // escorregar para a esquerda — isso leria o valor de outra coluna.
    const bytes = await arquivo([
      '<x:row><x:c r="A1" t="str"><x:v>um</x:v></x:c><x:c r="C1" t="str"><x:v>tres</x:v></x:c></x:row>',
    ])
    expect(await matrizDoXlsx(bytes)).toEqual([['um', '', 'tres']])
  })

  it('entrega uma matriz que o lerPlanilha entende de ponta a ponta', async () => {
    const cabecalho = [
      'Id', 'Vencimento', 'Competência', 'Previsto para', 'Data de pagamento', 'CPF/CNPJ',
      'Nome', 'Descrição', 'Referência', 'Categoria', 'Detalhamento', 'Centro de Custo',
      'Valor categoria/centro de custo', 'Identificador', 'Banco', 'Número NFS-e',
    ]
    const bytes = await arquivo([
      linha(cabecalho.map(texto)),
      linha([
        numero('1'), texto('01/09/2026'), texto('01/09/2026'), texto('01/09/2026'),
        texto('01/09/2026'), texto('12.345.678/0001-99'), texto('FORNECEDOR EXEMPLO'),
        texto('Mensalidade'), vazia(), texto('Serviços'), vazia(), texto('Clínica'),
        numero('-1409'), vazia(), texto('Unicred'), vazia(),
      ]),
    ])
    const lida = lerPlanilha(await matrizDoXlsx(bytes))
    expect(lida.lancamentos).toEqual([
      {
        data: '2026-09-01',
        competencia: '2026-09-01',
        centavos: -140900,
        banco: 'unicred',
        nome: 'FORNECEDOR EXEMPLO',
        descricao: 'Mensalidade',
        categoria: 'Serviços',
      },
    ])
    expect([lida.semDataPagamento, lida.bancoDesconhecido, lida.semValor]).toEqual([0, 0, 0])
  })

  // --- As falhas. Nenhuma delas pode devolver matriz vazia ou parcial: a aba
  // diria "nada para conciliar" de um arquivo que ela simplesmente não leu.

  it('estoura quando o arquivo não é um .xlsx', async () => {
    await expect(matrizDoXlsx(new Uint8Array([1, 2, 3, 4]))).rejects.toThrow(/\.xlsx/)
  })

  it('estoura quando falta o xl/workbook.xml', async () => {
    const bytes = await montar({ 'xl/worksheets/sheet1.xml': planilhaXml([linha([texto('a')])]) })
    await expect(matrizDoXlsx(bytes)).rejects.toThrow(/xl\/workbook\.xml/)
  })

  it('estoura quando o workbook não declara nenhuma aba', async () => {
    const bytes = await montar({
      'xl/workbook.xml': `<?xml version="1.0" encoding="utf-8"?><x:workbook ${NS}><x:sheets /></x:workbook>`,
      'xl/worksheets/sheet1.xml': planilhaXml([linha([texto('a')])]),
    })
    await expect(matrizDoXlsx(bytes)).rejects.toThrow(/nenhuma aba/i)
  })

  it('estoura quando a aba declarada não está no arquivo', async () => {
    const bytes = await montar({ 'xl/workbook.xml': WORKBOOK, 'xl/_rels/workbook.xml.rels': RELS })
    await expect(matrizDoXlsx(bytes)).rejects.toThrow(/xl\/worksheets\/sheet1\.xml/)
  })

  it('estoura quando a aba não tem sheetData', async () => {
    const bytes = await montar({
      'xl/workbook.xml': WORKBOOK,
      'xl/_rels/workbook.xml.rels': RELS,
      'xl/worksheets/sheet1.xml': `<?xml version="1.0" encoding="utf-8"?><x:worksheet ${NS} />`,
    })
    await expect(matrizDoXlsx(bytes)).rejects.toThrow(/sheetData/)
  })

  it('estoura quando a aba não tem nenhuma linha', async () => {
    const bytes = await arquivo([])
    await expect(matrizDoXlsx(bytes)).rejects.toThrow(/nenhuma linha/i)
  })

  it('estoura quando o texto vem por sharedStrings (t="s"), que estes arquivos não usam', async () => {
    const bytes = await arquivo([linha(['<x:c s="1" t="s"><x:v>0</x:v></x:c>'])])
    await expect(matrizDoXlsx(bytes)).rejects.toThrow(/sharedStrings/)
  })

  it('estoura quando uma célula numérica não tem número dentro', async () => {
    const bytes = await arquivo([linha([numero('quarenta e um')])])
    await expect(matrizDoXlsx(bytes)).rejects.toThrow(/quarenta e um/)
  })

  it('estoura quando um elemento não fecha (XML truncado)', async () => {
    const bytes = await montar({
      'xl/workbook.xml': WORKBOOK,
      'xl/_rels/workbook.xml.rels': RELS,
      'xl/worksheets/sheet1.xml': `<?xml version="1.0"?><x:worksheet ${NS}><x:sheetData><x:row><x:c t="str"><x:v>a`,
    })
    await expect(matrizDoXlsx(bytes)).rejects.toThrow()
  })

  it('estoura quando o tipo da célula é desconhecido', async () => {
    const bytes = await arquivo([linha(['<x:c s="1" t="zzz"><x:v>a</x:v></x:c>'])])
    await expect(matrizDoXlsx(bytes)).rejects.toThrow(/zzz/)
  })
})
