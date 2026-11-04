import { tipoDeImagemDosBytes } from './tipos-de-imagem'

// Como um arquivo de paciente pode ser servido PELA PRÓPRIA ORIGEM do sistema.
//
// O FURO QUE ISTO FECHA: a rota de download, com `?proxy=1`, devolvia o
// Content-Type gravado no S3, inline, na nossa origem. O upload gravava
// `file.type` do cliente sem filtro, então `image/svg+xml` entrava. SVG carrega
// `<script>`: um login da equipe subia um SVG e o código rodava no navegador de
// outro usuário, na nossa origem, com a sessão dele. O alvo valioso é o login
// do dono.
//
// POR QUE DECIDIR PELOS BYTES, e não pelo tipo gravado no S3: já existe arquivo
// gravado com tipo arbitrário, inclusive foto cujo `file.type` veio vazio do
// celular e foi gravada como `application/octet-stream`. Decidir pelo tipo
// gravado serviria essas fotos como anexo e quebraria a miniatura e o canvas do
// antes-e-depois. Os bytes são a única fonte que não depende do que o cliente
// disse nem do que foi gravado no passado.
//
// POR QUE PDF PODE SER INLINE: com `nosniff` e o tipo exato, um arquivo que não
// seja PDF de verdade nunca é tratado como HTML ou SVG. O JavaScript que um PDF
// pode conter roda no leitor de PDF do navegador, sem acesso ao DOM nem à
// sessão da nossa origem. Sem isso, o botão "Abrir" de exame, dieta e
// prescrição passaria a baixar o arquivo em vez de mostrá-lo.

/** Quantos bytes do começo bastam para reconhecer as assinaturas abaixo. O
 *  WebP é a mais longa: "RIFF" nos bytes 0-3 e "WEBP" nos bytes 8-11. */
export const PRIMEIROS_BYTES = 12

/** Limite do nome no cabeçalho. Servidor e proxy têm teto para o tamanho de um
 *  cabeçalho, e um nome de 5 mil letras derrubaria a resposta inteira. */
const MAX_NOME = 150

/** `%PDF-` — os cinco primeiros bytes de todo PDF. */
const ASSINATURA_PDF = [0x25, 0x50, 0x44, 0x46, 0x2d]

/**
 * Lê só o começo do stream e devolve um corpo que ainda tem o arquivo inteiro.
 *
 * Existe porque a decisão precisa dos bytes, mas a resposta precisa continuar
 * sendo stream: baixar o arquivo todo para a memória antes de decidir faria um
 * exame de 20 MB virar 20 MB de memória no servidor a cada miniatura aberta.
 *
 * Acumula até ter `PRIMEIROS_BYTES` em vez de olhar só o primeiro pedaço: um
 * stream pode entregar poucos bytes por vez, e aí um PNG legítimo seria
 * classificado como desconhecido e serviria como anexo — a miniatura sumiria.
 */
export async function espiarInicio(
  stream: ReadableStream<Uint8Array>
): Promise<{ primeirosBytes: Uint8Array; corpo: ReadableStream<Uint8Array> }> {
  const leitor = stream.getReader()
  const espiados: Uint8Array[] = []
  let total = 0

  while (total < PRIMEIROS_BYTES) {
    const { done, value } = await leitor.read()
    if (done) break
    if (value.length === 0) continue
    espiados.push(value)
    total += value.length
  }

  const inicio = new Uint8Array(total)
  let i = 0
  for (const p of espiados) {
    inicio.set(p, i)
    i += p.length
  }

  // O corpo devolve os pedaços já lidos e só então volta a puxar do original —
  // sem isso o navegador receberia o arquivo sem o próprio cabeçalho dele.
  const corpo = new ReadableStream<Uint8Array>({
    async pull(controlador) {
      if (espiados.length > 0) {
        controlador.enqueue(espiados.shift()!)
        return
      }
      const { done, value } = await leitor.read()
      if (done) controlador.close()
      else controlador.enqueue(value)
    },
    cancel(motivo) {
      // Navegador que fecha a aba no meio do download: solta a conexão do S3
      // em vez de deixá-la aberta até estourar o limite do pool.
      return leitor.cancel(motivo)
    },
  })

  return { primeirosBytes: inicio.subarray(0, PRIMEIROS_BYTES), corpo }
}

export interface CabecalhosDeArquivo {
  'Content-Type': string
  'Content-Disposition': string
  'X-Content-Type-Options': string
}

function ehPdf(bytes: Uint8Array): boolean {
  return bytes.length >= ASSINATURA_PDF.length && ASSINATURA_PDF.every((b, i) => bytes[i] === b)
}

/**
  * O tipo que os BYTES dizem ser, entre os que podem ser servidos INLINE.
 * `null` para tudo o mais. Usado nos dois lados: o upload grava o que isto
 * devolve (ou `application/octet-stream`), e a rota que serve decide por ele se
 * o arquivo vai inline ou como anexo.
 *
 * Lista fechada de propósito: o que não está aqui vai como anexo. Acrescentar
 * um formato é decidir que o navegador pode RENDERIZÁ-LO na nossa origem —
 * pense duas vezes antes, e nunca acrescente SVG.
 */
export function tipoDeConteudo(bytes: Uint8Array): string | null {
  return tipoDeImagemDosBytes(bytes) ?? (ehPdf(bytes) ? 'application/pdf' : null)
}

/**
 * O nome para `filename=`, em ASCII e sem nada que quebre o cabeçalho.
 *
 * Quebra de linha num cabeçalho é injeção de cabeçalho, e aspas encerram o
 * valor mais cedo, fazendo o resto do nome virar parâmetro. Em vez de escapar
 * caso a caso, só sobrevive o que é seguro: letra, número, ponto, hífen e
 * sublinhado. O nome de verdade, com acento, vai no `filename*`.
 */
function nomeAscii(nome: string): string {
  const limpo = nome
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '')
    .slice(0, MAX_NOME)
  return limpo || 'arquivo'
}

/**
 * Os cabeçalhos com que um arquivo de paciente pode ser devolvido.
 *
 * `primeirosBytes` é só o começo do arquivo (ver `PRIMEIROS_BYTES`) — não o
 * arquivo inteiro: um exame de 20 MB não precisa virar 20 MB de memória para
 * esta decisão ser tomada.
 */
export function cabecalhosDeArquivo(primeirosBytes: Uint8Array, nomeOriginal: string): CabecalhosDeArquivo {
  const inline = tipoDeConteudo(primeirosBytes)
  // Fora da lista, `application/octet-stream`: o navegador baixa em vez de
  // renderizar, e com `nosniff` ele não tenta adivinhar outro tipo pelo
  // conteúdo — que é o caminho pelo qual um SVG voltaria a executar.
  const contentType = inline ?? 'application/octet-stream'
  const nome = nomeOriginal.slice(0, MAX_NOME * 2)

  return {
    'Content-Type': contentType,
    'Content-Disposition':
      `${inline ? 'inline' : 'attachment'}; filename="${nomeAscii(nome)}"` +
      `; filename*=UTF-8''${encodeURIComponent(nome).replace(/['()*]/g, c => '%' + c.charCodeAt(0).toString(16))}`,
    'X-Content-Type-Options': 'nosniff',
  }
}
