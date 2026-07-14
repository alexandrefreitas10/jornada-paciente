import NextAuth, { CredentialsSignin } from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import bcrypt from 'bcryptjs'
import { findPortalUserByEmail } from './lib/patient-portal'
import { assertNotLocked, registerFailure, clearAttempts } from './lib/rate-limit'

class PortalRateLimitedError extends CredentialsSignin {
  code = 'rate_limited'
}

export const {
  handlers: portalHandlers,
  auth: portalAuth,
  signIn: portalSignIn,
  signOut: portalSignOut,
} = NextAuth({
  providers: [
    Credentials({
      credentials: {
        email: { label: 'E-mail', type: 'email' },
        password: { label: 'Senha', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null
        const email = (credentials.email as string).toLowerCase().trim()
        // Rate-limit: barra brute-force antes de gastar o bcrypt
        if ((await assertNotLocked('portal', email)).blocked) throw new PortalRateLimitedError()
        const user = await findPortalUserByEmail(email)
        if (!user || !user.password_hash) { await registerFailure('portal', email); return null }
        const valid = await bcrypt.compare(credentials.password as string, user.password_hash)
        if (!valid) {
          if ((await registerFailure('portal', email)).blocked) throw new PortalRateLimitedError()
          return null
        }
        await clearAttempts('portal', email)
        return {
          id: String(user.patient_id),
          email: user.email,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          patient_id: user.patient_id,
        }
      },
    }),
  ],
  pages: { signIn: '/portal/login' },
  // JWT curto (2h): o middleware roda no Edge e não consulta o banco, então a
  // revogação instantânea acontece na página do card (valida patient_users no
  // servidor). O maxAge limita a janela residual de acesso via API após revogar.
  session: { strategy: 'jwt', maxAge: 60 * 60 * 2 },
  cookies: {
    sessionToken: {
      name: 'portal-session-token',
      options: {
        httpOnly: true,
        sameSite: 'lax' as const,
        path: '/',
        secure: process.env.NODE_ENV === 'production',
      },
    },
  },
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        token.patient_id = (user as any).patient_id
      }
      return token
    },
    session({ session, token }) {
      if (session.user) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ;(session.user as any).patient_id = token.patient_id
      }
      return session
    },
  },
})
