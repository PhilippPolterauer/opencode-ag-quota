
import { loadConfig } from "./packages/ag-quota/src/config";
import { QuotaPlugin } from "./packages/opencode-ag-quota/src/plugin";

console.log("Loading config...");
const config = loadConfig(process.cwd());
console.log("Config loaded:", config);

console.log("Checking QuotaPlugin...");
if (typeof QuotaPlugin !== "function") {
    console.error("QuotaPlugin is not a function!");
    process.exit(1);
}
console.log("QuotaPlugin is a function.");
