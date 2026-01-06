import * as http from 'http';
import { spawn } from 'child_process';

const CSRF_TOKEN = 'mock-csrf-token-12345';
const PORT = 46367;

const mockResponse = {
  userStatus: {
    cascadeModelConfigData: {
      clientModelConfigs: [
        {
          modelName: 'antigravity-google-pro',
          label: 'Gemini 3 Pro (High)',
          quotaInfo: { remainingFraction: 0.85, resetTime: new Date(Date.now() + 3600000).toISOString() }
        },
        {
          modelName: 'antigravity-gemini-3-flash',
          label: 'Gemini 3 Flash',
          quotaInfo: { remainingFraction: 0.42, resetTime: new Date(Date.now() + 7200000).toISOString() }
        },
        {
          modelName: 'claude-sonnet-4.5',
          label: 'Claude Sonnet 4.5',
          quotaInfo: { remainingFraction: 0.05, resetTime: new Date(Date.now() + 600000).toISOString() }
        }
      ]
    }
  }
};

const server = http.createServer((req, res) => {
  // Check for the CSRF token header
  if (req.headers['x-codeium-csrf-token'] !== CSRF_TOKEN) {
    res.writeHead(403);
    res.end('Forbidden: Invalid CSRF Token');
    return;
  }

  if (req.method === 'POST' && req.url?.includes('GetUserStatus')) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(mockResponse));
  } else {
    res.writeHead(404);
    res.end();
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`🚀 Mock Antigravity Server running at http://127.0.0.1:${PORT}`);
  console.log(`🔑 Use CSRF Token: ${CSRF_TOKEN}`);
  console.log(`\nTo allow discovery, this process identifies as "language_server" in ps.`);
  
  // We name the process so "ps aux | grep language_server" finds it
  // In a real test, you'd run this script:
  // tsx src/mock-ag-server.ts --csrf_token mock-csrf-token-12345
});

// Keep the process alive and mimic the command line arguments
// for discovery logic to work
process.title = 'language_server';
