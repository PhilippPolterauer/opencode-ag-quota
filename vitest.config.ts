import { defineConfig } from "vitest/config";
import { resolve } from "path";

export default defineConfig({
    test: {
        include: ["test/unit/**/*.test.ts", "packages/**/src/**/*.test.ts"],
        exclude: ["node_modules", "dist", "test/integration"],
        testTimeout: 10000,
        globals: true,
        alias: {
            "ag-quota": resolve(__dirname, "packages/ag-quota/src/index.ts"),
        },
    },
});
