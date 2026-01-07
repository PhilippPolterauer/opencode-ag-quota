# ag-quota

Antigravity quota fetching library and CLI for checking your Windsurf/Codeium quota usage.

## Installation

```bash
npm install -g ag-quota
```

## CLI Usage

```bash
# Display quotas (auto-detects source)
ag-quota

# Force cloud source
ag-quota --source=cloud

# Force local source
ag-quota --source=local

# Output as JSON
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

### JSON Output

```bash
ag-quota --json
```

```json
{
  "source": "cloud",
  "timestamp": 1767735298099,
  "categories": [
    {
      "name": "Claude/GPT",
      "remainingFraction": 0.833,
      "remainingPercentage": 83.3,
      "resetTime": "2026-01-07T13:20:23.000Z",
      "resetsIn": "3h 58m"
    },
    {
      "name": "Flash",
      "remainingFraction": 1.0,
      "remainingPercentage": 100.0,
      "resetTime": "2026-01-07T13:32:12.000Z",
      "resetsIn": "4h 10m"
    },
    {
      "name": "Pro",
      "remainingFraction": 0.95,
      "remainingPercentage": 95.0,
      "resetTime": "2026-01-07T13:13:23.000Z",
      "resetsIn": "3h 51m"
    }
  ]
}
```

## Library Usage

### Unified Quota Fetching (Recommended)

```typescript
import { fetchQuota, type QuotaSource } from 'ag-quota';

// For local source, provide a shell runner
const shellRunner = async (cmd: string) => {
  const { execSync } = await import('node:child_process');
  return execSync(cmd).toString();
};

// Fetch quota (auto mode tries cloud first, falls back to local)
const result = await fetchQuota('auto', shellRunner);

console.log(`Source: ${result.source}`);
for (const cat of result.categories) {
  console.log(`${cat.category}: ${(cat.remainingFraction * 100).toFixed(1)}%`);
}
```

### Cloud-Only Fetching

```typescript
import { fetchCloudQuota, hasCloudCredentials } from 'ag-quota';

if (hasCloudCredentials()) {
  const result = await fetchCloudQuota();
  console.log(`Account: ${result.account.email}`);
  for (const model of result.models) {
    const quota = model.quotaInfo?.remainingFraction ?? 0;
    console.log(`${model.label}: ${(quota * 100).toFixed(1)}%`);
  }
}
```

### Local Server Fetching

```typescript
import { fetchAntigravityStatus, formatRelativeTime } from 'ag-quota';

const shellRunner = async (cmd: string) => {
  const { execSync } = await import('node:child_process');
  return execSync(cmd).toString();
};

const { userStatus, timestamp } = await fetchAntigravityStatus(shellRunner);

const configs = userStatus.cascadeModelConfigData?.clientModelConfigs || [];
for (const model of configs) {
  const quota = model.quotaInfo?.remainingFraction ?? 0;
  const resetTime = model.quotaInfo?.resetTime;
  console.log(`${model.label}: ${(quota * 100).toFixed(1)}%`);
}
```

## Configuration

Create a config file at `.opencode/ag-quota.json` or `~/.config/opencode/ag-quota.json`:

```json
{
  "quotaSource": "auto",
  "format": "{category}: {percent}% ({resetIn})",
  "separator": " | ",
  "displayMode": "all",
  "alwaysAppend": true
}
```

### Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `quotaSource` | `"cloud"` \| `"local"` \| `"auto"` | `"auto"` | Where to fetch quota data from |
| `format` | string | `"{category}: {percent}% ({resetIn})"` | Format string with placeholders |
| `separator` | string | `" \| "` | Separator between categories |
| `displayMode` | `"all"` \| `"current"` | `"all"` | Show all quotas or only current model |
| `alwaysAppend` | boolean | `true` | Always show quota info even when unavailable |

### Quota Sources

- `cloud` - Fetch from Google Cloud Code API (requires `opencode auth login`)
- `local` - Fetch from local Windsurf/Antigravity language server process
- `auto` - Try cloud first, fallback to local (default, recommended)

### Format Placeholders

- `{category}` - Category name (Flash, Pro, Claude/GPT)
- `{percent}` - Quota percentage (e.g., "85.5")
- `{resetIn}` - Relative time until reset (e.g., "2h 30m")
- `{resetAt}` - Absolute reset time (e.g., "10:30 PM")
- `{model}` - Current model ID

## Requirements

- Node.js >= 18
- For cloud mode: `opencode auth login` (via [opencode-antigravity-auth](https://github.com/NoeFabris/opencode-antigravity-auth))
- For local mode: Windsurf/Codeium Language Server running

## Acknowledgments

Cloud quota fetching based on:
- [opencode-antigravity-auth](https://github.com/NoeFabris/opencode-antigravity-auth) by [@NoeFabris](https://github.com/NoeFabris)
- [vscode-antigravity-cockpit](https://github.com/jlcodes99/vscode-antigravity-cockpit) by [@jlcodes99](https://github.com/jlcodes99)

## License

ISC
