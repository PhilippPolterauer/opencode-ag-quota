#!/usr/bin/env node
/*
 * ISC License
 * Copyright (c) 2026 Philipp
 */

import { execSync } from "node:child_process";
import {
    fetchQuota,
    formatRelativeTime,
    type ShellRunner,
    type QuotaSource,
    type CloudAuthCredentials,
} from "./index";
import { getCLICloudCredentials } from "./cli-auth";

const shellRunner: ShellRunner = async (cmd: string) =>
    execSync(cmd).toString();

function parseArgs(): { source: QuotaSource; json: boolean; help: boolean; token: string; projectId: string } {
    const args = process.argv.slice(2);
    let source: QuotaSource = "auto";
    let json = false;
    let help = false;
    let token = "";
    let projectId = "";

    for (const arg of args) {
        if (arg === "--json") {
            json = true;
        } else if (arg === "--help" || arg === "-h") {
            help = true;
        } else if (arg === "--source=cloud" || arg === "-s=cloud") {
            source = "cloud";
        } else if (arg === "--source=local" || arg === "-s=local") {
            source = "local";
        } else if (arg === "--source=auto" || arg === "-s=auto") {
            source = "auto";
        } else if (arg.startsWith("--token=")) {
            token = arg.split("=")[1];
        } else if (arg.startsWith("--project-id=")) {
            projectId = arg.split("=")[1];
        } else if (arg.startsWith("--source=") || arg.startsWith("-s=")) {
            const value = arg.split("=")[1];
            console.error(`Invalid source: ${value}. Use 'cloud', 'local', or 'auto'.`);
            process.exit(1);
        }
    }

    return { source, json, help, token, projectId };
}

async function run() {
    const { source, json: isJson, help: isHelp, token, projectId } = parseArgs();

    if (isHelp) {
        console.log(`
Usage: ag-quota [options]

Options:
  --source=<cloud|local|auto>  Quota source (default: auto)
  -s=<cloud|local|auto>        Alias for --source
  --token=<token>              Access token (override auto-discovery)
  --project-id=<id>            Google Cloud Project ID (optional)
  --json                       Output result as JSON
  -h, --help                   Show this help message

Sources:
  cloud   Fetch from Cloud Code API (uses auto-discovery or --token)
  local   Fetch from local language server process
  auto    Try cloud first, fallback to local (default)

Examples:
  ag-quota                     # Auto-detect (tries cloud then local)
  ag-quota --source=cloud      # Force cloud (auto-discover token)
  ag-quota --token=...         # Force cloud with specific token
  ag-quota --source=local      # Force local source
  ag-quota --json              # Output as JSON
`);
        process.exit(0);
    }

    try {
        // Resolve credentials
        let cloudAuth: CloudAuthCredentials | undefined = token ? { accessToken: token, projectId } : undefined;

        // If no token provided, try to auto-discover
        if (!cloudAuth && (source === "cloud" || source === "auto")) {
            const creds = await getCLICloudCredentials();
            if (creds) {
                cloudAuth = { accessToken: creds.accessToken, projectId: creds.projectId };
            }
        }

        if (source === "cloud" && !cloudAuth) {
            throw new Error("Cloud credentials not found. Run 'opencode auth login' or provide --token.");
        }

        const result = await fetchQuota(source, shellRunner, cloudAuth);

        if (isJson) {
            console.log(
                JSON.stringify(
                    {
                        source: result.source,
                        timestamp: result.timestamp,
                        categories: result.categories.map((cat) => ({
                            name: cat.category,
                            remainingFraction: cat.remainingFraction,
                            remainingPercentage: parseFloat(
                                (cat.remainingFraction * 100).toFixed(1),
                            ),
                            resetTime: cat.resetTime?.toISOString() ?? null,
                            resetsIn: cat.resetTime
                                ? formatRelativeTime(cat.resetTime)
                                : null,
                        })),
                    },
                    null,
                    2,
                ),
            );
            return;
        }

        const sourceLabel = result.source === "cloud" ? "Cloud API" : "Local Server";
        console.log(
            `\nAntigravity Quotas (Source: ${sourceLabel}, ${new Date(result.timestamp).toLocaleTimeString()}):`,
        );
        console.log(
            "------------------------------------------------------------",
        );

        for (const cat of result.categories) {
            const remaining = (cat.remainingFraction * 100).toFixed(1);
            let output = `${cat.category.padEnd(20)}: ${remaining.padStart(5)}% remaining`;
            if (cat.resetTime) {
                output += ` (Resets in: ${formatRelativeTime(cat.resetTime)})`;
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
