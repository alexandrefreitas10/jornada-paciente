// Comparação de nome ignorando acento e caixa.
//
// POR QUE A FAIXA É MONTADA POR NÚMERO, e não escrita dentro da expressão:
// os acentos combinantes que o NFD separa da letra são caracteres INVISÍVEIS.
// Escritos direto no código, não aparecem em editor nenhum, não aparecem no
// diff, e um reencode silencioso do arquivo quebraria a busca por nome
// acentuado sem deixar rastro — ninguém revisando veria o que mudou.
//
// Escrever a faixa como escape unicode também não resolve: toda ferramenta no
// caminho entre o texto e o arquivo converte o escape de volta no caractere
// invisível, e o problema volta sem avisar. Aconteceu três vezes seguidas aqui,
// inclusive dentro deste comentário.
//
// Montada a partir dos dois números abaixo, a faixa é legível, sobrevive a
// qualquer reencode, e o teste ao lado prova que ela ainda pega as duas pontas
// e não come o que está fora.

/** Primeiro e último ponto de código dos acentos combinantes (U+0300 a U+036F). */
const PRIMEIRO_DIACRITICO = 0x300
const ULTIMO_DIACRITICO = 0x36f

const DIACRITICOS = new RegExp(
  '[' + String.fromCharCode(PRIMEIRO_DIACRITICO) + '-' + String.fromCharCode(ULTIMO_DIACRITICO) + ']',
  'g',
)

/** "Lúcia", "LUCIA" e "lucia" viram a mesma coisa, para a busca de paciente. */
export function semAcento(texto: string): string {
  return texto.normalize('NFD').replace(DIACRITICOS, '').toLowerCase()
}
