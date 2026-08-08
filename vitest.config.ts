import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // IndexedDB in der Testumgebung bereitstellen, damit die
    // Persistenz- und Sync-Schicht echt getestet wird — nicht gegen
    // eine Attrappe, die andere Zusicherungen hätte.
    setupFiles: ['./src/test/setup.ts'],
  },
})
