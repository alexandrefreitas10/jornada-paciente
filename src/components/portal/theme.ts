// Tokens do design system do Portal do Paciente — Instituto Torres.
// Valores extraídos do handoff de alta fidelidade (não alterar sem o design).

export const C = {
  gold: '#C4A86A',        // dourado Torres — marca, botões primários, nav ativo
  goldIcon: '#8A7A4A',    // traço de ícones em caixa dourada
  sage: '#8A9A7B',        // verde sálvia — apoio, sucesso, links, banners
  sageText: '#6F7F60',    // texto sobre caixa sálvia clara
  graphite: '#514F4A',    // texto de interface
  graphiteStrong: '#2F2F31', // títulos
  sand: '#FBF6EF',        // fundo das telas
  white: '#FFFFFF',
  goldBox: '#FAF1E2',     // fundo de ícones (grupo 1)
  sageBox: '#EEF1E9',     // fundo de ícones (grupo 2)
  soft: '#8A8074',        // subtítulos
  muted: '#A2988A',       // metadados
  muted2: '#A99671',      // legendas douradas
  border: '#EEE6D7',      // bordas/divisórias
  border2: '#F0E9DC',
  pending: '#B0904F',     // texto de status pendente/agendado
  danger: '#B98D8D',      // "Sair"
  navOff: '#CDC6BA',      // nav inativo
} as const

export const serif = "var(--font-marcellus), serif"
export const sans = "var(--font-nunito), sans-serif"

// Sombras de cartão
export const shadowCard = '0 8px 20px -16px rgba(120,100,60,.5)'
export const shadowCardSoft = '0 8px 20px -18px rgba(120,100,60,.5)'
export const shadowFeature = '0 16px 32px -22px rgba(140,120,70,.6)'

// Nome curto (primeiro nome) para saudação/avatar
export function firstName(name: string): string {
  return (name || '').trim().split(/\s+/)[0] || ''
}
export function initial(name: string): string {
  return (firstName(name)[0] || '?').toUpperCase()
}

// Data curta em pt-BR: "08 jul"
export function shortDate(iso: string | null | undefined): string {
  if (!iso) return ''
  try {
    return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }).replace('.', '')
  } catch { return '' }
}
// "12 mar 2026"
export function longDate(iso: string | null | undefined): string {
  if (!iso) return ''
  try {
    return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' }).replace('.', '')
  } catch { return '' }
}
