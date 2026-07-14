import NextAuth, { CredentialsSignin } from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import bcrypt from 'bcryptjs'
import { findUserByUsername } from './lib/users'
import { assertNotLocked, registerFailure, clearAttempts } from './lib/rate-limit'

class RateLimitedError extends CredentialsSignin {
  code = 'rate_limited'
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Credentials({
      credentials: {
        username: { label: 'Usuário', type: 'text' },
        password: { label: 'Senha', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.username || !credentials?.password) return null
        const username = (credentials.username as string).trim()
        // Rate-limit: barra brute-force antes de gastar o bcrypt
        if ((await assertNotLocked('staff', username)).blocked) throw new RateLimitedError()
        const user = await findUserByUsername(username)
        if (!user) { await registerFailure('staff', username); return null }
        const valid = await bcrypt.compare(credentials.password as string, user.password_hash)
        if (!valid) {
          if ((await registerFailure('staff', username)).blocked) throw new RateLimitedError()
          return null
        }
        await clearAttempts('staff', username)
        return { id: String(user.id), name: user.username, is_admin: user.is_admin, can_estoque: user.can_estoque }
      },
    }),
  ],
  pages: { signIn: '/login' },
  session: { strategy: 'jwt' },
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.id = user.id
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        token.is_admin = (user as any).is_admin ?? false
        token.can_estoque = (user as any).can_estoque ?? false
      }
      return token
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ;(session.user as any).is_admin = token.is_admin ?? false
        ;(session.user as any).can_estoque = token.can_estoque ?? false
      }
      return session
    },
  },
})
