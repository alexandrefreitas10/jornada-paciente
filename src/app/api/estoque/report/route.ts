import { NextRequest, NextResponse } from 'next/server'
import { listStockItems } from '@/lib/stock'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import ExcelJS from 'exceljs'

export const dynamic = 'force-dynamic'

function fmtDateTime(d: Date) {
  return d.toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
    timeZone: 'America/Sao_Paulo',
  })
}

export async function GET(req: NextRequest) {
  const format = req.nextUrl.searchParams.get('format') === 'xlsx' ? 'xlsx' : 'pdf'
  const items = await listStockItems()
  const now = new Date()
  const stamp = now.toISOString().slice(0, 10)

  if (format === 'xlsx') {
    const wb = new ExcelJS.Workbook()
    const ws = wb.addWorksheet('Estoque')

    ws.columns = [
      { header: 'Medicação', key: 'name', width: 45 },
      { header: 'Quantidade', key: 'quantity', width: 14 },
      { header: 'Unidade', key: 'unit', width: 14 },
      { header: 'Lote', key: 'lot', width: 16 },
      { header: 'Validade', key: 'expiry', width: 14 },
    ]

    // Título
    ws.insertRow(1, [`Relatório de Estoque — ${fmtDateTime(now)}`])
    ws.mergeCells('A1:E1')
    ws.getCell('A1').font = { bold: true, size: 14 }
    ws.getRow(2).font = { bold: true }
    ws.getRow(2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEDE9FE' } }

    for (const i of items) {
      ws.addRow({
        name: i.name,
        quantity: i.quantity,
        unit: i.unit,
        lot: i.lot ?? '',
        expiry: i.expiry_date ?? '',
      })
    }

    // Total
    const totalRow = ws.addRow(['TOTAL', items.reduce((s, i) => s + i.quantity, 0)])
    totalRow.font = { bold: true }

    const buffer = await wb.xlsx.writeBuffer()
    return new NextResponse(buffer as ArrayBuffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="estoque-${stamp}.xlsx"`,
      },
    })
  }

  // ── PDF ──
  const pdf = await PDFDocument.create()
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold)

  const pageW = 595.28 // A4
  const pageH = 841.89
  const margin = 40
  const violet = rgb(0.486, 0.227, 0.929)
  const gray = rgb(0.35, 0.35, 0.35)
  const lightGray = rgb(0.93, 0.93, 0.95)

  // Colunas: nome | qtd | unidade | lote | validade
  const cols = [
    { label: 'Medicação', x: margin, w: 250 },
    { label: 'Qtd', x: margin + 255, w: 45 },
    { label: 'Unidade', x: margin + 305, w: 70 },
    { label: 'Lote', x: margin + 380, w: 75 },
    { label: 'Validade', x: margin + 460, w: 60 },
  ]

  let page = pdf.addPage([pageW, pageH])
  let y = pageH - margin

  const drawHeader = () => {
    page.drawText('Relatório de Estoque — Instituto Torres', { x: margin, y, size: 15, font: fontBold, color: violet })
    y -= 18
    page.drawText(`Gerado em ${fmtDateTime(now)} · ${items.length} medicações`, { x: margin, y, size: 9, font, color: gray })
    y -= 22
    // Cabeçalho da tabela
    page.drawRectangle({ x: margin - 4, y: y - 4, width: pageW - 2 * margin + 8, height: 18, color: lightGray })
    for (const c of cols) {
      page.drawText(c.label, { x: c.x, y, size: 9, font: fontBold, color: rgb(0.2, 0.2, 0.2) })
    }
    y -= 20
  }

  const truncate = (text: string, maxWidth: number, size: number) => {
    let t = text
    while (t.length > 3 && font.widthOfTextAtSize(t, size) > maxWidth) {
      t = t.slice(0, -1)
    }
    return t === text ? t : t.slice(0, -1) + '…'
  }

  drawHeader()

  for (const [idx, i] of items.entries()) {
    if (y < margin + 30) {
      page = pdf.addPage([pageW, pageH])
      y = pageH - margin
      drawHeader()
    }
    if (idx % 2 === 1) {
      page.drawRectangle({ x: margin - 4, y: y - 4, width: pageW - 2 * margin + 8, height: 16, color: rgb(0.975, 0.975, 0.98) })
    }
    const size = 9
    page.drawText(truncate(i.name, cols[0].w, size), { x: cols[0].x, y, size, font, color: rgb(0.1, 0.1, 0.1) })
    page.drawText(String(i.quantity), { x: cols[1].x, y, size, font: fontBold, color: rgb(0.1, 0.1, 0.1) })
    page.drawText(truncate(i.unit ?? '', cols[2].w, size), { x: cols[2].x, y, size, font, color: gray })
    page.drawText(truncate(i.lot ?? '—', cols[3].w, size), { x: cols[3].x, y, size, font, color: gray })
    page.drawText(truncate(i.expiry_date ?? '—', cols[4].w, size), { x: cols[4].x, y, size, font, color: gray })
    y -= 16
  }

  // Total
  y -= 6
  page.drawText(`Total em estoque: ${items.reduce((s, i) => s + i.quantity, 0)} unidades`, {
    x: margin, y, size: 10, font: fontBold, color: violet,
  })

  const bytes = await pdf.save()
  return new NextResponse(Buffer.from(bytes), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="estoque-${stamp}.pdf"`,
    },
  })
}
