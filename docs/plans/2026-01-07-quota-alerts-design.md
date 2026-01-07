# Design: Enhanced Quota Display & Alerts

## 1. Overview
Enhance the Opencode Quota Display plugin to provide a less intrusive, more informative, and rate-limit-safe experience. Key changes include switching to background polling, adding low-quota alerts, and refining the visual display.

## 2. Requirements

### 2.1. Visuals
- **Marker:** Change from `--- AG Quota ---` to `> AG Quota:`.
- **Formatting:** Display the quota line as a markdown blockquote (prefixed with `>`).
- **Urgency:** If a quota category is below 10%, append a red circle emoji `🔴` to that category text.
- **Initial Connection:** Show a detailed toast upon connection: "Connected via [Source] ([Category]: [Percent]%, ...)".

### 2.2. Architecture (Polling)
- **Background Fetch:** Do NOT fetch quota on every message.
- **Polling Loop:** Fetch quota in the background every 30 seconds (configurable).
- **Caching:** Store the latest quota result in memory.
- **Message Hook:** The text completion hook should only *read* the cached quota value to append it, ensuring zero latency impact on message generation.

### 2.3. Alerts
- **Thresholds:** Configurable list of percentages (e.g., `[0.2, 0.1, 0.05]`).
- **Logic:** Check thresholds during the background fetch.
- **Trigger:** If the *lowest* quota category drops below a threshold that hasn't been alerted yet for this session/period, trigger a toast.
- **Combined Warning:** Send one combined toast for the most critical status, not multiple toasts.

## 3. Configuration Updates (`ag-quota`)

Add new fields to `QuotaConfig` interface in `packages/ag-quota/src/config.ts`:

```typescript
export interface QuotaConfig {
    // ... existing ...
    /**
     * Array of percentage thresholds (0.0 - 1.0) to trigger low quota alerts.
     * @default [0.2, 0.1, 0.05]
     */
    alertThresholds?: number[];

    /**
     * Interval in milliseconds to fetch quota data in the background.
     * @default 30000 (30 seconds)
     */
    pollingInterval?: number;
}
```

## 4. Implementation Plan (`opencode-ag-quota`)

### 4.1. State Management
Move state into a more structured object within the plugin closure:

```typescript
interface PluginState {
    quota: UnifiedQuotaResult | null;
    lastAlertLevel: number; // The last threshold triggered (e.g., 0.1)
    isConnected: boolean;
    currentSource: "cloud" | "local" | null;
}
```

### 4.2. Polling Loop
Replace the current `startConnectionChecker` with a robust `startPollingLoop`:
- Run immediately on init, then `setInterval`.
- Fetch quota.
- Update `state.quota`.
- Run `checkAlerts(state.quota)`.
- Handle errors (update connection status, maybe backoff).

### 4.3. Alert Logic (`checkAlerts`)
- Find the category with the minimum remaining fraction.
- Iterate through `alertThresholds` (descending).
- If `minFraction < threshold` AND `state.lastAlertLevel > threshold`:
    - Show Toast: `⚠️ Low Quota: [Category] is at [Percent]%`
    - Update `state.lastAlertLevel = threshold`.
- If quota goes back up (reset), reset `lastAlertLevel`.

### 4.4. Display Helper
Update `updateQuotaMessage` to use the new blockquote format:
- Format: `> AG Quota: Flash: 90% | Pro: 9% 🔴`
- Regex match: `/\n\n> AG Quota:[\s\S]*?$/` (simplified anchor to end of message or specific pattern).

## 5. Testing strategy
- **Unit Tests:** Update `config.test.ts` for new fields.
- **Integration Tests:** Update `output.test.ts` to mock the background poller (or manually trigger it) and assert the new text format.
