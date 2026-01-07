#!/usr/bin/env node
var __defProp = Object.defineProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, {
      get: all[name],
      enumerable: true,
      configurable: true,
      set: (newValue) => all[name] = () => newValue
    });
};
var __esm = (fn, res) => () => (fn && (res = fn(fn = 0)), res);

// src/cloud.ts
var exports_cloud = {};
__export(exports_cloud, {
  fetchCloudQuota: () => fetchCloudQuota
});
async function fetchAvailableModels(accessToken, projectId) {
  const payload = projectId ? { project: projectId } : {};
  let lastError = null;
  const headers = {
    ...CLOUDCODE_HEADERS,
    Authorization: `Bearer ${accessToken}`
  };
  for (const endpoint of CLOUDCODE_ENDPOINTS) {
    try {
      const url = `${endpoint}/v1internal:fetchAvailableModels`;
      const response = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(payload)
      });
      if (response.status === 401) {
        throw new Error("Authorization expired or invalid.");
      }
      if (response.status === 403) {
        throw new Error("Access forbidden (403). Check your account permissions.");
      }
      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Cloud Code API error ${response.status}: ${text.slice(0, 200)}`);
      }
      return await response.json();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (lastError.message.includes("Authorization") || lastError.message.includes("forbidden") || lastError.message.includes("invalid_grant")) {
        throw lastError;
      }
    }
  }
  throw lastError || new Error("All Cloud Code API endpoints failed");
}
async function fetchCloudQuota(accessToken, projectId) {
  if (!accessToken) {
    throw new Error("Access token is required for cloud quota fetching");
  }
  const response = await fetchAvailableModels(accessToken, projectId);
  const models = [];
  if (response.models) {
    for (const [modelKey, info] of Object.entries(response.models)) {
      if (!info.quotaInfo)
        continue;
      models.push({
        modelName: info.model || modelKey,
        label: info.displayName || modelKey,
        quotaInfo: {
          remainingFraction: info.quotaInfo.remainingFraction ?? 0,
          resetTime: info.quotaInfo.resetTime
        }
      });
    }
  }
  return {
    account: {
      projectId
    },
    models,
    timestamp: Date.now()
  };
}
var CLOUDCODE_ENDPOINTS, CLOUDCODE_HEADERS;
var init_cloud = __esm(() => {
  CLOUDCODE_ENDPOINTS = [
    "https://daily-cloudcode-pa.sandbox.googleapis.com",
    "https://autopush-cloudcode-pa.sandbox.googleapis.com",
    "https://cloudcode-pa.googleapis.com"
  ];
  CLOUDCODE_HEADERS = {
    "Content-Type": "application/json",
    "User-Agent": "antigravity/1.11.5 windows/amd64",
    "X-Goog-Api-Client": "google-cloud-sdk vscode_cloudshelleditor/0.1",
    "Client-Metadata": '{"ideType":"IDE_UNSPECIFIED","platform":"PLATFORM_UNSPECIFIED","pluginType":"GEMINI"}'
  };
});

// src/cli.ts
import { execSync } from "node:child_process";

// src/index.ts
init_cloud();
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
function categorizeModel(label) {
  const lowerLabel = label.toLowerCase();
  if (lowerLabel.includes("flash")) {
    return "Flash";
  }
  if (lowerLabel.includes("gemini") || lowerLabel.includes("pro")) {
    return "Pro";
  }
  return "Claude/GPT";
}
function groupModelsByCategory(models) {
  const categories = {};
  for (const model of models) {
    const label = model.label || model.modelName || "";
    const category = categorizeModel(label);
    const fraction = model.quotaInfo?.remainingFraction ?? 0;
    const resetTime = model.quotaInfo?.resetTime ? new Date(model.quotaInfo.resetTime) : null;
    if (!categories[category] || fraction < categories[category].remainingFraction) {
      categories[category] = { remainingFraction: fraction, resetTime };
    }
  }
  const result = [];
  for (const cat of ["Flash", "Pro", "Claude/GPT"]) {
    if (categories[cat]) {
      result.push({
        category: cat,
        remainingFraction: categories[cat].remainingFraction,
        resetTime: categories[cat].resetTime
      });
    }
  }
  return result;
}
async function fetchQuota(source, shellRunner, cloudAuth) {
  const { fetchCloudQuota: fetchCloudQuota2 } = await Promise.resolve().then(() => (init_cloud(), exports_cloud));
  if (source === "cloud" || source === "auto") {
    if (cloudAuth) {
      try {
        const cloudResult = await fetchCloudQuota2(cloudAuth.accessToken, cloudAuth.projectId);
        const categories2 = groupModelsByCategory(cloudResult.models);
        return {
          source: "cloud",
          categories: categories2,
          models: cloudResult.models,
          timestamp: cloudResult.timestamp
        };
      } catch (error) {
        if (source === "cloud") {
          throw error;
        }
      }
    } else if (source === "cloud") {
      throw new Error("Cloud access token not provided. Cannot fetch cloud quota.");
    }
  }
  if (!shellRunner) {
    throw new Error("Shell runner required for local quota fetching");
  }
  const localResult = await fetchAntigravityStatus(shellRunner);
  const models = localResult.userStatus.cascadeModelConfigData?.clientModelConfigs || [];
  const categories = groupModelsByCategory(models);
  return {
    source: "local",
    categories,
    models,
    timestamp: localResult.timestamp
  };
}

// src/cli-auth.ts
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
var ANTIGRAVITY_CLIENT_ID = "1071006060591-tmhssin2h21lcre235vtolojh4g403ep.apps.googleusercontent.com";
var ANTIGRAVITY_CLIENT_SECRET = "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";
var TOKEN_URL = "https://oauth2.googleapis.com/token";
function getAccountsFilePath() {
  return join(homedir(), ".config", "opencode", "antigravity-accounts.json");
}
function loadAccounts() {
  const accountsPath = getAccountsFilePath();
  try {
    const content = readFileSync(accountsPath, "utf-8");
    const data = JSON.parse(content);
    if (!data.accounts || data.accounts.length === 0) {
      throw new Error("No accounts found in antigravity-accounts.json");
    }
    return data;
  } catch (error) {
    if (error.code === "ENOENT") {
      throw new Error("Antigravity accounts file not found.");
    }
    throw error;
  }
}
async function refreshAccessToken(refreshToken) {
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams({
      client_id: ANTIGRAVITY_CLIENT_ID,
      client_secret: ANTIGRAVITY_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: "refresh_token"
    }).toString()
  });
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Token refresh failed: ${response.status} - ${errorText}`);
  }
  const data = await response.json();
  return data.access_token;
}
async function getCLICloudCredentials() {
  try {
    const accountsFile = loadAccounts();
    const activeAccount = accountsFile.accounts[accountsFile.activeIndex] ?? accountsFile.accounts[0];
    if (!activeAccount) {
      return null;
    }
    const accessToken = await refreshAccessToken(activeAccount.refreshToken);
    return {
      accessToken,
      projectId: activeAccount.projectId,
      email: activeAccount.email
    };
  } catch (error) {
    if (error instanceof Error && error.message.includes("not found")) {
      return null;
    }
    throw error;
  }
}

// src/cli.ts
var shellRunner = async (cmd) => execSync(cmd).toString();
function parseArgs() {
  const args = process.argv.slice(2);
  let source = "auto";
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
    let cloudAuth = token ? { accessToken: token, projectId } : undefined;
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
      console.log(JSON.stringify({
        source: result.source,
        timestamp: result.timestamp,
        categories: result.categories.map((cat) => ({
          name: cat.category,
          remainingFraction: cat.remainingFraction,
          remainingPercentage: parseFloat((cat.remainingFraction * 100).toFixed(1)),
          resetTime: cat.resetTime?.toISOString() ?? null,
          resetsIn: cat.resetTime ? formatRelativeTime(cat.resetTime) : null
        }))
      }, null, 2));
      return;
    }
    const sourceLabel = result.source === "cloud" ? "Cloud API" : "Local Server";
    console.log(`
Antigravity Quotas (Source: ${sourceLabel}, ${new Date(result.timestamp).toLocaleTimeString()}):`);
    console.log("------------------------------------------------------------");
    for (const cat of result.categories) {
      const remaining = (cat.remainingFraction * 100).toFixed(1);
      let output = `${cat.category.padEnd(20)}: ${remaining.padStart(5)}% remaining`;
      if (cat.resetTime) {
        output += ` (Resets in: ${formatRelativeTime(cat.resetTime)})`;
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
