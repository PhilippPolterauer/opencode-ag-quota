import { defineConfig } from "vitest/config";

export default defineConfig({
    test: {
        include: ["test/unit/**/*.test.ts", "packages/**/src/**/*.test.ts"],
        exclude: ["node_modules", "dist", "test/integration"],
        testTimeout: 10000,
        globals: true,
    },
});
