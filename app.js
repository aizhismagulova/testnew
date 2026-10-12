'use strict';

const EXPENSE_CATS = ['Продукты', 'Транспорт', 'Жильё', 'Коммунальные', 'Кафе и рестораны', 'Здоровье', 'Одежда', 'Развлечения', 'Подписки', 'Образование', 'Подарки', 'Прочее'];
const INCOME_CATS = ['Зарплата', 'Подработка', 'Подарки', 'Проценты', 'Прочее'];
const STORAGE_KEY = 'finance-app-v1';
const SYMBOLS = { KZT: '₸', RUB: '₽', USD: '$', EUR: '€' };

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

let state = load();
let viewMonth = new Date().toISOString().slice(0, 7); // YYYY-MM

function load() {
  try {
    const s = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (s && Array.isArray(s.transactions)) return Object.assign(blank(), s);
  } catch (e) { /* повреждённые данные — начинаем заново */ }
  return blank();
}
function blank() { return { transactions: [], budgets: {}, goals: [], currency: 'KZT' }; }
function save() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
  catch (e) { alert('Не удалось сохранить данные: ' + e.message); }
}
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

function money(n) {
  return new Intl.NumberFormat('ru-RU', { style: 'currency', currency: state.currency, maximumFractionDigits: 0 }).format(n);
}
function esc(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function monthLabel(ym) {
  const [y, m] = ym.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' });
}
function shiftMonth(ym, d) {
  const [y, m] = ym.split('-').map(Number);
  const dt = new Date(y, m - 1 + d, 1);
  return dt.getFullYear() + '-' + String(dt.getMonth() + 1).padStart(2, '0');
}
const sum = (arr) => arr.reduce((a, t) => a + t.amount, 0);
const inMonth = (ym) => state.transactions.filter(t => t.date.startsWith(ym));

/* ---------- Рендер ---------- */
function render() {
  $('#monthLabel').textContent = monthLabel(viewMonth);
  $('#currency').value = state.currency;
  renderOverview();
  renderTransactions();
  renderBudgets();
  renderGoals();
}

function renderOverview() {
  const txs = inMonth(viewMonth);
  const inc = sum(txs.filter(t => t.type === 'income'));
  const exp = sum(txs.filter(t => t.type === 'expense'));
  const net = inc - exp;
  const reserved = state.goals.reduce((a, g) => a + g.saved, 0);
  const totalNet = sum(state.transactions.filter(t => t.type === 'income')) - sum(state.transactions.filter(t => t.type === 'expense'));

  $('#sumIncome').textContent = money(inc);
  $('#sumExpense').textContent = money(exp);
  const netEl = $('#sumNet');
  netEl.textContent = (net > 0 ? '+' : '') + money(net);
  netEl.className = 'value ' + (net >= 0 ? 'income' : 'expense');
  $('#sumFree').textContent = money(totalNet - reserved);
  $('#reservedHint').textContent = reserved ? `Отложено на цели: ${money(reserved)}` : 'За всё время';

  // расходы по категориям
  const byCat = {};
  txs.filter(t => t.type === 'expense').forEach(t => { byCat[t.category] = (byCat[t.category] || 0) + t.amount; });
  const entries = Object.entries(byCat).sort((a, b) => b[1] - a[1]);
  $('#categoryChart').innerHTML = entries.length ? entries.map(([c, v]) => `
    <div class="row"><div class="head"><span>${esc(c)}</span><span>${money(v)} · ${Math.round(v / exp * 100)}%</span></div>
    <div class="bar"><i style="width:${v / entries[0][1] * 100}%"></i></div></div>`).join('')
    : '<div class="empty">В этом месяце расходов пока нет</div>';

  // последние 6 месяцев
  const months = Array.from({ length: 6 }, (_, i) => shiftMonth(viewMonth, i - 5));
  const data = months.map(m => {
    const t = inMonth(m);
    return { m, inc: sum(t.filter(x => x.type === 'income')), exp: sum(t.filter(x => x.type === 'expense')) };
  });
  const max = Math.max(1, ...data.flatMap(d => [d.inc, d.exp]));
  $('#monthsChart').innerHTML = data.map(d => `
    <div class="col"><div class="pair">
      <i style="height:${d.inc / max * 100}%;background:var(--income)" title="Доходы: ${money(d.inc)}"></i>
      <i style="height:${d.exp / max * 100}%;background:var(--expense)" title="Расходы: ${money(d.exp)}"></i>
    </div>${new Date(d.m + '-01').toLocaleDateString('ru-RU', { month: 'short' })}</div>`).join('');
}

function fillCategories() {
  const type = $('#txForm input[name=type]:checked').value;
  const cats = type === 'income' ? INCOME_CATS : EXPENSE_CATS;
  $('#txForm select[name=category]').innerHTML = cats.map(c => `<option>${esc(c)}</option>`).join('');
}

function renderTransactions() {
  const txs = inMonth(viewMonth).sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
  $('#txList').innerHTML = txs.length ? txs.map(t => `
    <li><div class="grow"><div>${esc(t.category)}</div>
      <div class="note">${new Date(t.date).toLocaleDateString('ru-RU')}${t.note ? ' · ' + esc(t.note) : ''}</div></div>
      <strong class="${t.type}">${t.type === 'income' ? '+' : '−'}${money(t.amount)}</strong>
      <button class="del" data-del-tx="${t.id}" aria-label="Удалить">✕</button></li>`).join('')
    : '<li class="empty" style="display:block">Операций за этот месяц нет</li>';
}

function renderBudgets() {
  $('#budgetForm select[name=category]').innerHTML = EXPENSE_CATS.map(c => `<option>${esc(c)}</option>`).join('');
  const spent = {};
  inMonth(viewMonth).filter(t => t.type === 'expense').forEach(t => { spent[t.category] = (spent[t.category] || 0) + t.amount; });
  const entries = Object.entries(state.budgets);
  $('#budgetList').innerHTML = entries.length ? entries.map(([c, limit]) => {
    const s = spent[c] || 0, p = s / limit * 100;
    const cls = p >= 100 ? 'over' : p >= 80 ? 'warn' : 'ok';
    const left = limit - s;
    return `<div class="item"><div class="row" style="margin:0"><div class="head"><strong>${esc(c)}</strong>
      <span>${money(s)} из ${money(limit)}</span></div>
      <div class="bar"><i class="${cls}" style="width:${Math.min(100, p)}%"></i></div>
      <div class="hint">${left >= 0 ? 'Осталось ' + money(left) : 'Превышение на ' + money(-left)}</div></div>
      <div class="actions"><button class="danger" data-del-budget="${esc(c)}">Удалить лимит</button></div></div>`;
  }).join('') : '<div class="empty">Лимитов пока нет</div>';
}

function renderGoals() {
  $('#goalList').innerHTML = state.goals.length ? state.goals.map(g => {
    const p = Math.min(100, g.saved / g.target * 100);
    const left = Math.max(0, g.target - g.saved);
    let plan = '';
    if (left > 0 && g.deadline) {
      const days = Math.ceil((new Date(g.deadline) - new Date()) / 864e5);
      if (days > 0) plan = `До ${new Date(g.deadline).toLocaleDateString('ru-RU')} — откладывайте ~${money(left / Math.max(1, days / 30.4))} в месяц`;
      else plan = 'Срок истёк';
    }
    return `<div class="item"><div class="head row" style="margin:0 0 6px"><strong>${esc(g.name)}</strong>
      <span>${money(g.saved)} / ${money(g.target)}</span></div>
      <div class="bar"><i class="${p >= 100 ? 'ok' : ''}" style="width:${p}%"></i></div>
      <div class="hint">${p >= 100 ? '🎉 Цель достигнута!' : Math.round(p) + '% · осталось ' + money(left)}${plan ? '<br>' + plan : ''}</div>
      <div class="actions"><input type="number" min="1" step="1" placeholder="Сумма" data-amt="${g.id}">
        <button class="primary" data-add-goal="${g.id}">Пополнить</button>
        <button data-sub-goal="${g.id}">Снять</button>
        <button class="danger" data-del-goal="${g.id}">Удалить</button></div></div>`;
  }).join('') : '<div class="empty">Создайте первую финансовую цель</div>';
}

/* ---------- События ---------- */
$$('.tabs button').forEach(b => b.addEventListener('click', () => {
  $$('.tabs button').forEach(x => x.classList.toggle('active', x === b));
  $$('.tab').forEach(t => t.classList.toggle('active', t.id === 'tab-' + b.dataset.tab));
}));
$('#prevMonth').onclick = () => { viewMonth = shiftMonth(viewMonth, -1); render(); };
$('#nextMonth').onclick = () => { viewMonth = shiftMonth(viewMonth, 1); render(); };

$$('#txForm input[name=type]').forEach(r => r.addEventListener('change', fillCategories));
$('#txForm').addEventListener('submit', e => {
  e.preventDefault();
  const f = new FormData(e.target);
  const amount = parseFloat(f.get('amount'));
  if (!(amount > 0)) return;
  state.transactions.push({ id: uid(), type: f.get('type'), amount, category: f.get('category'), date: f.get('date'), note: f.get('note').trim() });
  save();
  e.target.amount.value = ''; e.target.note.value = '';
  viewMonth = f.get('date').slice(0, 7);
  render();
});

$('#budgetForm').addEventListener('submit', e => {
  e.preventDefault();
  const f = new FormData(e.target);
  state.budgets[f.get('category')] = parseFloat(f.get('limit'));
  save(); e.target.limit.value = ''; render();
});

$('#goalForm').addEventListener('submit', e => {
  e.preventDefault();
  const f = new FormData(e.target);
  state.goals.push({ id: uid(), name: f.get('name').trim(), target: parseFloat(f.get('target')), saved: 0, deadline: f.get('deadline') || '' });
  save(); e.target.reset(); render();
});

document.addEventListener('click', e => {
  const d = e.target.dataset;
  if (d.delTx) { state.transactions = state.transactions.filter(t => t.id !== d.delTx); }
  else if (d.delBudget) { delete state.budgets[d.delBudget]; }
  else if (d.delGoal) {
    const g = state.goals.find(x => x.id === d.delGoal);
    if (!confirm(`Удалить цель «${g.name}»? Отложенные ${money(g.saved)} вернутся в свободные деньги.`)) return;
    state.goals = state.goals.filter(x => x.id !== d.delGoal);
  }
  else if (d.addGoal || d.subGoal) {
    const id = d.addGoal || d.subGoal;
    const g = state.goals.find(x => x.id === id);
    const v = parseFloat($(`[data-amt="${id}"]`).value);
    if (!(v > 0)) return;
    g.saved = Math.max(0, g.saved + (d.addGoal ? v : -v));
  }
  else return;
  save(); render();
});

$('#currency').onchange = e => { state.currency = e.target.value; save(); render(); };
$('#exportBtn').onclick = () => {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' }));
  a.download = `finance-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click(); URL.revokeObjectURL(a.href);
};
$('#importFile').onchange = async e => {
  const file = e.target.files[0]; if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    if (!Array.isArray(data.transactions)) throw new Error('неверный формат');
    if (!confirm('Заменить текущие данные данными из файла?')) return;
    state = Object.assign(blank(), data); save(); render();
  } catch (err) { alert('Не удалось прочитать файл: ' + err.message); }
  e.target.value = '';
};
$('#resetBtn').onclick = () => {
  if (confirm('Удалить ВСЕ данные? Это нельзя отменить.')) { state = blank(); save(); render(); }
};

/* ---------- Старт ---------- */
$('#txForm input[name=date]').value = new Date().toISOString().slice(0, 10);
fillCategories();
render();
