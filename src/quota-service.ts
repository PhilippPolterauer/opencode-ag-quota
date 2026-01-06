/*
 * ISC License
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
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY
 * AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
 * INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM
 * LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR
 * OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR
 * PERFORMANCE OF THIS SOFTWARE.
 */

import * as http from 'http';
import * as https from 'https';

export const API_ENDPOINTS = {
  GET_USER_STATUS: '/exa.language_server_pb.LanguageServerService/GetUserStatus'
};

export interface UserStatusResponse {
  userStatus: any;
  timestamp: number;
}

export type ShellRunner = (cmd: string) => Promise<string>;

function makeRequest<T>(port: number, csrfToken: string, path: string, body: object): Promise<T> {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const options = {
      hostname: '127.0.0.1',
      port,
      path,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
        'X-Codeium-Csrf-Token': csrfToken,
        'Connect-Protocol-Version': '1'
      },
      timeout: 2000
    };

    const handleResponse = (response: any) => {
      let data = '';
      response.on('data', (chunk: any) => { data += chunk; });
      response.on('end', () => {
        try { resolve(JSON.parse(data)); } catch { reject(new Error('JSON parse error')); }
      });
    };

    const req = https.request({ ...options, rejectUnauthorized: false }, handleResponse);
    req.on('error', (err: any) => {
      const reqHttp = http.request(options, handleResponse);
      reqHttp.on('error', () => reject(err));
      reqHttp.write(payload);
      reqHttp.end();
    });
    req.write(payload);
    req.end();
  });
}

export async function fetchAntigravityStatus(runShell: ShellRunner): Promise<UserStatusResponse> {
  // 1. Discover Antigravity Server
  let procOutput = '';
  try {
    procOutput = await runShell('ps aux | grep -E "csrf_token|language_server" | grep -v grep');
  } catch (e) {
    // If grep fails (exit code 1), it usually means no matches found.
    // We treat this as empty output.
    procOutput = '';
  }

  const lines = procOutput.split('\n');
  let csrfToken = '';
  let cmdLinePort = 0;
  
  for (const line of lines) {
    const csrfMatch = line.match(/--csrf_token[=\s]+([\w-]+)/i);
    if (csrfMatch && csrfMatch[1]) csrfToken = csrfMatch[1];
    const portMatch = line.match(/--extension_server_port[=\s]+(\d+)/i);
    if (portMatch && portMatch[1]) cmdLinePort = parseInt(portMatch[1]);
    if (csrfToken && cmdLinePort) break;
  }
  
  if (!csrfToken) {
    throw new Error('Antigravity CSRF token not found. Is the Antigravity Language Server running?');
  }

  let netstatOutput = '';
  try {
    netstatOutput = await runShell('ss -tlnp | grep -E "language_server|opencode|node"');
  } catch (e) {
    // Fallback if ss fails or finds nothing
    netstatOutput = '';
  }

  const portMatches = netstatOutput.match(/:(\d+)/g);
  let ports = portMatches ? portMatches.map((p: string) => parseInt(p.replace(':', ''))) : [];
  
  if (cmdLinePort && !ports.includes(cmdLinePort)) {
    ports.unshift(cmdLinePort);
  }

  ports = Array.from(new Set(ports));

  if (ports.length === 0) {
    throw new Error('No listening ports found for Antigravity. Check if the server is active.');
  }

  // 2. Fetch User Status
  let userStatus: any = null;
  let lastError: Error | null = null;

  for (const p of ports) {
    try {
      const resp: any = await makeRequest(p, csrfToken, API_ENDPOINTS.GET_USER_STATUS, { metadata: { ideName: 'opencode' } });
      if (resp && resp.userStatus) {
        userStatus = resp.userStatus;
        break;
      }
    } catch (e: any) { 
      lastError = e;
      continue; 
    }
  }

  if (!userStatus) {
    throw new Error(`Could not communicate with Antigravity API. ${lastError?.message || ''}`);
  }

  return {
    userStatus,
    timestamp: Date.now()
  };
}

export function formatRelativeTime(targetDate: Date): string {
  const now = new Date();
  const diffMs = targetDate.getTime() - now.getTime();
  if (diffMs <= 0) return 'now';

  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMins / 60);
  const remainingMins = diffMins % 60;

  if (diffHours > 0) {
    return `${diffHours}h ${remainingMins}m`;
  }
  return `${diffMins}m`;
}
