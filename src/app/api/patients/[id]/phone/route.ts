import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { logAudit } from '@/lib/audit'
import { getPatient, updatePatientPhone } from '@/lib/patients'
import { formatarTelefone, validarTelefone } from '@/lib/telefone'

export const dynamic = 'force-dynamic'

// Altera SÓ o telefone. Existe separada da rota de perfil do portal porque
// aquela regrava nascimento e e-mail juntos e apagaria os dois.
// O acesso é o mesmo das rotas irmãs de paciente: quem controla é o proxy.ts,
// que libera a equipe e limita a sessão do portal aos próprios GETs e a quatro
// POSTs — um PATCH vindo do portal não passa.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await req.json().catch(() => ({}))

  const tel = validarTelefone(typeof body?.phone === 'string' ? body.phone : '')
  if (!tel.ok) return NextResponse.json({ error: tel.motivo }, { status: 400 })

  // Lê o telefone de antes para a trilha mostrar o que foi sobrescrito.
  const anterior = (await getPatient(Number(id)))?.phone ?? ''
  await updatePatientPhone(Number(id), tel.digitos)

  const session = await auth()
  await logAudit({
    userName: session?.user?.name ?? 'desconhecido',
    action: 'telefone_atualizado',
    entityType: 'patient',
    entityId: Number(id),
    // Sem patientId a linha cai com patient_id NULL e não aparece na aba de
    // auditoria da ficha — que é justo onde a equipe vai procurar.
    patientId: Number(id),
    details: `${anterior ? formatarTelefone(anterior) : 'sem telefone'} → ${formatarTelefone(tel.digitos)}`,
  })
  return NextResponse.json({ ok: true, phone: tel.digitos })
}
