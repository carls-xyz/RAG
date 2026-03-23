/* ── State ─────────────────────────────────────────────── */
const state = {
  depth: 2,
  indexed: false,
  history: JSON.parse(localStorage.getItem('rag_history') || '[]'),
  loading: false,
};

const SUGGESTIONS = [
  "Comment démarrer rapidement avec cette librairie ?",
  "Quels sont les concepts fondamentaux ?",
  "Comment gérer les erreurs et exceptions ?",
  "Quelles sont les meilleures pratiques ?",
  "Comment faire de l'authentification ?",
  "Quelles sont les limitations connues ?",
  "Comment déployer en production ?",
  "Y a-t-il des exemples complets ?",
];

/* ── Refs ──────────────────────────────────────────────── */
const $ = id => document.getElementById(id);

const urlInput      = $('docUrl');
const depthVal      = $('depthVal');
const indexBtn      = $('indexBtn');
const progressWrap  = $('progressWrap');
const progressBar   = $('progressBar');
const progressMsg   = $('progressMsg');
const statusBlock   = $('statusBlock');
const statusUrl     = $('statusUrl');
const statusStats   = $('statusStats');
const messagesEl    = $('messages');
const chatInput     = $('chatInput');
const sendBtn       = $('sendBtn');
const clearChatBtn  = $('clearChatBtn');
const clearIdxBtn   = $('clearIndexBtn');
const historyList   = $('historyList');
const suggestGrid   = $('suggestGrid');
const sidebarToggle = $('sidebarToggle');
const sidebar       = $('sidebar');
const groqBanner    = $('groqBanner');

/* ── Depth controls ────────────────────────────────────── */
$('depthMinus').addEventListener('click', () => {
  if (state.depth > 1) { state.depth--; depthVal.textContent = state.depth; }
});
$('depthPlus').addEventListener('click', () => {
  if (state.depth < 5) { state.depth++; depthVal.textContent = state.depth; }
});

/* ── Sidebar toggle (mobile) ───────────────────────────── */
sidebarToggle.addEventListener('click', () => sidebar.classList.toggle('open'));
document.addEventListener('click', e => {
  if (!sidebar.contains(e.target) && !sidebarToggle.contains(e.target)) {
    sidebar.classList.remove('open');
  }
});

/* ── Tabs ──────────────────────────────────────────────── */
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    tab.classList.add('active');
    $('tab-' + tab.dataset.tab).classList.add('active');
  });
});

/* ── Indexation ────────────────────────────────────────── */
indexBtn.addEventListener('click', async () => {
  const url = urlInput.value.trim();
  if (!url) return showToast('Entre une URL de documentation.');

  indexBtn.disabled = true;
  progressWrap.classList.add('visible');
  progressBar.dataset.p = '1';
  progressMsg.textContent = 'Connexion...';

  try {
    const res = await fetch('/api/index', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, depth: state.depth }),
    });

    const reader = res.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const lines = decoder.decode(value).split('\n').filter(l => l.startsWith('data:'));
      for (const line of lines) {
        const data = JSON.parse(line.slice(5));

        if (data.step === 'crawl') { progressBar.dataset.p = '1'; progressMsg.textContent = data.msg; }
        if (data.step === 'split') { progressBar.dataset.p = '2'; progressMsg.textContent = data.msg; }
        if (data.step === 'embed') { progressBar.dataset.p = '3'; progressMsg.textContent = data.msg; }

        if (data.step === 'done') {
          progressBar.dataset.p = '4';
          progressMsg.textContent = data.msg;
          setTimeout(() => { progressWrap.classList.remove('visible'); progressBar.dataset.p = '0'; }, 1200);

          state.indexed = true;
          const urlShort = url.replace(/https?:\/\//, '').replace(/\/$/, '');
          statusUrl.textContent = urlShort;
          statusStats.textContent = `${data.pages} pages · ${data.chunks} chunks`;
          statusBlock.style.display = 'flex';

          const entry = {
            url, pages: data.pages, chunks: data.chunks,
            time: new Date().toLocaleString('fr-FR', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' }),
          };
          state.history.unshift(entry);
          localStorage.setItem('rag_history', JSON.stringify(state.history));
          renderHistory();
        }

        if (data.step === 'error') {
          progressMsg.textContent = '❌ ' + data.msg;
          progressMsg.style.color = '#f87171';
          setTimeout(() => { progressWrap.classList.remove('visible'); progressMsg.style.color = ''; }, 3000);
        }
      }
    }
  } catch (e) {
    progressMsg.textContent = '❌ Erreur réseau';
    setTimeout(() => progressWrap.classList.remove('visible'), 2000);
  }

  indexBtn.disabled = false;
});

/* ── Chat ──────────────────────────────────────────────── */
chatInput.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
});
sendBtn.addEventListener('click', sendMessage);

chatInput.addEventListener('input', () => {
  chatInput.style.height = 'auto';
  chatInput.style.height = Math.min(chatInput.scrollHeight, 120) + 'px';
});

async function sendMessage() {
  const question = chatInput.value.trim();
  if (!question || state.loading) return;
  if (!state.indexed) return showToast('Indexe d\'abord une documentation.');

  const empty = $('emptyState');
  if (empty) empty.remove();

  appendMessage('user', question);
  chatInput.value = '';
  chatInput.style.height = 'auto';

  const typing = createTyping();
  messagesEl.appendChild(typing);
  scrollMessages();

  state.loading = true;
  sendBtn.disabled = true;

  try {
    const res = await fetch('/api/query', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question }),
    });

    const data = await res.json();
    typing.remove();

    if (data.error) appendMessage('error', data.error);
    else appendMessage('assistant', data.answer, data.sources);

  } catch (e) {
    typing.remove();
    appendMessage('error', 'Erreur réseau — vérifie que le serveur est lancé.');
  }

  state.loading = false;
  sendBtn.disabled = false;
  chatInput.focus();
}

function appendMessage(role, content, sources = []) {
  const el = document.createElement('div');
  el.className = `message ${role}`;
  const labels = { user: 'Vous', assistant: 'Assistant', error: 'Erreur' };
  el.innerHTML = `<div class="message-role">${labels[role] || role}</div><div class="message-content">${escapeHtml(content)}</div>`;

  if (sources && sources.length > 0) {
    const src = document.createElement('div');
    src.className = 'sources';
    src.innerHTML = `
      <button class="sources-toggle" onclick="this.nextElementSibling.classList.toggle('open'); this.textContent = this.nextElementSibling.classList.contains('open') ? '▴ Masquer les sources' : '▾ Voir les sources (${sources.length})'">
        ▾ Voir les sources (${sources.length})
      </button>
      <div class="sources-list">
        ${sources.map(s => `<a href="${s}" target="_blank" rel="noopener">${s}</a>`).join('')}
      </div>`;
    el.appendChild(src);
  }

  messagesEl.appendChild(el);
  scrollMessages();
}

function createTyping() {
  const el = document.createElement('div');
  el.className = 'typing';
  el.innerHTML = '<span></span><span></span><span></span>';
  return el;
}

function scrollMessages() { messagesEl.scrollTop = messagesEl.scrollHeight; }

/* ── Clear ─────────────────────────────────────────────── */
clearChatBtn.addEventListener('click', () => {
  messagesEl.innerHTML = `
    <div class="empty-state" id="emptyState">
      <div class="empty-icon">◆</div>
      <p class="empty-title">Prêt à répondre</p>
      <p class="empty-sub">Indexe une documentation via le panneau de gauche, puis pose tes questions.</p>
      <div class="steps">
        <div class="step"><span class="step-n">1</span>Crée un fichier .env avec ta clé Groq</div>
        <div class="step"><span class="step-n">2</span>Colle une URL et indexe</div>
        <div class="step"><span class="step-n">3</span>Pose tes questions</div>
      </div>
    </div>`;
});

clearIdxBtn.addEventListener('click', async () => {
  if (!confirm('Supprimer l\'index ChromaDB ?')) return;
  await fetch('/api/clear', { method: 'POST' });
  state.indexed = false;
  statusBlock.style.display = 'none';
  showToast('Index supprimé.');
});

/* ── History ───────────────────────────────────────────── */
function renderHistory() {
  if (!state.history.length) {
    historyList.innerHTML = '<p class="empty-text">Aucune documentation indexée pour le moment.</p>';
    return;
  }
  historyList.innerHTML = state.history.map(h => `
    <div class="history-item">
      <div class="history-url">${h.url.replace(/https?:\/\//, '').replace(/\/$/, '')}</div>
      <div class="history-meta">${h.pages} pages · ${h.chunks} chunks · ${h.time}</div>
    </div>`).join('');
}

/* ── Suggestions ───────────────────────────────────────── */
function renderSuggestions() {
  suggestGrid.innerHTML = SUGGESTIONS.map(s => `
    <button class="suggest-card" onclick="useSuggestion(this)">${s}</button>`).join('');
}

function useSuggestion(btn) {
  chatInput.value = btn.textContent;
  document.querySelector('.tab[data-tab="chat"]').click();
  sendMessage();
}

/* ── Utils ─────────────────────────────────────────────── */
function escapeHtml(str) {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\n/g,'<br>');
}

function showToast(msg) {
  const t = document.createElement('div');
  t.textContent = msg;
  Object.assign(t.style, {
    position:'fixed', bottom:'24px', right:'24px',
    background:'#1e2a45', border:'1px solid rgba(255,255,255,0.1)',
    color:'#e8eeff', borderRadius:'10px', padding:'12px 18px',
    fontSize:'13px', zIndex:'999', animation:'fadeIn 0.2s ease',
    boxShadow:'0 8px 30px rgba(0,0,0,0.4)',
  });
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 3000);
}

/* ── Init ──────────────────────────────────────────────── */
renderHistory();
renderSuggestions();

fetch('/api/status').then(r => r.json()).then(d => {
  if (d.indexed) {
    state.indexed = true;
    statusBlock.style.display = 'flex';
    statusUrl.textContent = 'Index existant chargé';
    statusStats.textContent = 'Prêt à répondre';
  }
  if (!d.groq_configured && groqBanner) {
    groqBanner.style.display = 'flex';
  }
});