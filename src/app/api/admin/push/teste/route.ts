import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { isAdminSession } from '@/lib/authz'
import { avisarPaciente } from '@/lib/push-envio'
import { pacientesComAviso } from '@/lib/push-db'

/** Quem já aceitou receber aviso, para a tela de teste escolher. */
export async function GET() {
  const session = await auth()
  if (!session?.user?.name) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  if (!(await isAdminSession())) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })

  return NextResponse.json({ pacientes: await pacientesComAviso() })
}

/**
 * Dispara um aviso de teste. Existe para ver o formato na tela do celular
 * antes de decidir quais eventos do sistema vão gerar aviso de verdade.
 */
export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user?.name) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  if (!(await isAdminSession())) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })

  try {
    const { patientId, titulo, texto } = await request.json()
    if (!Number.isInteger(patientId)) {
      return NextResponse.json({ error: 'Paciente inválido' }, { status: 400 })
    }
    const resultado = await avisarPaciente(patientId, {
      titulo: typeof titulo === 'string' && titulo.trim() ? titulo.trim() : 'Instituto Torres',
      texto: typeof texto === 'string' && texto.trim() ? texto.trim() : 'Teste de notificação',
    })
    return NextResponse.json(resultado)
  } catch {
    return NextResponse.json({ error: 'Erro ao enviar' }, { status: 500 })
  }
}
