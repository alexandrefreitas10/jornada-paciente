// Envio do aviso (push). Só servidor: usa a chave privada VAPID.
// Importes NOMEADOS: `web-push` é CommonJS e não tem `export default`. Com
// `import webpush from 'web-push'` o TypeScript aceita (por esModuleInterop),
// mas o Turbopack recusa na hora de empacotar — e aí o erro só aparece no
// build do Render, nunca no `tsc` nem no `jest`.
import { sendNotification, setVapidDetails } from 'web-push'
import { apagarAssinatura, assinaturasDoPaciente } from './push-db'
import { assinaturaMorreu, enderecoDeServicoConhecido, montarAviso, type Aviso } from './push'

/**
 * As chaves ficam só no ambiente (painel do Render), nunca no repositório.
 * Sem elas o envio não acontece — e isso é dito em voz alta, porque um push
 * que falha caladamente é indistinguível de um push que ninguém leu.
 */
function configurar(): boolean {
  const publica = process.env.VAPID_PUBLIC_KEY
  const privada = process.env.VAPID_PRIVATE_KEY
  if (!publica || !privada) return false
  setVapidDetails(process.env.VAPID_SUBJECT ?? 'mailto:contato@institutotorres.com.br', publica, privada)
  return true
}

export interface ResultadoEnvio {
  enviados: number
  removidos: number
  falhas: number
  motivo?: string
}

/**
 * Manda o aviso para todos os aparelhos do paciente.
 *
 * Nunca lança: um aviso que não saiu não pode derrubar o upload do arquivo que
 * o disparou. O que aconteceu volta no resultado, para quem chamou decidir.
 */
export async function avisarPaciente(patientId: number, aviso: Aviso): Promise<ResultadoEnvio> {
  if (!configurar()) return { enviados: 0, removidos: 0, falhas: 0, motivo: 'chaves VAPID ausentes no ambiente' }

  const assinaturas = await assinaturasDoPaciente(patientId)
  if (assinaturas.length === 0) {
    return { enviados: 0, removidos: 0, falhas: 0, motivo: 'paciente não aceitou receber avisos' }
  }

  const corpo = montarAviso(aviso)
  let enviados = 0, removidos = 0, falhas = 0

  for (const a of assinaturas) {
    // Segunda conferida, de proposito: esta linha pode ter sido gravada antes
    // de a trava existir. Endereco estranho sai do banco em vez de ser batido.
    if (!enderecoDeServicoConhecido(a.endpoint)) {
      await apagarAssinatura(a.endpoint)
      removidos++
      continue
    }
    try {
      await sendNotification(
        { endpoint: a.endpoint, keys: { p256dh: a.p256dh, auth: a.auth } },
        corpo,
      )
      enviados++
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode ?? 0
      if (assinaturaMorreu(status)) {
        await apagarAssinatura(a.endpoint)
        removidos++
      } else {
        falhas++
      }
    }
  }

  return { enviados, removidos, falhas }
}
