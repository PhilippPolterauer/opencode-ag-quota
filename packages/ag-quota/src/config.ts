/*
 * ISC License
 * Copyright (c) 2026 Philipp
 */

import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

/**
 * Quota data source
 * - "cloud": Fetch from Cloud Code API (requires opencode-antigravity-auth)
 * - "local": Fetch from local language server process
 * - "auto": Try cloud first, fallback to local
 */
export type QuotaSource = "cloud" | "local" | "auto";

/**
 * Configuration options for the quota plugin
 */
export interface QuotaConfig {
    /**
     * Where to fetch quota data from.
     * - "cloud": Use Cloud Code API (requires opencode-antigravity-auth)
     * - "local": Use local language server process
     * - "auto": Try cloud first, fallback to local (default)
     * @default "auto"
     */
    quotaSource?: QuotaSource;

    /**
     * Format string for quota display.
     * Available placeholders:
     * - {category} - Category name (Flash, Pro, Claude/GPT)
     * - {percent} - Quota percentage (e.g., "85.5")
     * - {resetIn} - Relative time until reset (e.g., "2h 30m")
     * - {resetAt} - Absolute reset time (e.g., "10:30 PM")
     * - {model} - Current model ID
     * 
     * For all quotas mode, the format is applied per category and joined with separator.
     * @default "{category}: {percent}% ({resetIn})"
     */
    format?: string;

    /**
     * Separator between categories when showing all quotas
     * @default " | "
     */
    separator?: string;

    /**
     * Show all quota categories or only the current model's quota
     * @default "all"
     */
    displayMode?: "all" | "current";

    /**
     * Always append quota info, even when unavailable
     * @default true
     */
    alwaysAppend?: boolean;

    /**
     * The marker string used to separate quota info from the message
     * @default "> AG Quota:"
     */
    quotaMarker?: string;

    /**
     * Polling interval in milliseconds
     * @default 30000 (30 seconds)
     */
    pollingInterval?: number;

    /**
     * Array of quota usage percentages (remaining) that trigger alerts
     * @default [0.2, 0.1, 0.05] (20%, 10%, 5%)
     */
    alertThresholds?: number[];
}

const DEFAULT_CONFIG: Required<QuotaConfig> = {
    quotaSource: "auto",
    format: "{category}: {percent}% ({resetIn})",
    separator: " | ",
    displayMode: "all",
    alwaysAppend: true,
    quotaMarker: "> AG Quota:",
    pollingInterval: 30000,
    alertThresholds: [0.2, 0.1, 0.05],
};

/**
 * Load configuration from file system.
 * Searches in order:
 * 1. .opencode/ag-quota.json (project-local)
 * 2. ~/.config/opencode/ag-quota.json (user global)
 * 
 * @param projectDir - The project directory to search from
 * @returns Merged configuration with defaults
 */
export function loadConfig(projectDir?: string): Required<QuotaConfig> {
    const paths: string[] = [];

    // Project-local config
    if (projectDir) {
        paths.push(join(projectDir, ".opencode", "ag-quota.json"));
    } else {
        paths.push(join(process.cwd(), ".opencode", "ag-quota.json"));
    }

    // User global config
    paths.push(join(homedir(), ".config", "opencode", "ag-quota.json"));

    for (const configPath of paths) {
        try {
            const content = readFileSync(configPath, "utf-8");
            const userConfig = JSON.parse(content) as QuotaConfig;
            return { ...DEFAULT_CONFIG, ...userConfig };
        } catch {
            // File doesn't exist or is invalid, try next
            continue;
        }
    }

    return DEFAULT_CONFIG;
}

/**
 * Format a quota entry using the format string.
 * Placeholders are only replaced if they exist in the format string.
 */
export function formatQuotaEntry(
    format: string,
    data: {
        category: string;
        percent: string;
        resetIn: string | null;   // Relative: "2h 30m"
        resetAt: string | null;   // Absolute: "10:30 PM"
        model: string;
    },
): string {
    let result = format
        .replace("{category}", data.category)
        .replace("{percent}", data.percent)
        .replace("{model}", data.model);

    // Handle resetIn (relative time) - e.g., "2h 30m"
    if (format.includes("{resetIn}")) {
        if (data.resetIn) {
            result = result.replace("{resetIn}", data.resetIn);
        } else {
            result = result
                .replace(/\s*\(\{resetIn}\)/, "")
                .replace(/\s*\{resetIn}/, "");
        }
    }

    // Handle resetAt (absolute time) - e.g., "10:30 PM"
    if (format.includes("{resetAt}")) {
        if (data.resetAt) {
            result = result.replace("{resetAt}", data.resetAt);
        } else {
            result = result
                .replace(/\s*\(\{resetAt}\)/, "")
                .replace(/\s*\{resetAt}/, "");
        }
    }

    return result;
}

export { DEFAULT_CONFIG };
