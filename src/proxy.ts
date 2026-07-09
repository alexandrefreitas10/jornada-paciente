import { auth } from './auth'
import { getToken } from 'next-auth/jwt'
import { NextResponse } from 'next/server'

const PORTAL_COOKIE = 'portal-session-token'

export default auth(async (req) => {
  const isStaff = !!req.auth
  const { pathname } = req.nextUrl

  // Rotas públicas (sem sessão nenhuma)
  const isPublic =
    pathname.startsWith('/login') ||
    pathname.startsWith('/setup') ||
    pathname.startsWith('/termos/assinar') ||
    pathname.startsWith('/portal/login') ||
    pathname.startsWith('/portal/ativar') ||
    pathname.startsWith('/api/portal') ||
    // Arquivos dos PWAs (portal e sistema interno)
    pathname === '/sw.js' ||
    pathname === '/portal-manifest.json' ||
    pathname === '/manifest.json'

  if (isPublic) return NextResponse.next()

  // Staff logado: acesso total
  if (isStaff) return NextResponse.next()

  // Sessão do portal (paciente)
  const portalToken = await getToken({
    req,
    secret: process.env.AUTH_SECRET,
    salt: PORTAL_COOKIE,
    cookieName: PORTAL_COOKIE,
  }).catch(() => null)

  const portalPatientId = portalToken?.patient_id != null ? String(portalToken.patient_id) : null

  if (portalPatientId) {
    // Página do próprio card (a página valida a sessão de novo no servidor)
    if (pathname.startsWith('/portal/paciente')) return NextResponse.next()

    // Somente leitura (GET) dos dados do PRÓPRIO paciente — nunca escrita, nunca outro id
    const ownApiPrefix = `/api/patients/${portalPatientId}`
    const isOwnPatientGet =
      req.method === 'GET' &&
      (pathname === ownApiPrefix || pathname.startsWith(`${ownApiPrefix}/`)) &&
      !pathname.includes('/portal-invite')

    // Exceções de escrita do próprio paciente: NPS e ouvidoria
    const isOwnPatientWrite =
      req.method === 'POST' &&
      (pathname === `${ownApiPrefix}/nps` || pathname === `${ownApiPrefix}/feedback`)

    if (isOwnPatientGet || isOwnPatientWrite) return NextResponse.next()

    // Qualquer outra rota: bloqueia
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    }
    return NextResponse.redirect(new URL('/portal/login', req.url))
  }

  // Sem sessão nenhuma
  if (pathname.startsWith('/portal')) {
    return NextResponse.redirect(new URL('/portal/login', req.url))
  }
  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }
  return NextResponse.redirect(new URL('/login', req.url))
})

export const config = {
  matcher: ['/((?!api/auth|api/terms|_next/static|_next/image|favicon\\.ico|.*\\.png|.*\\.jpg|.*\\.jpeg|.*\\.svg|.*\\.webp|.*\\.ico).*)'],
}
