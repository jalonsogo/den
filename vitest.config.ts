import { defineConfig } from 'vitest/config'

// Unit tests for the pure parts only: text in, structure out. No Electron, no
// DOM, no sbx — the layer that talks to the CLI is covered by the manual plan in
// docs/test-plan-cli-coverage.md, because mocking a child process whose output
// format is not a stable contract would test the mock, not the app.
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
    // A test that needs a browser environment is a sign it's reaching past the
    // pure layer this suite is for.
    passWithNoTests: false
  }
})
