// Quando um arquivo é grande demais para ser enviado. PURO: sem rede, sem DOM.
//
// POR QUE ISTO EXISTE: a rota de upload carrega o arquivo TRÊS vezes na
// memória antes de mandar o primeiro byte ao S3 — `req.formData()`, depois
// `file.arrayBuffer()`, depois `Buffer.from()`. Um arquivo grande estoura a
// memória da instância e o Render reinicia o processo. Em 12/11/2026 isso
// derrubou o sistema inteiro, com aviso da própria plataforma: "exceeded its
// memory limit, which triggered an automatic restart".
//
// Para quem estava enviando, o sintoma era mudo: o botão ficava "Enviando..."
// para sempre. O processo que responderia morreu, e com ele o processo que
// registraria o erro — por isso a tela de Erros não mostrava nada.
//
// Isto é REMENDO, não a cura. A cura é a rota parar de fazer três cópias e
// mandar o arquivo em fluxo para o S3. Enquanto isso não existe, barrar aqui
// evita que o arquivo sequer saia do aparelho.

/** Teto por arquivo. Foto de celular fica entre 2 e 6 MB, então sobra folga
 *  larga; três cópias de 15 MB ainda cabem com conforto na instância. */
export const LIMITE_FOTO_MB = 15

const BYTES_POR_MB = 1024 * 1024

/** Tamanho em MB como gente lê: "23,5", não "24609980 bytes". */
function emMB(bytes: number): string {
  return (bytes / BYTES_POR_MB).toFixed(1).replace('.', ',')
}

/**
 * Devolve o motivo da recusa, ou `null` quando o arquivo pode ser enviado.
 *
 * A mensagem diz o NOME porque a pessoa pode ter escolhido vários de uma vez e
 * precisa saber qual tirar, e diz o TAMANHO porque "grande demais" sem número
 * não ajuda ninguém a decidir o que fazer.
 */
export function recusaDeEnvio(arquivo: { name: string; size: number }): string | null {
  if (arquivo.size === 0) {
    return `"${arquivo.name}" está vazio (0 MB). Escolha o arquivo de novo.`
  }
  if (arquivo.size > LIMITE_FOTO_MB * BYTES_POR_MB) {
    return `"${arquivo.name}" tem ${emMB(arquivo.size)} MB e o limite é ${LIMITE_FOTO_MB} MB. ` +
      `Se for vídeo, ele não pode ser enviado aqui; se for foto, reduza antes de enviar.`
  }
  return null
}
