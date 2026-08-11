import type { Config } from 'jest'
import nextJest from 'next/jest.js'

const createJestConfig = nextJest({ dir: './' })

// Worktrees do Claude Code vivem dentro do projeto e carregam uma cópia inteira
// da árvore de testes. Sem este ignore, o jest roda cada suíte duas vezes e toda
// falha aparece em dobro — o que faz a saída parecer pior do que é.
const IGNORAR = ['/node_modules/', '/.claude/worktrees/', '/.next/']

const config: Config = {
  coverageProvider: 'v8',
  projects: [
    {
      displayName: 'lib',
      testEnvironment: 'node',
      testMatch: ['**/__tests__/lib/**/*.test.ts'],
      testPathIgnorePatterns: IGNORAR,
      modulePathIgnorePatterns: IGNORAR,
      transform: { '^.+\\.(ts|tsx)$': ['ts-jest', {}] },
      moduleNameMapper: { '^@/(.*)$': '<rootDir>/src/$1' },
    },
    {
      displayName: 'components',
      testEnvironment: 'jsdom',
      testMatch: ['**/__tests__/components/**/*.test.tsx'],
      testPathIgnorePatterns: IGNORAR,
      modulePathIgnorePatterns: IGNORAR,
      setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
      transform: { '^.+\\.(ts|tsx)$': ['ts-jest', { tsconfig: { jsx: 'react-jsx' } }] },
      moduleNameMapper: { '^@/(.*)$': '<rootDir>/src/$1' },
    },
  ],
}

export default createJestConfig(config)
