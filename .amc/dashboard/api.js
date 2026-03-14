/* AMC Dashboard API Client */
const AMC_API = localStorage.getItem('amc_studio_url') || 'http://localhost:3210';

async function amcApi(path, opts = {}) {
  try {
    const res = await fetch(`${AMC_API}/api/v1${path}`, {
      headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
      ...opts
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`API ${res.status}: ${text}`);
    }

    const text = await res.text();
    if (!text) {
      return {};
    }
    try {
      return JSON.parse(text);
    } catch {
      return { raw: text };
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes('fetch') || message.includes('Failed to fetch')) {
      throw new Error('Studio not running. Start with: amc up');
    }
    throw err;
  }
}

async function amcApiWithFallback(paths, opts = {}) {
  let lastErr = null;
  for (const path of paths) {
    try {
      return await amcApi(path, opts);
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr || new Error('API request failed');
}

async function checkStudio() {
  try {
    await amcApiWithFallback(['/status', '/score/status', '/watch/status']);
    return true;
  } catch {
    return false;
  }
}

async function runQuickscore(agent = 'default') {
  return amcApiWithFallback(
    ['/quickscore', '/score/quickscore'],
    { method: 'POST', body: JSON.stringify({ agent, auto: true }) }
  );
}

async function runAssurancePack(packId, agent = 'default') {
  return amcApiWithFallback(
    ['/assurance/run', '/assurance/run-pack'],
    { method: 'POST', body: JSON.stringify({ pack: packId, packId, agent }) }
  );
}

async function assessDomain(domain, agent = 'default') {
  return amcApi('/domain/assess', { method: 'POST', body: JSON.stringify({ domain, agent }) });
}

async function applyDomain(domain, agent = 'default', opts = {}) {
  return amcApi('/domain/apply', { method: 'POST', body: JSON.stringify({ domain, agent, ...opts }) });
}

async function getGuardrails() {
  const data = await amcApiWithFallback(['/guardrails', '/guardrails/list']);
  if (Array.isArray(data)) {
    return data;
  }
  if (Array.isArray(data.guardrails)) {
    return data.guardrails;
  }
  if (data.data && Array.isArray(data.data.guardrails)) {
    return data.data.guardrails;
  }
  return [];
}

async function toggleGuardrail(id, enabled) {
  try {
    return await amcApi(`/guardrails/${id}`, { method: 'PATCH', body: JSON.stringify({ enabled }) });
  } catch {
    if (enabled) {
      return amcApi('/guardrails/enable', { method: 'POST', body: JSON.stringify({ name: id }) });
    }
    return amcApi('/guardrails/disable', { method: 'POST', body: JSON.stringify({ name: id }) });
  }
}

async function getGuide(agent = 'default') {
  return amcApiWithFallback(
    ['/guide', '/guide/quick'],
    { method: 'POST', body: JSON.stringify({ agent, quick: true }) }
  );
}

async function execCommand(command) {
  return amcApiWithFallback(
    ['/exec', '/studio/exec'],
    { method: 'POST', body: JSON.stringify({ command }) }
  );
}

/* Studio connection monitor — polls every 15s, updates status badge */
let _studioConnected = false;
let _studioMonitorId = null;

function getStudioConnected() { return _studioConnected; }

function updateStudioBadge(connected) {
  _studioConnected = connected;
  const badge = document.getElementById('studio-status');
  if (!badge) return;
  badge.textContent = connected ? '● Studio' : '○ Studio';
  badge.className = 'studio-badge ' + (connected ? 'studio-on' : 'studio-off');
  badge.title = connected
    ? `Connected to ${AMC_API}`
    : 'Studio offline — start with: amc up';
}

async function studioHeartbeat() {
  const ok = await checkStudio();
  updateStudioBadge(ok);
  return ok;
}

function startStudioMonitor(intervalMs = 15000) {
  if (_studioMonitorId) return;
  studioHeartbeat();
  _studioMonitorId = setInterval(studioHeartbeat, intervalMs);
}

function stopStudioMonitor() {
  if (_studioMonitorId) { clearInterval(_studioMonitorId); _studioMonitorId = null; }
}

window.AMC_API = AMC_API;
window.amcApi = amcApi;
window.execCommand = execCommand;
window.checkStudio = checkStudio;
window.runQuickscore = runQuickscore;
window.runAssurancePack = runAssurancePack;
window.assessDomain = assessDomain;
window.applyDomain = applyDomain;
window.getGuardrails = getGuardrails;
window.toggleGuardrail = toggleGuardrail;
window.getGuide = getGuide;
window.getStudioConnected = getStudioConnected;
window.startStudioMonitor = startStudioMonitor;
window.stopStudioMonitor = stopStudioMonitor;
