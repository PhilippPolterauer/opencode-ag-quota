#!/usr/bin/env node

// src/cli.ts
import { execSync } from "node:child_process";

// src/index.ts
import * as http from "node:http";
import * as https from "node:https";
var API_ENDPOINTS = {
  GET_USER_STATUS: "/exa.language_server_pb.LanguageServerService/GetUserStatus"
};
function makeRequest(port, csrfToken, path, body) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const options = {
      hostname: "127.0.0.1",
      port,
      path,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(payload),
        "X-Codeium-Csrf-Token": csrfToken,
        "Connect-Protocol-Version": "1"
      },
      timeout: 2000
    };
    const handleResponse = (response) => {
      let data = "";
      response.on("data", (chunk) => {
        data += chunk.toString();
      });
      response.on("end", () => {
        try {
          resolve(JSON.parse(data));
        } catch {
          reject(new Error("JSON parse error"));
        }
      });
    };
    const req = https.request({ ...options, rejectUnauthorized: false }, handleResponse);
    req.on("error", () => {
      const reqHttp = http.request(options, handleResponse);
      reqHttp.on("error", (err) => reject(err));
      reqHttp.write(payload);
      reqHttp.end();
    });
    req.write(payload);
    req.end();
  });
}
async function fetchAntigravityStatus(runShell) {
  let procOutput = "";
  try {
    procOutput = await runShell('ps aux | grep -E "csrf_token|language_server" | grep -v grep');
  } catch {
    procOutput = "";
  }
  const lines = procOutput.split(`
`);
  let csrfToken = "";
  let cmdLinePort = 0;
  for (const line of lines) {
    const csrfMatch = line.match(/--csrf_token[=\s]+([\w-]+)/i);
    if (csrfMatch?.[1])
      csrfToken = csrfMatch[1];
    const portMatch = line.match(/--extension_server_port[=\s]+(\d+)/i);
    if (portMatch?.[1])
      cmdLinePort = parseInt(portMatch[1], 10);
    if (csrfToken && cmdLinePort)
      break;
  }
  if (!csrfToken) {
    throw new Error("Antigravity CSRF token not found. Is the Language Server running?");
  }
  let netstatOutput = "";
  try {
    netstatOutput = await runShell('ss -tlnp | grep -E "language_server|opencode|node"');
  } catch {
    netstatOutput = "";
  }
  const portMatches = netstatOutput.match(/:(\d+)/g);
  let ports = portMatches ? portMatches.map((p) => parseInt(p.replace(":", ""), 10)) : [];
  if (cmdLinePort && !ports.includes(cmdLinePort)) {
    ports.unshift(cmdLinePort);
  }
  ports = Array.from(new Set(ports));
  if (ports.length === 0) {
    throw new Error("No listening ports found for Antigravity. Check if the server is active.");
  }
  let userStatus = null;
  let lastError = null;
  for (const p of ports) {
    try {
      const resp = await makeRequest(p, csrfToken, API_ENDPOINTS.GET_USER_STATUS, { metadata: { ideName: "opencode" } });
      if (resp?.userStatus) {
        userStatus = resp.userStatus;
        break;
      }
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e));
      continue;
    }
  }
  if (!userStatus) {
    throw new Error(`Could not communicate with Antigravity API. ${lastError?.message ?? ""}`);
  }
  return {
    userStatus,
    timestamp: Date.now()
  };
}
function formatRelativeTime(targetDate) {
  const now = new Date;
  const diffMs = targetDate.getTime() - now.getTime();
  if (diffMs <= 0)
    return "now";
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMins / 60);
  const remainingMins = diffMins % 60;
  if (diffHours > 0) {
    return `${diffHours}h ${remainingMins}m`;
  }
  return `${diffMins}m`;
}

// src/cli.ts
var CATEGORY_NAMES = {
  GEMINI_FLASH: "Gemini Flash",
  GEMINI_PRO: "Gemini Pro",
  CLAUDE_GPT: "Claude/GPT/OSS"
};
var MODEL_KEYWORDS = {
  flash: "flash",
  gemini: "gemini"
};
function determineCategory(label) {
  const lowerLabel = label.toLowerCase();
  if (lowerLabel.includes(MODEL_KEYWORDS.flash)) {
    return CATEGORY_NAMES.GEMINI_FLASH;
  }
  if (lowerLabel.includes(MODEL_KEYWORDS.gemini)) {
    return CATEGORY_NAMES.GEMINI_PRO;
  }
  return CATEGORY_NAMES.CLAUDE_GPT;
}
var shellRunner = async (cmd) => execSync(cmd).toString();
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
    const { userStatus, timestamp } = await fetchAntigravityStatus(shellRunner);
    const modelConfigs = userStatus.cascadeModelConfigData?.clientModelConfigs || [];
    const groups = {};
    for (const model of modelConfigs) {
      const { quotaInfo, label } = model;
      const remainingFraction = quotaInfo?.remainingFraction;
      const modelQuota = typeof remainingFraction === "number" && Number.isFinite(remainingFraction) ? remainingFraction : 0;
      const category = determineCategory(label || model.modelName || "");
      const group = groups[category] ??= {
        quota: 1,
        resetTime: null,
        label: category
      };
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
      console.log(JSON.stringify({
        timestamp,
        categories: Object.values(groups).map((g) => ({
          name: g.label,
          remainingFraction: g.quota,
          remainingPercentage: parseFloat((g.quota * 100).toFixed(1)),
          resetTime: g.resetTime,
          resetsIn: g.resetTime ? formatRelativeTime(new Date(g.resetTime)) : null
        }))
      }, null, 2));
      return;
    }
    console.log(`
Antigravity Quotas (Retrieved at: ${new Date(timestamp).toLocaleTimeString()}):`);
    console.log("------------------------------------------------------------");
    const sortedCategories = Object.keys(groups).sort();
    for (const catName of sortedCategories) {
      const group = groups[catName];
      const remaining = (group.quota * 100).toFixed(1);
      let output = `${catName.padEnd(20)}: ${remaining.padStart(5)}% remaining`;
      if (group.resetTime) {
        output += ` (Resets in: ${formatRelativeTime(new Date(group.resetTime))})`;
      }
      console.log(output);
    }
    console.log("");
  } catch (error) {
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
