let state;
let page = 'overview';
let conversationId = null;
let chatBusy = false;

const $ = s => document.querySelector(s);

const escape = v => String(v).replace(
  /[&<>"']/g,
  c => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[c])
);

const money = v => new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 2
}).format(v);

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const titles = {
  overview: 'Farm overview',
  chat: 'AI Assistant',
  records: 'Farm records',
  reports: 'Reports & analytics',
  notifications: 'Notifications',
  history: 'Your history',
  profile: 'Farmer profile'
};

async function api(path, method = 'GET', data) {
  const r = await fetch('/api' + path, {
    method,
    headers: data ? { 'Content-Type': 'application/json' } : {},
    body: data ? JSON.stringify(data) : undefined
  });

  const value = await r.json();

  if (!r.ok) {
    throw Error(value.error || 'Request failed.');
  }

  return value;
}

function notify(message) {
  $('#notice').textContent = message;
}

async function refresh() {
  state = await api('/state');

  $('#mode').textContent =
    'AI chat disabled';

  $('#alert-count').textContent = state.profile.reminders
    ? state.reminders.filter(r => !r.done && r.dueDate <= today()).length
    : '';

  render();
}

function go(next) {
  page = next;
  notify('');
  render();
}

function messageLabel(m) {
  if (m.role === 'user') {
    return 'YOU';
  }

  // Also handles older saved responses that were marked "live".
  if (
    m.mode === 'local' ||
    String(m.text || '').trimStart().startsWith('LOCAL KNOWLEDGE CHECK')
  ) {
    return 'ASSISTANT / LOCAL KNOWLEDGE CHECK';
  }

  if (m.mode === 'demo') {
    return 'ASSISTANT / OFFLINE DEMO';
  }

  if (m.mode === 'live') {
    return 'ASSISTANT / LIVE AI';
  }

  return 'ASSISTANT';
}

function sample() {
  return state.analytics.containsSampleData
    ? '<div class="warning">Sample farm entries are included. Remove them in Farm records before using real totals.</div>'
    : '';
}

function stats(a) {
  return `
    <div class="grid">
      <div class="card metric">
        <small>RECORDED REVENUE</small>
        <strong>${money(a.revenue)}</strong>
        <small>From saved revenue entries</small>
      </div>
      <div class="card metric">
        <small>RECORDED EXPENSES</small>
        <strong>${money(a.expenses)}</strong>
        <small>From saved expense entries</small>
      </div>
      <div class="card metric">
        <small>RECORDED CASH BALANCE</small>
        <strong>${money(a.balance)}</strong>
        <small>Not audited profit</small>
      </div>
    </div>
  `;
}

function bars() {
  const entries = Object.entries(state.analytics.categories);
  const max = Math.max(1, ...entries.map(x => x[1]));

  return entries.length
    ? entries.map(([k, v]) => `
        <div>
          ${escape(k)}
          <span class="muted">${money(v)}</span>
          <div class="bar">
            <span style="width:${v / max * 100}%"></span>
          </div>
        </div>
      `).join('')
    : '<p class="empty">No expense data yet.</p>';
}

function reminderRows() {
  return state.reminders.length
    ? state.reminders.slice()
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
      .map(r => `
        <div class="row">
          <div>
            <strong>${escape(r.title)}</strong>
            <p class="muted">
              ${escape(r.dueDate)} ·
              ${r.done ? 'Completed' : r.dueDate <= today() ? 'Due' : 'Upcoming'}
            </p>
          </div>
          <button
            class="secondary"
            data-reminder="${r.id}"
            data-done="${!r.done}"
          >
            ${r.done ? 'Reopen' : 'Mark complete'}
          </button>
        </div>
      `).join('')
    : '<p class="empty">No reminders yet. Add your first task.</p>';
}

function reportRows() {
  return state.reports.length
    ? state.reports.slice().reverse().map(r => `
        <div class="row">
          <div>
            <strong>Farm report</strong>
            <p class="muted">
              ${r.from} — ${r.to} · ${r.analytics.count} records
              ${r.analytics.containsSampleData ? ' · Sample data' : ''}
            </p>
          </div>
          <div class="actions">
            <a href="/api/reports/${r.id}/html" target="_blank" rel="noopener">
              View / Save PDF
            </a>
            <a href="/api/reports/${r.id}/html?download=1">HTML</a>
            <a href="/api/reports/${r.id}/csv">CSV</a>
            <button class="danger" data-delete-report="${r.id}">
              Delete
            </button>
          </div>
        </div>
      `).join('')
    : '<p class="empty">No reports generated yet.</p>';
}

function chat() {
  const c = state.conversations.find(c => c.id === conversationId);

  return `
    <div class="warning">
      ${state.mode === 'demo'
        ? 'Offline demo uses keyword retrieval and templates, not a live language model.'
        : 'Live AI sends your farm context and messages to the configured provider after profile consent.'}
      Starter notes are not verified local agronomic guidance.
    </div>

    <div class="card">
      <div class="row">
        <h2>Your farming questions, in one place</h2>
        <button
          class="secondary"
          id="new-chat"
          ${chatBusy ? 'disabled' : ''}
        >
          New conversation
        </button>
      </div>

      <div class="chat-area" aria-live="polite">
        ${c ? c.messages.map(m => `
          <div class="message ${m.role}">
            <small>${messageLabel(m)}</small>
            <pre>${escape(m.text)}</pre>

            ${m.sources?.length ? `
              <details>
                <summary>
                  Retrieved references (${m.sources.length})
                </summary>
                ${m.sources.map(s => `
                  <p>
                    <strong>${escape(s.title)} [${s.id}]</strong>
                    <br>${escape(s.source)}
                  </p>
                `).join('')}
              </details>
            ` : ''}
          </div>
        `).join('') : `
          <div class="empty">
            <h2>What would you like to understand?</h2>
            <p>
              Ask about your records, soil observations,
              crop symptoms or irrigation records.
            </p>
            <div class="actions">
              <button
                class="secondary"
                data-prompt="Summarize my farm expenses"
              >
                Summarize expenses
              </button>
              <button
                class="secondary"
                data-prompt="What soil information should I record?"
              >
                Soil records
              </button>
              <button
                class="secondary"
                data-prompt="Can you give a weather forecast?"
              >
                Weather availability
              </button>
            </div>
          </div>
        `}
      </div>

      <form id="chat-form">
        <label for="question">Your question</label>
        <textarea
          id="question"
          name="message"
          rows="3"
          maxlength="3000"
          placeholder="Ask a farming or recordkeeping question…"
          required
          ${chatBusy ? 'disabled' : ''}
        ></textarea>
        <button class="primary" ${chatBusy ? 'disabled' : ''}>
          ${chatBusy ? 'Preparing response…' : 'Send question'}
        </button>
      </form>
    </div>
  `;
}

function render() {
  if (!state) return;

  $('#page-title').textContent = titles[page];

  document.querySelectorAll('[data-page]').forEach(b => {
    b.classList.toggle('active', b.dataset.page === page);
  });

  let html = '';

  if (page === 'overview') {
    html = `
      <section class="hero">
        <span class="eyebrow" style="color:#cfdfc3">
          A CLEARER VIEW OF YOUR FARM
        </span>
        <h2>Good records. Better-informed decisions.</h2>
        <p>
          Welcome, ${escape(state.profile.name)}.
          Bring your farm activity, questions and reports
          together in one workspace.
        </p>
        <button class="button" data-go="records">Add farm records</button>
      </section>

      ${sample()}
      ${stats(state.analytics)}

      <div class="two">
        <section class="card">
          <h2>Where your expenses go</h2>
          ${bars()}
        </section>
        <section class="card">
          <h2>${escape(state.profile.farmName)}</h2>
          <p>${escape(state.profile.location)}</p>
          <p>
            Crop: <strong>${escape(state.profile.crop)}</strong><br>
            Farm area: <strong>${state.profile.area} hectares</strong>
          </p>
          <button class="secondary" data-go="profile">
            Manage profile
          </button>
          <p class="muted">
            Weather: not connected. No forecast is being displayed.
          </p>
        </section>
      </div>
    `;
  }

  if (page === 'chat') {
    html = chat();
  }

  if (page === 'records') {
    html = `
      ${sample()}

      <div class="two">
        <div class="card">
          <h2>Add a farm transaction</h2>
          <form id="record-form">
            <label>
              Date
              <input type="date" name="date" value="${today()}" required>
            </label>
            <label>
              Type
              <select name="type">
                <option value="expense">Expense</option>
                <option value="revenue">Revenue</option>
              </select>
            </label>
            <label>
              Category
              <input
                name="category"
                placeholder="Seeds, labour, harvest sale…"
                maxlength="80"
                required
              >
            </label>
            <label>
              Amount (INR)
              <input
                name="amount"
                type="number"
                min="0"
                max="1000000000"
                step="0.01"
                required
              >
            </label>
            <label>
              Note
              <textarea name="note" maxlength="1000" rows="2"></textarea>
            </label>
            <button class="primary">Save record</button>
          </form>
        </div>

        <div class="card">
          <h2>Expense breakdown</h2>
          ${bars()}
          <p class="muted">
            All entries use INR. Area uses hectares.
            Delete only records you no longer need;
            saved report snapshots remain unchanged.
          </p>
        </div>
      </div>

      <div class="card">
        <h2>Recorded activity</h2>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Category</th>
                <th>Type</th>
                <th>Amount</th>
                <th>Source</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              ${state.records.slice().reverse().map(r => `
                <tr>
                  <td>${r.date}</td>
                  <td>
                    ${escape(r.category)}<br>
                    <span class="muted">${escape(r.note)}</span>
                  </td>
                  <td>${r.type}</td>
                  <td>${money(r.amount)}</td>
                  <td>${r.sample ? 'Sample' : 'Entered'}</td>
                  <td>
                    <button class="danger" data-delete-record="${r.id}">
                      Delete
                    </button>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
          ${!state.records.length
            ? '<p class="empty">No records yet.</p>'
            : ''}
        </div>
      </div>
    `;
  }

  if (page === 'reports') {
    html = `
      ${sample()}
      ${stats(state.analytics)}

      <div class="card">
        <h2>Generate a farm report</h2>
        <p class="muted">
          Totals above cover all records. Each report uses the date range
          below and saves a fixed snapshot. Open a report, press Ctrl+P,
          then choose Save as PDF.
        </p>
        <form id="report-form">
          <div class="two">
            <label>
              From
              <input
                type="date"
                name="from"
                value="${today().slice(0, 7)}-01"
                required
              >
            </label>
            <label>
              To
              <input type="date" name="to" value="${today()}" required>
            </label>
          </div>
          <button class="primary">Generate report</button>
        </form>
      </div>

      <div class="card">
        <h2>Saved reports</h2>
        ${reportRows()}
      </div>
    `;
  }

  if (page === 'notifications') {
    html = `
      <div class="warning">
        In-app reminders only. Due dates are checked while this page is
        open. No email, SMS, WhatsApp or background push is connected.
        ${state.profile.reminders
          ? ''
          : 'Reminder badge is disabled in Profile.'}
      </div>

      <div class="two">
        <div class="card">
          <h2>Add a reminder</h2>
          <form id="reminder-form">
            <label>
              Task
              <input
                name="title"
                maxlength="200"
                placeholder="Record soil test results"
                required
              >
            </label>
            <label>
              Due date
              <input
                type="date"
                name="dueDate"
                value="${today()}"
                required
              >
            </label>
            <button class="primary">Save reminder</button>
          </form>
        </div>
        <div class="card">
          <h2>Your reminders</h2>
          ${reminderRows()}
        </div>
      </div>
    `;
  }

  if (page === 'history') {
    html = `
      <div class="card">
        <h2>Previous conversations</h2>
        ${state.conversations.length
          ? state.conversations.slice().reverse().map(c => `
            <div class="row">
              <div>
                <strong>${escape(c.title)}</strong>
                <p class="muted">
                  ${new Date(c.createdAt).toLocaleString()} ·
                  ${c.messages.length} messages
                </p>
              </div>
              <div class="actions">
                <button class="secondary" data-open-chat="${c.id}">
                  Continue
                </button>
                <button class="danger" data-delete-chat="${c.id}">
                  Delete
                </button>
              </div>
            </div>
          `).join('')
          : '<p class="empty">Your conversations will appear here.</p>'}
      </div>
      <div class="card">
        <h2>Report history</h2>
        ${reportRows()}
      </div>
    `;
  }

  if (page === 'profile') {
    const p = state.profile;

    html = `
      <div class="card">
        <h2>Farmer information</h2>
        <p class="muted">
          This profile belongs to your hosted farm workspace.
          Preferences and farm context are saved on the server.
        </p>

        <form id="profile-form">
          <div class="two">
            <div>
              <label>
                Name
                <input
                  name="name"
                  maxlength="200"
                  value="${escape(p.name)}"
                  required
                >
              </label>
              <label>
                Farm name
                <input
                  name="farmName"
                  maxlength="200"
                  value="${escape(p.farmName)}"
                  required
                >
              </label>
              <label>
                Location
                <input
                  name="location"
                  maxlength="200"
                  value="${escape(p.location)}"
                  required
                >
              </label>
            </div>
            <div>
              <label>
                Area (hectares)
                <input
                  name="area"
                  type="number"
                  min="0.01"
                  max="1000000"
                  step="0.01"
                  value="${p.area}"
                  required
                >
              </label>
              <label>
                Main crop
                <input
                  name="crop"
                  maxlength="200"
                  value="${escape(p.crop)}"
                  required
                >
              </label>
              <label>
                Soil information
                <input
                  name="soil"
                  maxlength="300"
                  value="${escape(p.soil)}"
                  required
                >
              </label>
            </div>
          </div>

          <label>
            Preferred live AI answer language
            <select name="language">
              <option ${p.language === 'English' ? 'selected' : ''}>
                English
              </option>
              <option ${p.language === 'Hindi' ? 'selected' : ''}>
                Hindi
              </option>
            </select>
          </label>

          <p class="muted">
            The interface and offline demo remain in English.
          </p>

          <label class="check">
            <input
              name="reminders"
              type="checkbox"
              ${p.reminders ? 'checked' : ''}
            >
            Show due-reminder badge
          </label>

          <label class="check">
            <input
              name="aiConsent"
              type="checkbox"
              ${p.aiConsent ? 'checked' : ''}
            >
            I agree to send my farm location, crop, soil details,
            financial summaries, up to 30 recent records, question and
            recent conversation messages to the configured AI provider
            when live mode is enabled. Record notes may contain
            personal information.
          </label>

          <button class="primary">Save profile</button>
        </form>
      </div>
    `;
  }

  $('#content').innerHTML = html;

  const area = $('.chat-area');
  if (area) area.scrollTop = area.scrollHeight;
}

document.addEventListener('click', async event => {
  const b = event.target.closest('button');
  if (!b) return;

  try {
    if (b.dataset.page) return go(b.dataset.page);
    if (b.dataset.go) return go(b.dataset.go);

    if (b.dataset.prompt) {
      $('#question').value = b.dataset.prompt;
      $('#question').focus();
      return;
    }

    if (b.id === 'new-chat') {
      conversationId = null;
      return render();
    }

    if (b.dataset.openChat) {
      conversationId = b.dataset.openChat;
      return go('chat');
    }

    let path;

    if (b.dataset.deleteRecord) {
      path = '/records/' + b.dataset.deleteRecord;
    }

    if (b.dataset.deleteReport) {
      path = '/reports/' + b.dataset.deleteReport;
    }

    if (b.dataset.deleteChat) {
      path = '/conversations/' + b.dataset.deleteChat;
    }

    if (path) {
      if (!confirm('Delete this saved item? This cannot be undone.')) {
        return;
      }

      await api(path, 'DELETE');

      if (b.dataset.deleteChat === conversationId) {
        conversationId = null;
      }

      await refresh();
      notify('Item deleted.');
    }

    if (b.dataset.reminder) {
      await api('/reminders/' + b.dataset.reminder, 'PATCH', {
        done: b.dataset.done === 'true'
      });
      await refresh();
    }
  } catch (e) {
    notify(e.message);
  }
});

document.addEventListener('submit', async event => {
  event.preventDefault();

  const f = event.target;
  const b = Object.fromEntries(new FormData(f));
  const button = f.querySelector('button');

  button.disabled = true;
  notify('');

  try {
    if (f.id === 'chat-form') {
      chatBusy = true;
      button.textContent = 'Preparing response…';

      const r = await api('/chat', 'POST', {
        message: b.message,
        conversationId
      });

      conversationId = r.conversationId;
      chatBusy = false;
    }

    if (f.id === 'record-form') {
      await api('/records', 'POST', {
        ...b,
        amount: Number(b.amount)
      });
    }

    if (f.id === 'reminder-form') {
      await api('/reminders', 'POST', b);
    }

    if (f.id === 'report-form') {
      await api('/reports', 'POST', b);
    }

    if (f.id === 'profile-form') {
      await api('/profile', 'PUT', {
        ...b,
        area: Number(b.area),
        reminders: !!b.reminders,
        aiConsent: !!b.aiConsent
      });
    }

    await refresh();

    if (f.id !== 'chat-form') {
      notify('Saved successfully.');
    }
  } catch (e) {
    chatBusy = false;
    button.disabled = false;

    if (f.id === 'chat-form') {
      button.textContent = 'Send question';
    }

    notify(e.message);
  }
});

setInterval(() => {
  if (state) {
    $('#alert-count').textContent = state.profile.reminders
      ? state.reminders.filter(r => !r.done && r.dueDate <= today()).length
      : '';
  }
}, 30000);

refresh().catch(e => {
  notify(`Unable to load the workspace: ${e.message}`);
});
chat = function () { const c=state.conversations.find(c=>c.id===conversationId); return '<div class="warning">AI chat is disabled on this hosted version.</div>' + (c ? '<div class="card">'+c.messages.map(m=>'<div class="message"><small>'+escape(m.role)+'</small><pre>'+escape(m.text)+'</pre></div>').join('')+'</div>' : ''); };

const hostedObserver = new MutationObserver(() => { const consent=document.querySelector('input[name="aiConsent"]'); if(consent){consent.checked=false;consent.disabled=true;consent.closest('label').hidden=true;} const language=document.querySelector('select[name="language"]');if(language){language.closest('label').hidden=true;} }); hostedObserver.observe(document.querySelector('#content'),{childList:true});

if(document.modelContext?.registerTool){try{Promise.resolve(document.modelContext.registerTool({name:'read_farm_summary',description:'Read totals for the current farm workspace.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true,untrustedContentHint:true},execute:async(input)=>{if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).length)throw Error('Expected an empty object');await refresh();return {analytics:state.analytics,records:state.records.length,reports:state.reports.length};}})).catch(()=>{});}catch{}}
