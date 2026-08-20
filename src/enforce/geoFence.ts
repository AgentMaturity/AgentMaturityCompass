import { emitGuardEvent } from './evidenceEmitter.js';
export interface GeoLocation {
  ip?: string;
  lat?: number;
  lon?: number;
  region?: string;
}

export interface GeoPolicy {
  allowedRegions?: string[];
  blockedRegions?: string[];
}

export interface GeoFenceResult {
  allowed: boolean;
  region: string;
  reason?: string;
}

const IP_REGION_MAP: Array<{ prefix: string; region: string }> = [
  { prefix: '3.', region: 'US' }, { prefix: '4.', region: 'US' }, { prefix: '8.', region: 'US' },
  { prefix: '13.', region: 'US' }, { prefix: '18.', region: 'US' }, { prefix: '34.', region: 'US' },
  { prefix: '35.', region: 'US' }, { prefix: '44.', region: 'US' }, { prefix: '52.', region: 'US' },
  { prefix: '54.', region: 'US' }, { prefix: '63.', region: 'US' }, { prefix: '64.', region: 'US' },
  { prefix: '65.', region: 'US' }, { prefix: '66.', region: 'US' }, { prefix: '67.', region: 'US' },
  { prefix: '68.', region: 'US' }, { prefix: '69.', region: 'US' }, { prefix: '70.', region: 'US' },
  { prefix: '71.', region: 'US' }, { prefix: '72.', region: 'US' }, { prefix: '73.', region: 'US' },
  { prefix: '74.', region: 'US' }, { prefix: '75.', region: 'US' }, { prefix: '76.', region: 'US' },
  { prefix: '77.', region: 'EU' }, { prefix: '78.', region: 'EU' }, { prefix: '79.', region: 'EU' },
  { prefix: '80.', region: 'EU' }, { prefix: '81.', region: 'EU' }, { prefix: '82.', region: 'EU' },
  { prefix: '83.', region: 'EU' }, { prefix: '84.', region: 'EU' }, { prefix: '85.', region: 'EU' },
  { prefix: '86.', region: 'APAC' }, { prefix: '87.', region: 'EU' }, { prefix: '88.', region: 'EU' },
  { prefix: '89.', region: 'EU' }, { prefix: '90.', region: 'EU' }, { prefix: '91.', region: 'APAC' },
  { prefix: '92.', region: 'EU' }, { prefix: '93.', region: 'APAC' }, { prefix: '94.', region: 'EU' },
  { prefix: '95.', region: 'EU' }, { prefix: '96.', region: 'US' },
  { prefix: '103.', region: 'APAC' }, { prefix: '110.', region: 'APAC' },
  { prefix: '112.', region: 'APAC' }, { prefix: '113.', region: 'APAC' },
  { prefix: '114.', region: 'APAC' }, { prefix: '115.', region: 'APAC' },
  { prefix: '116.', region: 'APAC' }, { prefix: '117.', region: 'APAC' },
  { prefix: '118.', region: 'APAC' }, { prefix: '119.', region: 'APAC' },
  { prefix: '120.', region: 'APAC' }, { prefix: '121.', region: 'APAC' },
  { prefix: '122.', region: 'APAC' }, { prefix: '123.', region: 'APAC' },
  { prefix: '124.', region: 'APAC' }, { prefix: '125.', region: 'APAC' },
  { prefix: '126.', region: 'APAC' },
  { prefix: '150.', region: 'APAC' }, { prefix: '151.', region: 'APAC' },
  { prefix: '175.', region: 'APAC' }, { prefix: '180.', region: 'APAC' },
  { prefix: '182.', region: 'APAC' }, { prefix: '183.', region: 'APAC' },
  { prefix: '202.', region: 'APAC' }, { prefix: '203.', region: 'APAC' },
  { prefix: '210.', region: 'APAC' }, { prefix: '211.', region: 'APAC' },
  { prefix: '212.', region: 'EU' }, { prefix: '213.', region: 'EU' },
  { prefix: '217.', region: 'EU' },
];

function ipToRegion(ip: string): string {
  for (const { prefix, region } of IP_REGION_MAP) {
    if (ip.startsWith(prefix)) return region;
  }
  return 'UNKNOWN';
}

export function checkGeoFence(location: GeoLocation, policy: GeoPolicy): GeoFenceResult {
  let region = location.region || 'UNKNOWN';

  if (region === 'UNKNOWN' && location.ip) {
    region = ipToRegion(location.ip);
  }

  if (region === 'UNKNOWN' && location.lat !== undefined && location.lon !== undefined) {
    if (location.lat > 24 && location.lat < 50 && location.lon > -130 && location.lon < -60) region = 'US';
    else if (location.lat > 35 && location.lat < 72 && location.lon > -10 && location.lon < 40) region = 'EU';
    else if (location.lat > -50 && location.lat < 60 && location.lon > 60 && location.lon < 180) region = 'APAC';
  }

  if (policy.blockedRegions && policy.blockedRegions.includes(region)) {
        const __e28Allowed = false;
    emitGuardEvent({ agentId: 'system', moduleCode: 'E28', severity: 'medium', decision: __e28Allowed ? 'allow' : 'deny', reason: `E28 ${__e28Allowed ? 'allowed' : 'denied'}` });
    return { allowed: false, region, reason: `Region ${region} is blocked` };
  }

  if (policy.allowedRegions && policy.allowedRegions.length > 0 && !policy.allowedRegions.includes(region)) {
        const __e28Allowed = false;
    emitGuardEvent({ agentId: 'system', moduleCode: 'E28', severity: 'medium', decision: __e28Allowed ? 'allow' : 'deny', reason: `E28 ${__e28Allowed ? 'allowed' : 'denied'}` });
    return { allowed: false, region, reason: `Region ${region} not in allowed list` };
  }

    const __e28Allowed = true;
  emitGuardEvent({ agentId: 'system', moduleCode: 'E28', severity: 'medium', decision: __e28Allowed ? 'allow' : 'deny', reason: `E28 ${__e28Allowed ? 'allowed' : 'denied'}` });
  return { allowed: true, region };
}