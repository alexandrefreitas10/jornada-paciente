import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import sql from '@/lib/db'
import QRCode from 'qrcode'
import {
  Document, Packer, Paragraph, Table, TableRow, TableCell,
  TextRun, ImageRun, AlignmentType, WidthType, BorderStyle, ShadingType,
  VerticalAlign
} from 'docx'

export const dynamic = 'force-dynamic'

interface StockItem {
  id: number; name: string; lot: string | null; expiry_date: string | null; unit: string
}

const noBorder = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }
const borders = { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder }

async function makeQrBuffer(url: string): Promise<Buffer> {
  return QRCode.toBuffer(url, { width: 300, margin: 1 }) as Promise<Buffer>
}

export async function POST(req: NextRequest) {
  try {
  const session = await auth()
  const u = session?.user as { is_admin?: boolean; can_estoque?: boolean } | undefined
  if (!u?.is_admin && !u?.can_estoque) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })

  const { itemIds, baseUrl } = await req.json() as { itemIds: number[]; baseUrl: string }
  if (!itemIds?.length) return NextResponse.json({ error: 'Nenhum item selecionado' }, { status: 400 })

  const items = await sql<StockItem[]>`
    SELECT
      i.id, i.name, i.unit,
      (SELECT lot FROM stock_movements WHERE item_id = i.id AND type = 'entrada' ORDER BY created_at DESC LIMIT 1) AS lot,
      (SELECT expiry_date FROM stock_movements WHERE item_id = i.id AND type = 'entrada' ORDER BY created_at DESC LIMIT 1) AS expiry_date
    FROM stock_items i
    WHERE i.id = ANY(${itemIds}::int[])
    ORDER BY i.name
  `

  // Generate QR buffers in parallel
  const qrBuffers = await Promise.all(
    items.map(i => makeQrBuffer(`${baseUrl}/estoque/saida?item=${i.id}`))
  )

  const COLS = 4
  const COL_W = 2350 // DXA (each of 4 cols), total ~9400 for A4 with narrow margins
  const QR_PX = 150  // image pixels for docx

  // Build rows (4 items per row)
  const rows: TableRow[] = []
  for (let r = 0; r < items.length; r += COLS) {
    const rowItems = items.slice(r, r + COLS)
    const qrRow = rowItems.map((item, ci) => {
      const buf = qrBuffers[r + ci]
      const meta = [item.lot ? `Lote: ${item.lot}` : null, item.expiry_date ? `Val: ${item.expiry_date}` : null]
        .filter(Boolean).join('   ')
      return new TableCell({
        borders,
        width: { size: COL_W, type: WidthType.DXA },
        verticalAlign: VerticalAlign.TOP,
        margins: { top: 80, bottom: 160, left: 80, right: 80 },
        children: [
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 40 },
            children: [new TextRun({ text: item.name, bold: true, size: 18, font: 'Arial' })]
          }),
          ...(meta ? [new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 60 },
            children: [new TextRun({ text: meta, size: 14, color: '666666', font: 'Arial' })]
          })] : []),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [new ImageRun({
              type: 'png',
              data: buf,
              transformation: { width: QR_PX, height: QR_PX },
              altText: { title: item.name, description: item.name, name: item.name }
            })]
          }),
        ]
      })
    })
    // Pad to COLS if last row is short
    while (qrRow.length < COLS) {
      qrRow.push(new TableCell({
        borders,
        width: { size: COL_W, type: WidthType.DXA },
        children: [new Paragraph({ children: [] })]
      }))
    }
    rows.push(new TableRow({ children: qrRow }))
  }

  const doc = new Document({
    sections: [{
      properties: {
        page: {
          size: { width: 11906, height: 16838 },
          margin: { top: 720, right: 720, bottom: 720, left: 720 }
        }
      },
      children: [
        new Table({
          width: { size: 9400, type: WidthType.DXA },
          columnWidths: Array(COLS).fill(COL_W),
          rows
        })
      ]
    }]
  })

  const buffer = await Packer.toBuffer(doc)
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'Content-Disposition': 'attachment; filename="qrcodes-estoque.docx"'
    }
  })
  } catch (e) {
    console.error('qr-docx error:', e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
