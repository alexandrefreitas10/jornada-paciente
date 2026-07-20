'use client'

import React, { useState } from 'react'
import { C } from './theme'
import { IconHome, IconCamera, IconBars, IconLeaf, IconMenu } from './Icons'
import type { PortalData, Screen } from './types'
import { Home } from './screens/Home'
import { Fotos } from './screens/Fotos'
import { Exames } from './screens/Exames'
import { Bio } from './screens/Bio'
import { Dieta } from './screens/Dieta'
import { Med } from './screens/Med'
import { Termos } from './screens/Termos'
import { Estetica } from './screens/Estetica'
import { Prescricoes } from './screens/Prescricoes'
import { Perfil } from './screens/Perfil'
import { Ouvidoria } from './screens/Ouvidoria'

export function PortalApp({ data, onLogout }: { data: PortalData; onLogout: () => void }) {
  const [screen, setScreen] = useState<Screen>('home')
  const go = (s: Screen) => setScreen(s)
  const back = () => setScreen('home')

  // Limpa o cache do service worker antes de sair (troca de conta no mesmo aparelho)
  async function handleLogout() {
    try {
      if (typeof caches !== 'undefined') {
        const keys = await caches.keys()
        await Promise.all(keys.map(k => caches.delete(k)))
      }
    } catch { /* segue mesmo se falhar */ }
    await onLogout()
  }

  const showNav = screen !== 'ouvidoria'
  const navColor = (s: Screen) => (screen === s ? C.gold : C.navOff)

  // Escala global via transform: um "palco" de tamanho fixo (largura/altura
  // divididas por SCALE) é ampliado por scale(SCALE) para preencher a tela.
  // Assim o conteúdo cresce de verdade no celular (o zoom não fazia isso).
  const SCALE = 1.3

  return (
    <div style={{ height: '100dvh', overflow: 'hidden', background: C.sand, display: 'flex', justifyContent: 'center' }}>
      <style>{`
        @keyframes ptfade { from { opacity:0; transform:translateY(6px); } to { opacity:1; transform:none; } }
        .pt-view { animation: ptfade .28s ease; }
        .pt-press { transition: transform .08s ease; }
        .pt-press:active { transform: scale(.97); }
        .pt-root a, .pt-root a:hover { color:#8A9A7B; }
      `}</style>
      <div style={{
        width: `calc(min(100vw, 500px) / ${SCALE})`,
        height: `calc(100dvh / ${SCALE})`,
        transform: `scale(${SCALE})`,
        transformOrigin: 'top center',
      }}>
      <div className="pt-root" style={{
        width: '100%', height: '100%',
        background: C.sand, color: C.graphite, display: 'flex', flexDirection: 'column', position: 'relative',
      }}>
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
          {screen === 'home' && <Home data={data} go={go} />}
          {screen === 'fotos' && <Fotos data={data} onBack={back} />}
          {screen === 'exames' && <Exames data={data} onBack={back} />}
          {screen === 'bio' && <Bio data={data} onBack={back} />}
          {screen === 'dieta' && <Dieta data={data} onBack={back} />}
          {screen === 'med' && <Med data={data} onBack={back} />}
          {screen === 'termos' && <Termos data={data} onBack={back} />}
          {screen === 'estetica' && <Estetica data={data} onBack={back} />}
          {screen === 'prescricoes' && <Prescricoes data={data} onBack={back} />}
          {screen === 'perfil' && <Perfil data={data} go={go} onLogout={handleLogout} onBack={back} />}
          {screen === 'ouvidoria' && <Ouvidoria data={data} onBack={() => setScreen('perfil')} />}
        </div>

        {showNav && (
          <nav style={{ flexShrink: 0, display: 'flex', justifyContent: 'space-around', padding: '14px 20px 22px', borderTop: `1px solid #efe7d9`, background: C.white }}>
            <button aria-label="Início" onClick={() => go('home')} style={navBtn(navColor('home'))}><IconHome size={21} color="currentColor" /></button>
            <button aria-label="Fotos" onClick={() => go('fotos')} style={navBtn(navColor('fotos'))}><IconCamera size={21} color="currentColor" sw={1.7} /></button>
            <button aria-label="Bioimpedância" onClick={() => go('bio')} style={navBtn(navColor('bio'))}><IconBars size={21} color="currentColor" sw={1.7} /></button>
            <button aria-label="Dieta" onClick={() => go('dieta')} style={navBtn(navColor('dieta'))}><IconLeaf size={21} color="currentColor" sw={1.7} /></button>
            <button aria-label="Perfil" onClick={() => go('perfil')} style={navBtn(navColor('perfil'))}><IconMenu size={21} color="currentColor" /></button>
          </nav>
        )}
      </div>
      </div>
    </div>
  )
}

function navBtn(color: string): React.CSSProperties {
  return { background: 'none', border: 'none', cursor: 'pointer', color, padding: 4, display: 'flex' }
}
