#!/usr/bin/env node

require('dotenv').config();

console.log('HelpCrunch Export Configuration Check\n');
console.log('=====================================');

const requiredVars = [
    'HELPCRUNCH_API_KEY',
    'HELPCRUNCH_API_SECRET', 
    'HELPCRUNCH_ORGANIZATION_ID'
];

const optionalVars = [
    'FROM_DATE',
    'OUTPUT_FILE'
];

let allRequired = true;

console.log('Required Configuration:');
for (const varName of requiredVars) {
    const value = process.env[varName];
    if (value) {
        console.log(`✓ ${varName}: ${value.substring(0, 8)}...`);
    } else {
        console.log(`✗ ${varName}: NOT SET`);
        allRequired = false;
    }
}

console.log('\nOptional Configuration:');
for (const varName of optionalVars) {
    const value = process.env[varName];
    if (value) {
        console.log(`✓ ${varName}: ${value}`);
    } else {
        const defaults = {
            'FROM_DATE': '2024-01-01',
            'OUTPUT_FILE': 'exported_chats.json'
        };
        console.log(`○ ${varName}: using default (${defaults[varName]})`);
    }
}

console.log('\n=====================================');

if (allRequired) {
    console.log('✓ Configuration is complete! You can run the export with:');
    console.log('  npm start');
} else {
    console.log('✗ Configuration is incomplete. Please:');
    console.log('  1. Copy .env.example to .env');
    console.log('  2. Fill in the missing required values');
    console.log('  3. Run this check again with: node config-check.js');
}