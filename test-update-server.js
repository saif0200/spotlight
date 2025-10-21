#!/usr/bin/env node

import http from 'http';
import fs from 'fs';
import path from 'path';

const port = 3003;

// Create test latest.json with newer version
const testLatestJson = {
  "version": "0.1.2",
  "notes": "Test update - this is newer than current version",
  "pub_date": new Date().toISOString(),
  "platforms": {
    "darwin-x86_64": {
      "signature": "",
      "url": "http://localhost:3003/test-update-x64.dmg"
    },
    "darwin-aarch64": {
      "signature": "",
      "url": "http://localhost:3003/test-update-aarch64.dmg"
    }
  }
};

const server = http.createServer((req, res) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);

  if (req.url === '/latest.json') {
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    });
    res.end(JSON.stringify(testLatestJson, null, 2));
    console.log('📤 Served latest.json with version 0.1.2');
  } else if (req.url?.includes('test-update')) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Update files not found - this is just a test server');
    console.log('⚠️ Update file requested (expected for testing)');
  } else {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found');
  }
});

server.listen(port, () => {
  console.log(`🚀 Test update server running on http://localhost:${port}`);
  console.log(`📋 latest.json available at: http://localhost:${port}/latest.json`);
  console.log(`\n🧪 Testing auto-update:`);
  console.log(`1. Run your app with: npm run tauri dev`);
  console.log(`2. Check the console for update check logs`);
  console.log(`3. Should detect update to version 0.1.2`);
  console.log(`\n💡 To stop server: Press Ctrl+C`);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Test update server stopped');
  process.exit(0);
});