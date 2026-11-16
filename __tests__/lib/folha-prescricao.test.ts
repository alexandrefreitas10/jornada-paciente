import fs from 'fs'
import path from 'path'
import { TIPO_FOLHA_PRESCRICAO } from '@/lib/folha-prescricao'

/**
 * "Tem folha na aba Prescrições" é perguntado em DOIS lugares que precisam
 * responder a mesma coisa:
 *
 *  - `temPrescricao` (agenda-db.ts) é o PORTÃO: decide se a aba Agenda
 *    aparece no portal do paciente.
 *  - `listPatients` (patients.ts) é a VITRINE: decide quem aparece marcado na
 *    lista da clínica, e é por ela que a equipe sabe de quem ainda falta subir
 *    a folha.
 *
 * Se as duas divergirem, a tela da equipe passa a mentir — e mente em silêncio,
 * porque nada no sistema compara as duas. Nenhum teste de comportamento pega
 * isso: cada lado, sozinho, continua certo.
 *
 * Existe uma armadilha concreta aqui, não hipotética: o sistema tem DOIS tipos
 * de arquivo parecidos. 'prescricao' é a aba Prescrições; 'prescription' é o
 * anexo da aba Evolução (ver EvolutionTab.tsx). Só o primeiro abre a agenda.
 * Quem for "arrumar" isso um dia vai encontrar este teste antes do estrago.
 */

const LIB = path.join(__dirname, '..', '..', 'src', 'lib')
const ARQUIVOS = ['patients.ts', 'agenda-db.ts'] as const

/** Os trechos de SQL que consultam `patient_files`, um por consulta. */
function blocosDePatientFiles(fonte: string): string[] {
  return fonte.match(/FROM patient_files[\s\S]*?\)/g) ?? []
}

describe('a marca na lista e o portão da agenda usam o MESMO critério', () => {
  it('o tipo da folha é o da aba Prescrições, não o anexo da Evolução', () => {
    expect(TIPO_FOLHA_PRESCRICAO).toBe('prescricao')
    // Dito ao contrário de propósito: é este o engano que custa caro.
    expect(TIPO_FOLHA_PRESCRICAO).not.toBe('prescription')
  })

  it.each(ARQUIVOS)('%s consulta patient_files pela constante, não por texto solto', (arquivo) => {
    const fonte = fs.readFileSync(path.join(LIB, arquivo), 'utf8')
    const blocos = blocosDePatientFiles(fonte)
    expect(blocos.length).toBeGreaterThan(0)

    for (const bloco of blocos) {
      // Compara pela constante compartilhada: assim os dois lados não têm como
      // divergir sem que alguém mude o valor nos dois ao mesmo tempo.
      expect(bloco).toContain('file_type = ${TIPO_FOLHA_PRESCRICAO}')
      // Nenhum tipo escrito à mão sobrou no SQL.
      expect(bloco).not.toMatch(/'prescri\w*'/)
      // Folha apagada não vale em lugar nenhum: sem isto, apagar a prescrição
      // tiraria a aba do paciente e a lista continuaria dizendo que ele tem.
      expect(bloco).toMatch(/deleted_at IS NULL/)
    }
  })

  it.each(ARQUIVOS)('%s importa a constante de um lugar só', (arquivo) => {
    const fonte = fs.readFileSync(path.join(LIB, arquivo), 'utf8')
    expect(fonte).toMatch(/import\s*\{[^}]*TIPO_FOLHA_PRESCRICAO[^}]*\}\s*from\s*'\.\/folha-prescricao'/)
  })
})
