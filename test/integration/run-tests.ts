#!/usr/bin/env bun
/**
 * Integration test runner for opencode-ag-quota plugin
 * 
 * Runs opencode with different configurations and asserts expected behavior
 */

import { execSync } from "node:child_process";
import { copyFileSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = join(__dirname, "../..");
const CONFIGS_DIR = join(__dirname, "configs");
const OPENCODE_CONFIG_DIR = join(ROOT_DIR, ".opencode");
const CONFIG_FILE = join(OPENCODE_CONFIG_DIR, "ag-quota.json");

const TIMEOUT_MS = 30000;
const TEST_MESSAGE = "respond with ok";

// Models to test
const GOOGLE_MODEL = "google/antigravity-gemini-3-flash";
const NON_GOOGLE_MODEL = "anthropic/claude-sonnet-4";

interface TestResult {
    name: string;
    passed: boolean;
    message: string;
    duration: number;
}

interface TestCase {
    name: string;
    config: string;
    model: string;
    assert: (output: string) => { passed: boolean; message: string };
}

/**
 * Run opencode with a message and return stdout
 */
function runOpencode(model: string): string {
    try {
        const output = execSync(
            `opencode run "${TEST_MESSAGE}" --model ${model}`,
            {
                cwd: ROOT_DIR,
                encoding: "utf-8",
                timeout: TIMEOUT_MS,
                stdio: ["pipe", "pipe", "pipe"],
            }
        );
        return output;
    } catch (error: any) {
        if (error.stdout) {
            return error.stdout;
        }
        throw error;
    }
}

/**
 * Set up a test configuration
 */
function setupConfig(configName: string): void {
    const configPath = join(CONFIGS_DIR, `${configName}.json`);
    if (!existsSync(configPath)) {
        throw new Error(`Config not found: ${configPath}`);
    }
    mkdirSync(OPENCODE_CONFIG_DIR, { recursive: true });
    copyFileSync(configPath, CONFIG_FILE);
}

/**
 * Clean up configuration
 */
function cleanupConfig(): void {
    if (existsSync(CONFIG_FILE)) {
        rmSync(CONFIG_FILE);
    }
}

// Test cases
const testCases: TestCase[] = [
    {
        name: "Google model shows quota with default config",
        config: "default",
        model: GOOGLE_MODEL,
        assert: (output) => {
            const hasQuota = output.includes("*Quota:");
            return {
                passed: hasQuota,
                message: hasQuota ? "Quota line found" : "Quota line not found in: " + output.slice(0, 200),
            };
        },
    },
    {
        name: "All categories shown with displayMode=all",
        config: "default",
        model: GOOGLE_MODEL,
        assert: (output) => {
            const hasFlash = output.includes("Flash:");
            const hasPro = output.includes("Pro:");
            const hasClaude = output.includes("Claude/GPT:");
            const hasAll = hasFlash && hasPro && hasClaude;
            return {
                passed: hasAll,
                message: hasAll
                    ? "All categories found"
                    : `Missing: ${!hasFlash ? "Flash " : ""}${!hasPro ? "Pro " : ""}${!hasClaude ? "Claude/GPT" : ""}`,
            };
        },
    },
    {
        name: "Reset time shown with showResetTime=true",
        config: "default",
        model: GOOGLE_MODEL,
        assert: (output) => {
            const hasResetTime = /\(\d+h\s+\d+m\)|\(\d+m\)/.test(output);
            return {
                passed: hasResetTime,
                message: hasResetTime ? "Reset time pattern found" : "Reset time pattern not found",
            };
        },
    },
    {
        name: "Separator shown between categories",
        config: "default",
        model: GOOGLE_MODEL,
        assert: (output) => {
            const hasSeparator = output.includes(" | ");
            return {
                passed: hasSeparator,
                message: hasSeparator ? "Separator found" : "Separator not found",
            };
        },
    },
    {
        name: "Current mode shows single category",
        config: "current-only",
        model: GOOGLE_MODEL,
        assert: (output) => {
            const hasQuota = output.includes("*Quota:");
            // In current mode, should not have pipe separator for multiple categories
            const noMultipleCategories = !output.includes(" | ");
            const passed = hasQuota && noMultipleCategories;
            return {
                passed,
                message: passed ? "Single category shown" : "Expected single category without separator",
            };
        },
    },
    {
        name: "Reset time hidden with showResetTime=false",
        config: "no-reset-time",
        model: GOOGLE_MODEL,
        assert: (output) => {
            const quotaMatch = output.match(/\*Quota:[^*]+\*/);
            if (!quotaMatch) {
                return { passed: false, message: "No quota line found" };
            }
            const quotaLine = quotaMatch[0];
            const hasResetTime = /\(\d+h\s+\d+m\)|\(\d+m\)/.test(quotaLine);
            return {
                passed: !hasResetTime,
                message: hasResetTime ? "Reset time found (should be hidden)" : "Reset time correctly hidden",
            };
        },
    },
    {
        name: "Custom format with brackets",
        config: "custom-format",
        model: GOOGLE_MODEL,
        assert: (output) => {
            const hasBrackets = output.includes("[Flash]") || output.includes("[Pro]") || output.includes("[Claude/GPT]");
            const hasCustomSeparator = output.includes(" · ");
            const passed = hasBrackets && hasCustomSeparator;
            return {
                passed,
                message: passed ? "Custom format applied" : `Brackets: ${hasBrackets}, Separator: ${hasCustomSeparator}`,
            };
        },
    },
    {
        name: "Non-Google model has no quota line",
        config: "default",
        model: NON_GOOGLE_MODEL,
        assert: (output) => {
            const hasQuota = output.includes("*Quota:");
            return {
                passed: !hasQuota,
                message: hasQuota ? "Quota line found (should not be present)" : "Correctly no quota line",
            };
        },
    },
];

/**
 * Run a single test
 */
function runTest(testCase: TestCase): TestResult {
    const startTime = Date.now();

    try {
        setupConfig(testCase.config);
        const output = runOpencode(testCase.model);
        const assertion = testCase.assert(output);

        return {
            name: testCase.name,
            passed: assertion.passed,
            message: assertion.message,
            duration: Date.now() - startTime,
        };
    } catch (error: any) {
        return {
            name: testCase.name,
            passed: false,
            message: `Error: ${error.message}`,
            duration: Date.now() - startTime,
        };
    } finally {
        cleanupConfig();
    }
}

/**
 * Run all tests sequentially (to avoid config conflicts)
 */
function runAllTests(): void {
    console.log("\n🧪 Running Integration Tests\n");
    console.log("=".repeat(60));

    const results: TestResult[] = [];

    for (const testCase of testCases) {
        console.log(`\nRunning: ${testCase.name}...`);
        const result = runTest(testCase);
        results.push(result);

        const icon = result.passed ? "✓" : "✗";
        const color = result.passed ? "\x1b[32m" : "\x1b[31m";
        const reset = "\x1b[0m";
        console.log(`${color}${icon}${reset} ${result.message} (${result.duration}ms)`);
    }

    let passed = 0;
    let failed = 0;

    for (const result of results) {
        if (result.passed) {
            passed++;
        } else {
            failed++;
        }
    }

    console.log("\n" + "=".repeat(60));
    console.log(`\nResults: ${passed} passed, ${failed} failed`);

    if (failed > 0) {
        process.exit(1);
    }
}

// Run tests
runAllTests();
