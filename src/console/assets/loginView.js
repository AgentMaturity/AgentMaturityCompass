// The console sign-in card (LIVE-UX-01). Pure: options in, HTML out; app.js attaches the handlers. The card says how an
// account is created for the deployment it is served from, and never invites a non-first user to run `amc user init`,
// which replaces every login in users.yaml.

const DEMO_BANNER = '<p class="banner">Local demo mode creates a no-login session on loopback only. If this screen remains after startup, refresh once or use the emergency admin token.</p>';
const LOCAL_HINT = "No account yet? Ask an OWNER of this workspace to run <code>amc user add --username &lt;you&gt; --role &lt;role&gt;</code> in its folder. "
  + "On a brand-new workspace, the first account is created once with <code>amc user init --username &lt;you&gt;</code> "
  + "(it replaces any existing logins, so never run it on a workspace that has accounts).";
// A host login alone is answered 403 "membership required" on /w/<id>/: the membership grant is the second step.
const HOST_HINT = "No account yet? Ask the host administrator to create your host login with "
  + "<code>amc host user add --dir &lt;hostDir&gt; --username &lt;you&gt; --password-file &lt;file&gt;</code> and to grant it this workspace with "
  + "<code>amc host membership grant --dir &lt;hostDir&gt; --username &lt;you&gt; --workspace &lt;id&gt; --role &lt;role&gt;</code> "
  + "(the id follows /w/ in this page's address).";
const NO_ACCOUNT = "No console account exists yet in this workspace. In the terminal where you ran amc up, run "
  + "amc user init --username <you> (asks for a password), then sign in here.";

/** The card's markup. demoMode keeps the demo banner and names no command; hostMode is a /w/<id>/ console. */
export function loginCardHtml({ demoMode = false, hostMode = false } = {}) {
  return `
    <div class="card auth-card">
      <div class="studio-kicker">AMC Studio access</div>
      <h2>AMC Studio Login</h2>
      ${demoMode ? DEMO_BANNER : `<p class="muted">${hostMode ? HOST_HINT : LOCAL_HINT}</p>`}
      <p class="muted">Login with username/password. Admin token fallback is available for emergency CLI access.</p>
      <form id="loginForm" method="post">
        <label for="loginUser">Username</label>
        <input id="loginUser" name="username" autocomplete="username" required />
        <label for="loginPass">Password</label>
        <input id="loginPass" name="password" type="password" autocomplete="current-password" required />
        <label for="pairCode">Pairing code (LAN mode only)</label>
        <input id="pairCode" name="pairingCode" autocomplete="off" />
        <button id="loginBtn" type="submit">Login</button>
      </form>
      <details>
        <summary>Emergency: use admin token</summary>
        <div class="row wrap">
          <input id="adminTokenInput" type="password" placeholder="x-amc-admin-token" />
          <button id="adminTokenBtn" type="button" class="secondary">Use Admin Token</button>
        </div>
      </details>
      <details>
        <summary>Pair another device (LAN mode)</summary>
        <p class="muted">The QR code is this console's login address for a phone on the same network; pairing needs LAN mode (<code>amc studio lan enable</code>) and an OWNER account.</p>
        <div class="row wrap">
          <button id="pairCodeCreateBtn" type="button" class="secondary">Create Pairing Code</button>
          <span class="muted">OWNER role required</span>
        </div>
        <pre id="authOut" class="muted" aria-live="polite"></pre>
        <div id="pairQr" class="card"></div>
      </details>
    </div>
  `;
}

/** The status line after a failed sign-in: Studio's "no users.yaml" reply becomes the next step; any other error is shown as is. */
export function loginFailureText(message) {
  return String(message).includes("users config missing") ? NO_ACCOUNT : `Login failed: ${message}`;
}

/** The page to open after sign-in (M9): a console page name with an optional query, so `./<next>` cannot leave the console. */
export function safeNextPage(raw) {
  const value = typeof raw === "string" ? raw : "";
  return /^[A-Za-z][\w-]*(?:\?[\w%=&.,:+-]*)?$/.test(value) && !/^login(?:\?|$)/.test(value) ? value : null;
}
