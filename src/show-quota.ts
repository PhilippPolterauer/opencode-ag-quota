/*
 * MIT License
 *
 * Copyright (c) 2026 Philipp
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */

import { execSync } from 'child_process';
import { fetchAntigravityStatus, formatRelativeTime, type ShellRunner } from './quota-service.js';

const CATEGORY_NAMES = {
  GEMINI_FLASH: 'Gemini Flash',
  GEMINI_PRO: 'Gemini Pro',
  CLAUDE_GPT: 'Claude/GPT/OSS'
};

const MODEL_KEYWORDS = {
  flash: 'flash',
  gemini: 'gemini'
};

function determineCategory(label: string): string {
  const lowerLabel = label.toLowerCase();
  if (lowerLabel.includes(MODEL_KEYWORDS.flash)) { return CATEGORY_NAMES.GEMINI_FLASH; }
  if (lowerLabel.includes(MODEL_KEYWORDS.gemini)) { return CATEGORY_NAMES.GEMINI_PRO; }
  return CATEGORY_NAMES.CLAUDE_GPT;
}

const shellRunner: ShellRunner = async (cmd: string) => execSync(cmd).toString();

async function run() {
  const isJson = process.argv.includes('--json');
  
  try {
    const { userStatus, timestamp } = await fetchAntigravityStatus(shellRunner);

    const modelConfigs = userStatus.cascadeModelConfigData?.clientModelConfigs || [];
    const groups: Record<string, { quota: number; resetTime: string | null; label: string }> = {};

    for (const model of modelConfigs) {
      const { quotaInfo, label } = model;
      const remainingFraction = quotaInfo?.remainingFraction;
      const modelQuota = typeof remainingFraction === 'number' && Number.isFinite(remainingFraction) ? remainingFraction : 0;
      const category = determineCategory(label || model.modelName || '');
      
      const group = groups[category] ??= { quota: 1, resetTime: null, label: category };
      if (modelQuota < group.quota) {
        group.quota = modelQuota;
      }

      const resetTimeStr = quotaInfo?.resetTime;
      if (typeof resetTimeStr === 'string' && resetTimeStr.length > 0) {
        if (group.resetTime === null || resetTimeStr < group.resetTime) {
          group.resetTime = resetTimeStr;
        }
      }
    }

    if (isJson) {
      console.log(JSON.stringify({
        timestamp,
        categories: Object.values(groups).map(g => ({
          name: g.label,
          remainingFraction: g.quota,
          remainingPercentage: parseFloat((g.quota * 100).toFixed(1)),
          resetTime: g.resetTime,
          resetsIn: g.resetTime ? formatRelativeTime(new Date(g.resetTime)) : null
        }))
      }, null, 2));
      return;
    }

    console.log(`\n📊 Antigravity Quotas (Retrieved at: ${new Date(timestamp).toLocaleTimeString()}):`);
    console.log('------------------------------------------------------------');
    
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
    console.log('');

  } catch (error: any) {
    if (isJson) {
      console.log(JSON.stringify({ error: error.message }, null, 2));
    } else {
      console.error('Error:', error.message);
    }
    process.exit(1);
  }
}

run();
