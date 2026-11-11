// Regras do aviso (push) do portal do paciente. PURO: sem banco, sem rede.
//
// Roda dos dois lados — `chaveParaBytes` no navegador, o resto no servidor —
// então aqui não entra nada de `Buffer` nem de `postgres`.

/** Para onde o toque na notificação leva, quando ninguém disser outra coisa. */
const TELA_PADRAO = '/portal/paciente'

/**
 * A chave VAPID viaja como base64url, mas `applicationServerKey` só aceita
 * bytes crus. A troca de `-_` por `+/` não é enfeite: sem ela o decodificador
 * devolve bytes errados **em silêncio**, e a inscrição falha sem mensagem.
 */
export function chaveParaBytes(base64url: string): Uint8Array {
  const resto = base64url.length % 4
  const base64 = (base64url + '='.repeat(resto ? 4 - resto : 0))
    .replace(/-/g, '+')
    .replace(/_/g, '/')
  const cru = atob(base64)
  const bytes = new Uint8Array(cru.length)
  for (let i = 0; i < cru.length; i++) bytes[i] = cru.charCodeAt(i)
  return bytes
}

/**
 * O aparelho desistiu de vez?
 *
 * Quem apaga o ícone da tela de início não avisa ninguém: o endereço continua
 * gravado e só se revela morto quando o envio falha. 410 e 404 são o serviço
 * da Apple ou do Google dizendo "esse endereço não existe mais" — aí a linha
 * sai do banco. Qualquer outro erro é passageiro, e apagar por causa dele
 * seria perder o paciente por um soluço de servidor.
 */
export function assinaturaMorreu(status: number): boolean {
  return status === 410 || status === 404
}

export interface Aviso {
  titulo: string
  texto: string
  url?: string
}

/**
 * O que viaja dentro do push.
 *
 * ATENÇÃO ao que se escreve em `texto`: a notificação aparece na **tela
 * bloqueada**, visível para quem estiver perto do celular do paciente. Nada de
 * nome de exame, de medicação ou de procedimento — só o convite para abrir.
 */
export function montarAviso({ titulo, texto, url = TELA_PADRAO }: Aviso): string {
  return JSON.stringify({ titulo, texto, url })
}
