'use client'

import React from 'react'
import { C, serif } from './theme'

// Cabeçalho padrão de tela: ‹ Voltar + título Marcellus + subtítulo.
export function ScreenHeader({ title, subtitle, onBack }: { title: string; subtitle?: string; onBack: () => void }) {
  return (
    <>
      <div style={{ padding: '16px 22px 8px', display: 'flex', alignItems: 'center', gap: 10 }}>
        <button onClick={onBack} aria-label="Voltar"
          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 26, color: C.soft, lineHeight: 1, padding: 0 }}>‹</button>
        <span style={{ fontFamily: serif, fontSize: 22, color: C.graphiteStrong }}>{title}</span>
      </div>
      {subtitle && <div style={{ padding: '0 22px 14px', fontSize: 13, color: C.soft }}>{subtitle}</div>}
    </>
  )
}

// Caixa de ícone (dourada ou sálvia)
export function IconBox({ tone = 'gold', size = 44, radius = 14, children }: { tone?: 'gold' | 'sage'; size?: number; radius?: number; children: React.ReactNode }) {
  return (
    <span style={{
      width: size, height: size, borderRadius: radius, flexShrink: 0,
      background: tone === 'gold' ? C.goldBox : C.sageBox,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>{children}</span>
  )
}

// Estado vazio amigável
export function EmptyState({ children }: { children: React.ReactNode }) {
  return <div style={{ padding: '40px 24px', textAlign: 'center', color: C.muted, fontSize: 14 }}>{children}</div>
}
