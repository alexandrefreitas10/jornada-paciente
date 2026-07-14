import Anthropic from '@anthropic-ai/sdk'

const EXAM_PROMPT = `Este é um exame médico laboratorial. Transcreva TODOS os resultados seguindo RIGOROSAMENTE estas regras:

1. ORDEM DO DOCUMENTO: siga exatamente a ordem em que os exames aparecem no arquivo, página por página. NÃO reorganize por tema, NÃO agrupe exames parecidos, NÃO mude a sequência.

2. UM BLOCO POR EXAME: cada exame/painel (ex: Hemograma, Colesterol Total, Glicose, EAS/Urina, TSH...) vira UMA seção com o nome do exame como título em MAIÚSCULAS, exatamente como está no documento. TODOS os resultados daquele exame ficam juntos dentro da seção dele — NUNCA divida os resultados de um mesmo exame em partes diferentes do resumo.

3. NOMES REPETIDOS: quando o mesmo analito aparece em exames diferentes (ex: Hemácias no Hemograma E Hemácias no EAS/urina), cada um fica APENAS na seção do seu exame. Nunca misture ou combine esses valores.

4. FORMATO: apenas o nome do analito e o resultado, um por linha, exatamente assim:
   Nome do analito | resultado

   Exemplo:
   Hemácias | 5,01 milhões/uL
   Hemoglobina | 14,5 g/dL

5. PROIBIDO incluir: valores de referência, nome do paciente, idade, médico, convênio, laboratório, data da coleta, introdução, conclusão, interpretação ou qualquer comentário. APENAS o título de cada exame e as linhas "nome | resultado".

6. Inclua TODOS os resultados, sem omitir nenhum.

Responda em português.`

function getClient() {
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
}

export async function generateExamSummary(buffer: Buffer, mimeType: string, fileName: string): Promise<string> {
  const base64 = buffer.toString('base64')
  const isPdf = mimeType === 'application/pdf' || fileName.toLowerCase().endsWith('.pdf')

  const content: Anthropic.MessageParam['content'] = isPdf
    ? [
        {
          type: 'document',
          source: { type: 'base64', media_type: 'application/pdf', data: base64 },
        } as Anthropic.DocumentBlockParam,
        { type: 'text', text: EXAM_PROMPT },
      ]
    : [
        {
          type: 'image',
          source: { type: 'base64', media_type: mimeType as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp', data: base64 },
        },
        { type: 'text', text: EXAM_PROMPT },
      ]

  // Streaming: exames longos (50+ páginas) demoram mais que o timeout de
  // requisições não-streaming — o stream mantém a conexão viva até o fim
  const message = await getClient().messages
    .stream({
      model: 'claude-sonnet-4-6',
      max_tokens: 16384,
      messages: [{ role: 'user', content }],
    })
    .finalMessage()

  const textBlock = message.content.find(b => b.type === 'text') as { type: 'text'; text: string } | undefined
  return textBlock?.text ?? ''
}
