const API = '/api/v1';

let token = localStorage.getItem('respondent_token');
if (!token) {
  token = crypto.randomUUID();
  localStorage.setItem('respondent_token', token);
}

let currentPulse = null;
let loadedAt = null;
let timerInterval = null;

// --- Screen management ---
function show(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

// --- Fetch next question ---
async function fetchNext() {
  try {
    const res = await fetch(`${API}/questions/next`, {
      headers: { 'X-Respondent-Token': token }
    });
    if (res.status === 404) { show('empty-screen'); return; }
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
      // Already answered or other error — skip to next question
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
