import NextAuth from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import bcrypt from 'bcryptjs'
import { findPortalUserByEmail } from './lib/patient-portal'

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
        const user = await findPortalUserByEmail(credentials.email as string)
        if (!user || !user.password_hash) return null
        const valid = await bcrypt.compare(credentials.password as string, user.password_hash)
        if (!valid) return null
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
  session: { strategy: 'jwt' },
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
