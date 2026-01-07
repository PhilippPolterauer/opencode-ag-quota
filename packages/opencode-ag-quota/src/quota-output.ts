export const QUOTA_SEPARATOR = "--- AG Quota ---";

/**
 * Check whether quota should be appended to the output.
 */
export function shouldAppendQuota(outputText: string): boolean {
    return !outputText.includes(QUOTA_SEPARATOR);
}
