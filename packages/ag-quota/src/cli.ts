#!/usr/bin/env node
/*
 * ISC License
 * Copyright (c) 2026 Philipp
 */

import { execSync } from "node:child_process";
import {
    fetchAntigravityStatus,
    formatRelativeTime,
    type ShellRunner,
} from "./index";

const CATEGORY_NAMES = {
    GEMINI_FLASH: "Gemini Flash",
    GEMINI_PRO: "Gemini Pro",
    CLAUDE_GPT: "Claude/GPT/OSS",
};

const MODEL_KEYWORDS = {
    flash: "flash",
    gemini: "gemini",
};

function determineCategory(label: string): string {
    const lowerLabel = label.toLowerCase();
    if (lowerLabel.includes(MODEL_KEYWORDS.flash)) {
        return CATEGORY_NAMES.GEMINI_FLASH;
    }
    if (lowerLabel.includes(MODEL_KEYWORDS.gemini)) {
        return CATEGORY_NAMES.GEMINI_PRO;
    }
    return CATEGORY_NAMES.CLAUDE_GPT;
}

const shellRunner: ShellRunner = async (cmd: string) =>
    execSync(cmd).toString();

async function run() {
    const isJson = process.argv.includes("--json");
    const isHelp = process.argv.includes("--help") || process.argv.includes("-h");

    if (isHelp) {
        console.log(`
Usage: ag-quota [options]

Options:
  --json      Output result as JSON
  -h, --help  Show this help message

Examples:
  ag-quota
  ag-quota --json
`);
        process.exit(0);
    }

    try {
        const { userStatus, timestamp } =
            await fetchAntigravityStatus(shellRunner);

        const modelConfigs =
            userStatus.cascadeModelConfigData?.clientModelConfigs || [];
        const groups: Record<
            string,
            { quota: number; resetTime: string | null; label: string }
        > = {};

        for (const model of modelConfigs) {
            const { quotaInfo, label } = model;
            const remainingFraction = quotaInfo?.remainingFraction;
            const modelQuota =
                typeof remainingFraction === "number" &&
                Number.isFinite(remainingFraction)
                    ? remainingFraction
                    : 0;
            const category = determineCategory(label || model.modelName || "");

            const group = (groups[category] ??= {
                quota: 1,
                resetTime: null,
                label: category,
            });
            if (modelQuota < group.quota) {
                group.quota = modelQuota;
            }

            const resetTimeStr = quotaInfo?.resetTime;
            if (typeof resetTimeStr === "string" && resetTimeStr.length > 0) {
                if (group.resetTime === null || resetTimeStr < group.resetTime) {
                    group.resetTime = resetTimeStr;
                }
            }
        }

        if (isJson) {
            console.log(
                JSON.stringify(
                    {
                        timestamp,
                        categories: Object.values(groups).map((g) => ({
                            name: g.label,
                            remainingFraction: g.quota,
                            remainingPercentage: parseFloat(
                                (g.quota * 100).toFixed(1),
                            ),
                            resetTime: g.resetTime,
                            resetsIn: g.resetTime
                                ? formatRelativeTime(new Date(g.resetTime))
                                : null,
                        })),
                    },
                    null,
                    2,
                ),
            );
            return;
        }

        console.log(
            `\nAntigravity Quotas (Retrieved at: ${new Date(timestamp).toLocaleTimeString()}):`,
        );
        console.log(
            "------------------------------------------------------------",
        );

        const sortedCategories = Object.keys(groups).sort();

        for (const catName of sortedCategories) {
            const group = groups[catName]!;
            const remaining = (group.quota * 100).toFixed(1);
            let output = `${catName.padEnd(20)}: ${remaining.padStart(5)}% remaining`;
            if (group.resetTime) {
                output += ` (Resets in: ${formatRelativeTime(new Date(group.resetTime))})`;
            }
            console.log(output);
        }
        console.log("");
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        if (isJson) {
            console.log(JSON.stringify({ error: message }, null, 2));
        } else {
            console.error("Error:", message);
        }
        process.exit(1);
    }
}

run();
