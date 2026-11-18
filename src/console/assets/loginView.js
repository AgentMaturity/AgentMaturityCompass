// The console sign-in card (LIVE-UX-01). Pure: options in, HTML out; app.js attaches the handlers. The card says how an
// account is created for the deployment it is served from, and never invites a non-first user to run `amc user init`,
// which replaces every login in users.yaml.

const DEMO_BANNER = '<p class="banner">Local demo mode creates a no-login session on loopback only. If this screen remains after startup, refresh the page once.</p>';
// The "no account yet" steps, collapsed under the form so a beginner sees what AMC is and the sign-in fields first.
const LOCAL_HINT = `<ol>
          <li>Ask an OWNER of this workspace to run <code>amc user add --username &lt;you&gt; --role &lt;role&gt;</code> in its folder.</li>
          <li>They tell you your username and password.</li>
          <li>Sign in above.</li>
        </ol>
        <p class="muted">Brand-new workspace with no accounts at all? In the terminal where you ran <code>amc up</code>, create the first account once with
        <code>amc user init --username &lt;you&gt;</code>. It replaces any existing logins, so never run it on a workspace that has accounts.</p>`;
// A host login alone is answered 403 "membership required" on /w/<id>/: the membership grant is the second step.
const HOST_HINT = `<ol>
          <li>Ask the host administrator to create your host login with
          <code>amc host user add --dir &lt;hostDir&gt; --username &lt;you&gt; --password-file &lt;file&gt;</code>.</li>
          <li>Ask them to grant it this workspace with
          <code>amc host membership grant --dir &lt;hostDir&gt; --username &lt;you&gt; --workspace &lt;id&gt; --role &lt;role&gt;</code>
          (the id follows /w/ in this page's address).</li>
          <li>Sign in above.</li>
        </ol>`;
const NO_ACCOUNT = "No console account exists yet in this workspace. In the terminal where you ran amc up, run "
  + "amc user init --username <you> (asks for a password), then sign in here.";

/** The card's markup. demoMode keeps the demo banner and names no command; hostMode is a /w/<id>/ console. */
export function loginCardHtml({ demoMode = false, hostMode = false } = {}) {
  return `
    <div class="card auth-card">
      <img class="auth-logo" src="./assets/icons/compass.svg" alt="" width="56" height="56" />
      <h2>Sign in to Compass Console</h2>
      <p class="auth-lead">Build, run and check AI agents for regulated work.</p>
      ${demoMode ? DEMO_BANNER : ""}
      <form id="loginForm" method="post">
        <label for="loginUser">Username</label>
        <input id="loginUser" name="username" autocomplete="username" required />
        <label for="loginPass">Password</label>
        <input id="loginPass" name="password" type="password" autocomplete="current-password" required />
        <details class="auth-advanced">
          <summary>Advanced: pairing code</summary>
          <label for="pairCode">Pairing code (LAN mode only)</label>
          <input id="pairCode" name="pairingCode" autocomplete="off" />
          <p class="muted">Only needed when this console runs in LAN mode and an OWNER gave you a code.</p>
        </details>
        <button id="loginBtn" type="submit">Sign in</button>
      </form>
      ${demoMode ? "" : `<details class="auth-help">
        <summary>No account yet? How to get one</summary>
        ${hostMode ? HOST_HINT : LOCAL_HINT}
      </details>`}
      <div class="auth-more">
      <details>
        <summary>Emergency: use admin token</summary>
        <p class="muted">For emergencies only: the admin token lets someone with terminal access in when username and password sign-in is not possible.</p>
        <div class="row wrap">
          <input id="adminTokenInput" type="password" placeholder="x-amc-admin-token" aria-label="Admin token" />
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
    </div>
  `;
}

// Studio answers "invalid credentials" for every refusal (wrong password, revoked account, unreadable users file),
// so this one message names both causes and never says which accounts exist.
const WRONG_PASSWORD = "Sign-in failed: the user name or password is wrong, or this account cannot sign in (ask the workspace owner). "
  + "Check both and try again. If you forgot the password, the workspace owner can set a new one in a terminal in the "
  + "workspace folder with amc user password <your user name>.";

/** The status line after a failed sign-in: Studio's "no users.yaml" and wrong-password replies become plain next steps; any other error is shown as is. */
export function loginFailureText(message) {
  if (String(message).includes("users config missing")) return NO_ACCOUNT;
  if (String(message) === "invalid credentials") return WRONG_PASSWORD;
  return `Sign-in failed: ${message}`;
}

/** The page to open after sign-in (M9): a console page name with an optional query, so `./<next>` cannot leave the console. */
export function safeNextPage(raw) {
  const value = typeof raw === "string" ? raw : "";
  return /^[A-Za-z][\w-]*(?:\?[\w%=&.,:+-]*)?$/.test(value) && !/^login(?:\?|$)/.test(value) ? value : null;
}
