import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // Only the canonical tests directory — never pick up stray worktrees or
    // vendored copies elsewhere in the workspace.
    include: ['tests/**/*.test.ts']
  }
})
