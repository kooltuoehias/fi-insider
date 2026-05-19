/// <reference types="vitest" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vitejs.dev/config/
export default defineConfig({
    plugins: [react()],
    resolve: {
        alias: {
            "@": path.resolve(__dirname, "./src"),
        },
    },
    server: {
        port: 6175,
    },
    test: {
        globals: true,
        environment: 'node',
        coverage: {
            provider: 'v8',
            reporter: ['text', 'lcov'],
            include: ['src/**/*.ts'],
            exclude: ['src/main.tsx', 'src/**/*.d.ts'],
        },
    },
})
