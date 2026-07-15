// Ícones de linha fina do design system do portal (SVG inline, extraídos do
// handoff). stroke-width 1.6, linecap/linejoin round, viewBox 0 0 24 24.
import React from 'react'

type P = { size?: number; color?: string; sw?: number }

function Svg({ size = 20, color = 'currentColor', sw = 1.6, children }: P & { children: React.ReactNode }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color}
      strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
      {children}
    </svg>
  )
}

export const IconBell = (p: P) => <Svg {...p}><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.7 21a2 2 0 0 1-3.4 0" /></Svg>
export const IconCamera = (p: P) => <Svg {...p}><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h3l1.6-2.4A1 1 0 0 1 9.4 4h5.2a1 1 0 0 1 .8.4L17 7h3a2 2 0 0 1 2 2z" /><circle cx="12" cy="13" r="3.6" /></Svg>
export const IconFlask = (p: P) => <Svg {...p}><path d="M9 3h6" /><path d="M10 3v6l-4.6 8.1A2 2 0 0 0 7.1 20h9.8a2 2 0 0 0 1.7-2.9L14 9V3" /><path d="M7 14h10" /></Svg>
export const IconBars = (p: P) => <Svg {...p}><path d="M5 21V9M12 21V3M19 21v-7" /><path d="M3 21h18" /></Svg>
export const IconLeaf = (p: P) => <Svg {...p}><path d="M4 20c9 1 16-5 16-14 0 0-2-1-5-1C7 5 4 11 4 20z" /><path d="M4 20C7 14 11 11 16 9" /></Svg>
export const IconCapsule = (p: P) => <Svg {...p}><path d="M10.5 20.5 3.5 13.5a4.95 4.95 0 0 1 7-7l7 7a4.95 4.95 0 0 1-7 7z" /><path d="M8 8l8 8" /></Svg>
export const IconSparkle = (p: P) => <Svg {...p}><path d="M12 3l1.9 4.6L18.5 9.5 13.9 11.4 12 16l-1.9-4.6L5.5 9.5 10.1 7.6z" /><path d="M18.5 3.5v3M17 5h3" /></Svg>
export const IconDoc = (p: P) => <Svg {...p}><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5" /><path d="M9 13h6" /><path d="M9 17h4" /></Svg>
export const IconDocSimple = (p: P) => <Svg {...p}><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5" /></Svg>
export const IconCheckCircle = (p: P) => <Svg {...p}><circle cx="12" cy="12" r="9" /><path d="M8.3 12.4 11 15l4.7-5.2" /></Svg>
export const IconPen = (p: P) => <Svg {...p}><path d="M14 4.5 19.5 10 8.5 21 3 21l0-5.5z" /><path d="M13 5.5 18.5 11" /></Svg>
export const IconDownload = (p: P) => <Svg {...p}><path d="M4 15v3.5A1.5 1.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.5V15" /><path d="M8 11l4 4 4-4M12 3.5v11" /></Svg>
export const IconDrop = (p: P) => <Svg {...p}><path d="M12 3s6 5.7 6 10a6 6 0 0 1-12 0c0-4.3 6-10 6-10z" /></Svg>
export const IconSun = (p: P) => <Svg {...p}><path d="M12 3v4M4.5 12H3M21 12h-1.5M6 6.5 7.3 7.8M18 6.5 16.7 7.8" /><path d="M7.5 16a4.5 4.5 0 0 1 9 0" /><path d="M3 20h18" /></Svg>
export const IconSunFull = (p: P) => <Svg {...p}><circle cx="12" cy="12" r="4" /><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.2 5.2 6.6 6.6M17.4 17.4l1.4 1.4M18.8 5.2 17.4 6.6M6.6 17.4 5.2 18.8" /></Svg>
export const IconUser = (p: P) => <Svg {...p}><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></Svg>
export const IconLock = (p: P) => <Svg {...p}><rect x="4" y="10" width="16" height="11" rx="2.5" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></Svg>
export const IconChat = (p: P) => <Svg {...p}><path d="M21 11.5a8.5 8.5 0 0 1-12.3 7.6L3 21l1.9-5.7A8.5 8.5 0 1 1 21 11.5z" /></Svg>
export const IconSend = (p: P) => <Svg {...p} sw={p.sw ?? 1.7}><path d="M21 3 10.5 13.5M21 3l-6.5 18-4-8-8-4z" /></Svg>
export const IconHome = (p: P) => <Svg {...p} sw={p.sw ?? 1.7}><path d="M3.5 11 12 3.5l8.5 7.5" /><path d="M5.5 10v10h13V10" /></Svg>
export const IconMenu = (p: P) => <Svg {...p} sw={p.sw ?? 1.7}><path d="M4 7h16M4 12h16M4 17h16" /></Svg>
export const IconSwap = (p: P) => <Svg {...p} sw={p.sw ?? 1.8}><path d="M7 8 3.5 11.5 7 15M17 8l3.5 3.5L17 15M3.5 11.5h17" /></Svg>

// Meia-lua (antes/depois): círculo com metade preenchida
export function IconMoon({ size = 20, color = 'currentColor', sw = 1.6 }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color}
      strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 3a9 9 0 0 1 0 18z" fill={color} stroke="none" />
    </svg>
  )
}
