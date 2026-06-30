import { NextRequest } from 'next/server'
import { auth } from '@/auth'
import { softDeletePatientFile, getFileById, updateFileSummary } from '@/lib/patient-files'
import { logAudit } from '@/lib/audit'
import { downloadFile } from '@/lib/s3'
import Anthropic from '@anthropic-ai/sdk'

async function regenerateSummary(s3Key: string, originalName: string): Promise<string> {
  const buffer = await downloadFile(s3Key)
  const isPdf = originalName.toLowerCase().endsWith('.pdf')
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  const base64 = buffer.toString('base64')
  const content: Anthropic.MessageParam['content'] = isPdf
    ? [
        { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } } as Anthropic.DocumentBlockParam,
        { type: 'text', text: 'Este é um exame médico. Extraia e liste de forma clara e organizada TODOS os resultados encontrados, sem omitir nenhum, com os valores e as referências normais quando disponíveis. Seja objetivo e use linguagem simples. Responda em português.' },
      ]
    : [
        { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: base64 } },
        { type: 'text', text: 'Esta é a imagem de um exame médico. Extraia e liste de forma clara e organizada TODOS os resultados encontrados, sem omitir nenhum. Responda em português.' },
      ]
  const msg = await client.messages.create({ model: 'claude-sonnet-4-6', max_tokens: 4096, messages: [{ role: 'user', content }] })
  return (msg.content[0] as { type: string; text: string }).text
}

export async function PATCH(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; fid: string }> }
) {
  const { fid } = await params
  const file = await getFileById(Number(fid))
  if (!file) return Response.json({ error: 'Arquivo não encontrado' }, { status: 404 })
  try {
    const summary = await regenerateSummary(file.s3_key, file.original_name)
    await updateFileSummary(Number(fid), summary)
    return Response.json({ summary })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return Response.json({ error: msg }, { status: 500 })
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; fid: string }> }
) {
  const { id, fid } = await params
  const session = await auth()
  const userName = session?.user?.name ?? 'Desconhecido'
  // Soft-delete: mantém o arquivo no S3 para que possa ser restaurado
  const fileRecord = await softDeletePatientFile(Number(fid))
  await logAudit({ userName, action: 'DELETE', entityType: 'file', entityId: fid, patientId: Number(id), details: fileRecord?.original_name, deletedData: fileRecord ?? undefined })
  return new Response(null, { status: 204 })
}
