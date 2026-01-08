# ag-quota

Antigravity quota fetching library + CLI to inspect your Antigravity quota usage.

This package is **not** affiliated with or endorsed by Opencode. If you want the Opencode integration, install the plugin package `opencode-ag-quota` from this repo.

## Installation

```bash
npm install -g ag-quota
```

## CLI

```bash
# Auto mode (tries cloud first, falls back to local)
ag-quota

# Force cloud source (uses opencode auth credentials)
ag-quota --source=cloud

# Force local source (requires language server running)
ag-quota --source=local

# JSON output for scripts
ag-quota --json
```

### Example Output

```
Antigravity Quotas (Source: Cloud API, 10:34:53 PM):
------------------------------------------------------------
Claude/GPT          :  83.3% remaining (Resets in: 3h 58m)
Flash               : 100.0% remaining (Resets in: 3h 34m)
Pro                 :  95.0% remaining (Resets in: 55m)
```

## Library

### Unified Quota Fetching (Recommended)

```ts
import { fetchQuota } from "ag-quota";

const shellRunner = async (cmd: string) => {
  const { execSync } = await import("node:child_process");
  return execSync(cmd).toString();
};

const result = await fetchQuota("auto", shellRunner);

console.log(`Source: ${result.source}`);
for (const cat of result.categories) {
  console.log(`${cat.category}: ${(cat.remainingFraction * 100).toFixed(1)}%`);
}
```

### Cloud-Only Fetching

```ts
import { fetchCloudQuota, hasCloudCredentials } from "ag-quota";

if (await hasCloudCredentials()) {
  const token = process.env.AG_ACCESS_TOKEN;
  const projectId = process.env.AG_PROJECT_ID;
  if (!token) throw new Error("Set AG_ACCESS_TOKEN");

  const result = await fetchCloudQuota(token, projectId);
  console.log(`Account: ${result.account.email}`);
}
```

### Local Server Fetching

```ts
import { fetchAntigravityStatus } from "ag-quota";

const shellRunner = async (cmd: string) => {
  const { execSync } = await import("node:child_process");
  return execSync(cmd).toString();
};

const { userStatus } = await fetchAntigravityStatus(shellRunner);
const configs = userStatus.cascadeModelConfigData?.clientModelConfigs || [];
for (const model of configs) {
  const quota = model.quotaInfo?.remainingFraction ?? 0;
  console.log(`${model.label ?? model.modelName}: ${(quota * 100).toFixed(1)}%`);
}
```

## Plugin Configuration Notes

The CLI/library does not read Opencode config files. The Opencode plugin reads:

- Project: `.opencode/ag-quota.json`
- Global: `~/.config/opencode/ag-quota.json`

See the repo root `README.md` for plugin configuration, and the full defaults in `ag-quota.json`.

## Requirements

- Node.js >= 18
- Cloud mode: `opencode auth login` credentials available
- Local mode: Antigravity language server running

## Acknowledgments

Cloud quota fetching based on:
- [opencode-antigravity-auth](https://github.com/NoeFabris/opencode-antigravity-auth) by [@NoeFabris](https://github.com/NoeFabris)
- [vscode-antigravity-cockpit](https://github.com/jlcodes99/vscode-antigravity-cockpit) by [@jlcodes99](https://github.com/jlcodes99)

## License

ISC
