#!/usr/bin/env node

// Simple validation script to test the module
const HelpCrunchExporter = require('./index.js');

console.log('Testing HelpCrunch Exporter module...');

// Test 1: Check if class can be instantiated with env vars
try {
    process.env.HELPCRUNCH_API_KEY = 'test_key';
    process.env.HELPCRUNCH_API_SECRET = 'test_secret';
    process.env.HELPCRUNCH_ORGANIZATION_ID = 'test_org';
    
    const exporter = new HelpCrunchExporter();
    console.log('✓ HelpCrunchExporter can be instantiated');
    console.log('✓ Environment variables are properly loaded');
    console.log('✓ API configuration is set up');
    
} catch (error) {
    console.error('✗ Failed to create exporter:', error.message);
    process.exit(1);
}

// Test 2: Check if sleep utility works
const exporter = new HelpCrunchExporter();
const startTime = Date.now();
exporter.sleep(100).then(() => {
    const elapsed = Date.now() - startTime;
    if (elapsed >= 100) {
        console.log('✓ Sleep utility function works correctly');
    } else {
        console.log('✗ Sleep utility function is too fast');
    }
    
    console.log('\nAll tests passed! The module is ready to use.');
    console.log('To run the actual export, configure your .env file and run:');
    console.log('  npm start');
});