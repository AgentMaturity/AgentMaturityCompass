import { createReadStream, statSync } from "node:fs";
import { extname, basename } from "node:path";
import { createHash } from "node:crypto";
import { pipeline } from "node:stream/promises";

// Supported model formats for security scanning
const SUPPORTED_FORMATS = new Set([
  ".pkl", ".pickle",     // Pickle files
  ".pth", ".pt",         // PyTorch
  ".onnx",               // ONNX
  ".safetensors",        // SafeTensors
  ".h5", ".hdf5",        // Keras/HDF5
  ".pb",                 // TensorFlow
  ".tflite",             // TensorFlow Lite
  ".joblib",             // Scikit-learn
  ".bin",                // Generic binary models
  ".model",              // Generic model files
  ".weights",            // Weight files
  ".ckpt",               // Checkpoint files
]);

// Known malicious patterns and indicators
const MALICIOUS_PATTERNS = {
  // Code execution indicators
  codeExecution: [
    /eval\s*\(/gi,
    /exec\s*\(/gi,
    /__import__\s*\(/gi,
    /subprocess\./gi,
    /os\.system/gi,
    /shell=True/gi,
    /pickle\.loads/gi,
    /marshal\.loads/gi,
  ],
  
  // Network indicators
  networkAccess: [
    /urllib\.request/gi,
    /requests\./gi,
    /socket\./gi,
    /http[s]?:\/\//gi,
    /ftp:\/\//gi,
    /telnet/gi,
  ],
  
  // File system access
  fileSystemAccess: [
    /open\s*\(/gi,
    /file\s*\(/gi,
    /\.write\s*\(/gi,
    /\.read\s*\(/gi,
    /os\.remove/gi,
    /shutil\./gi,
  ],
  
  // Embedded secrets/keys
  secrets: [
    /-----BEGIN [A-Z ]+-----/gi,
    /[A-Za-z0-9+/]{40,}={0,2}/g, // Base64 patterns
    /[0-9a-f]{32,}/gi,            // Hex patterns
    /sk-[A-Za-z0-9]{48}/gi,       // OpenAI API keys
    /xoxb-[0-9]+-[0-9]+-[0-9]+-[a-z0-9]{32}/gi, // Slack tokens
  ],
  
  // Archive exploits
  archiveExploits: [
    /\.\.\/\.\.\//gi,             // Path traversal
    /\.\.\\\.\.\\]/gi,            // Windows path traversal
    /\/etc\/passwd/gi,
    /\/proc\/self/gi,
  ],
};

export interface ModelScanThreat {
  type: 'code_execution' | 'network_access' | 'file_system' | 'embedded_secrets' | 'archive_exploit' | 'suspicious_size' | 'unknown_format';
  severity: 'critical' | 'high' | 'medium' | 'low';
  description: string;
  evidence?: string;
  offset?: number;
}

export interface ModelScanResult {
  filePath: string;
  format: string;
  fileSize: number;
  sha256: string;
  threats: ModelScanThreat[];
  riskLevel: 'safe' | 'low' | 'medium' | 'high' | 'critical';
  scanDurationMs: number;
}

export interface ModelScanOptions {
  maxFileSize?: number;        // Default: 100MB
  deepScan?: boolean;          // Scan file contents, not just metadata
  includeHashes?: boolean;     // Include file hashes
  timeoutMs?: number;          // Scan timeout
}

const DEFAULT_OPTIONS: Required<ModelScanOptions> = {
  maxFileSize: 100 * 1024 * 1024, // 100MB
  deepScan: true,
  includeHashes: true,
  timeoutMs: 30000, // 30 seconds
};

export async function scanModelFile(filePath: string, options: ModelScanOptions = {}): Promise<ModelScanResult> {
  const startTime = Date.now();
  const opts = { ...DEFAULT_OPTIONS, ...options };
  
  const threats: ModelScanThreat[] = [];
  
  try {
    const stats = statSync(filePath);
    const fileSize = stats.size;
    const format = detectFormat(filePath);
    
    // Check file size
    if (fileSize > opts.maxFileSize) {
      threats.push({
        type: 'suspicious_size',
        severity: 'medium',
        description: `File size (${Math.round(fileSize / 1024 / 1024)}MB) exceeds recommended limit (${Math.round(opts.maxFileSize / 1024 / 1024)}MB)`,
      });
    }
    
    // Check format support
    if (format === 'unknown') {
      threats.push({
        type: 'unknown_format',
        severity: 'low',
        description: `Unknown or unsupported model format: ${extname(filePath)}`,
      });
    }
    
    let sha256 = '';
    if (opts.includeHashes) {
      sha256 = await computeFileHash(filePath);
    }
    
    // Deep scan file contents
    if (opts.deepScan && fileSize < opts.maxFileSize) {
      const contentThreats = await scanFileContents(filePath, opts.timeoutMs);
      threats.push(...contentThreats);
    }
    
    const riskLevel = calculateRiskLevel(threats);
    const scanDurationMs = Date.now() - startTime;
    
    return {
      filePath,
      format,
      fileSize,
      sha256,
      threats,
      riskLevel,
      scanDurationMs,
    };
    
  } catch (error) {
    const scanDurationMs = Date.now() - startTime;
    return {
      filePath,
      format: 'error',
      fileSize: 0,
      sha256: '',
      threats: [{
        type: 'unknown_format',
        severity: 'high',
        description: `Scan failed: ${error instanceof Error ? error.message : String(error)}`,
      }],
      riskLevel: 'high',
      scanDurationMs,
    };
  }
}

function detectFormat(filePath: string): string {
  const ext = extname(filePath).toLowerCase();
  
  if (['.pkl', '.pickle'].includes(ext)) return 'pickle';
  if (['.pth', '.pt'].includes(ext)) return 'pytorch';
  if (ext === '.onnx') return 'onnx';
  if (ext === '.safetensors') return 'safetensors';
  if (['.h5', '.hdf5'].includes(ext)) return 'keras';
  if (ext === '.pb') return 'tensorflow';
  if (ext === '.tflite') return 'tensorflow_lite';
  if (ext === '.joblib') return 'scikit_learn';
  if (['.bin', '.model', '.weights', '.ckpt'].includes(ext)) return 'generic_binary';
  
  return 'unknown';
}

async function computeFileHash(filePath: string): Promise<string> {
  const hash = createHash('sha256');
  const stream = createReadStream(filePath);
  
  await pipeline(stream, hash);
  return hash.digest('hex');
}

async function scanFileContents(filePath: string, timeoutMs: number): Promise<ModelScanThreat[]> {
  const threats: ModelScanThreat[] = [];
  
  try {
    // Read file in chunks to avoid memory issues
    const stream = createReadStream(filePath, { highWaterMark: 64 * 1024 });
    const chunks: Buffer[] = [];
    let totalSize = 0;
    const maxScanSize = 10 * 1024 * 1024; // 10MB max for content scanning
    
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('Scan timeout')), timeoutMs);
    });
    
    const scanPromise = new Promise<void>((resolve, reject) => {
      stream.on('data', (chunk: string | Buffer) => {
        const buffer = typeof chunk === 'string' ? Buffer.from(chunk) : chunk;
        totalSize += buffer.length;
        if (totalSize > maxScanSize) {
          stream.destroy();
          resolve();
          return;
        }
        chunks.push(buffer);
      });
      
      stream.on('end', resolve);
      stream.on('error', reject);
    });
    
    await Promise.race([scanPromise, timeoutPromise]);
    
    if (chunks.length > 0) {
      const content = Buffer.concat(chunks);
      const contentStr = content.toString('utf8', 0, Math.min(content.length, 1024 * 1024)); // 1MB string limit
      
      // Scan for malicious patterns
      threats.push(...scanForPatterns(contentStr, content));
    }
    
  } catch (error) {
    // Content scanning failed, but don't fail the entire scan
    threats.push({
      type: 'unknown_format',
      severity: 'low',
      description: `Content scan failed: ${error instanceof Error ? error.message : String(error)}`,
    });
  }
  
  return threats;
}

function scanForPatterns(contentStr: string, contentBuffer: Buffer): ModelScanThreat[] {
  const threats: ModelScanThreat[] = [];
  
  // Check for code execution patterns
  for (const pattern of MALICIOUS_PATTERNS.codeExecution) {
    const matches = contentStr.match(pattern);
    if (matches) {
      threats.push({
        type: 'code_execution',
        severity: 'critical',
        description: 'Potential code execution detected in model file',
        evidence: matches[0],
      });
    }
  }
  
  // Check for network access patterns
  for (const pattern of MALICIOUS_PATTERNS.networkAccess) {
    const matches = contentStr.match(pattern);
    if (matches) {
      threats.push({
        type: 'network_access',
        severity: 'high',
        description: 'Network access code detected in model file',
        evidence: matches[0],
      });
    }
  }
  
  // Check for file system access
  for (const pattern of MALICIOUS_PATTERNS.fileSystemAccess) {
    const matches = contentStr.match(pattern);
    if (matches) {
      threats.push({
        type: 'file_system',
        severity: 'high',
        description: 'File system access detected in model file',
        evidence: matches[0],
      });
    }
  }
  
  // Check for embedded secrets
  for (const pattern of MALICIOUS_PATTERNS.secrets) {
    const matches = contentStr.match(pattern);
    if (matches) {
      threats.push({
        type: 'embedded_secrets',
        severity: 'medium',
        description: 'Potential embedded secrets or keys detected',
        evidence: matches[0].substring(0, 50) + '...', // Truncate for safety
      });
    }
  }
  
  // Check for archive exploits
  for (const pattern of MALICIOUS_PATTERNS.archiveExploits) {
    const matches = contentStr.match(pattern);
    if (matches) {
      threats.push({
        type: 'archive_exploit',
        severity: 'high',
        description: 'Potential path traversal or archive exploit detected',
        evidence: matches[0],
      });
    }
  }
  
  return threats;
}

function calculateRiskLevel(threats: ModelScanThreat[]): 'safe' | 'low' | 'medium' | 'high' | 'critical' {
  if (threats.length === 0) return 'safe';
  
  const severities = threats.map(t => t.severity);
  
  if (severities.includes('critical')) return 'critical';
  if (severities.includes('high')) return 'high';
  if (severities.includes('medium')) return 'medium';
  if (severities.includes('low')) return 'low';
  
  return 'safe';
}

export function isModelFile(filePath: string): boolean {
  const ext = extname(filePath).toLowerCase();
  return SUPPORTED_FORMATS.has(ext);
}

export function getSupportedFormats(): string[] {
  return Array.from(SUPPORTED_FORMATS).sort();
}