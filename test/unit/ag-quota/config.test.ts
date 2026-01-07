import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { loadConfig, formatQuotaEntry, DEFAULT_CONFIG } from "../../../packages/ag-quota/src/config";
import { writeFileSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

describe("loadConfig", () => {
    const testDir = join(tmpdir(), "ag-quota-test-" + Date.now());
    const configDir = join(testDir, ".opencode");

    beforeEach(() => {
        mkdirSync(configDir, { recursive: true });
    });

    afterEach(() => {
        if (existsSync(testDir)) {
            rmSync(testDir, { recursive: true, force: true });
        }
    });

    it("returns defaults when no config file exists", () => {
        const config = loadConfig("/nonexistent/path");
        expect(config).toEqual(DEFAULT_CONFIG);
    });

    it("includes default alert thresholds and polling interval", () => {
        const config = loadConfig("/nonexistent/path");
        expect(config.alertThresholds).toEqual([0.2, 0.1, 0.05]);
        expect(config.pollingInterval).toBe(30000);
    });

    it("loads and merges project config", () => {
        const userConfig = {
            displayMode: "current" as const,
            format: "{category}: {percent}%",
        };
        writeFileSync(
            join(configDir, "ag-quota.json"),
            JSON.stringify(userConfig)
        );

        const config = loadConfig(testDir);
        expect(config.displayMode).toBe("current");
        expect(config.format).toBe("{category}: {percent}%");
        // Defaults preserved
        expect(config.separator).toBe(DEFAULT_CONFIG.separator);
        expect(config.alwaysAppend).toBe(DEFAULT_CONFIG.alwaysAppend);
    });

    it("handles invalid JSON gracefully", () => {
        writeFileSync(join(configDir, "ag-quota.json"), "not valid json");
        const config = loadConfig(testDir);
        expect(config).toEqual(DEFAULT_CONFIG);
    });

    it("merges all config options", () => {
        const userConfig = {
            quotaSource: "cloud" as const,
            format: "[{category}] {percent}%",
            separator: " · ",
            displayMode: "current" as const,
            alwaysAppend: false,
            quotaMarker: "--- My Quota ---",
        };
        writeFileSync(
            join(configDir, "ag-quota.json"),
            JSON.stringify(userConfig)
        );

        const config = loadConfig(testDir);
        expect(config).toEqual({
            ...userConfig,
            pollingInterval: 30000,
            alertThresholds: [0.2, 0.1, 0.05],
        });
    });

    it("accepts quotaSource config option", () => {
        const userConfig = {
            quotaSource: "local" as const,
        };
        writeFileSync(
            join(configDir, "ag-quota.json"),
            JSON.stringify(userConfig)
        );

        const config = loadConfig(testDir);
        expect(config.quotaSource).toBe("local");
        // Other defaults preserved
        expect(config.format).toBe(DEFAULT_CONFIG.format);
    });
});

describe("formatQuotaEntry", () => {
    it("formats with all placeholders including resetIn", () => {
        const result = formatQuotaEntry(
            "{category}: {percent}% ({resetIn})",
            {
                category: "Flash",
                percent: "85.5",
                resetIn: "2h 30m",
                resetAt: "10:30 PM",
                model: "gemini-flash",
            }
        );
        expect(result).toBe("Flash: 85.5% (2h 30m)");
    });

    it("formats with resetAt placeholder", () => {
        const result = formatQuotaEntry(
            "{category}: {percent}% (resets at {resetAt})",
            {
                category: "Flash",
                percent: "85.5",
                resetIn: "2h 30m",
                resetAt: "10:30 PM",
                model: "gemini-flash",
            }
        );
        expect(result).toBe("Flash: 85.5% (resets at 10:30 PM)");
    });

    it("omits reset time when format doesn't include placeholders", () => {
        const result = formatQuotaEntry(
            "{category}: {percent}%",
            {
                category: "Flash",
                percent: "85.5",
                resetIn: "2h 30m",
                resetAt: "10:30 PM",
                model: "gemini-flash",
            }
        );
        expect(result).toBe("Flash: 85.5%");
    });

    it("handles null resetIn gracefully", () => {
        const result = formatQuotaEntry(
            "{category}: {percent}% ({resetIn})",
            {
                category: "Flash",
                percent: "85.5",
                resetIn: null,
                resetAt: null,
                model: "gemini-flash",
            }
        );
        expect(result).toBe("Flash: 85.5%");
    });

    it("handles null resetAt gracefully", () => {
        const result = formatQuotaEntry(
            "{category}: {percent}% ({resetAt})",
            {
                category: "Flash",
                percent: "85.5",
                resetIn: null,
                resetAt: null,
                model: "gemini-flash",
            }
        );
        expect(result).toBe("Flash: 85.5%");
    });

    it("supports custom format with model placeholder", () => {
        const result = formatQuotaEntry(
            "{model} - {percent}%",
            {
                category: "Flash",
                percent: "85.5",
                resetIn: null,
                resetAt: null,
                model: "gemini-flash",
            }
        );
        expect(result).toBe("gemini-flash - 85.5%");
    });

    it("supports both resetIn and resetAt in same format", () => {
        const result = formatQuotaEntry(
            "{category}: {percent}% ({resetIn} / {resetAt})",
            {
                category: "Flash",
                percent: "85.5",
                resetIn: "2h 30m",
                resetAt: "10:30 PM",
                model: "gemini-flash",
            }
        );
        expect(result).toBe("Flash: 85.5% (2h 30m / 10:30 PM)");
    });

    it("handles bracket format", () => {
        const result = formatQuotaEntry(
            "[{category}] {percent}% ({resetIn})",
            {
                category: "Pro",
                percent: "45",
                resetIn: "1h 37m",
                resetAt: "9:37 PM",
                model: "gemini-pro",
            }
        );
        expect(result).toBe("[Pro] 45% (1h 37m)");
    });
});
