import fs from 'fs'
import path from 'path'

/**
 * Quais rotas o guardião (`src/proxy.ts`) deixa passar sem sessão.
 *
 * POR QUE ESTE TESTE EXISTE: o disparo do lembrete da véspera falhou três
 * vezes seguidas com 401, e a causa não era o segredo — era o guardião
 * recusando a chamada ANTES de a rota rodar. O 401 do guardião e o 401 da
 * rota são quase idênticos ("Não autorizado" contra "Não autorizado."), e a
 * diferença de um ponto final custou duas trocas de segredo em produção.
 *
 * Rota que se autentica sozinha precisa estar nesta lista, e uma lista que
 * ninguém confere é uma lista que volta a esquecer alguém.
 */

const PROXY = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'proxy.ts'), 'utf8')

/** O trecho que decide o que é público, sem os comentários. */
const BLOCO_PUBLICO = PROXY
  .slice(PROXY.indexOf('const isPublic'), PROXY.indexOf('if (isPublic)'))
  .replace(/\/\/.*$/gm, '')

describe('rotas que se autenticam sozinhas são públicas para o guardião', () => {
  it('/api/portal — a sessão do paciente é conferida dentro da rota', () => {
    expect(BLOCO_PUBLICO).toContain("'/api/portal'")
  })

  it('/api/cron — o segredo é conferido dentro da rota', () => {
    // Sem esta linha o agendador leva 401 do guardião e nenhum lembrete sai,
    // por mais certo que esteja o CRON_SECRET nos dois lados.
    expect(BLOCO_PUBLICO).toContain("'/api/cron'")
  })

  it('nenhuma rota de equipe virou pública por engano', () => {
    // A lista é curta de propósito. Se alguém acrescentar /api/agenda,
    // /api/estoque ou /api/patients aqui, a agenda e o prontuário ficam
    // abertos para quem não fez login.
    for (const perigosa of ['/api/agenda', '/api/estoque', '/api/patients', '/api/reports', '/api/admin']) {
      expect(BLOCO_PUBLICO).not.toContain(`'${perigosa}'`)
    }
  })
})
