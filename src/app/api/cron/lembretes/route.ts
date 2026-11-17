import { NextRequest, NextResponse } from 'next/server'
import sql, { initSchema } from '@/lib/db'
import { agendamentosDoPeriodo } from '@/lib/agenda-db'
import { avisoLembreteVespera } from '@/lib/avisos-do-portal'
import { avisarPaciente } from '@/lib/push-envio'
import { quemRecebeLembrete, type AgendamentoParaLembrete } from '@/lib/lembretes'
import { dataBrasilia, somarDiasAoDia } from '@/lib/datas'
import { logSystemError } from '@/lib/system-errors'

export const dynamic = 'force-dynamic'

// O disparo do lembrete da véspera. Chamada por um agendador, uma vez por dia,
// de manhã (ver docs/superpowers/specs/2026-11-16-avisos-do-portal.md).
//
// PORTÃO: `CRON_SECRET`, comparado com o cabeçalho `x-cron-secret`. Sem a
// variável no ambiente a rota recusa tudo — falha FECHADA, de propósito: uma
// rota de disparo aberta deixaria qualquer pessoa na internet mandar avisos
// para os pacientes da clínica, e o estrago seria com o nome da clínica.
//
// O segredo vai no CABEÇALHO, nunca na URL: URL aparece em log de servidor, em
// histórico e em referer.

/**
 * Comparação em tempo constante, para o segredo não vazar pelo relógio.
 *
 * Os dois lados são APARADOS antes de comparar. Não é frouxidão: espaço e
 * quebra de linha nunca fazem parte de um segredo, e colar um valor de um
 * painel traz esse lixo invisível junto o tempo todo. Foi o que derrubou as
 * duas primeiras tentativas em produção — os valores "pareciam" iguais na
 * tela e não eram, e ninguém descobre isso olhando. O que muda é só a borda:
 * um caractere a mais no meio continua recusado.
 */
function segredoConfere(enviado: string | null, esperado: string): boolean {
  const a = enviado?.trim()
  const b = esperado.trim()
  if (!a || a.length !== b.length) return false
  let diferenca = 0
  for (let i = 0; i < a.length; i++) {
    diferenca |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return diferenca === 0
}

export async function POST(req: NextRequest) {
  const esperado = process.env.CRON_SECRET
  if (!esperado) {
    return NextResponse.json({ error: 'Disparo não configurado.' }, { status: 503 })
  }
  const recebido = req.headers.get('x-cron-secret')
  if (!segredoConfere(recebido, esperado)) {
    // O TAMANHO dos dois lados, nunca o conteúdo. Sem isto, "401" é tudo o
    // que se sabe e a diferença é invisível; com o tamanho, um caractere a
    // mais aparece na hora. A tela de Erros é lida pela clínica, então o
    // segredo em si não pode encostar nela.
    await logSystemError(
      'lembretes.disparo.nao-autorizado',
      'Chamada recusada: o segredo recebido não confere com o do ambiente.',
      {
        tamanhoRecebido: recebido?.trim().length ?? 0,
        tamanhoEsperado: esperado.trim().length,
      },
    )
    return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 })
  }

  await initSchema()
  const hoje = dataBrasilia(new Date())
  const amanha = somarDiasAoDia(hoje, 1)
  if (!amanha) return NextResponse.json({ error: 'Data inválida.' }, { status: 500 })

  const doDia = await agendamentosDoPeriodo(amanha, amanha)
  const jaEnviados = await sql<{ agendamento_id: number }[]>`
    SELECT agendamento_id FROM lembretes_enviados
    WHERE agendamento_id = ANY(${doDia.map((a) => a.id)}::int[])`

  const escolhidos = quemRecebeLembrete(
    doDia as unknown as AgendamentoParaLembrete[],
    new Set(jaEnviados.map((l) => l.agendamento_id)),
  )

  let enviados = 0
  let semAviso = 0
  for (const a of escolhidos) {
    // Marca ANTES de enviar. Se o processo morrer no meio, o pior caso é um
    // paciente não receber — e não a clínica mandar o mesmo aviso de novo na
    // próxima tentativa. Entre os dois erros, o silêncio é o menos pior:
    // aviso repetido é o que faz as pessoas desligarem.
    const [marcado] = await sql<{ agendamento_id: number }[]>`
      INSERT INTO lembretes_enviados (agendamento_id) VALUES (${a.id})
      ON CONFLICT (agendamento_id) DO NOTHING
      RETURNING agendamento_id`
    if (!marcado) continue // outra execução pegou este primeiro

    const r = await avisarPaciente(a.patient_id, avisoLembreteVespera(a.dia, a.hora))
    if (r.enviados > 0) enviados++
    else semAviso++
  }

  // Sem nome de paciente: a tela de Erros é lida pela clínica e declara não
  // guardar dado de paciente.
  if (escolhidos.length > 0 && enviados === 0) {
    await logSystemError(
      'lembretes.vespera.nenhum-enviado',
      `${escolhidos.length} agendamento(s) para ${amanha} e nenhum aviso saiu`,
      { dia: amanha, escolhidos: escolhidos.length },
    )
  }

  return NextResponse.json({ dia: amanha, candidatos: escolhidos.length, enviados, semAviso })
}
