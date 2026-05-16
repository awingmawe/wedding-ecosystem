import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
    coverage: {
      include: ['src/**/*.ts'],
      exclude: [
        'src/index.ts',
        'src/types/index.ts',
        'src/types/interfaces.ts',
        'src/types/responses.ts',
        'src/types/errors.ts',
        'src/utils/index.ts',
      ],
      thresholds: {
        statements: 80,
        branches: 80,
        functions: 50,
        lines: 80,
      },
    },
  },
});
