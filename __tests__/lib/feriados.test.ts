// __tests__/lib/feriados.test.ts
import { ehFeriadoNacional } from '@/lib/feriados'

describe('ehFeriadoNacional', () => {
  it('pega os fixos', () => {
    for (const d of ['2027-01-01','2027-04-21','2027-05-01','2027-09-07','2027-10-12','2027-11-02','2027-11-15','2027-12-25'])
      expect(ehFeriadoNacional(d)).toBe(true)
  })
  it('pega a Consciência Negra (nacional desde a Lei 14.759/2023)', () => {
    expect(ehFeriadoNacional('2027-11-20')).toBe(true)
  })
  it('pega os móveis, que mudam todo ano', () => {
    // Páscoa 2027 = 28/03. Carnaval = -47d, Sexta-feira Santa = -2d, Corpus Christi = +60d.
    expect(ehFeriadoNacional('2027-02-09')).toBe(true)  // Carnaval
    expect(ehFeriadoNacional('2027-03-26')).toBe(true)  // Sexta-feira Santa
    expect(ehFeriadoNacional('2027-05-27')).toBe(true)  // Corpus Christi
  })
  it('os móveis mudam de ano para ano — lista fixa falharia aqui', () => {
    expect(ehFeriadoNacional('2026-02-17')).toBe(true)  // Carnaval 2026
    expect(ehFeriadoNacional('2027-02-17')).toBe(false)
  })
  it('Páscoa 2025 (20/04): confere o termo de correção m em outro ano', () => {
    // Datas contadas à mão a partir da Páscoa, não tiradas do código.
    expect(ehFeriadoNacional('2025-03-04')).toBe(true)  // Carnaval = -47d
    expect(ehFeriadoNacional('2025-04-18')).toBe(true)  // Sexta-feira Santa = -2d
    expect(ehFeriadoNacional('2025-06-19')).toBe(true)  // Corpus Christi = +60d
  })
  it('Páscoa 2032 (28/03, ano bissexto): exercita o ramo que 2026 e 2027 não pegam', () => {
    expect(ehFeriadoNacional('2032-02-10')).toBe(true)  // Carnaval = -47d (passa por 29/02)
    expect(ehFeriadoNacional('2032-03-26')).toBe(true)  // Sexta-feira Santa = -2d
    expect(ehFeriadoNacional('2032-05-27')).toBe(true)  // Corpus Christi = +60d
  })
  it('dia comum não é feriado', () => {
    expect(ehFeriadoNacional('2027-03-15')).toBe(false)
  })
})
