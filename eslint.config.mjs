import { defineConfig } from '@octohash/eslint-config'

export default defineConfig({
  react: true,
  jsx: true,
  ignores: ['raycast-env.d.ts'],
  rules: {
    'e18e/prefer-static-regex': 'off',
  },
})
