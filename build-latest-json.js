#!/usr/bin/env node

// Script to generate latest.json for Tauri updater
// Run this after building your app: node build-latest-json.js

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration - update these values for your release
const releaseConfig = {
  version: "0.1.2", // Current release version
  notes: "Auto-update configuration completed with GitHub releases integration.", // Release notes
  pub_date: new Date().toISOString(), // Current date
  platforms: {
    "darwin-x86_64": {
      signature: "", // No signature for unsigned builds
      url: "https://github.com/saif0200/spotlight/releases/download/v0.1.2/spotlight_0.1.2_x64.dmg"
    },
    "darwin-aarch64": {
      signature: "", // No signature for unsigned builds
      url: "https://github.com/saif0200/spotlight/releases/download/v0.1.2/spotlight_0.1.2_aarch64.dmg"
    }
  }
};

// Generate latest.json
const latestJson = JSON.stringify(releaseConfig, null, 2);
const outputPath = path.join(__dirname, 'latest.json');

fs.writeFileSync(outputPath, latestJson);
console.log(`Generated ${outputPath}`);
console.log('⚠️  Remember to:');
console.log('1. Update the signature values with actual signatures from your builds');
console.log('2. Upload this file to your GitHub release');
console.log('3. Upload the built app files to your GitHub release');

// Instructions for getting signatures
console.log('\n📝 To get signatures:');
console.log('After building, check the build output for .sig files');
console.log('Copy the signature values from those files into this script');
console.log('Then run: node build-latest-json.js');