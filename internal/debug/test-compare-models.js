#!/usr/bin/env node

// Test script to verify the amc compare command works with model names
const { exec } = require('child_process');
const path = require('path');

console.log('Testing amc compare command with model names...');

// Test with help flag first
exec('node dist/cli.js compare --help', { cwd: __dirname }, (error, stdout, stderr) => {
  if (error) {
    console.error('Error running help:', error);
    return;
  }
  
  console.log('Help output:');
  console.log(stdout);
  
  if (stderr) {
    console.log('Stderr:', stderr);
  }
});

// Test model detection logic
const isRunId = (item) => {
  return /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(item) ||
         /^run_\d+_[a-f0-9]+$/i.test(item) ||
         /^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}/.test(item);
};

console.log('\nTesting model detection logic:');
console.log('gpt-4 is run ID:', isRunId('gpt-4')); // should be false
console.log('claude-3-opus is run ID:', isRunId('claude-3-opus')); // should be false
console.log('gemini-pro is run ID:', isRunId('gemini-pro')); // should be false
console.log('12345678-1234-1234-1234-123456789012 is run ID:', isRunId('12345678-1234-1234-1234-123456789012')); // should be true
console.log('run_1234567890_abc123 is run ID:', isRunId('run_1234567890_abc123')); // should be true
console.log('2024-03-11T10-30-45 is run ID:', isRunId('2024-03-11T10-30-45')); // should be true