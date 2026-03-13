const API = '/api/v1';

let token = localStorage.getItem('respondent_token');
if (!token) {
  token = crypto.randomUUID();
  localStorage.setItem('respondent_token', token);
}

let currentPulse = null;
let loadedAt = null;
let timerInterval = null;

// --- Activity feed ---
function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr + 'Z').getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function renderFeedCard(item) {
  return `<div class="feed-card">
    <div class="feed-card-header">
      <span class="feed-category">${item.category}</span>
      <span class="feed-time">${timeAgo(item.completed_at)}</span>
    </div>
    <p class="feed-question">${item.question}</p>
    <div class="feed-result">
      <span class="feed-dot ${item.consensus}"></span>
      <span class="feed-consensus">${item.consensus}</span>
      <span class="feed-confidence">${Math.round(item.confidence * 100)}%</span>
      <span class="feed-responses">${item.responses_used} responses</span>
    </div>
  </div>`;
}

let feedItemIds = '';

async function loadFeed() {
  const scroll = document.getElementById('feed-scroll');
  if (!scroll) return;

  try {
    const res = await fetch(`${API}/questions/recent`);
    if (!res.ok) return;
    const data = await res.json();

    if (!data.results || data.results.length === 0) {
      scroll.innerHTML = '<p class="feed-empty">No answers yet — be the first!</p>';
      return;
    }

    const newIds = data.results.map(r => r.id).join(',');
    if (newIds === feedItemIds) return; // nothing new, leave animation untouched
    feedItemIds = newIds;

    const cards = data.results.map(renderFeedCard).join('');
    // Duplicate for seamless infinite scroll loop
    scroll.innerHTML = cards + cards;
  } catch { /* silent fail — feed is optional */ }
}

loadFeed();
setInterval(loadFeed, 60000);

// --- Screen management ---
function show(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

// --- Fetch next question ---
async function fetchNext() {
  // Reset submit button state
  const submitBtn = document.getElementById('submit-btn');
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = 'Submit your answer';
  }
  if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }

  try {
    const res = await fetch(`${API}/questions/next`, {
      headers: { 'X-Respondent-Token': token }
    });
    if (!res.ok) { show('empty-screen'); return; }

    currentPulse = await res.json();
    renderQuestion(currentPulse);
    show('question-screen');
  } catch (err) {
    console.error('Fetch failed:', err);
    show('empty-screen');
  }
}

// --- Render question + timer ---
function renderQuestion(pulse) {
  document.getElementById('category-badge').textContent = pulse.category;
  document.getElementById('question-text').textContent = pulse.question;

  const ctxBlock = document.getElementById('context-block');
  if (pulse.context) {
    document.getElementById('context-text').textContent = pulse.context;
    ctxBlock.classList.remove('hidden');
  } else {
    ctxBlock.classList.add('hidden');
  }

  // Reset form state
  const form = document.getElementById('response-form');
  form.classList.add('hidden');
  document.querySelectorAll('.dir-btn').forEach(b => b.classList.remove('selected'));
  document.getElementById('submit-btn').disabled = true;
  document.getElementById('certainty-slider').value = 3;
  document.getElementById('certainty-value').textContent = '3';

  // Start reading timer
  loadedAt = Date.now();
  const ms = pulse.min_reading_time_ms || 3000;
  startTimer(ms, () => form.classList.remove('hidden'));
}

function startTimer(ms, onDone) {
  const block = document.getElementById('timer-block');
  const count = document.getElementById('timer-count');
  const bar = document.getElementById('timer-bar');

  block.classList.remove('hidden');
  let remaining = Math.ceil(ms / 1000);
  const total = remaining;
  count.textContent = remaining;
  bar.style.setProperty('--progress', '0%');

  if (timerInterval) clearInterval(timerInterval);

  timerInterval = setInterval(() => {
    remaining--;
    count.textContent = Math.max(remaining, 0);
    bar.style.setProperty('--progress', `${((total - remaining) / total) * 100}%`);

    if (remaining <= 0) {
      clearInterval(timerInterval);
      timerInterval = null;
      block.classList.add('hidden');
      onDone();
    }
  }, 1000);
}

// --- Direction buttons ---
document.querySelectorAll('.dir-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.dir-btn').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
    document.getElementById('submit-btn').disabled = false;
  });
});

// --- Certainty slider ---
document.getElementById('certainty-slider').addEventListener('input', e => {
  document.getElementById('certainty-value').textContent = e.target.value;
});

// --- Submit response ---
document.getElementById('response-form').addEventListener('submit', async e => {
  e.preventDefault();

  const direction = document.querySelector('.dir-btn.selected')?.dataset.direction;
  if (!direction) return;

  const certainty = parseInt(document.getElementById('certainty-slider').value);
  const elapsed = Date.now() - loadedAt;

  const submitBtn = document.getElementById('submit-btn');
  submitBtn.disabled = true;
  submitBtn.textContent = 'Submitting…';

  try {
    const res = await fetch(`${API}/questions/${currentPulse.id}/respond`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Respondent-Token': token
      },
      body: JSON.stringify({
        direction,
        certainty,
        time_to_respond_ms: elapsed
      })
    });

    const data = await res.json();

    if (!res.ok) {
      fetchNext();
      return;
    }

    renderResult(data.aggregate);
    show('result-screen');
  } catch (err) {
    console.error('Submit failed:', err);
    submitBtn.disabled = false;
    submitBtn.textContent = 'Submit your answer';
  }
});

// --- Render result aggregate ---
function renderResult(agg) {
  if (!agg) return;

  const chart = document.getElementById('bar-chart');
  const total = agg.total_responses;
  chart.innerHTML = '';

  [
    { key: 'yes', label: 'Yes' },
    { key: 'no', label: 'No' },
    { key: 'depends', label: 'It depends' }
  ].forEach(({ key, label }) => {
    const count = agg.distribution[key] || 0;
    const pct = total > 0 ? Math.round((count / total) * 100) : 0;
    const bar = document.createElement('div');
    bar.className = `bar bar-${key}`;
    bar.innerHTML = `
      <span class="bar-label">${label}</span>
      <div class="bar-track"><div class="bar-fill" style="width: ${pct}%"></div></div>
      <span class="bar-pct">${pct}%</span>
    `;
    chart.appendChild(bar);
  });

  document.getElementById('response-count').textContent =
    `${total} response${total !== 1 ? 's' : ''} so far`;
}

// --- Navigation ---
document.getElementById('start-btn').addEventListener('click', fetchNext);
document.getElementById('next-btn').addEventListener('click', fetchNext);
