#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import os from 'os';
import { logger } from './utils.js';

const CONFIG_PATHS = [
  // Cursor (Windows, Mac, Linux)
  path.join(os.homedir(), 'AppData', 'Roaming', 'Cursor', 'User', 'global_mcp_settings.json'),
  path.join(os.homedir(), 'Library', 'Application Support', 'Cursor', 'User', 'global_mcp_settings.json'),
  path.join(os.homedir(), '.config', 'Cursor', 'User', 'global_mcp_settings.json'),
  
  // VS Code (Standard MCP settings location - checking standard settings.json as fallback)
  path.join(os.homedir(), 'AppData', 'Roaming', 'Code', 'User', 'settings.json'),
  path.join(os.homedir(), 'Library', 'Application Support', 'Code', 'User', 'settings.json'),
  path.join(os.homedir(), '.config', 'Code', 'User', 'settings.json')
];

const ATLAS_CONFIG = {
  "command": "npx",
  "args": [
    "-y",
    "atlas-pipeline-mcp"
  ],
  "env": {
    "OLLAMA_BASE_URL": "http://localhost:11434"
  },
  "disabled": false,
  "alwaysAllow": []
};

function main() {
  console.log('🚀 Atlas MCP Auto-Setup');
  console.log('Searching for IDE configurations...');

  let found = false;

  for (const configPath of CONFIG_PATHS) {
    if (fs.existsSync(configPath)) {
      try {
        console.log(`\nFound config: ${configPath}`);
        const content = fs.readFileSync(configPath, 'utf8');
        let config = JSON.parse(content);

        // Handle Cursor's global_mcp_settings.json structure
        if (configPath.includes('global_mcp_settings.json')) {
            if (!config.mcpServers) config.mcpServers = {};
            config.mcpServers['atlas'] = ATLAS_CONFIG;
        } 
        // Handle VS Code's settings.json structure
        else {
             if (!config['mcp.servers']) config['mcp.servers'] = {};
             config['mcp.servers']['atlas'] = ATLAS_CONFIG;
        }

        fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
        console.log('✅ Successfully injected Atlas MCP configuration!');
        found = true;
      } catch (e) {
        console.error(`❌ Failed to update ${configPath}:`, e);
      }
    }
  }

  if (!found) {
    console.log('\n⚠️  No supported IDE configuration files found.');
    console.log('Please assume manual configuration (see README).');
    console.log('Supported IDEs: Cursor, VS Code (Standard installed paths)');
  } else {
    console.log('\n✨ Setup complete! Please restart your IDE to start using Atlas Tools.');
  }
}

main();
