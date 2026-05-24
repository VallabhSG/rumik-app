/* global fetch */
'use strict';

// ── API ──────────────────────────────────────────────────────────────────────

const API_KEY = localStorage.getItem('admin_api_key') ?? '';
if (!API_KEY) { window.location.href = '/admin/login.html'; }

async function api(method, path, body) {
  const res = await fetch(`/api${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${API_KEY}`,
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`${res.status}: ${text || res.statusText}`);
  }
  return res.json();
}

const get  = (path)        => api('GET',    path);
const post = (path, body)  => api('POST',   path, body);
const patch= (path, body)  => api('PATCH',  path, body);
const del  = (path)        => api('DELETE', path);

// ── Toast ───────────────────────────────────────────────────────────────────

function toast(msg, type = 'info') {
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.textContent = msg;
  document.getElementById('toast-container').appendChild(el);
  setTimeout(() => el.remove(), 3500);
}

// ── Modal ────────────────────────────────────────────────────────────────────

let modalResolve = null;

function openModal(title, html, confirmLabel = 'Save') {
  return new Promise((resolve) => {
    modalResolve = resolve;
    document.getElementById('modal-title').textContent = title;
    document.getElementById('modal-body').innerHTML = html;
    document.getElementById('modal-confirm').textContent = confirmLabel;
    document.getElementById('modal-overlay').classList.remove('hidden');
  });
}

function closeModal(result) {
  document.getElementById('modal-overlay').classList.add('hidden');
  if (modalResolve) { modalResolve(result); modalResolve = null; }
}

document.getElementById('modal-close').onclick   = () => closeModal(null);
document.getElementById('modal-cancel').onclick  = () => closeModal(null);
document.getElementById('modal-confirm').onclick = () => {
  closeModal({ confirmed: true });
};

// ── Tabs ─────────────────────────────────────────────────────────────────────

document.querySelectorAll('.tab').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(`panel-${btn.dataset.tab}`).classList.add('active');
    loadPanel(btn.dataset.tab);
  });
});

function loadPanel(tab) {
  if (tab === 'monitoring')  loadMonitoring();
  if (tab === 'adoption')    loadAdoption();
  if (tab === 'errors')      loadErrors(0);
  if (tab === 'flags')       loadFlags();
  if (tab === 'experiments') loadExperiments();
  if (tab === 'urls')        loadUrls();
  if (tab === 'kills')       loadKillSwitches();
  if (tab === 'releases')    loadReleases();
  if (tab === 'metrics')     loadMetrics();
  if (tab === 'audit')       loadAudit(0);
  if (tab === 'segments')    loadSegments();
  if (tab === 'results')     loadResults();
  if (tab === 'schedules')   loadSchedules();
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function fmtDate(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' });
}

function emptyState(label) {
  return `
    <div class="empty">
      <p>${label}</p>
      <small>Click "Add" to create one.</small>
    </div>`;
}

function targetingFields(existing = {}) {
  return `
    <div class="field">
      <label>Platforms (comma-separated, leave blank for all)</label>
      <input id="f-platforms" placeholder="ios, android, web"
        value="${esc(existing.platforms?.join(', ') ?? '')}">
    </div>
    <div class="field-row">
      <div class="field">
        <label>Min Version</label>
        <input id="f-minver" placeholder="1.0.0" value="${esc(existing.min_version ?? '')}">
      </div>
      <div class="field">
        <label>Max Version</label>
        <input id="f-maxver" placeholder="2.0.0" value="${esc(existing.max_version ?? '')}">
      </div>
    </div>
    <div class="field">
      <label>Rollout Percentage (0–100, blank = 100)</label>
      <input id="f-pct" type="number" min="0" max="100"
        placeholder="100" value="${esc(existing.percentage ?? '')}">
    </div>`;
}

function readTargeting() {
  const platforms = document.getElementById('f-platforms')?.value
    .split(',').map(s => s.trim()).filter(Boolean);
  const min_version = document.getElementById('f-minver')?.value.trim() || undefined;
  const max_version = document.getElementById('f-maxver')?.value.trim() || undefined;
  const pct = document.getElementById('f-pct')?.value.trim();
  const percentage = pct ? Number(pct) : undefined;
  const rule = {};
  if (platforms?.length) rule.platforms = platforms;
  if (min_version)  rule.min_version  = min_version;
  if (max_version)  rule.max_version  = max_version;
  if (percentage !== undefined) rule.percentage = percentage;
  return Object.keys(rule).length ? rule : undefined;
}

// ── Feature Flags ────────────────────────────────────────────────────────────

async function loadFlags() {
  const el = document.getElementById('flags-table');
  el.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:24px;color:var(--text-muted)">Loading…</td></tr>';
  try {
    const { data } = await get('/flags');
    if (!data.length) {
      el.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:32px;color:var(--text-muted)">No feature flags yet. Click "+ Add Flag" to create one.</td></tr>';
      return;
    }
    el.innerHTML = data.map(f => `
      <tr>
        <td><code>${esc(f.key)}</code></td>
        <td><span class="badge-${f.enabled ? 'on' : 'off'}">${f.enabled ? 'Enabled' : 'Disabled'}</span></td>
        <td>${esc(f.description || '—')}</td>
        <td>${esc(f.targeting ? JSON.stringify(typeof f.targeting === 'string' ? JSON.parse(f.targeting) : f.targeting, null, 0) : '—')}</td>
        <td>${fmtDate(f.updated_at)}</td>
        <td>
          <button class="btn btn-ghost" onclick="editFlag('${f.id}')">Edit</button>
          <button class="btn btn-danger" onclick="deleteFlag('${f.id}', '${esc(f.key)}')">Delete</button>
        </td>
      </tr>`).join('');
  } catch (e) {
    toast(e.message, 'error');
  }
}

window.editFlag = async function(id) {
  let existing = { enabled: true };
  if (id) {
    try { existing = (await get(`/flags/${id}`)).data; } catch (e) { toast(e.message, 'error'); return; }
  }
  const existingTargeting = existing.targeting ? (typeof existing.targeting === 'string' ? JSON.parse(existing.targeting) : existing.targeting) : {};
  const res = await openModal(id ? 'Edit Feature Flag' : 'New Feature Flag', `
    <div class="field">
      <label>Key <small style="color:var(--text-muted)">(snake_case)</small></label>
      <input id="f-key" placeholder="my_feature" value="${esc(existing.key ?? '')}"
        ${id ? 'readonly style="opacity:.6"' : ''}>
    </div>
    <div class="field">
      <label>Description</label>
      <input id="f-desc" placeholder="Optional" value="${esc(existing.description ?? '')}">
    </div>
    <div class="toggle-row">
      <span class="toggle-label">Enabled</span>
      <label class="toggle">
        <input id="f-enabled" type="checkbox" ${existing.enabled ? 'checked' : ''}>
        <span class="slider"></span>
      </label>
    </div>
    <hr style="border-color:var(--border);margin:16px 0">
    <p style="font-size:12px;color:var(--text-muted);margin-bottom:12px">TARGETING (optional)</p>
    ${targetingFields(existingTargeting)}`);

  if (!res?.confirmed) return;
  const key     = document.getElementById('f-key').value.trim();
  const desc    = document.getElementById('f-desc').value.trim();
  const enabled = document.getElementById('f-enabled').checked;
  const targeting = readTargeting();
  if (!key) { toast('Key is required', 'error'); return; }
  try {
    if (id) {
      await patch(`/flags/${id}`, { enabled, description: desc, targeting });
      toast('Flag updated', 'success');
    } else {
      await post('/flags', { key, enabled, description: desc, targeting });
      toast('Flag created', 'success');
    }
    loadFlags();
  } catch (e) { toast(e.message, 'error'); }
};

window.deleteFlag = async function(id, key) {
  const res = await openModal('Delete Flag', `<p>Delete flag <code>${esc(key)}</code>? This cannot be undone.</p>`, 'Delete');
  if (!res?.confirmed) return;
  try { await del(`/flags/${id}`); toast('Flag deleted'); loadFlags(); }
  catch (e) { toast(e.message, 'error'); }
};

document.getElementById('btn-add-flag').onclick = () => window.editFlag(null);

// ── Experiments ──────────────────────────────────────────────────────────────

async function loadExperiments() {
  const el = document.getElementById('experiments-table');
  el.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:24px;color:var(--text-muted)">Loading…</td></tr>';
  try {
    const { data } = await get('/experiments');
    if (!data.length) {
      el.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:32px;color:var(--text-muted)">No experiments yet. Click "+ Add Experiment" to create one.</td></tr>';
      return;
    }
    el.innerHTML = data.map(e => {
      const variants = e.variants ? (typeof e.variants === 'string' ? JSON.parse(e.variants) : e.variants) : [];
      const badgeCls = `badge-${e.status || 'draft'}`;
      return `
        <tr>
          <td><code>${esc(e.key)}</code></td>
          <td><span class="${badgeCls}">${esc(e.status || 'draft')}</span></td>
          <td>${variants.map(v => `${esc(v.id)} (${v.weight}%)`).join(', ')}</td>
          <td>${fmtDate(e.updated_at)}</td>
          <td>
            <button class="btn btn-ghost" onclick="editExperiment('${e.id}')">Edit</button>
            <button class="btn btn-danger" onclick="deleteExperiment('${e.id}', '${esc(e.key)}')">Delete</button>
          </td>
        </tr>`;
    }).join('');
  } catch (e) { toast(e.message, 'error'); }
}

window.editExperiment = async function(id) {
  let existing = { status: 'draft', variants: [{ id: 'control', weight: 50 }, { id: 'treatment', weight: 50 }] };
  if (id) {
    try {
      const { data } = await get(`/experiments/${id}`);
      existing = { ...data, variants: data.variants ? (typeof data.variants === 'string' ? JSON.parse(data.variants) : data.variants) : existing.variants };
    } catch (e) { toast(e.message, 'error'); return; }
  }
  const existingTargeting = existing.targeting ? (typeof existing.targeting === 'string' ? JSON.parse(existing.targeting) : existing.targeting) : {};
  const variantsJson = JSON.stringify(existing.variants, null, 2);
  const res = await openModal(id ? 'Edit Experiment' : 'New Experiment', `
    <div class="field">
      <label>Key</label>
      <input id="e-key" placeholder="onboarding_v2" value="${esc(existing.key ?? '')}"
        ${id ? 'readonly style="opacity:.6"' : ''}>
    </div>
    <div class="field">
      <label>Status</label>
      <select id="e-status">
        ${['draft','active','paused','completed'].map(s =>
          `<option value="${s}" ${existing.status === s ? 'selected' : ''}>${s}</option>`
        ).join('')}
      </select>
    </div>
    <div class="field">
      <label>Variants JSON (array of {id, weight})</label>
      <textarea id="e-variants" rows="5">${esc(variantsJson)}</textarea>
    </div>
    <hr style="border-color:var(--border);margin:16px 0">
    <p style="font-size:12px;color:var(--text-muted);margin-bottom:12px">TARGETING (optional)</p>
    ${targetingFields(existingTargeting)}`);

  if (!res?.confirmed) return;
  const key = document.getElementById('e-key').value.trim();
  const status = document.getElementById('e-status').value;
  let variants;
  try { variants = JSON.parse(document.getElementById('e-variants').value); }
  catch { toast('Variants must be valid JSON', 'error'); return; }
  const targeting = readTargeting();
  if (!key) { toast('Key is required', 'error'); return; }
  try {
    if (id) {
      await patch(`/experiments/${id}`, { status, variants, targeting });
      toast('Experiment updated', 'success');
    } else {
      await post('/experiments', { key, status, variants, targeting });
      toast('Experiment created', 'success');
    }
    loadExperiments();
  } catch (e) { toast(e.message, 'error'); }
};

window.deleteExperiment = async function(id, key) {
  const res = await openModal('Delete Experiment', `<p>Delete experiment <code>${esc(key)}</code>?</p>`, 'Delete');
  if (!res?.confirmed) return;
  try { await del(`/experiments/${id}`); toast('Experiment deleted'); loadExperiments(); }
  catch (e) { toast(e.message, 'error'); }
};

document.getElementById('btn-add-experiment').onclick = () => window.editExperiment(null);

// ── Dynamic URLs ──────────────────────────────────────────────────────────────

async function loadUrls() {
  const el = document.getElementById('urls-table');
  el.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:24px;color:var(--text-muted)">Loading…</td></tr>';
  try {
    const { data } = await get('/urls');
    if (!data.length) {
      el.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:32px;color:var(--text-muted)">No dynamic URLs yet. Click "+ Add URL" to create one.</td></tr>';
      return;
    }
    el.innerHTML = data.map(u => `
      <tr>
        <td><code>${esc(u.key)}</code></td>
        <td><a href="${esc(u.value)}" target="_blank" rel="noopener" style="color:var(--accent)">${esc(u.value)}</a></td>
        <td>${fmtDate(u.updated_at)}</td>
        <td>
          <button class="btn btn-ghost" onclick="editUrl('${u.id}')">Edit</button>
          <button class="btn btn-danger" onclick="deleteUrl('${u.id}', '${esc(u.key)}')">Delete</button>
        </td>
      </tr>`).join('');
  } catch (e) { toast(e.message, 'error'); }
}

window.editUrl = async function(id) {
  let existing = {};
  if (id) {
    try { existing = (await get(`/urls/${id}`)).data; } catch (e) { toast(e.message, 'error'); return; }
  }
  const existingTargeting = existing.targeting ? (typeof existing.targeting === 'string' ? JSON.parse(existing.targeting) : existing.targeting) : {};
  const res = await openModal(id ? 'Edit URL' : 'New Dynamic URL', `
    <div class="field">
      <label>Key</label>
      <input id="u-key" placeholder="api_base" value="${esc(existing.key ?? '')}"
        ${id ? 'readonly style="opacity:.6"' : ''}>
    </div>
    <div class="field">
      <label>URL</label>
      <input id="u-value" type="url" placeholder="https://..." value="${esc(existing.value ?? '')}">
    </div>
    <hr style="border-color:var(--border);margin:16px 0">
    <p style="font-size:12px;color:var(--text-muted);margin-bottom:12px">TARGETING (optional)</p>
    ${targetingFields(existingTargeting)}`);

  if (!res?.confirmed) return;
  const key = document.getElementById('u-key').value.trim();
  const value = document.getElementById('u-value').value.trim();
  const targeting = readTargeting();
  if (!key || !value) { toast('Key and URL are required', 'error'); return; }
  try {
    if (id) {
      await patch(`/urls/${id}`, { value, targeting });
      toast('URL updated', 'success');
    } else {
      await post('/urls', { key, value, targeting });
      toast('URL created', 'success');
    }
    loadUrls();
  } catch (e) { toast(e.message, 'error'); }
};

window.deleteUrl = async function(id, key) {
  const res = await openModal('Delete URL', `<p>Delete URL <code>${esc(key)}</code>?</p>`, 'Delete');
  if (!res?.confirmed) return;
  try { await del(`/urls/${id}`); toast('URL deleted'); loadUrls(); }
  catch (e) { toast(e.message, 'error'); }
};

document.getElementById('btn-add-url').onclick = () => window.editUrl(null);

// ── Kill Switches ────────────────────────────────────────────────────────────

async function loadKillSwitches() {
  const el = document.getElementById('kills-table');
  el.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:24px;color:var(--text-muted)">Loading…</td></tr>';
  try {
    const { data } = await get('/kill-switches');
    if (!data.length) {
      el.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:32px;color:var(--text-muted)">No kill switches yet. Click "+ Add Kill Switch" to create one.</td></tr>';
      return;
    }
    el.innerHTML = data.map(k => `
      <tr>
        <td><code>${esc(k.key)}</code></td>
        <td><span class="${k.active ? 'badge-active' : 'badge-off'}">${k.active ? 'ACTIVE' : 'Inactive'}</span></td>
        <td>${esc(k.reason || '—')}</td>
        <td>${fmtDate(k.updated_at)}</td>
        <td>
          <div class="ks-actions">
            ${k.active
              ? `<button class="btn btn-ghost" onclick="toggleKS('${k.id}', false, '${esc(k.key)}')">Deactivate</button>`
              : `<button class="btn btn-danger" onclick="toggleKS('${k.id}', true, '${esc(k.key)}')">Activate</button>`}
            <button class="btn btn-ghost" onclick="editKS('${k.id}')">Edit</button>
            <button class="btn btn-danger" onclick="deleteKS('${k.id}', '${esc(k.key)}')">Delete</button>
          </div>
        </td>
      </tr>`).join('');
  } catch (e) { toast(e.message, 'error'); }
}

window.toggleKS = async function(id, activate, key) {
  const action = activate ? 'activate' : 'deactivate';
  const confirmLabel = activate ? 'Activate' : 'Deactivate';
  const res = await openModal(
    `${confirmLabel} Kill Switch`,
    `<p>${activate ? 'This will immediately kill <strong>' + esc(key) + '</strong> for all users via WebSocket.' : `Deactivate kill switch <code>${esc(key)}</code>?`}</p>
     ${activate ? `<div class="field" style="margin-top:16px"><label>Reason (optional)</label><input id="ks-reason" placeholder="Reason for activation"></div>` : ''}`,
    confirmLabel
  );
  if (!res?.confirmed) return;
  const reason = activate ? document.getElementById('ks-reason')?.value.trim() : undefined;
  try {
    await post(`/kill-switches/${id}/${action}`, reason ? { reason } : {});
    toast(`Kill switch ${action}d`, activate ? 'error' : 'success');
    loadKillSwitches();
  } catch (e) { toast(e.message, 'error'); }
};

window.editKS = async function(id) {
  let existing = {};
  if (id) {
    try { existing = (await get(`/kill-switches/${id}`)).data; } catch (e) { toast(e.message, 'error'); return; }
  }
  const res = await openModal(id ? 'Edit Kill Switch' : 'New Kill Switch', `
    <div class="field">
      <label>Key</label>
      <input id="ks-key" placeholder="payments" value="${esc(existing.key ?? '')}"
        ${id ? 'readonly style="opacity:.6"' : ''}>
    </div>
    <div class="field">
      <label>Reason</label>
      <input id="ks-reason-field" placeholder="Optional" value="${esc(existing.reason ?? '')}">
    </div>`);

  if (!res?.confirmed) return;
  const key = document.getElementById('ks-key').value.trim();
  const reason = document.getElementById('ks-reason-field').value.trim();
  if (!key) { toast('Key is required', 'error'); return; }
  try {
    if (id) {
      await patch(`/kill-switches/${id}`, { reason: reason || null });
      toast('Kill switch updated', 'success');
    } else {
      await post('/kill-switches', { key, reason: reason || null });
      toast('Kill switch created', 'success');
    }
    loadKillSwitches();
  } catch (e) { toast(e.message, 'error'); }
};

window.deleteKS = async function(id, key) {
  const res = await openModal('Delete Kill Switch', `<p>Delete kill switch <code>${esc(key)}</code>?</p>`, 'Delete');
  if (!res?.confirmed) return;
  try { await del(`/kill-switches/${id}`); toast('Kill switch deleted'); loadKillSwitches(); }
  catch (e) { toast(e.message, 'error'); }
};

document.getElementById('btn-add-kill').onclick = () => window.editKS(null);

// ── Audit Log ────────────────────────────────────────────────────────────────

let auditPage = 0;
const AUDIT_LIMIT = 20;

async function loadAudit(offset = 0) {
  auditPage = offset;
  const el = document.getElementById('audit-table');
  el.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:24px;color:var(--text-muted)">Loading…</td></tr>';
  try {
    const { data, meta } = await get(`/audit?limit=${AUDIT_LIMIT}&offset=${offset}`);
    document.getElementById('audit-total').textContent = `${meta.total} entries`;
    document.getElementById('btn-audit-prev').disabled = offset === 0;
    document.getElementById('btn-audit-next').disabled = offset + AUDIT_LIMIT >= meta.total;

    if (!data.length) {
      el.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:24px;color:var(--text-muted)">No audit entries yet.</td></tr>';
      return;
    }
    el.innerHTML = data.map(a => {
      const cls = a.action === 'create' ? 'audit-create' : a.action === 'delete' ? 'audit-delete' : 'audit-update';
      let changesHtml = '—';
      if (a.changes) {
        try {
          const ch = JSON.parse(a.changes);
          changesHtml = Object.entries(ch).map(([k, v]) =>
            `<div><code>${esc(k)}</code>: ${esc(JSON.stringify(v.old))} → ${esc(JSON.stringify(v.new))}</div>`
          ).join('') || '—';
        } catch {}
      }
      return `
        <tr class="audit-row">
          <td>${fmtDate(a.created_at)}</td>
          <td>${esc(a.entity_type)}</td>
          <td>${esc(a.entity_id)}</td>
          <td><span class="audit-action ${cls}">${esc(a.action)}</span></td>
          <td style="font-size:12px">${changesHtml}</td>
        </tr>`;
    }).join('');
  } catch (e) { toast(e.message, 'error'); }
}

document.getElementById('btn-audit-prev').onclick = () => loadAudit(auditPage - AUDIT_LIMIT);
document.getElementById('btn-audit-next').onclick = () => loadAudit(auditPage + AUDIT_LIMIT);
document.getElementById('btn-refresh-audit').onclick = () => loadAudit(0);

// ── Releases ─────────────────────────────────────────────────────────────────

async function loadReleases() {
  // Current release card
  const rcBody = document.getElementById('rc-body');
  rcBody.innerHTML = '<span style="color:var(--text-muted)">Loading…</span>';
  try {
    const { data } = await get('/releases/current?channel=production');
    rcBody.innerHTML = `
      <div class="rc-item"><span>Version</span><span>${esc(data.version)}</span></div>
      <div class="rc-item"><span>Channel</span><span>${esc(data.channel)}</span></div>
      <div class="rc-item"><span>Platform</span><span>${esc(data.platform)}</span></div>
      <div class="rc-item"><span>Rollout</span><span>${data.rollout_percentage}%</span></div>
      <div class="rc-item"><span>Status</span><span><span class="badge-active-release">active</span></span></div>
      ${data.commit_sha ? `<div class="rc-item"><span>Commit</span><span style="font-family:monospace;font-size:12px">${esc(data.commit_sha.slice(0, 8))}</span></div>` : ''}
    `;
  } catch {
    rcBody.innerHTML = '<span style="color:var(--text-muted)">No active production release</span>';
  }

  // All releases table
  const el = document.getElementById('releases-table');
  el.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:24px;color:var(--text-muted)">Loading…</td></tr>';
  try {
    const { data } = await get('/releases');
    if (!data.length) {
      el.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:32px;color:var(--text-muted)">No releases yet. Click "+ New Release" to create one.</td></tr>';
      return;
    }
    el.innerHTML = data.map(r => {
      const statusCls = r.status === 'active' ? 'badge-active-release'
        : r.status === 'paused' ? 'badge-paused-release' : 'badge-rolled_back';
      const pct = r.rollout_percentage ?? 0;
      return `
        <tr>
          <td><strong>${esc(r.version)}</strong>${r.is_rollback ? ' <span style="font-size:10px;color:var(--orange)">[rollback]</span>' : ''}</td>
          <td>${esc(r.channel)}</td>
          <td>${esc(r.platform)}</td>
          <td><span class="${statusCls}">${esc(r.status)}</span></td>
          <td>
            <div class="rollout-wrap">
              <div class="rollout-bar"><div class="rollout-fill" style="width:${pct}%"></div></div>
              <span class="rollout-pct">${pct}%</span>
            </div>
          </td>
          <td style="color:var(--text-muted);font-size:12px">${fmtDate(r.created_at)}</td>
          <td>
            <div class="rel-actions">
              ${r.status === 'active' ? `<button class="btn btn-ghost" onclick="editRelease('${esc(r.id)}')">Edit</button>` : ''}
              ${r.status === 'active' ? `<button class="btn btn-ghost" onclick="pauseRelease('${esc(r.id)}', '${esc(r.version)}')">Pause</button>` : ''}
              ${r.status !== 'rolled_back' ? `<button class="btn btn-danger" onclick="rollbackRelease('${esc(r.id)}', '${esc(r.version)}')">Rollback</button>` : ''}
            </div>
          </td>
        </tr>`;
    }).join('');
  } catch (e) { toast(e.message, 'error'); }
}

window.editRelease = async function(id) {
  let existing = {};
  try { existing = (await get(`/releases/${id}`)).data; } catch (e) { toast(e.message, 'error'); return; }

  const res = await openModal('Edit Release', `
    <div class="field">
      <label>Version</label>
      <input value="${esc(existing.version)}" readonly style="opacity:.6">
    </div>
    <div class="field">
      <label>Rollout Percentage (0–100)</label>
      <input id="r-pct" type="number" min="0" max="100" value="${existing.rollout_percentage ?? 0}">
    </div>
    <div class="field">
      <label>Status</label>
      <select id="r-status">
        ${['active','paused'].map(s =>
          `<option value="${s}" ${existing.status === s ? 'selected' : ''}>${s}</option>`
        ).join('')}
      </select>
    </div>
    <div class="field">
      <label>Release Notes</label>
      <textarea id="r-notes">${esc(existing.release_notes ?? '')}</textarea>
    </div>`);

  if (!res?.confirmed) return;
  const rollout_percentage = Number(document.getElementById('r-pct').value);
  const status = document.getElementById('r-status').value;
  const release_notes = document.getElementById('r-notes').value.trim() || undefined;
  try {
    await api('PATCH', `/releases/${id}`, { rollout_percentage, status, release_notes });
    toast('Release updated', 'success');
    loadReleases();
  } catch (e) { toast(e.message, 'error'); }
};

window.pauseRelease = async function(id, version) {
  const res = await openModal('Pause Release', `<p>Pause release <strong>${esc(version)}</strong>? Devices will stop receiving this update.</p>`, 'Pause');
  if (!res?.confirmed) return;
  try {
    await api('PATCH', `/releases/${id}`, { status: 'paused' });
    toast('Release paused', 'success');
    loadReleases();
  } catch (e) { toast(e.message, 'error'); }
};

window.rollbackRelease = async function(id, version) {
  const res = await openModal('Rollback Release', `
    <p style="color:var(--red)">Mark <strong>${esc(version)}</strong> as rolled back?</p>
    <p style="margin-top:8px;font-size:13px;color:var(--text-muted)">This will mark the release as rolled_back. Devices on it will fall back to the previous release.</p>`, 'Rollback');
  if (!res?.confirmed) return;
  try {
    await del(`/releases/${id}`);
    toast('Release rolled back', 'success');
    loadReleases();
  } catch (e) { toast(e.message, 'error'); }
};

window.addRelease = async function() {
  const res = await openModal('New OTA Release', `
    <div class="field">
      <label>Version <small style="color:var(--text-muted)">(semver)</small></label>
      <input id="nr-version" placeholder="1.2.3">
    </div>
    <div class="field-row">
      <div class="field">
        <label>Channel</label>
        <select id="nr-channel">
          <option value="production">production</option>
          <option value="staging">staging</option>
          <option value="development">development</option>
        </select>
      </div>
      <div class="field">
        <label>Platform</label>
        <select id="nr-platform">
          <option value="all">all</option>
          <option value="ios">ios</option>
          <option value="android">android</option>
        </select>
      </div>
    </div>
    <div class="field">
      <label>Initial Rollout % (0 = staged off)</label>
      <input id="nr-pct" type="number" min="0" max="100" value="0">
    </div>
    <div class="field">
      <label>Commit SHA (optional)</label>
      <input id="nr-sha" placeholder="abc1234...">
    </div>
    <div class="field-row">
      <div class="field">
        <label>Min Native Version</label>
        <input id="nr-min" placeholder="1.0.0">
      </div>
      <div class="field">
        <label>Max Native Version</label>
        <input id="nr-max" placeholder="2.0.0">
      </div>
    </div>
    <div class="field">
      <label>Release Notes</label>
      <textarea id="nr-notes" placeholder="What changed in this release?"></textarea>
    </div>`);

  if (!res?.confirmed) return;
  const version = document.getElementById('nr-version').value.trim();
  const channel = document.getElementById('nr-channel').value;
  const platform = document.getElementById('nr-platform').value;
  const rollout_percentage = Number(document.getElementById('nr-pct').value);
  const commit_sha = document.getElementById('nr-sha').value.trim() || undefined;
  const min_native_version = document.getElementById('nr-min').value.trim() || undefined;
  const max_native_version = document.getElementById('nr-max').value.trim() || undefined;
  const release_notes = document.getElementById('nr-notes').value.trim() || undefined;

  if (!version) { toast('Version is required', 'error'); return; }
  try {
    await post('/releases', { version, channel, platform, rollout_percentage, commit_sha, min_native_version, max_native_version, release_notes });
    toast('Release created', 'success');
    loadReleases();
  } catch (e) { toast(e.message, 'error'); }
};

document.getElementById('btn-add-release').onclick = () => window.addRelease();

document.getElementById('btn-pause-all').onclick = async () => {
  const res = await openModal('Pause Production', `<p>Pause all active production releases? This stops OTA delivery immediately.</p>`, 'Pause All');
  if (!res?.confirmed) return;
  try {
    const { data } = await post('/releases/current/pause', { channel: 'production', reason: 'manual admin pause' });
    toast(`Paused ${data.paused_count} release(s)`, 'success');
    loadReleases();
  } catch (e) { toast(e.message, 'error'); }
};

// ── Crash Metrics ─────────────────────────────────────────────────────────────

async function loadMetrics() {
  // Current card
  try {
    const { data } = await get('/crash-rate/current');
    const rate = data.crash_rate;
    const pct = (rate * 100).toFixed(2);
    const cls = rate < 0.01 ? 'metric-ok' : rate < 0.05 ? 'metric-warn' : 'metric-crit';
    const label = rate < 0.01 ? 'Healthy' : rate < 0.05 ? 'Warning' : 'Critical';
    document.getElementById('metric-rate').textContent = `${pct}%`;
    document.getElementById('metric-rate').className = `metric-value ${cls}`;
    document.getElementById('metric-status').textContent = label;
    document.getElementById('metric-status').className = `metric-value ${cls}`;
    document.getElementById('metric-sub').textContent = `v${data.version ?? '—'} · ${data.channel ?? 'production'} · ${fmtDate(data.recorded_at)}`;
  } catch (e) {
    document.getElementById('metric-rate').textContent = 'N/A';
    document.getElementById('metric-sub').textContent = e.message;
  }

  // History table
  await loadMetricsHistory();
}

async function loadMetricsHistory() {
  const channel = document.getElementById('metric-channel-filter').value;
  const el = document.getElementById('metrics-table');
  el.innerHTML = '<tr><td colspan="4" style="text-align:center;padding:24px;color:var(--text-muted)">Loading…</td></tr>';
  try {
    const qs = channel ? `?channel=${encodeURIComponent(channel)}&limit=50` : '?limit=50';
    const { data } = await get(`/crash-rate/history${qs}`);
    if (!data.length) {
      el.innerHTML = '<tr><td colspan="4" style="text-align:center;padding:24px;color:var(--text-muted)">No crash data yet.</td></tr>';
      return;
    }
    el.innerHTML = data.map(row => {
      const rate = row.crash_rate;
      const pct = (rate * 100).toFixed(2);
      const cls = rate < 0.01 ? 'crash-ok' : rate < 0.05 ? 'crash-warn' : 'crash-crit';
      const barW = Math.min(rate * 100 * 4, 100).toFixed(1); // scale for visual
      return `
        <tr>
          <td style="color:var(--text-muted);font-size:12px;font-family:monospace">${fmtDate(row.recorded_at)}</td>
          <td>
            <div class="crash-bar-wrap">
              <div class="crash-bar"><div class="crash-fill ${cls}" style="width:${barW}%"></div></div>
              <span style="font-size:12px;${rate >= 0.05 ? 'color:var(--red)' : rate >= 0.01 ? 'color:var(--orange)' : 'color:var(--green)'}">${pct}%</span>
            </div>
          </td>
          <td style="font-size:12px">${esc(row.version ?? '—')}</td>
          <td style="font-size:12px">${esc(row.channel ?? '—')}</td>
        </tr>`;
    }).join('');
  } catch (e) { toast(e.message, 'error'); }
}

document.getElementById('metric-channel-filter').onchange = () => loadMetricsHistory();
document.getElementById('btn-refresh-metrics').onclick = () => loadMetrics();

document.getElementById('btn-record-crash').onclick = async () => {
  const res = await openModal('Record Crash Rate', `
    <div class="field">
      <label>Crash Rate (0.0 – 1.0, e.g. 0.02 = 2%)</label>
      <input id="cr-rate" type="number" min="0" max="1" step="0.001" placeholder="0.005">
    </div>
    <div class="field-row">
      <div class="field">
        <label>Version (optional)</label>
        <input id="cr-version" placeholder="1.2.3">
      </div>
      <div class="field">
        <label>Channel</label>
        <select id="cr-channel">
          <option value="production">production</option>
          <option value="staging">staging</option>
        </select>
      </div>
    </div>`);

  if (!res?.confirmed) return;
  const crash_rate = parseFloat(document.getElementById('cr-rate').value);
  const version = document.getElementById('cr-version').value.trim() || undefined;
  const channel = document.getElementById('cr-channel').value;

  if (isNaN(crash_rate) || crash_rate < 0 || crash_rate > 1) { toast('Crash rate must be 0–1', 'error'); return; }
  try {
    await post('/crash-rate', { crash_rate, version, channel });
    toast('Crash rate recorded', 'success');
    loadMetrics();
  } catch (e) { toast(e.message, 'error'); }
};

// ── Monitoring ────────────────────────────────────────────────────────────────

async function loadMonitoring() {
  await Promise.all([
    loadCrashTrendChart(),
    loadPerfTrendChart(),
    loadAlertRules(),
    loadAlertHistory(),
  ]);
}

async function loadCrashTrendChart() {
  try {
    const { data } = await get('/crash-rate/history?limit=200');
    // Group by version, collect hourly buckets
    const byVersion = {};
    for (const row of data) {
      const v = row.version ?? 'unknown';
      if (!byVersion[v]) byVersion[v] = {};
      const bucket = row.recorded_at ? row.recorded_at.slice(0, 13) + ':00:00' : null;
      if (bucket) {
        if (!byVersion[v][bucket]) byVersion[v][bucket] = [];
        byVersion[v][bucket].push(row.crash_rate * 100);
      }
    }

    const allBuckets = [...new Set(data.map(r => r.recorded_at ? r.recorded_at.slice(0, 13) + ':00:00' : null).filter(Boolean))].sort();
    const labels = allBuckets.map(bucketLabel);
    const versions = Object.keys(byVersion).slice(0, 6);

    const datasets = versions.map((v, i) => ({
      label: `v${v}`,
      data: allBuckets.map(b => {
        const vals = byVersion[v][b];
        return vals ? vals.reduce((a, x) => a + x, 0) / vals.length : null;
      }),
      borderColor: seriesColor(i),
      backgroundColor: seriesColor(i) + '22',
      borderWidth: 2,
      pointRadius: 2,
      tension: 0.3,
      spanGaps: true,
    }));

    if (datasets.length === 0) {
      document.getElementById('chart-crash-trend').parentElement.innerHTML =
        '<p style="text-align:center;color:var(--text-muted);padding:32px 0">No crash data yet</p>';
      return;
    }

    createLineChart('chart-crash-trend', datasets, labels, 'Crash Rate (%)');
  } catch (e) { toast(e.message, 'error'); }
}

async function loadPerfTrendChart() {
  try {
    const [startupRes, downloadRes] = await Promise.all([
      get('/perf-metrics/timeseries?metric_type=startup_ms&hours=24').catch(() => ({ data: [] })),
      get('/perf-metrics/timeseries?metric_type=update_download_ms&hours=24').catch(() => ({ data: [] })),
    ]);

    const allBuckets = [...new Set([
      ...startupRes.data.map(r => r.bucket),
      ...downloadRes.data.map(r => r.bucket),
    ])].sort();

    const toMap = (rows) => {
      const m = {};
      for (const r of rows) m[r.bucket] = r.avg;
      return m;
    };
    const startupMap  = toMap(startupRes.data);
    const downloadMap = toMap(downloadRes.data);

    const labels = allBuckets.map(bucketLabel);
    const datasets = [
      {
        label: 'Startup (ms)',
        data: allBuckets.map(b => startupMap[b] ?? null),
        borderColor: '#4f8ef7', backgroundColor: '#4f8ef722',
        borderWidth: 2, pointRadius: 2, tension: 0.3, spanGaps: true,
      },
      {
        label: 'Download (ms)',
        data: allBuckets.map(b => downloadMap[b] ?? null),
        borderColor: '#3ecf8e', backgroundColor: '#3ecf8e22',
        borderWidth: 2, pointRadius: 2, tension: 0.3, spanGaps: true,
      },
    ];

    if (allBuckets.length === 0) {
      document.getElementById('chart-perf-trend').parentElement.innerHTML =
        '<p style="text-align:center;color:var(--text-muted);padding:32px 0">No perf data yet</p>';
      return;
    }

    createLineChart('chart-perf-trend', datasets, labels, 'Milliseconds');
  } catch (e) { toast(e.message, 'error'); }
}

async function loadAlertRules() {
  const tbody = document.getElementById('alert-rules-table');
  tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:16px;color:var(--text-muted)">Loading…</td></tr>';
  const activeList = document.getElementById('active-alerts-list');

  try {
    const { data } = await get('/alerts/rules');
    const badge = document.getElementById('alert-badge');

    if (!data.length) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:24px;color:var(--text-muted)">No alert rules yet. Click "+ Add Rule" to create one.</td></tr>';
      activeList.innerHTML = '<p style="color:var(--text-muted);font-size:13px">No active alerts.</p>';
      badge.classList.add('hidden');
      return;
    }

    tbody.innerHTML = data.map(r => `
      <tr>
        <td>${esc(r.name)}</td>
        <td><code style="font-size:12px">${esc(r.metric)}</code></td>
        <td style="font-size:12px">${opLabel(r.operator)} ${fmtThreshold(r.metric, r.threshold)}</td>
        <td style="font-size:12px">${esc(r.channel)}${r.version ? ` · v${esc(r.version)}` : ''}</td>
        <td style="font-size:12px">${r.window_mins}min</td>
        <td><span class="${r.enabled ? 'badge-on' : 'badge-off'}">${r.enabled ? 'Enabled' : 'Disabled'}</span></td>
        <td>
          <div style="display:flex;gap:6px">
            <button class="btn btn-ghost" onclick="editAlertRule('${r.id}')">Edit</button>
            <button class="btn btn-ghost" onclick="toggleAlertRule('${r.id}', ${r.enabled})">${r.enabled ? 'Disable' : 'Enable'}</button>
            <button class="btn btn-danger" onclick="deleteAlertRule('${r.id}', '${esc(r.name)}')">Delete</button>
          </div>
        </td>
      </tr>`).join('');

    // Show active alerts badge
    const activeAlerts = data.filter(r => r.enabled);
    if (activeAlerts.length > 0) {
      badge.textContent = activeAlerts.length;
      badge.classList.remove('hidden');
    } else {
      badge.classList.add('hidden');
    }

    activeList.innerHTML = activeAlerts.length
      ? activeAlerts.map(r => `
          <div class="alert-item">
            <span class="alert-dot"></span>
            <span style="flex:1">${esc(r.name)}</span>
            <code style="font-size:11px;color:var(--text-muted)">${esc(r.metric)} ${opLabel(r.operator)} ${fmtThreshold(r.metric, r.threshold)} on ${esc(r.channel)}</code>
          </div>`).join('')
      : '<p style="color:var(--text-muted);font-size:13px">No enabled rules.</p>';
  } catch (e) { toast(e.message, 'error'); }
}

async function loadAlertHistory() {
  const tbody = document.getElementById('alert-history-table');
  tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;padding:16px;color:var(--text-muted)">Loading…</td></tr>';
  try {
    const { data } = await get('/alerts/history?limit=20');
    if (!data.length) {
      tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;padding:16px;color:var(--text-muted)">No alerts fired yet.</td></tr>';
      return;
    }
    tbody.innerHTML = data.map(h => `
      <tr>
        <td style="font-size:12px;color:var(--text-muted)">${fmtDate(h.fired_at)}</td>
        <td>${esc(h.rule_name ?? h.rule_id)}</td>
        <td style="font-size:12px">${h.metric_value}</td>
        <td><span class="${h.status === 'sent' ? 'badge-on' : 'badge-off'}">${esc(h.status)}</span></td>
      </tr>`).join('');
  } catch (e) { toast(e.message, 'error'); }
}

function opLabel(op) {
  return { gt: '>', lt: '<', gte: '≥', lte: '≤' }[op] ?? op;
}

function fmtThreshold(metric, val) {
  if (metric.endsWith('_ms')) return `${Math.round(val)}ms`;
  if (metric.endsWith('_rate') || metric === 'adoption_rate') return `${(val * 100).toFixed(1)}%`;
  return String(val);
}

window.editAlertRule = async function(id) {
  let existing = {};
  if (id) {
    try { existing = (await get(`/alerts/rules`)).data.find(r => r.id === id) ?? {}; } catch {}
  }
  const res = await openModal(id ? 'Edit Alert Rule' : 'New Alert Rule', `
    <div class="field">
      <label>Name</label>
      <input id="ar-name" placeholder="Production Crash Rate Alert" value="${esc(existing.name ?? '')}">
    </div>
    <div class="field-row">
      <div class="field">
        <label>Metric</label>
        <select id="ar-metric">
          ${['crash_rate','adoption_rate','failure_rate','p95_startup_ms','p95_download_ms'].map(m =>
            `<option value="${m}" ${existing.metric === m ? 'selected' : ''}>${m}</option>`
          ).join('')}
        </select>
      </div>
      <div class="field">
        <label>Operator</label>
        <select id="ar-op">
          ${[['gt','>'],['lt','<'],['gte','≥'],['lte','≤']].map(([v,l]) =>
            `<option value="${v}" ${existing.operator === v ? 'selected' : ''}>${l}</option>`
          ).join('')}
        </select>
      </div>
    </div>
    <div class="field-row">
      <div class="field">
        <label>Threshold (raw: 0.05 = 5% for rates, ms for latency)</label>
        <input id="ar-threshold" type="number" step="0.001" placeholder="0.05" value="${existing.threshold ?? ''}">
      </div>
      <div class="field">
        <label>Channel</label>
        <input id="ar-channel" placeholder="production" value="${esc(existing.channel ?? 'production')}">
      </div>
    </div>
    <div class="field-row">
      <div class="field">
        <label>Window (minutes)</label>
        <input id="ar-window" type="number" min="1" placeholder="60" value="${existing.window_mins ?? 60}">
      </div>
      <div class="field">
        <label>Cooldown (minutes)</label>
        <input id="ar-cooldown" type="number" min="1" placeholder="30" value="${existing.cooldown_mins ?? 30}">
      </div>
    </div>
    <div class="field">
      <label>Slack Webhook URL</label>
      <input id="ar-webhook" type="url" placeholder="https://hooks.slack.com/..." value="${esc(existing.webhook_url ?? '')}">
    </div>`);

  if (!res?.confirmed) return;
  const body = {
    name: document.getElementById('ar-name').value.trim(),
    metric: document.getElementById('ar-metric').value,
    operator: document.getElementById('ar-op').value,
    threshold: parseFloat(document.getElementById('ar-threshold').value),
    channel: document.getElementById('ar-channel').value.trim() || 'production',
    window_mins: parseInt(document.getElementById('ar-window').value, 10) || 60,
    cooldown_mins: parseInt(document.getElementById('ar-cooldown').value, 10) || 30,
    webhook_url: document.getElementById('ar-webhook').value.trim(),
  };
  if (!body.name || !body.webhook_url || isNaN(body.threshold)) {
    toast('Name, threshold and webhook URL are required', 'error'); return;
  }
  try {
    if (id) {
      await patch(`/alerts/rules/${id}`, body);
      toast('Alert rule updated', 'success');
    } else {
      await post('/alerts/rules', body);
      toast('Alert rule created', 'success');
    }
    loadAlertRules();
  } catch (e) { toast(e.message, 'error'); }
};

window.toggleAlertRule = async function(id, currentlyEnabled) {
  try {
    await patch(`/alerts/rules/${id}`, { enabled: !currentlyEnabled });
    toast(`Rule ${currentlyEnabled ? 'disabled' : 'enabled'}`, 'success');
    loadAlertRules();
  } catch (e) { toast(e.message, 'error'); }
};

window.deleteAlertRule = async function(id, name) {
  const res = await openModal('Delete Alert Rule', `<p>Delete rule <strong>${esc(name)}</strong>?</p>`, 'Delete');
  if (!res?.confirmed) return;
  try { await del(`/alerts/rules/${id}`); toast('Rule deleted'); loadAlertRules(); }
  catch (e) { toast(e.message, 'error'); }
};

document.getElementById('btn-add-alert').onclick = () => window.editAlertRule(null);
document.getElementById('btn-refresh-monitoring').onclick = () => loadMonitoring();

// ── Adoption ──────────────────────────────────────────────────────────────────

async function loadAdoption() {
  await populateReleaseSelect();
  const select = document.getElementById('adoption-release-select');
  if (select.value) {
    await Promise.all([loadFunnelChart(select.value), loadVelocityChart(select.value)]);
  }
  await loadRolloutHealth();
}

async function populateReleaseSelect() {
  try {
    const { data } = await get('/releases');
    const select = document.getElementById('adoption-release-select');
    const active = data.filter(r => r.status === 'active' || r.status === 'paused');
    select.innerHTML = '<option value="">Select release…</option>' +
      active.map(r => `<option value="${r.id}">${esc(r.version)} · ${esc(r.channel)} · ${esc(r.platform)}</option>`).join('');
    if (active.length && !select.value) select.value = active[0].id;
  } catch {}
}

async function loadFunnelChart(releaseId) {
  const canvas = document.getElementById('chart-funnel');
  const statsEl = document.getElementById('funnel-stats');
  try {
    const { data } = await get(`/update-events/funnel?release_id=${encodeURIComponent(releaseId)}`);
    const f = data.funnel;
    const steps = ['eligible','notified','downloading','staged','applied'];
    const labels = ['Eligible','Notified','Downloading','Staged','Applied'];
    const values = steps.map(s => f[s]);
    const colors = ['#4f8ef7','#4f8ef7cc','#4f8ef799','#4f8ef766','#3ecf8e'];

    if (values[0] === 0) {
      canvas.parentElement.innerHTML = '<p style="text-align:center;color:var(--text-muted);padding:32px 0">No adoption events yet for this release.</p>';
      statsEl.innerHTML = '';
      return;
    }

    createFunnelChart('chart-funnel', labels, values, colors);
    statsEl.innerHTML = `
      <div class="funnel-row"><span>Adoption Rate</span><strong style="color:var(--green)">${(data.adoption_rate * 100).toFixed(1)}%</strong></div>
      <div class="funnel-row"><span>Failure Rate</span><strong style="color:${data.failure_rate > 0.05 ? 'var(--red)' : 'var(--green)'}">${(data.failure_rate * 100).toFixed(1)}%</strong></div>
      ${f.skipped ? `<div class="funnel-row"><span>Skipped</span><strong style="color:var(--orange)">${f.skipped}</strong></div>` : ''}`;
  } catch (e) { toast(e.message, 'error'); }
}

async function loadVelocityChart(releaseId) {
  try {
    const { data } = await get(`/update-events/timeseries?release_id=${encodeURIComponent(releaseId)}&hours=48`);
    const labels = data.map(r => bucketLabel(r.bucket));
    const datasets = [
      {
        label: 'Applied',
        data: data.map(r => r.applied),
        borderColor: '#3ecf8e', backgroundColor: '#3ecf8e22',
        borderWidth: 2, pointRadius: 2, tension: 0.3, fill: true,
      },
      {
        label: 'Failed',
        data: data.map(r => r.failed),
        borderColor: '#f05252', backgroundColor: '#f0525222',
        borderWidth: 2, pointRadius: 2, tension: 0.3, fill: true,
      },
    ];

    if (!data.length) {
      document.getElementById('chart-velocity').parentElement.innerHTML =
        '<p style="text-align:center;color:var(--text-muted);padding:32px 0">No velocity data yet.</p>';
      return;
    }

    createLineChart('chart-velocity', datasets, labels, 'Devices');
  } catch (e) { toast(e.message, 'error'); }
}

async function loadRolloutHealth() {
  const tbody = document.getElementById('rollout-health-table');
  tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:16px;color:var(--text-muted)">Loading…</td></tr>';
  try {
    const [relRes, schedRes] = await Promise.all([
      get('/releases'),
      get('/scheduler'),
    ]);
    const releases = relRes.data.filter(r => r.status === 'active');
    const pending = schedRes.data.pendingReleases;

    if (!releases.length) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:24px;color:var(--text-muted)">No active releases.</td></tr>';
      return;
    }

    tbody.innerHTML = await Promise.all(releases.map(async r => {
      let adoptionRate = '—';
      let funnelFailRate = '—';
      try {
        const { data } = await get(`/update-events/funnel?release_id=${encodeURIComponent(r.id)}`);
        adoptionRate = `${(data.adoption_rate * 100).toFixed(1)}%`;
        funnelFailRate = `${(data.failure_rate * 100).toFixed(1)}%`;
      } catch {}

      const sched = pending.find(p => p.id === r.id);
      const crashRate = sched ? sched.crashRate : 0;
      const crashCls = crashRate > 0.05 ? 'color:var(--red)' : crashRate > 0.01 ? 'color:var(--orange)' : 'color:var(--green)';
      const stage = sched ? `${sched.currentPct}%→${sched.nextPct ?? '✓'}` : `${r.rollout_percentage}%`;

      return `
        <tr>
          <td><strong>${esc(r.version)}</strong></td>
          <td style="font-size:12px">${esc(r.channel)}</td>
          <td>
            <div class="rollout-wrap">
              <div class="rollout-bar"><div class="rollout-fill" style="width:${r.rollout_percentage}%"></div></div>
              <span class="rollout-pct">${r.rollout_percentage}%</span>
            </div>
          </td>
          <td style="font-size:12px;color:var(--green)">${esc(adoptionRate)}</td>
          <td style="font-size:12px;${crashCls}">${(crashRate * 100).toFixed(1)}%</td>
          <td style="font-size:12px;color:var(--text-muted)">${esc(stage)}</td>
          <td><span class="badge-active-release">active</span></td>
        </tr>`;
    })).then(rows => rows.join(''));
  } catch (e) { toast(e.message, 'error'); }
}

document.getElementById('adoption-release-select').onchange = async function() {
  if (this.value) {
    await Promise.all([loadFunnelChart(this.value), loadVelocityChart(this.value)]);
  }
};
document.getElementById('btn-refresh-adoption').onclick = () => loadAdoption();

// ── Errors ────────────────────────────────────────────────────────────────────

let errorsPage = 0;
const ERRORS_LIMIT = 20;

async function loadErrors(offset = 0) {
  errorsPage = offset;
  await Promise.all([loadErrorsTable(offset), loadErrorRateChart()]);
}

async function loadErrorRateChart() {
  try {
    const { data } = await get('/errors/timeseries?hours=24');
    const labels = data.map(r => bucketLabel(r.bucket));
    const datasets = [{
      label: 'Errors/hour',
      data: data.map(r => r.count),
      borderColor: '#f05252', backgroundColor: '#f0525222',
      borderWidth: 2, pointRadius: 2, tension: 0.3, fill: true,
    }];

    const badgeEl = document.getElementById('error-badge');
    const total = data.reduce((s, r) => s + r.count, 0);
    if (total > 0) {
      badgeEl.textContent = total > 999 ? '999+' : total;
      badgeEl.classList.remove('hidden');
    } else {
      badgeEl.classList.add('hidden');
    }

    if (!data.length) {
      document.getElementById('chart-error-rate').parentElement.innerHTML =
        '<p style="text-align:center;color:var(--text-muted);padding:24px 0">No errors recorded in the last 24h.</p>';
      return;
    }

    createLineChart('chart-error-rate', datasets, labels, 'Error count');
  } catch {}
}

async function loadErrorsTable(offset = 0) {
  const tbody = document.getElementById('errors-table');
  tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:24px;color:var(--text-muted)">Loading…</td></tr>';

  const status = document.getElementById('error-status-filter').value;
  const qs = `?status=${encodeURIComponent(status)}&limit=${ERRORS_LIMIT}&offset=${offset}`;

  try {
    const { data, meta } = await get(`/errors/groups${qs}`);
    document.getElementById('errors-total').textContent = `${meta.total} groups`;
    document.getElementById('btn-errors-prev').disabled = offset === 0;
    document.getElementById('btn-errors-next').disabled = offset + ERRORS_LIMIT >= meta.total;

    if (!data.length) {
      tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:32px;color:var(--text-muted)">No ${esc(status)} error groups.</td></tr>`;
      return;
    }

    tbody.innerHTML = data.map(g => {
      const statusCls = g.status === 'open' ? 'badge-crit' : g.status === 'resolved' ? 'badge-on' : 'badge-off';
      return `
        <tr>
          <td style="max-width:300px">
            <div style="font-size:12px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${esc(g.title)}">${esc(g.title)}</div>
            <div style="font-size:11px;color:var(--text-muted);margin-top:2px">${esc(g.error_type)}</div>
          </td>
          <td style="font-size:13px;font-weight:600">${g.event_count}</td>
          <td style="font-size:12px">${g.device_count}</td>
          <td style="font-size:12px">${esc(g.version)}</td>
          <td style="font-size:12px;color:var(--text-muted)">${fmtDate(g.last_seen)}</td>
          <td><span class="${statusCls}">${esc(g.status)}</span></td>
          <td>
            <div style="display:flex;gap:6px">
              <button class="btn btn-ghost" onclick="viewErrorGroup('${g.id}')">View</button>
              ${g.status !== 'resolved' ? `<button class="btn btn-ghost" onclick="setErrorStatus('${g.id}', 'resolved')">Resolve</button>` : ''}
              ${g.status !== 'ignored' ? `<button class="btn btn-ghost" onclick="setErrorStatus('${g.id}', 'ignored')">Ignore</button>` : ''}
            </div>
          </td>
        </tr>`;
    }).join('');
  } catch (e) { toast(e.message, 'error'); }
}

window.viewErrorGroup = async function(id) {
  try {
    const { data } = await get(`/errors/groups/${id}`);
    const g = data.group;
    const events = data.recent_events;
    const eventsHtml = events.length
      ? events.map(ev => {
          let frames = [];
          try { frames = JSON.parse(ev.stack_trace).slice(0, 5); } catch {}
          return `
            <div style="margin-bottom:12px;padding:10px;background:var(--bg);border-radius:6px">
              <div style="font-size:11px;color:var(--text-muted);margin-bottom:4px">${fmtDate(ev.recorded_at)} · ${esc(ev.platform)} · v${esc(ev.version)}</div>
              <div style="font-size:12px;margin-bottom:6px">${esc(ev.message)}</div>
              ${frames.map(f => `<div style="font-size:11px;font-family:monospace;color:var(--text-muted)">${esc(f.func ?? '?')} (${esc(f.file)}:${f.line ?? '?'})</div>`).join('')}
            </div>`;
        }).join('')
      : '<p style="color:var(--text-muted);font-size:12px">No events recorded.</p>';

    await openModal(`Error: ${g.title.slice(0, 60)}`, `
      <div style="margin-bottom:16px">
        <div style="font-size:12px;color:var(--text-muted);margin-bottom:4px">DETAILS</div>
        <div style="font-size:13px"><strong>${esc(g.error_type)}</strong></div>
        <div style="font-size:12px;margin-top:4px">
          ${g.event_count} events · ${g.device_count} devices · v${esc(g.version)} · ${esc(g.channel)}
        </div>
        <div style="font-size:12px;color:var(--text-muted);margin-top:4px">
          First: ${fmtDate(g.first_seen)} · Last: ${fmtDate(g.last_seen)}
        </div>
      </div>
      <div style="font-size:12px;color:var(--text-muted);margin-bottom:8px">RECENT OCCURRENCES</div>
      ${eventsHtml}`, 'Close');
  } catch (e) { toast(e.message, 'error'); }
};

window.setErrorStatus = async function(id, status) {
  try {
    await patch(`/errors/groups/${id}`, { status });
    toast(`Marked as ${status}`, 'success');
    loadErrors(errorsPage);
  } catch (e) { toast(e.message, 'error'); }
};

document.getElementById('error-status-filter').onchange = () => loadErrors(0);
document.getElementById('btn-refresh-errors').onclick   = () => loadErrors(0);
document.getElementById('btn-errors-prev').onclick = () => loadErrors(errorsPage - ERRORS_LIMIT);
document.getElementById('btn-errors-next').onclick = () => loadErrors(errorsPage + ERRORS_LIMIT);

// ── Segments ─────────────────────────────────────────────────────────────────

async function loadSegments() {
  const el = document.getElementById('segments-table');
  el.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:24px;color:var(--text-muted)">Loading…</td></tr>';
  try {
    const { data } = await get('/segments');
    if (!data.length) {
      el.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:32px;color:var(--text-muted)">No segments yet.</td></tr>';
      return;
    }
    el.innerHTML = data.map(s => {
      const rules = Array.isArray(s.rules) ? s.rules : JSON.parse(s.rules || '[]');
      const rulesText = rules.map(r => `${r.attribute} ${r.operator} ${JSON.stringify(r.value)}`).join('; ');
      return `
        <tr>
          <td><code>${esc(s.key)}</code></td>
          <td>${esc(s.name)}</td>
          <td style="color:var(--text-muted)">${esc(s.description || '—')}</td>
          <td style="font-size:11px;color:var(--text-muted)">${esc(rulesText)}</td>
          <td>${fmtDate(s.updated_at)}</td>
          <td>
            <button class="btn btn-danger" onclick="deleteSegment('${s.id}', '${esc(s.key)}')">Delete</button>
          </td>
        </tr>`;
    }).join('');
  } catch (e) { toast(e.message, 'error'); }
}

window.deleteSegment = async function(id, key) {
  const res = await openModal('Delete Segment', `<p>Delete segment <code>${esc(key)}</code>?</p>`, 'Delete');
  if (!res?.confirmed) return;
  try { await del(`/segments/${id}`); toast('Segment deleted'); loadSegments(); }
  catch (e) { toast(e.message, 'error'); }
};

document.getElementById('btn-add-segment').onclick = async () => {
  const res = await openModal('New Segment', `
    <div class="field"><label>Key (snake_case)</label><input id="sg-key" placeholder="premium_users"></div>
    <div class="field"><label>Name</label><input id="sg-name" placeholder="Premium Users"></div>
    <div class="field"><label>Description</label><input id="sg-desc" placeholder="Optional description"></div>
    <div class="field">
      <label>Rules JSON (array of {attribute, operator, value})</label>
      <textarea id="sg-rules" rows="4">[{"attribute":"plan","operator":"eq","value":"premium"}]</textarea>
    </div>`);
  if (!res?.confirmed) return;
  const key = document.getElementById('sg-key').value.trim();
  const name = document.getElementById('sg-name').value.trim();
  const description = document.getElementById('sg-desc').value.trim();
  let rules;
  try { rules = JSON.parse(document.getElementById('sg-rules').value); }
  catch { toast('Rules must be valid JSON', 'error'); return; }
  if (!key || !name) { toast('Key and Name are required', 'error'); return; }
  try { await post('/segments', { key, name, description, rules }); toast('Segment created', 'success'); loadSegments(); }
  catch (e) { toast(e.message, 'error'); }
};

// ── Experiment Results ────────────────────────────────────────────────────────

async function loadResults() {
  const container = document.getElementById('results-container');
  container.innerHTML = '<p style="color:var(--text-muted);text-align:center;padding:32px">Loading…</p>';
  try {
    const { data: experiments } = await get('/experiments');
    const active = experiments.filter(e => e.status === 'active' || e.status === 'completed');
    if (!active.length) {
      container.innerHTML = '<p style="color:var(--text-muted);text-align:center;padding:32px">No active or completed experiments.</p>';
      return;
    }
    const sections = await Promise.all(active.map(async (exp) => {
      try {
        const res = await get(`/experiments/${exp.key}/results`);
        const winnerBadge = res.winner ? `<span class="badge-active">winner: ${esc(res.winner)}</span>` : '';
        const rows = (res.variants || []).map(v => `
          <tr>
            <td>${esc(v.id)}</td>
            <td>${v.exposures}</td>
            <td>${v.conversions}</td>
            <td>${(v.rate * 100).toFixed(1)}%</td>
            <td>${v.lift_vs_control >= 0 ? '+' : ''}${(v.lift_vs_control * 100).toFixed(1)}%</td>
          </tr>`).join('');
        return `
          <div style="margin-bottom:32px">
            <div class="toolbar" style="margin-bottom:8px">
              <h3 style="font-size:14px;font-weight:600"><code>${esc(exp.key)}</code> <span class="badge-${exp.status}">${esc(exp.status)}</span></h3>
              ${winnerBadge}
            </div>
            <div class="table-wrap">
              <table>
                <thead><tr><th>Variant</th><th>Exposures</th><th>Conversions</th><th>Rate</th><th>Lift vs Control</th></tr></thead>
                <tbody>${rows}</tbody>
              </table>
            </div>
          </div>`;
      } catch { return `<p style="color:var(--text-muted)">Could not load results for <code>${esc(exp.key)}</code></p>`; }
    }));
    container.innerHTML = sections.join('');
  } catch (e) { toast(e.message, 'error'); }
}

document.getElementById('btn-refresh-results').onclick = () => loadResults();

// ── Schedules ─────────────────────────────────────────────────────────────────

async function loadSchedules() {
  const el = document.getElementById('schedules-table');
  el.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:24px;color:var(--text-muted)">Loading…</td></tr>';
  try {
    const { data } = await get('/schedules');
    if (!data.length) {
      el.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:32px;color:var(--text-muted)">No scheduled changes.</td></tr>';
      return;
    }
    el.innerHTML = data.map(s => {
      const isPending = !s.executed_at;
      const statusBadge = isPending ? '<span class="badge-draft">pending</span>' : '<span class="badge-completed">executed</span>';
      return `
        <tr>
          <td><code>${esc(s.entity_type)}/${esc(s.entity_id)}</code></td>
          <td>${esc(s.action)} ${statusBadge}</td>
          <td>${fmtDate(s.scheduled_at)}</td>
          <td>${s.executed_at ? fmtDate(s.executed_at) : '—'}</td>
          <td style="color:var(--text-muted)">${esc(s.created_by)}</td>
          <td>${isPending ? `<button class="btn btn-danger" onclick="deleteSchedule('${s.id}')">Cancel</button>` : '—'}</td>
        </tr>`;
    }).join('');
  } catch (e) { toast(e.message, 'error'); }
}

window.deleteSchedule = async function(id) {
  const res = await openModal('Cancel Schedule', '<p>Cancel this scheduled change?</p>', 'Cancel Schedule');
  if (!res?.confirmed) return;
  try { await del(`/schedules/${id}`); toast('Schedule cancelled'); loadSchedules(); }
  catch (e) { toast(e.message, 'error'); }
};

document.getElementById('btn-refresh-schedules').onclick = () => loadSchedules();

// ── Init ─────────────────────────────────────────────────────────────────────

loadPanel('monitoring');
