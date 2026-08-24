/**
 * TFast Agency Command Center — zero-build SPA.
 * All data flows through the authenticated /api/v1 surface; the server
 * enforces tenant isolation and RBAC. Provider credentials never touch
 * this code (see docs/SECURITY_MODEL.md).
 */
const API = '';
let token = localStorage.getItem('tfast_token') || '';
let clients = [];
let currentClient = null;
let currentTab = 'overview';

const $app = document.getElementById('app');

/* ── API helper ─────────────────────────────────────────── */
async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(API + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401) {
    token = '';
    localStorage.removeItem('tfast_token');
    renderLogin('Session expired — sign in again.');
    throw new Error('UNAUTHORIZED');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || data.message || res.statusText);
  return data;
}

const fmtMoney = (n) => (n == null ? '—' : '$' + Number(n).toLocaleString(undefined, { maximumFractionDigits: 0 }));
const fmtNum = (n, d = 2) => (n == null ? '—' : Number(n).toLocaleString(undefined, { maximumFractionDigits: d }));
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const icon = (name) => {
  const paths = {
    command: '<path d="M4 5h7v6H4zM13 5h7v10h-7zM4 13h7v6H4zM13 17h7v2h-7z"/>',
    clients: '<path d="M16 20v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 10a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM22 20v-2a4 4 0 0 0-3-3.87M16 2.13a4 4 0 0 1 0 7.75"/>',
    ask: '<path d="M12 3a7 7 0 0 0-7 7v2a4 4 0 0 0 4 4h1l2 4 2-4h1a4 4 0 0 0 4-4v-2a7 7 0 0 0-7-7zM9 10h.01M12 10h.01M15 10h.01"/>',
    reports: '<path d="M4 19V9M10 19V5M16 19v-7M22 19H2"/>',
  };
  return `<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${paths[name] ?? paths.command}</svg>`;
};

/* ── Login ──────────────────────────────────────────────── */
function renderLogin(message = '') {
  $app.innerHTML = `
    <div class="login-wrap">
      <div class="login-card">
        <div class="login-brand"><img src="/assets/icon.svg" alt="" /><span><strong>TFast</strong><small>Ads Manager</small></span></div>
        <div class="login-heading"><h1>Agency Command Center</h1><p>Sign in to monitor performance, investigate accounts, and approve guarded actions.</p></div>
        ${message ? `<div class="banner error" role="alert">${esc(message)}</div>` : ''}
        <form class="login-form" onsubmit="event.preventDefault(); doLogin()">
        <label for="lg-email">Email</label>
        <input id="lg-email" type="email" autocomplete="username" placeholder="admin@example.com" />
        <label for="lg-password">Password</label>
        <input id="lg-password" type="password" autocomplete="current-password" placeholder="Enter your password" />
        <div class="token-divider"><span>or use an existing token</span></div>
        <label class="sr-only" for="lg-token">Existing access token</label>
        <textarea id="lg-token" rows="3" spellcheck="false" placeholder="Paste access token"></textarea>
        <div class="login-actions">
          <button class="btn" type="submit">Sign in to workspace</button>
          <button class="btn ghost" type="button" onclick="doTokenLogin()">Use token</button>
        </div>
        </form>
        <div class="login-note"><span>Development access</span><p>Disabled server-side in production. Rotate JWT_SECRET before deployment.</p></div>
      </div>
    </div>`;
}

async function doLogin() {
  const email = document.getElementById('lg-email').value.trim();
  const password = document.getElementById('lg-password').value;
  try {
    const res = await api('/api/v1/auth/dev-login', { method: 'POST', body: { email, password } });
    token = res.token;
    localStorage.setItem('tfast_token', token);
    boot();
  } catch (err) {
    renderLogin(err.message);
  }
}

async function doTokenLogin() {
  token = document.getElementById('lg-token').value.trim();
  localStorage.setItem('tfast_token', token);
  boot();
}

/* ── Shell ──────────────────────────────────────────────── */
function shell(active, inner) {
  const tabs = [
    ['command', 'Command Center'],
    ['clients', 'Clients'],
    ['ask', 'Ask TFast AI'],
    ['reports', 'Reports'],
  ];
  $app.innerHTML = `<div class="app-shell">
    <aside class="sidebar" id="sidebar" aria-label="Primary navigation">
      <button class="brand" onclick="showCommandCenter()" aria-label="Open command center"><img src="/assets/icon.svg" alt="" /><span><span class="brand-word">T<span>Fast</span></span><small>Ads Manager</small></span></button>
      <nav>${tabs.map(([id, label]) => `<button class="${active === id ? 'active' : ''}" onclick="nav('${id}')">${icon(id)}<span>${label}</span></button>`).join('')}</nav>
      <div class="sidebar-foot"><div class="agency-avatar">TD</div><div><strong>TFast Digital</strong><span>Agency workspace</span></div></div>
    </aside><button class="sidebar-scrim" aria-label="Close navigation" onclick="toggleSidebar()"></button>
    <div class="workspace">
      <header class="utility-bar"><button class="menu-toggle" onclick="toggleSidebar()" aria-label="Toggle navigation">${icon('command')}</button><div class="workspace-label">Agency operations</div><div class="utility-actions"><span class="system-live"><i></i> Automation online</span><button class="user" onclick="logout()" title="Sign out">Sign out</button></div></header>
      <main class="main">${inner}</main>
    </div></div>`;
}

function toggleSidebar() {
  document.getElementById('sidebar')?.classList.toggle('open');
  document.body.classList.toggle('nav-open');
}

function nav(view) {
  if (view === 'command') return showCommandCenter();
  if (view === 'clients') return showClients();
  if (view === 'ask') return showAsk();
  if (view === 'reports') return showReports();
}

function logout() {
  token = '';
  localStorage.removeItem('tfast_token');
  renderLogin();
}

/* ── Command Center ─────────────────────────────────────────── */
async function showCommandCenter() {
  shell('command', '<div class="empty">Loading portfolio…</div>');
  try {
    const [portfolio, brief] = await Promise.all([
      api('/api/v1/portfolio/summary'),
      api('/api/v1/jobs/morning-brief', { method: 'POST', body: {} }),
    ]);
    const t = portfolio.totals;
    const rows = portfolio.clients.map((c) => {
      const name = clients.find((x) => x.id === c.client_id)?.name ?? c.client_id.slice(0, 8);
      return `<tr onclick="openClient('${c.client_id}')" style="cursor:pointer">
        <td>${esc(name)}</td>
        <td><span class="pill ${c.status}">${c.status}</span></td>
        <td class="muted">${esc(c.flags.join(' · '))}</td>
      </tr>`;
    }).join('');
    shell('command', `
      <div class="page-head"><div><h1>Agency Command Center</h1><p>Live performance, automation, and decisions across every client.</p></div><button class="btn ghost" onclick="showCommandCenter()">Refresh data</button></div>
      <section class="automation-rail" aria-label="Automation status">
        <div><strong>Automation desk</strong><span>Sync TikTok data, analyze it, and surface guarded actions.</span></div>
        <div class="automation-flow"><span>Connect</span><i></i><span>Sync</span><i></i><span>Analyze</span><i></i><span>Approve</span></div>
        <div class="action-row"><button class="btn" onclick="runAutomation(this)">Run full cycle</button></div>
      </section>
      <div class="cards">
        ${statCard('Spend', fmtMoney(t.spend))}
        ${statCard('Revenue', fmtMoney(t.revenue))}
        ${statCard('ROAS', fmtNum(t.roas) + '×')}
        ${statCard('Leads', fmtNum(t.leads, 0))}
        ${statCard('Qualified', fmtNum(t.qualified_leads, 0))}
        ${statCard('CPA', fmtMoney(t.cpa))}
      </div>
      <div class="panel">
        <h2>Clients <button class="btn small ghost" onclick="showClients()">Manage</button></h2>
        <table><thead><tr><th>Client</th><th>Status</th><th>Flags</th></tr></thead>
        <tbody>${rows || '<tr><td class="empty" colspan="3">No clients yet — add one in Clients.</td></tr>'}</tbody></table>
      </div>
      ${briefSections(brief)}
      <button class="btn" onclick="showCommandCenter()">↻ Refresh brief</button>`);
  } catch (err) {
    shell('command', `<div class="error">${esc(err.message)}</div>`);
  }
}

function statCard(label, value) {
  return `<div class="stat"><div class="label">${label}</div><div class="value">${value}</div></div>`;
}

function briefSections(brief) {
  const s = brief.sections ?? {};
  const defs = [
    ['critical', 'Critical'],
    ['needs_attention', 'Needs Attention'],
    ['scaling', 'Scaling Opportunities'],
    ['creative_needed', 'Creative Needed'],
    ['tracking_problems', 'Tracking Problems'],
    ['ai_recommendations', 'AI Recommendations'],
    ['pending_approvals', 'Pending Approvals'],
  ];
  return `<div class="panel"><h2># TFast Morning Brief — ${esc(brief.date ?? '')}</h2>
    <div class="tab-body">${defs.map(([key, label]) => `
      <div class="section-title">${label}</div>
      ${(s[key] ?? []).length ? `<ul class="findings">${s[key].map((f) => `<li>${esc(f)}</li>`).join('')}</ul>` : '<div class="muted">None</div>'}
    `).join('')}</div></div>`;
}

/* ── Clients ────────────────────────────────────────────── */
async function showClients() {
  shell('clients', '<div class="empty">Loading clients…</div>');
  try {
    const res = await api('/api/v1/clients');
    clients = res.clients;
    const rows = clients.map((c) => `
      <tr onclick="openClient('${c.id}')" style="cursor:pointer">
        <td><strong>${esc(c.name)}</strong></td><td class="workspace-slug">${esc(c.slug)}</td><td><span class="pill healthy">${esc(c.status)}</span></td><td class="muted">${esc(c.timezone)}</td>
        <td class="client-actions"><button class="btn small ghost" onclick="event.stopPropagation(); openClient('${c.id}')">Open workspace</button><button class="btn small" onclick="event.stopPropagation(); openClientConnections('${c.id}')">Connect TikTok</button></td>
      </tr>`).join('');
    shell('clients', `
      <div class="page-head"><div><h1>Clients</h1><p>Accounts, operating status, and scoped workspaces.</p></div><button class="btn" onclick="toggleAddClient()">Add client</button></div>
      <section class="ledger-block client-directory">
        <div class="ledger-title"><div><h2>Client directory</h2><span>${clients.length} active workspace${clients.length === 1 ? '' : 's'}</span></div><label class="table-search">Search<input placeholder="Find a client" oninput="filterClientRows(this.value)" /></label></div>
        <div id="add-form" hidden class="create-client-form">
          <label>Client name<input id="nc-name" placeholder="e.g. Northstar Retail" /></label>
          <label>Workspace slug<input id="nc-slug" placeholder="northstar-retail" /></label>
          <button class="btn" onclick="addClient()">Create workspace</button>
          <button class="btn ghost" onclick="toggleAddClient()">Cancel</button>
          <div id="add-err" class="error"></div>
        </div>
        <div class="table-scroll"><table><thead><tr><th>Name</th><th>Workspace</th><th>Status</th><th>Timezone</th><th class="actions-heading">Actions</th></tr></thead>
        <tbody>${rows || '<tr><td class="empty" colspan="5">No clients. Add a client to create a workspace.</td></tr>'}</tbody></table>
        </div></section>`);
  } catch (err) {
    shell('clients', `<div class="error">${esc(err.message)}</div>`);
  }
}

function toggleAddClient() {
  const form = document.getElementById('add-form');
  form.hidden = !form.hidden;
  if (!form.hidden) document.getElementById('nc-name')?.focus();
}

function filterClientRows(value) {
  const query = value.trim().toLowerCase();
  document.querySelectorAll('.client-directory tbody tr').forEach((row) => {
    row.hidden = query && !row.textContent.toLowerCase().includes(query);
  });
}

async function addClient() {
  const name = document.getElementById('nc-name').value.trim();
  const slug = document.getElementById('nc-slug').value.trim();
  try {
    await api('/api/v1/clients', { method: 'POST', body: { name, slug } });
    showClients();
  } catch (err) {
    document.getElementById('add-err').textContent = err.message;
  }
}

/* ── Client workspace ───────────────────────────────────────── */
function openClient(clientId) {
  currentClient = clientId;
  currentTab = 'overview';
  showClient();
}

const CLIENT_TABS = [
  ['overview', 'Overview'], ['brief', 'Performance'], ['attribution', 'Attribution'],
  ['profit', 'Profit'], ['experiments', 'Experiments'], ['approvals', 'Approvals'],
  ['research', 'Research'], ['connections', 'Connections'], ['brain', 'Client Brain'],
];

async function showClient() {
  const name = clients.find((c) => c.id === currentClient)?.name ?? currentClient;
  shell('clients', `
    <h1 style="margin-bottom:8px">${esc(name)}</h1>
    <div class="muted" style="margin-bottom:12px">${currentClient}</div>
    <div class="panel">
      <div class="tabs">${CLIENT_TABS.map(([id, label]) => `<button class="${currentTab === id ? 'active' : ''}" onclick="setTab('${id}')">${label}</button>`).join('')}</div>
      <div class="tab-body" id="client-body"><div class="empty">Loading…</div></div>
    </div>`);
  const body = document.getElementById('client-body');
  try {
    if (currentTab === 'overview') body.innerHTML = await clientOverview();
    if (currentTab === 'brief') body.innerHTML = await clientBrief();
    if (currentTab === 'attribution') body.innerHTML = await clientAttribution();
    if (currentTab === 'profit') body.innerHTML = await clientProfit();
    if (currentTab === 'experiments') body.innerHTML = await clientExperiments();
    if (currentTab === 'approvals') body.innerHTML = await clientApprovals();
    if (currentTab === 'research') body.innerHTML = await clientResearch();
    if (currentTab === 'connections') body.innerHTML = await clientConnections();
    if (currentTab === 'brain') body.innerHTML = await clientBrain();
  } catch (err) {
    body.innerHTML = `<div class="error">${esc(err.message)}</div>`;
  }
}

function setTab(tab) {
  currentTab = tab;
  showClient();
}

async function clientOverview() {
  const [brain, brief] = await Promise.all([
    api(`/api/v1/clients/${currentClient}/brain`),
    api(`/api/v1/jobs/morning-brief`, { method: 'POST', body: { client_id: currentClient } }),
  ]);
  const econ = brain.brain?.economics?.content ?? {};
  return `
    <div class="cards">
      ${statCard('Target ROAS', fmtNum(econ.target_roas) + '×')}
      ${statCard('Target CPA', fmtMoney(econ.target_cpa))}
      ${statCard('AOV', fmtMoney(econ.aov))}
      ${statCard('Monthly budget', fmtMoney(econ.monthly_budget))}
      ${statCard('Industry', esc(econ.industry ?? brain.brain?.business?.content?.industry ?? '—'))}
    </div>
    ${briefSections(brief)}`;
}

async function clientBrief() {
  const brief = await api('/api/v1/jobs/morning-brief', { method: 'POST', body: { client_id: currentClient } });
  return `<h2 style="margin:0 0 12px">Performance & findings</h2>` + briefSections(brief);
}

async function clientAttribution() {
  const res = await api(`/api/v1/clients/${currentClient}/attribution?days=30`);
  const rows = res.campaigns.map((r) => `
    <tr><td>${esc(r.campaign_name)}</td><td>${r.leads}</td><td>${r.qualified}</td><td>${r.customers}</td>
    <td>${fmtMoney(r.cpl)}</td><td>${fmtMoney(r.qualified_cpl)}</td><td>${fmtMoney(r.customer_cpa)}</td></tr>`).join('');
  return `<h2 style="margin:0 0 12px">CRM attribution — judge by qualified CPL, not CPL</h2>
    <table><thead><tr><th>Campaign</th><th>Leads</th><th>Qualified</th><th>Customers</th><th>CPL</th><th>Qualified CPL</th><th>Customer CPA</th></tr></thead>
    <tbody>${rows || '<tr><td class="empty" colspan="7">No lead data yet — ingest via POST /leads or CRM sync.</td></tr>'}</tbody></table>`;
}

async function clientProfit() {
  const res = await api(`/api/v1/clients/${currentClient}/profit?days=30`);
  const rows = res.campaigns.map((r) => `
    <tr><td>${esc(r.campaign_name)}</td><td>${fmtMoney(r.revenue)}</td><td>${fmtMoney(r.ad_spend)}</td>
    <td>${fmtMoney(r.refunds)}</td><td>${fmtMoney(r.cogs)}</td><td><b>${fmtMoney(r.contribution_profit)}</b></td></tr>`).join('');
  return `<h2 style="margin:0 0 12px">Contribution profit</h2>
    <table><thead><tr><th>Campaign</th><th>Revenue</th><th>Ad spend</th><th>Refunds</th><th>COGS</th><th>Contribution profit</th></tr></thead>
    <tbody>${rows || '<tr><td class="empty" colspan="6">No purchase data yet.</td></tr>'}</tbody></table>`;
}

async function clientExperiments() {
  const res = await api(`/api/v1/clients/${currentClient}/experiments`);
  const rows = res.experiments.map((e) => `
    <tr><td>${esc(e.title)}</td><td><span class="pill info">${esc(e.status)}</span></td>
    <td class="muted">${e.result ? esc(JSON.stringify(e.result.winner ?? '—')) : '—'}</td>
    <td>${e.status === 'running' ? `<button class="btn small" onclick="evaluateExperiment('${e.id}')">Evaluate</button>` : ''}</td></tr>`).join('');
  return `<h2 style="margin:0 0 12px">Experiments</h2>
    <table><thead><tr><th>Title</th><th>Status</th><th>Winner</th><th></th></tr></thead>
    <tbody>${rows || '<tr><td class="empty" colspan="4">No experiments — create one via the API (see creative-experiments skill).</td></tr>'}</tbody></table>`;
}

async function evaluateExperiment(id) {
  try {
    const res = await api(`/api/v1/clients/${currentClient}/experiments/${id}/evaluate`, { method: 'POST', body: {} });
    alert(`Winner: ${res.winner ?? 'inconclusive'}`);
    showClient();
  } catch (err) {
    alert(err.message);
  }
}

async function clientApprovals() {
  const res = await api(`/api/v1/clients/${currentClient}/approvals`);
  const rows = res.approvals.map((a) => `
    <tr><td>${esc(a.action_type)}</td><td><span class="pill watch">pending</span></td><td>${esc(a.required_role)}</td>
    <td><button class="btn small" onclick="approve('${a.id}')">Approve & execute</button></td></tr>`).join('');
  return `<h2 style="margin:0 0 12px">Pending approvals</h2>
    <table><thead><tr><th>Action</th><th>Status</th><th>Required role</th><th></th></tr></thead>
    <tbody>${rows || '<tr><td class="empty" colspan="4">Nothing pending.</td></tr>'}</tbody></table>
    <div class="muted" style="margin-top:10px">Approval executes the STORED parameters — agents cannot change them during approval.</div>`;
}

async function approve(id) {
  try {
    const res = await api(`/api/v1/clients/${currentClient}/approvals/${id}/approve`, { method: 'POST', body: {} });
    alert(res.executed ? 'Executed ✓' : res.message);
    showClient();
  } catch (err) {
    alert(err.message);
  }
}

async function clientResearch() {
  const res = await api(`/api/v1/clients/${currentClient}/research`);
  const rows = res.items.map((i) => `
    <tr><td>${esc(i.platform)}</td><td>${esc(i.kind)}</td><td>${esc(i.external_url ?? '—')}</td></tr>`).join('');
  return `<h2 style="margin:0 0 12px">Research</h2>
    <div style="display:flex; gap:8px; margin-bottom:12px">
      <input id="rq-query" placeholder='Research query, e.g. "[competitor] ads"' style="flex:1; background:var(--card-2); border:1px solid var(--border); color:var(--text); border-radius:8px; padding:9px 10px" />
      <button class="btn" onclick="runResearch()">Run research</button>
    </div>
    <div id="rq-status" class="muted"></div>
    <table><thead><tr><th>Platform</th><th>Kind</th><th>Source</th></tr></thead>
    <tbody>${rows || '<tr><td class="empty" colspan="3">No research yet — run a query above (API Direct).</td></tr>'}</tbody></table>`;
}

async function runResearch() {
  const query = document.getElementById('rq-query').value.trim();
  if (!query) return;
  document.getElementById('rq-status').textContent = 'Researching… (API Direct → classification)';
  try {
    const res = await api(`/api/v1/clients/${currentClient}/research/run`, { method: 'POST', body: { query, limit: 15 } });
    document.getElementById('rq-status').textContent = `Collected ${res.items} items, ${res.insights} insights` + (res.skipped_classification ? ` (classification skipped: ${res.skipped_classification})` : '');
    showClient();
  } catch (err) {
    document.getElementById('rq-status').textContent = err.message;
  }
}

async function clientConnections() {
  const res = await api(`/api/v1/clients/${currentClient}/connections`);
  const rows = res.connections.map((c) => `
    <tr>
      <td>${esc(c.provider)}</td>
      <td>${esc(c.external_account_id)}</td>
      <td>${esc(c.advertiser_id ?? '—')}</td>
      <td>${esc(c.permissions.join(', '))}</td>
      <td><span class="pill ${c.status === 'active' ? 'healthy' : 'info'}">${esc(c.status)}</span></td>
      <td><button class="btn small ${c.status === 'active' ? 'danger' : ''}" onclick="toggleConnection('${c.id}', '${c.status === 'active' ? 'revoked' : 'active'}')">${c.status === 'active' ? 'Revoke' : 'Activate'}</button></td>
    </tr>`).join('');
  return `<div class="section-head"><div><h2>TikTok connections</h2><p>OAuth tokens stay encrypted on the server. Advertiser IDs are resolved by the gateway.</p></div></div>
    <div class="connection-hero">
      <div><span class="status-dot"></span><strong>Official TikTok MCP</strong><p>Recommended for reporting and guarded ad operations.</p></div>
      <div class="action-row"><button class="btn ghost" onclick="testTikTokConnection(this)">Test connection</button><button class="btn" onclick="startTikTokMcpOAuth()">Connect with OAuth</button></div>
      <div id="connection-status" class="inline-status" aria-live="polite"></div>
    </div>
    <details class="manual-connection"><summary>Advanced: add a connection manually</summary><div class="form-grid">
        <select id="cn-provider">
          <option value="tiktok">tiktok</option>
          <option value="meta">meta</option>
          <option value="google">google</option>
        </select>
        <input id="cn-ext" placeholder="External account ID" />
        <input id="cn-adv" placeholder="TikTok advertiser ID" />
        <input id="cn-ref" placeholder="Credential reference" />
        <label><input type="checkbox" id="cn-read" checked /> Read</label>
        <label><input type="checkbox" id="cn-write" /> Write</label>
        <button class="btn" onclick="addConnection()">+ Add connection</button>
      </div>
      <div id="cn-err" class="error"></div>
      <div class="muted">Enter only a server-side secret reference, never a token.</div></details>
    <div class="table-wrap"><table><thead><tr><th>Provider</th><th>Account</th><th>Advertiser</th><th>Permissions</th><th>Status</th><th></th></tr></thead>
    <tbody>${rows || '<tr><td class="empty" colspan="6">No connections — add your first TikTok account above.</td></tr>'}</tbody></table></div>`;
}

function openClientConnections(clientId) {
  currentClient = clientId;
  currentTab = 'connections';
  showClient();
}

async function testTikTokConnection(button) {
  const status = document.getElementById('connection-status');
  button.disabled = true;
  status.className = 'inline-status loading';
  status.textContent = 'Checking OAuth token and MCP tool discovery…';
  try {
    const result = await api(`/api/v1/clients/${currentClient}/tiktok/health`);
    status.className = 'inline-status success';
    status.textContent = result.message;
  } catch (err) {
    status.className = 'inline-status error';
    status.textContent = `${err.message}. Reconnect with OAuth, then test again.`;
  } finally {
    button.disabled = false;
  }
}

async function runAutomation(button) {
  button.disabled = true;
  const original = button.textContent;
  button.textContent = 'Running sync…';
  try {
    const sync = await api('/api/v1/jobs/tiktok-sync', { method: 'POST', body: { days: 30 } });
    button.textContent = 'Building brief…';
    await api('/api/v1/jobs/morning-brief', { method: 'POST', body: { include_ai_recommendations: true } });
    button.textContent = sync.errors?.length ? `Complete · ${sync.errors.length} need attention` : 'Cycle complete';
    setTimeout(() => showCommandCenter(), 900);
  } catch (err) {
    button.textContent = `Stopped: ${err.message}`;
    button.disabled = false;
    setTimeout(() => { button.textContent = original; }, 5000);
  }
}

async function startTikTokMcpOAuth() {
  try {
    const res = await api(`/api/v1/clients/${currentClient}/connections/tiktok/mcp/oauth/start`);
    const w = window.open(res.auth_url, '_blank');
    if (!w) alert('Pop-up blocked — allow pop-ups for this site and try again.');
  } catch (err) {
    alert(err.message);
  }
}

async function startTikTokOAuth() {
  try {
    const res = await api(`/api/v1/clients/${currentClient}/connections/tiktok/oauth/start`);
    const w = window.open(res.auth_url, '_blank');
    if (!w) alert('Pop-up blocked — allow pop-ups for this site and try again.');
  } catch (err) {
    alert(err.message);
  }
}

async function addConnection() {
  const provider = document.getElementById('cn-provider').value;
  const external_account_id = document.getElementById('cn-ext').value.trim();
  const advertiser_id = document.getElementById('cn-adv').value.trim() || undefined;
  const credential_reference = document.getElementById('cn-ref').value.trim() || `secret-store:${provider}-${external_account_id}`;
  const permissions = [
    ...(document.getElementById('cn-read').checked ? [`${provider}:read`] : []),
    ...(document.getElementById('cn-write').checked ? [`${provider}:write`] : []),
  ];
  if (!external_account_id) {
    document.getElementById('cn-err').textContent = 'external_account_id is required';
    return;
  }
  try {
    await api(`/api/v1/clients/${currentClient}/connections`, {
      method: 'POST',
      body: { provider, external_account_id, advertiser_id, credential_reference, permissions },
    });
    showClient();
  } catch (err) {
    document.getElementById('cn-err').textContent = err.message;
  }
}

async function toggleConnection(id, status) {
  try {
    await api(`/api/v1/clients/${currentClient}/connections/${id}/status`, { method: 'POST', body: { status } });
    showClient();
  } catch (err) {
    alert(err.message);
  }
}

async function clientBrain() {
  const res = await api(`/api/v1/clients/${currentClient}/brain`);
  const brain = res.brain ?? {};
  const sections = ['business', 'brand', 'customers', 'economics', 'advertising_history', 'competitors', 'ai_knowledge'];
  const cards = sections.map((s) => {
    const entry = brain[s];
    const content = entry?.content ?? {};
    return `<div class="panel"><h2>${s} <span class="muted">v${entry?.version ?? '—'}</span>
      <button class="btn small ghost" onclick="editBrain('${s}')">Edit</button></h2>
      <div class="tab-body"><pre class="code">${esc(JSON.stringify(content, null, 2))}</pre></div></div>`;
  }).join('');
  return `<h2 style="margin:0 0 12px">Client Brain</h2>${cards}
    <div id="brain-editor" style="display:none" class="panel">
      <h2>Edit section <span id="be-section"></span></h2>
      <div class="tab-body">
        <textarea id="be-json" class="code" style="min-height:180px"></textarea>
        <div style="margin-top:10px"><button class="btn" onclick="saveBrain()">Save</button></div>
        <div id="be-err" class="error"></div>
      </div>
    </div>`;
}

let brainSection = '';
function editBrain(section) {
  brainSection = section;
  const brain = JSON.parse(localStorage.getItem('brain_cache') || '{}');
  const content = brain[section]?.content ?? {};
  document.getElementById('brain-editor').style.display = 'block';
  document.getElementById('be-section').textContent = section;
  document.getElementById('be-json').value = JSON.stringify(content, null, 2);
  document.getElementById('brain-editor').scrollIntoView({ behavior: 'smooth' });
}

async function saveBrain() {
  try {
    const content = JSON.parse(document.getElementById('be-json').value);
    await api(`/api/v1/clients/${currentClient}/brain/${brainSection}`, { method: 'PUT', body: content });
    showClient();
  } catch (err) {
    document.getElementById('be-err').textContent = err.message;
  }
}

/* ── Ask TFast AI ───────────────────────────────────────────── */
function showAsk() {
  shell('ask', `
    <h1 style="margin-bottom:16px">Ask TFast AI</h1>
    <div class="panel"><div class="tab-body">
      <div class="chat">
        <div class="chat-log" id="chat-log">
          <div class="msg ai">I'm the TFast Agency Commander. Ask about your portfolio — e.g. "Which clients need my attention today?", "Compare TikTok performance across all accounts.", "Which clients need new creatives?"</div>
        </div>
        <div class="chat-input">
          <input id="chat-input" placeholder="Ask about the agency portfolio…" onkeydown="if(event.key==='Enter')askAI()" />
          <button class="btn" onclick="askAI()">Ask</button>
        </div>
      </div>
    </div></div>`);
}

async function askAI() {
  const input = document.getElementById('chat-input');
  const question = input.value.trim();
  if (!question) return;
  const log = document.getElementById('chat-log');
  log.insertAdjacentHTML('beforeend', `<div class="msg user">${esc(question)}</div>`);
  input.value = '';
  log.insertAdjacentHTML('beforeend', '<div class="msg ai" id="pending">Thinking…</div>');
  log.scrollTop = log.scrollHeight;
  try {
    const res = await api('/api/v1/ai/ask', { method: 'POST', body: { question } });
    document.getElementById('pending').textContent = res.answer;
  } catch (err) {
    document.getElementById('pending').textContent = 'Error: ' + err.message;
  }
}

/* ── Reports ────────────────────────────────────────────── */
async function showReports() {
  shell('reports', '<div class="empty">Loading…</div>');
  try {
    const res = await api('/api/v1/briefs');
    const rows = res.briefs.map((b) => `
      <tr><td>${esc(b.created_at)}</td><td>${esc(b.client_id ?? 'all clients')}</td>
      <td><span class="pill ${b.severity}">${esc(b.severity)}</span></td>
      <td><button class="btn small ghost" onclick="viewBrief('${b.id}')">View</button></td></tr>`).join('');
    shell('reports', `
      <h1 style="margin-bottom:16px">Reports — Morning Brief history</h1>
      <div class="panel">
        <table><thead><tr><th>Date</th><th>Client</th><th>Severity</th><th></th></tr></thead>
        <tbody>${rows || '<tr><td class="empty" colspan="4">No briefs yet.</td></tr>'}</tbody></table>
      </div>`);
  } catch (err) {
    shell('reports', `<div class="error">${esc(err.message)}</div>`);
  }
}

async function viewBrief(id) {
  try {
    const res = await api(`/api/v1/briefs/${id}`);
    const f = res.brief?.findings;
    if (f) {
      const text = Object.entries(f)
        .map(([k, v]) => `${k.toUpperCase()}
${Array.isArray(v) && v.length ? v.join('\n') : 'None'}`)
        .join('\n\n');
      alert(text.slice(0, 3000));
    }
  } catch {
    /* history view is informational */
  }
}

/* ── Boot ───────────────────────────────────────────────── */
async function boot() {
  if (!token) return renderLogin();
  try {
    await api('/api/v1/auth/session');
    const params = new URLSearchParams(window.location.search);
    const clientId = params.get('client');
    if (clientId) {
      // Deep link from OAuth callback: /?client=<id>&tab=connections&oauth=connected
      const list = await api('/api/v1/clients');
      clients = list.clients ?? list ?? [];
      currentClient = clientId;
      currentTab = CLIENT_TABS.some(([id]) => id === params.get('tab')) ? params.get('tab') : 'overview';
      await showClient();
      history.replaceState(null, '', '/');
      showOAuthBanner(params);
      return;
    }
    await showCommandCenter();
    showOAuthBanner(params);
  } catch {
    renderLogin();
  }
}

/* OAuth callback feedback: connected / denied / error banners. */
function showOAuthBanner(params) {
  if (params.get('oauth') !== 'connected' && params.get('oauth') !== 'denied' && params.get('oauth') !== 'error') return;
  let kind = 'success';
  let msg;
  if (params.get('oauth') === 'connected') {
    const n = params.get('advertisers') ?? '1';
    const provider = params.get('provider') === 'tiktok-mcp' ? 'TikTok MCP (DCR + PKCE)' : 'TikTok Marketing API';
    msg = `🔐 ${provider} connected — ${n} advertiser${n === '1' ? '' : 's'} registered as active connection(s).`;
  } else if (params.get('oauth') === 'denied') {
    kind = 'error';
    msg = '⚠️ TikTok authorization was declined — no connection was created.';
  } else {
    kind = 'error';
    const reason = params.get('reason') ?? 'OAUTH_STATE_INVALID_OR_EXPIRED';
    msg = `⚠️ That connection request already completed or expired (${reason}). Click Connect again — it will start a fresh request.`;
  }
  const banner = document.createElement('div');
  banner.className = `banner ${kind}`;
  banner.textContent = msg;
  document.querySelector('.main')?.prepend(banner);
}

boot();
