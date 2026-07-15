import { PortalLoginForm } from './PortalLoginForm'

export default function PortalLoginPage() {
  return (
    <div style={{ minHeight: '100dvh', background: '#FBF6EF', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '44px 34px 30px', textAlign: 'center' }}>
      <div style={{ marginTop: 20, display: 'flex', alignItems: 'center', gap: 20 }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/portal/logo-torres.png" alt="Instituto Torres" style={{ width: 118, height: 'auto', display: 'block' }} />
        <div style={{ width: 1, height: 84, background: '#ddd2be' }} />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/portal/logo-fran.png" alt="Dra. Fran Torres" style={{ width: 104, height: 'auto', display: 'block' }} />
      </div>

      <div style={{ fontFamily: 'var(--font-marcellus), serif', fontSize: 30, color: '#2f2f31', marginTop: 26, lineHeight: 1.15 }}>
        Sua jornada,<br />ao seu alcance
      </div>
      <div style={{ fontSize: 14, color: '#8a8074', marginTop: 12, lineHeight: 1.5, maxWidth: 300 }}>
        Acompanhe evolução, fotos, exames e cuidados em um só lugar.
      </div>

      <div style={{ width: '100%', maxWidth: 340, marginTop: 30 }}>
        <PortalLoginForm />
      </div>
    </div>
  )
}
