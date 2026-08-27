// --- KONFIGURATION & DATEN ---
const produkte = [
    { name: "Cola",           preis: 3.00, icon: "bottle", c1: "#c1272d", c2: "#7a1a1f", badge: "🥤" },
    { name: "Cola Zero",      preis: 3.00, icon: "bottle", c1: "#2e2b2b", c2: "#0c0b0b", badge: "⚫" },
    { name: "Red Bull",       preis: 3.50, icon: "can",    c1: "#2f5fc7", c2: "#122a63", badge: "⚡" },
    { name: "Eiste Zitrone",  preis: 3.00, icon: "glass",  c1: "#f2d94e", c2: "#d1ac1a", badge: "🍋" },
    { name: "Eiste Pfirsich", preis: 3.00, icon: "glass",  c1: "#f4a35f", c2: "#dd7a35", badge: "🍑" }
];

// Alle Daten unten (users/trans/archive/matches/predictions) kommen live aus
// Firebase Realtime Database (siehe firebase-config.js) und werden von den
// Listenern in initFirebaseSync() befüllt — hier nur leere Startwerte.
let users = ["Gast"];
let trans = [];
let archive = [];
let revenueOffset = 0;
let matches = [];
let predictions = [];

let isSuperUser = localStorage.getItem('isSuperUser') === 'true';
let soundEnabled = localStorage.getItem('aj_sound') !== 'off';
let viewDate = new Date();
let chart = null;
let pendingAdminAction = null;
let currentPendingDrink = null;
const ADMIN_PASSWORD = "122461";

let pinBuffer = "";
let extraAmountStr = "0";
let personPickerCallback = null;

let currentWettenSubTab = 'live';
let tipDraft = null;
let goalDraft = null;

// --- CORE LOGIK ---
function init() {
    applyStoredTheme();
    renderDrinks();
    checkSuperUser();
    buildKeypad('admin-keypad', onAdminKey);
    buildKeypad('extra-keypad', onExtraKey, true);
    updateSoundIcon();
    startClock();
    setGreeting();
    startWettenTicker();
    initFirebaseSync();
    sync();
    syncWetten();
}

// --- FIREBASE REALTIME SYNC ---
function snapshotToArray(snap) {
    const val = snap.val();
    if (!val) return [];
    return Object.entries(val).map(([id, item]) => ({ ...item, id }));
}

function matchesSnapshotToArray(snap) {
    const val = snap.val();
    if (!val) return [];
    return Object.entries(val).map(([id, m]) => ({
        ...m,
        id,
        goals: m.goals ? Object.entries(m.goals).map(([gid, g]) => ({ ...g, id: gid })) : []
    }));
}

function initFirebaseSync() {
    const banner = document.getElementById('db-warning-banner');
    if (!FIREBASE_CONFIGURED) {
        banner.classList.add('show');
        setSyncStatus('offline', 'Nicht konfiguriert');
        return;
    }
    banner.classList.remove('show');
    setSyncStatus('offline', 'Verbinde…');

    firebase.auth().signInAnonymously().catch(err => {
        console.error('Firebase Anmeldung fehlgeschlagen:', err);
        setSyncStatus('offline', 'Anmeldung fehlgeschlagen');
    });

    firebase.auth().onAuthStateChanged(user => {
        if (user) attachDbListeners();
    });
}

function attachDbListeners() {
    db.ref('.info/connected').on('value', snap => {
        setSyncStatus(snap.val() === true ? 'online' : 'offline', snap.val() === true ? 'Live verbunden' : 'Verbinde…');
    });

    db.ref('kassa/users').on('value', snap => { users = snap.val() || ["Gast"]; sync(); });
    db.ref('kassa/trans').on('value', snap => { trans = snapshotToArray(snap); sync(); });
    db.ref('kassa/archive').on('value', snap => { archive = snapshotToArray(snap); sync(); });
    db.ref('kassa/revenueOffset').on('value', snap => { revenueOffset = snap.val() || 0; sync(); });
    db.ref('wetten/matches').on('value', snap => { matches = matchesSnapshotToArray(snap); syncWetten(); });
    db.ref('wetten/predictions').on('value', snap => { predictions = snapshotToArray(snap); syncWetten(); });
}

function setSyncStatus(state, text) {
    const el = document.getElementById('sync-status');
    if (!el) return;
    el.classList.remove('online', 'offline');
    el.classList.add(state);
    document.getElementById('sync-status-text').textContent = text;
}

// Kleine Wrapper, damit die App nicht abstürzt, solange firebase-config.js
// noch nicht mit echten Werten befüllt ist, und Schreibfehler sichtbar werden.
function handleDbError(err) {
    console.error('Firebase Fehler:', err);
    showBookingToast('⚠️ Speichern fehlgeschlagen – Verbindung prüfen');
}
function dbPush(path, value) {
    if (!db) { console.warn('Firebase nicht konfiguriert – Aktion wurde nicht gespeichert.'); return; }
    const ref = db.ref(path).push(value);
    ref.catch(handleDbError);
    return ref;
}
function dbSet(path, value) {
    if (!db) { console.warn('Firebase nicht konfiguriert – Aktion wurde nicht gespeichert.'); return; }
    return db.ref(path).set(value).catch(handleDbError);
}
function dbUpdate(path, value) {
    if (!db) { console.warn('Firebase nicht konfiguriert – Aktion wurde nicht gespeichert.'); return; }
    return db.ref(path).update(value).catch(handleDbError);
}
function dbRemove(path) {
    if (!db) { console.warn('Firebase nicht konfiguriert – Aktion wurde nicht gespeichert.'); return Promise.resolve(); }
    return db.ref(path).remove().catch(handleDbError);
}

// --- THEME ---
function applyStoredTheme() {
    const theme = localStorage.getItem('aj_theme');
    if (theme === 'dark') {
        document.documentElement.setAttribute('data-theme', 'dark');
        setThemeIcon(true);
    }
}
function toggleTheme() {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    if (isDark) {
        document.documentElement.removeAttribute('data-theme');
        localStorage.setItem('aj_theme', 'light');
        setThemeIcon(false);
    } else {
        document.documentElement.setAttribute('data-theme', 'dark');
        localStorage.setItem('aj_theme', 'dark');
        setThemeIcon(true);
    }
}
function setThemeIcon(dark) {
    const btn = document.getElementById('theme-toggle');
    if (btn) btn.innerHTML = dark ? '<i class="fas fa-sun"></i>' : '<i class="fas fa-moon"></i>';
}

// --- SOUND ---
function toggleSound() {
    soundEnabled = !soundEnabled;
    localStorage.setItem('aj_sound', soundEnabled ? 'on' : 'off');
    updateSoundIcon();
    if (soundEnabled) playTone([660, 880], 0.12);
}
function updateSoundIcon() {
    const btn = document.getElementById('sound-toggle');
    if (btn) btn.innerHTML = soundEnabled ? '<i class="fas fa-volume-high"></i>' : '<i class="fas fa-volume-xmark"></i>';
}
let audioCtx = null;
function playTone(freqs, dur) {
    if (!soundEnabled) return;
    try {
        audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
        const now = audioCtx.currentTime;
        freqs.forEach((f, i) => {
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.type = 'sine';
            osc.frequency.value = f;
            const start = now + i * dur * 0.85;
            gain.gain.setValueAtTime(0.0001, start);
            gain.gain.exponentialRampToValueAtTime(0.18, start + 0.02);
            gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);
            osc.connect(gain).connect(audioCtx.destination);
            osc.start(start);
            osc.stop(start + dur + 0.05);
        });
    } catch (e) { /* Web Audio nicht verfügbar */ }
}
function playBookChime() { playTone([784, 1046.5], 0.14); }
function playPayChime() { playTone([523.25, 659.25, 783.99], 0.13); }
function playGoalChime() { playTone([523.25, 659.25, 783.99, 1046.5], 0.1); }
function playWinChime() { playTone([523.25, 659.25, 783.99, 1046.5, 1318.51], 0.16); }

// --- CLOCK & GREETING ---
function startClock() {
    const update = () => {
        const el = document.getElementById('live-clock');
        if (el) el.textContent = new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
    };
    update();
    setInterval(update, 15000);
}
function setGreeting() {
    const h = new Date().getHours();
    const g = h < 11 ? "Guten Morgen" : h < 17 ? "Schönen Tag" : "Guten Abend";
    const el = document.getElementById('greeting-text');
    if (el) el.textContent = `${g} — Alevitische Jugend Linz`;
}

// --- ADMIN & AUTH SYSTEM ---
function checkSuperUser() {
    document.body.classList.toggle('admin-logged-in', isSuperUser);
}

function handleLogoClick() {
    if (!isSuperUser) {
        requireAdmin();
    } else {
        if (confirm("Möchtest du dich abmelden?")) logout();
    }
}

function requireAdmin(callback = null) {
    if (isSuperUser) { if (callback) callback(); return; }
    pendingAdminAction = callback;
    pinBuffer = "";
    renderPinDots();
    document.getElementById('pin-error').classList.remove('show');
    document.getElementById('admin-login-modal').style.display = 'flex';
}

function buildKeypad(containerId, handler, isExtra) {
    const el = document.getElementById(containerId);
    if (!el) return;
    const keys = ['1','2','3','4','5','6','7','8','9', isExtra ? ',' : 'C', '0', 'back'];
    el.innerHTML = keys.map(k => {
        if (k === 'back') return `<button class="key-action" data-key="back"><i class="fas fa-delete-left"></i></button>`;
        if (k === 'C') return `<button class="key-action" data-key="C">C</button>`;
        return `<button data-key="${k}">${k}</button>`;
    }).join('');
    el.querySelectorAll('button').forEach(btn => {
        btn.addEventListener('click', () => handler(btn.dataset.key));
    });
}

function renderPinDots() {
    const len = Math.max(ADMIN_PASSWORD.length, pinBuffer.length, 4);
    const dots = document.getElementById('pin-dots');
    dots.innerHTML = Array.from({ length: Math.max(ADMIN_PASSWORD.length, 4) }).map((_, i) =>
        `<span class="pin-dot ${i < pinBuffer.length ? 'filled' : ''}"></span>`
    ).join('');
}

function onAdminKey(key) {
    if (key === 'back') { pinBuffer = pinBuffer.slice(0, -1); renderPinDots(); return; }
    if (key === 'C') { pinBuffer = ""; renderPinDots(); return; }
    if (pinBuffer.length >= 12) return;
    pinBuffer += key;
    renderPinDots();
    if (pinBuffer.length === ADMIN_PASSWORD.length) {
        setTimeout(() => submitAdminAuth(), 120);
    }
}

function submitAdminAuth() {
    if (pinBuffer === ADMIN_PASSWORD) {
        isSuperUser = true;
        localStorage.setItem('isSuperUser', 'true');
        document.getElementById('admin-login-modal').style.display = 'none';
        checkSuperUser();
        playPayChime();
        if (pendingAdminAction) { pendingAdminAction(); pendingAdminAction = null; }
        pinBuffer = "";
    } else {
        const dots = document.getElementById('pin-dots');
        const err = document.getElementById('pin-error');
        err.classList.add('show');
        dots.classList.add('shake');
        setTimeout(() => { dots.classList.remove('shake'); pinBuffer = ""; renderPinDots(); }, 380);
    }
}

function cancelAdminAuth() {
    document.getElementById('admin-login-modal').style.display = 'none';
    pendingAdminAction = null;
    pinBuffer = "";
}

function logout() {
    isSuperUser = false;
    localStorage.setItem('isSuperUser', 'false');
    document.body.classList.remove('admin-logged-in');
    showSection('kassa');
}

// --- DRINK ICONS ---
function drinkIconSvg(p) {
    const use = p.icon === 'bottle' ? '#icon-bottle' : p.icon === 'can' ? '#icon-can' : '#icon-glass';
    const gradId = 'g_' + p.name.replace(/\s+/g, '_');
    return `
        <svg viewBox="0 0 100 160">
            <defs>
                <linearGradient id="${gradId}" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stop-color="${p.c1}"/>
                    <stop offset="100%" stop-color="${p.c2}"/>
                </linearGradient>
            </defs>
            <use href="${use}" fill="url(#${gradId})"/>
        </svg>
        <span class="drink-icon-shine"></span>
    `;
}

// --- BUCHUNGS-LOGIK ---
function renderDrinks() {
    const grid = document.getElementById('drink-grid');
    grid.innerHTML = produkte.map(p => `
        <div class="drink-card">
            <span class="drink-badge">${p.badge}</span>
            <div class="drink-icon-wrap">${drinkIconSvg(p)}</div>
            <h3>${p.name}</h3>
            <p class="drink-price">${p.preis.toFixed(2)} €</p>
            <button class="btn-book" onclick="buy('${p.name.replace(/'/g, "\\'")}', ${p.preis})">Buchen</button>
        </div>
    `).join('') + `
        <div class="drink-card drink-card--extra" onclick="openExtraModal()">
            <i class="fas fa-circle-plus"></i>
            <h3>Extra</h3>
        </div>
    `;
}

function buy(name, preis) {
    currentPendingDrink = { name, preis };
    openPersonPicker(`${name} · ${preis.toFixed(2)} €`, confirmBookingForUser);
}

// --- GENERISCHER PERSON-PICKER (Buchung & Tipps) ---
function openPersonPicker(promptText, callback) {
    personPickerCallback = callback;
    document.getElementById('user-modal-item-name').textContent = promptText;
    const searchInput = document.getElementById('user-search-input');
    searchInput.value = "";
    renderUserTiles(users);
    document.getElementById('user-select-modal').style.display = 'flex';
    setTimeout(() => searchInput.focus(), 150);
}

function renderUserTiles(list) {
    const container = document.getElementById('user-selection-list');
    if (list.length === 0) {
        container.innerHTML = `<div class="user-tile-empty"><i class="fas fa-user-slash"></i><p>Kein Treffer.</p></div>`;
        return;
    }
    container.innerHTML = list.map(u => `
        <div onclick="onPersonPicked('${u.replace(/'/g, "\\'")}')" class="user-grid-item">
            <span>${u}</span>
            <i class="fas fa-chevron-right"></i>
        </div>
    `).join('');
}

function onPersonPicked(name) {
    const cb = personPickerCallback;
    document.getElementById('user-select-modal').style.display = 'none';
    personPickerCallback = null;
    if (cb) cb(name);
}

function filterUserModal(query) {
    const q = query.trim().toLowerCase();
    renderUserTiles(q ? users.filter(u => u.toLowerCase().includes(q)) : users);
}

function showItemDetails(userName) {
    requireAdmin(() => {
        const modal = document.getElementById('item-details-modal');
        const container = document.getElementById('item-list-container');
        document.getElementById('details-user-name').innerHTML = `Korrektur: ${userName}`;

        const userItems = trans.filter(t => t.person === userName);

        if (userItems.length === 0) {
            container.innerHTML = `
                <div class="detail-empty">
                    <i class="fas fa-circle-check"></i>
                    <p>Alles erledigt! Keine offenen Posten.</p>
                </div>`;
        } else {
            container.innerHTML = userItems.map(t => `
                <div class="correction-item">
                    <div>
                        <div style="font-weight:800;">${t.product}</div>
                        <div style="font-size:0.8rem; color:var(--ink-soft);">
                            <i class="far fa-clock"></i> ${new Date(t.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </div>
                    </div>
                    <div style="display:flex; align-items:center; gap:14px;">
                        <span style="font-weight:700; color:var(--brand);">${t.price.toFixed(2)} €</span>
                        <button class="del-btn" onclick="deleteSingleItem('${t.id}', '${userName.replace(/'/g, "\\'")}')">
                            <i class="fas fa-trash-can"></i>
                        </button>
                    </div>
                </div>
            `).join('');
        }
        modal.style.display = 'flex';
    });
}

function confirmBookingForUser(userName) {
    if (!currentPendingDrink) return;
    const { name, preis } = currentPendingDrink;

    dbPush('kassa/trans', {
        person: userName,
        product: name,
        price: preis,
        date: new Date().toISOString(),
        status: 'open'
    });

    showBookingToast(`${name} für ${userName}`);
    fireConfetti();
    playBookChime();
    currentPendingDrink = null;
}

function closeUserModal() {
    document.getElementById('user-select-modal').style.display = 'none';
    currentPendingDrink = null;
    personPickerCallback = null;
}

function deleteSingleItem(txId, userName) {
    if (confirm("Dieses Produkt stornieren? (Kein Einfluss auf Umsatz-Archiv)")) {
        dbRemove('kassa/trans/' + txId).then(() => showItemDetails(userName));
    }
}

function closeDetailsModal() {
    document.getElementById('item-details-modal').style.display = 'none';
}

// --- CORE SYSTEM (SYNC) ---
function sync() {
    users = [...users].sort();
    renderActiveUserSelect();

    const tbody = document.getElementById('user-billing-body');
    if (tbody) {
        tbody.innerHTML = users.map(u => {
            const userTrans = trans.filter(t => t.person === u);
            const total = userTrans.reduce((s, t) => s + t.price, 0);
            const count = userTrans.length;

            const itemsBadge = count === 0
                ? `<span class="items-badge badge-empty"><i class="fas fa-circle" style="font-size:0.5rem; opacity:0.5;"></i> 0</span>`
                : `<span class="items-badge badge-open" onclick="showItemDetails('${u.replace(/'/g, "\\'")}')"><i class="fas fa-basket-shopping"></i> ${count}</span>`;

            return `
                <tr>
                    <td><div style="font-weight:800; font-size:1.05rem;">${u}</div></td>
                    <td>${itemsBadge}</td>
                    <td><div style="font-weight:800; color:var(--brand); font-size:1.05rem;">${total.toFixed(2)} €</div></td>
                    <td>
                        <div class="action-buttons">
                            <button onclick="pay('${u.replace(/'/g, "\\'")}')" class="btn-pay"><i class="fas fa-circle-check"></i></button>
                            <button onclick="removeUser('${u.replace(/'/g, "\\'")}')" class="btn-delete"><i class="fas fa-circle-minus"></i></button>
                        </div>
                    </td>
                </tr>`;
        }).join('');
    }

    renderAdminBookings();
    if (document.getElementById('section-stats').classList.contains('active-section')) updateStats();
}

function renderActiveUserSelect() {
    const sel = document.getElementById('active-user-select');
    if (!sel) return;
    const prev = sel.value;
    sel.innerHTML = users.map(u => `<option value="${u}">${u}</option>`).join('');
    if (users.includes(prev)) sel.value = prev;
}

function pay(name) {
    requireAdmin(() => {
        const userTrans = trans.filter(t => t.person === name);
        if (userTrans.length === 0) return;
        if (confirm(`${name} hat bezahlt?`)) {
            const updates = {};
            userTrans.forEach(t => {
                const { id, ...rest } = t;
                updates['kassa/archive/' + id] = { ...rest, status: 'paid' };
                updates['kassa/trans/' + id] = null;
            });
            if (db) db.ref().update(updates).then(() => playPayChime()).catch(handleDbError);
            else console.warn('Firebase nicht konfiguriert – Aktion wurde nicht gespeichert.');
        }
    });
}

function removeUser(name) {
    requireAdmin(() => {
        if (confirm(`${name} löschen?`)) {
            dbSet('kassa/users', users.filter(u => u !== name));
        }
    });
}

function showBookingToast(message) {
    const existing = document.getElementById('booking-toast');
    if (existing) existing.remove();
    const toast = document.createElement('div');
    toast.id = 'booking-toast';
    toast.className = 'booking-toast';
    toast.innerHTML = `<i class="fas fa-circle-check"></i> Gebucht: ${message}`;
    document.body.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('show'));
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 260);
    }, 1600);
}

function fireConfetti() {
    const colors = ['#a8342c', '#c9932f', '#5c6e4f', '#e2b45a', '#c9564a'];
    const originX = window.innerWidth / 2;
    const originY = window.innerHeight - 120;
    for (let i = 0; i < 18; i++) {
        const piece = document.createElement('div');
        piece.className = 'confetti-piece';
        piece.style.background = colors[i % colors.length];
        piece.style.left = originX + 'px';
        piece.style.top = originY + 'px';
        const angle = (Math.random() * Math.PI) - Math.PI / 2 - Math.PI / 2;
        const dist = 60 + Math.random() * 140;
        const dx = Math.cos(angle) * dist;
        const dy = Math.sin(angle) * dist - 80;
        const rot = Math.random() * 480 - 240;
        piece.animate([
            { transform: `translate(0,0) rotate(0deg)`, opacity: 1 },
            { transform: `translate(${dx}px, ${dy + 220}px) rotate(${rot}deg)`, opacity: 0 }
        ], { duration: 900 + Math.random() * 400, easing: 'cubic-bezier(.2,.7,.4,1)' });
        document.body.appendChild(piece);
        setTimeout(() => piece.remove(), 1350);
    }
}

// --- STATS & NAV ---
function showSection(id) {
    document.querySelectorAll('section').forEach(s => s.className = 'hidden-section');
    document.getElementById(`section-${id}`).className = 'active-section';
    document.querySelectorAll('nav li[id^="nav-"]').forEach(l => l.classList.remove('active'));
    const navEl = document.getElementById(`nav-${id}`);
    if (navEl) navEl.classList.add('active');
    document.querySelectorAll('.mobile-tabbar button').forEach(b => b.classList.remove('tab-active'));
    const tabEl = document.getElementById(`tab-${id}`);
    if (tabEl) tabEl.classList.add('tab-active');
    if (id === 'stats') requireAdmin(() => updateStats());
    if (id === 'wetten') showWettenTab(currentWettenSubTab);
}

function updateStats() {
    if (!isSuperUser) return;
    const m = viewDate.getMonth();
    const y = viewDate.getFullYear();
    document.getElementById('current-month-display').innerText = viewDate.toLocaleString('de-DE', { month: 'long', year: 'numeric' });

    const allTrans = [...trans, ...archive];
    const monthlyData = allTrans.filter(t => {
        const d = new Date(t.date);
        return d.getMonth() === m && d.getFullYear() === y;
    });

    const monthRevenue = monthlyData.reduce((s, t) => s + t.price, 0);
    const totalRevenue = allTrans.reduce((s, t) => s + t.price, 0) + revenueOffset;

    document.getElementById('month-revenue').innerText = monthRevenue.toFixed(2) + " €";
    document.getElementById('total-revenue').innerText = totalRevenue.toFixed(2) + " €";
    document.getElementById('month-sales-count').innerText = monthlyData.length;
    document.getElementById('avg-sale').innerText = (monthlyData.length > 0 ? monthRevenue / monthlyData.length : 0).toFixed(2) + " €";

    renderRankings(monthlyData);
    renderJournal(allTrans);
    renderChart(allTrans);
}

function renderRankings(data) {
    const counts = {};
    data.forEach(t => { counts[t.product] = (counts[t.product] || 0) + 1; });
    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 5);
    document.getElementById('top-lists-content').innerHTML = sorted.length
        ? sorted.map(([n, c]) => `<div class="rank-item"><span>${n}</span><span>${c}x</span></div>`).join('')
        : `<p style="color:var(--ink-soft); font-size:.9rem;">Noch keine Verkäufe.</p>`;
}

function renderJournal(data) {
    const latest = [...data].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 50);
    document.getElementById('journal-body').innerHTML = latest.map(t => `
        <tr>
            <td><small>${new Date(t.date).toLocaleDateString('de-DE')}</small></td>
            <td>${t.person}</td>
            <td>${t.product}</td>
            <td>${t.price.toFixed(2)} €</td>
            <td><span class="status-badge ${t.status}">${t.status === 'paid' ? 'Bezahlt' : 'Offen'}</span></td>
        </tr>`).join('');
}

function renderChart(dataList) {
    const ctx = document.getElementById('revenueChart').getContext('2d');
    if (chart) chart.destroy();
    const styles = getComputedStyle(document.documentElement);
    const brand = styles.getPropertyValue('--brand').trim() || '#a8342c';
    const gold = styles.getPropertyValue('--gold').trim() || '#c9932f';
    const labels = []; const chartData = [];
    for (let i = 5; i >= 0; i--) {
        let d = new Date(); d.setMonth(d.getMonth() - i);
        labels.push(d.toLocaleString('de-DE', { month: 'short' }));
        chartData.push(dataList.filter(t => {
            const td = new Date(t.date);
            return td.getMonth() === d.getMonth() && td.getFullYear() === d.getFullYear();
        }).reduce((s, x) => s + x.price, 0));
    }
    chart = new Chart(ctx, {
        type: 'line',
        data: {
            labels,
            datasets: [{
                label: 'Umsatz', data: chartData, borderColor: brand,
                backgroundColor: gold + '33', fill: true, tension: 0.4,
                pointBackgroundColor: brand, pointRadius: 4
            }]
        },
        options: { plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } }
    });
}

function renderAdminBookings() {
    const allHistory = [...trans, ...archive].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 20);
    document.getElementById('admin-booking-body').innerHTML = allHistory.map(t => `
        <tr>
            <td>${new Date(t.date).toLocaleDateString('de-DE')}</td>
            <td>${t.person}</td>
            <td>${t.product}</td>
            <td>${t.price.toFixed(2)} €</td>
            <td>${t.status === 'paid' ? '✅ Bezahlt' : 'Offen'}</td>
        </tr>`).join('');
}

function changeMonth(delta) { viewDate.setMonth(viewDate.getMonth() + delta); updateStats(); }

function addUser() {
    const n = document.getElementById('new-user-name');
    if (n.value.trim()) { dbSet('kassa/users', [...users, n.value.trim()]); n.value = ""; }
}

// --- EXTRA MODAL (Ziffernblock) ---
function openExtraModal() {
    extraAmountStr = "0";
    document.getElementById('modal-extra-desc').value = "";
    updateExtraDisplay();
    document.getElementById('extra-modal').style.display = 'flex';
}
function closeExtraModal() { document.getElementById('extra-modal').style.display = 'none'; }

function onExtraKey(key) {
    if (key === 'back') {
        extraAmountStr = extraAmountStr.length > 1 ? extraAmountStr.slice(0, -1) : "0";
    } else if (key === ',') {
        if (!extraAmountStr.includes('.')) extraAmountStr += '.';
    } else {
        if (extraAmountStr.includes('.') && extraAmountStr.split('.')[1].length >= 2) return;
        extraAmountStr = extraAmountStr === "0" ? key : extraAmountStr + key;
        if (extraAmountStr.length > 8) extraAmountStr = extraAmountStr.slice(0, 8);
    }
    updateExtraDisplay();
}

function updateExtraDisplay() {
    let display;
    if (extraAmountStr.endsWith('.')) {
        display = extraAmountStr.slice(0, -1) + ',';
    } else if (extraAmountStr.includes('.')) {
        const [intPart, fracPart] = extraAmountStr.split('.');
        display = `${intPart || '0'},${fracPart}`;
    } else {
        display = extraAmountStr;
    }
    document.getElementById('extra-amount-value').textContent = display;
}

function confirmExtra() {
    const d = document.getElementById('modal-extra-desc').value.trim();
    const a = parseFloat(extraAmountStr);
    if (!isNaN(a) && a > 0) {
        currentPendingDrink = { name: d || 'Extra', preis: a };
        closeExtraModal();
        openPersonPicker(`${currentPendingDrink.name} · ${a.toFixed(2)} €`, confirmBookingForUser);
    }
}

// ==========================================================================
// WETTEN — Tippspiel (Ergebnis + 1x Torschütze)
// ==========================================================================

function syncWetten() {
    populateScorerSuggestions();
    const panelVisible = (tab) => document.getElementById(`wetten-panel-${tab}`) && !document.getElementById(`wetten-panel-${tab}`).classList.contains('hidden-section');
    if (panelVisible('live')) renderMatchesList();
    if (panelVisible('history')) renderHistoryList();
    if (panelVisible('board')) renderLeaderboard();
}

function startWettenTicker() {
    setInterval(() => {
        const wettenActive = document.getElementById('section-wetten').classList.contains('active-section');
        const liveVisible = wettenActive && !document.getElementById('wetten-panel-live').classList.contains('hidden-section');
        if (liveVisible) renderMatchesList();
    }, 20000);
}

function showWettenTab(tab) {
    currentWettenSubTab = tab;
    ['live', 'history', 'board'].forEach(t => {
        document.getElementById(`wetten-panel-${t}`).classList.toggle('hidden-section', t !== tab);
        document.getElementById(`wsub-${t}`).classList.toggle('active', t === tab);
    });
    if (tab === 'live') renderMatchesList();
    if (tab === 'history') renderHistoryList();
    if (tab === 'board') renderLeaderboard();
}

function matchScore(match) {
    return {
        a: match.goals.filter(g => g.team === 'A').length,
        b: match.goals.filter(g => g.team === 'B').length
    };
}

function matchElapsedMinute(match) {
    if (!match.startedAt) return 0;
    const mins = Math.floor((Date.now() - new Date(match.startedAt)) / 60000);
    return Math.max(0, Math.min(mins, 130));
}

function formatCountdown(ms) {
    if (ms <= 0) return 'Jeden Moment';
    const totalMin = Math.floor(ms / 60000);
    const days = Math.floor(totalMin / 1440);
    const hours = Math.floor((totalMin % 1440) / 60);
    const mins = totalMin % 60;
    if (days > 0) return `Anpfiff in ${days}T ${hours}Std`;
    if (hours > 0) return `Anpfiff in ${hours}Std ${mins}Min`;
    return `Anpfiff in ${mins}Min`;
}

function hashHue(str) {
    let h = 0;
    for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) % 360;
    return h;
}

function teamBadge(name) {
    const hue = hashHue(name || '?');
    const initials = (name || '?').trim().split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase();
    return `<span class="team-badge" style="background:hsl(${hue},55%,40%)">${initials}</span>`;
}

function renderMatchCard(match, prevScoreMap) {
    const s = matchScore(match);
    const key = match.id;
    const pulse = prevScoreMap && prevScoreMap[key] !== undefined && prevScoreMap[key] !== (s.a + '-' + s.b);

    const statusInfo = match.status === 'upcoming'
        ? { label: formatCountdown(new Date(match.kickoff) - new Date()), cls: 'status-upcoming', icon: '⏳' }
        : match.status === 'live'
            ? { label: `LIVE · ${matchElapsedMinute(match)}'`, cls: 'status-live', icon: '' }
            : { label: 'Beendet', cls: 'status-finished', icon: '✅' };

    const scoreDisplay = match.status === 'upcoming'
        ? `<div class="score-box score-box--vs"><span>VS</span></div>`
        : `<div class="score-box"><span class="score-num ${pulse ? 'score-pulse' : ''}">${s.a}</span><span class="score-colon">:</span><span class="score-num ${pulse ? 'score-pulse' : ''}">${s.b}</span></div>`;

    const goalsHtml = match.goals.length
        ? match.goals.slice().reverse().map(g => `
            <div class="goal-feed-item">⚽ <b>${g.minute}'</b> ${g.player} <span class="goal-team-tag">(${g.team === 'A' ? match.teamA : match.teamB})</span></div>
        `).join('')
        : `<p class="goal-feed-empty">Noch keine Tore.</p>`;

    const adminTools = `
        <div class="admin-match-tools admin-only-inline">
            ${match.status === 'upcoming' ? `<button onclick="startMatch('${match.id}')"><i class="fas fa-play"></i> Anpfiff</button>` : ''}
            ${match.status === 'live' ? `
                <button onclick="openGoalModal('${match.id}','A')"><i class="fas fa-futbol"></i> Tor ${match.teamA}</button>
                <button onclick="openGoalModal('${match.id}','B')"><i class="fas fa-futbol"></i> Tor ${match.teamB}</button>
                ${match.goals.length ? `<button onclick="undoLastGoal('${match.id}')"><i class="fas fa-rotate-left"></i></button>` : ''}
            ` : ''}
            ${match.status === 'live' ? `<button onclick="finishMatch('${match.id}')"><i class="fas fa-flag-checkered"></i> Abpfiff</button>` : ''}
            <button class="tool-danger" onclick="deleteMatch('${match.id}')"><i class="fas fa-trash-can"></i></button>
        </div>`;

    const cta = match.status === 'upcoming'
        ? `<button class="btn-book tip-cta" onclick="openTipFlow('${match.id}')"><i class="fas fa-ticket"></i> Jetzt tippen</button>`
        : match.status === 'live'
            ? `<button class="btn-book tip-cta" onclick="openTipFlow('${match.id}')"><i class="fas fa-eye"></i> Meinen Tipp ansehen</button>`
            : `<button class="btn-book tip-cta" onclick="openWinnerReveal('${match.id}')"><i class="fas fa-trophy"></i> Ergebnis & Gewinner</button>`;

    return `
    <div class="match-card">
        <div class="match-top">
            <span class="competition-tag">${match.competition || 'Freundschaftsspiel'}</span>
            <span class="status-pill ${statusInfo.cls}">${statusInfo.icon} ${statusInfo.label}</span>
        </div>
        <div class="match-teams">
            <div class="team-block">${teamBadge(match.teamA)}<span>${match.teamA}</span></div>
            ${scoreDisplay}
            <div class="team-block">${teamBadge(match.teamB)}<span>${match.teamB}</span></div>
        </div>
        <div class="goal-feed">${goalsHtml}</div>
        ${adminTools}
        ${cta}
    </div>`;
}

let lastScoreSnapshot = {};

function renderMatchesList() {
    const container = document.getElementById('wetten-panel-live');
    const list = matches.filter(m => m.status !== 'finished').sort((a, b) => new Date(a.kickoff) - new Date(b.kickoff));
    if (list.length === 0) {
        container.innerHTML = `<div class="wetten-panel-empty"><i class="fas fa-futbol"></i><p>Aktuell sind keine Spiele geplant.</p></div>`;
        return;
    }
    container.innerHTML = `<div class="match-grid">${list.map(m => renderMatchCard(m, lastScoreSnapshot)).join('')}</div>`;
    list.forEach(m => { const s = matchScore(m); lastScoreSnapshot[m.id] = s.a + '-' + s.b; });
}

function renderHistoryList() {
    const container = document.getElementById('wetten-panel-history');
    const list = matches.filter(m => m.status === 'finished').sort((a, b) => new Date(b.kickoff) - new Date(a.kickoff));
    if (list.length === 0) {
        container.innerHTML = `<div class="wetten-panel-empty"><i class="fas fa-clock-rotate-left"></i><p>Noch keine beendeten Spiele.</p></div>`;
        return;
    }
    container.innerHTML = `<div class="match-grid">${list.map(m => renderMatchCard(m)).join('')}</div>`;
}

function computeLeaderboard() {
    const stats = {};
    matches.filter(m => m.status === 'finished').forEach(match => {
        const s = matchScore(match);
        predictions.filter(p => p.matchId === match.id).forEach(p => {
            stats[p.user] = stats[p.user] || { tips: 0, resultsCorrect: 0, scorerCorrect: 0, wins: 0 };
            const st = stats[p.user];
            st.tips++;
            const resultOk = p.scoreA === s.a && p.scoreB === s.b;
            const scorerOk = match.goals.some(g => g.player.trim().toLowerCase() === p.scorer.trim().toLowerCase());
            if (resultOk) st.resultsCorrect++;
            if (scorerOk) st.scorerCorrect++;
            if (resultOk && scorerOk) st.wins++;
        });
    });
    return Object.entries(stats)
        .map(([user, st]) => ({ user, ...st }))
        .sort((a, b) => b.wins - a.wins || b.resultsCorrect - a.resultsCorrect || a.tips - b.tips);
}

function renderLeaderboard() {
    const container = document.getElementById('wetten-panel-board');
    const rows = computeLeaderboard();
    if (rows.length === 0) {
        container.innerHTML = `<div class="wetten-panel-empty"><i class="fas fa-ranking-star"></i><p>Noch keine ausgewerteten Tipps.</p></div>`;
        return;
    }
    const medals = ['🥇', '🥈', '🥉'];
    container.innerHTML = `<div class="card leaderboard-card">` + rows.map((r, i) => `
        <div class="leaderboard-row ${i < 3 ? 'top-' + (i + 1) : ''}">
            <div class="lb-rank">${medals[i] || (i + 1)}</div>
            <div class="lb-name">${r.user}</div>
            <div class="lb-stats">
                <span><b>${r.tips}</b> Tipps</span>
                <span><b>${r.resultsCorrect}</b> Ergebnis</span>
                <span><b>${r.scorerCorrect}</b> Torschütze</span>
            </div>
            <div class="lb-wins">${r.wins} 🏆</div>
        </div>
    `).join('') + `</div>`;
}

// --- ADMIN: SPIEL ANLEGEN / STEUERN ---
function openCreateMatchModal() {
    requireAdmin(() => {
        document.getElementById('cm-teamA').value = '';
        document.getElementById('cm-teamB').value = '';
        document.getElementById('cm-competition').value = '';
        document.getElementById('cm-kickoff').value = '';
        document.getElementById('create-match-modal').style.display = 'flex';
    });
}
function closeCreateMatchModal() { document.getElementById('create-match-modal').style.display = 'none'; }

function confirmCreateMatch() {
    const teamA = document.getElementById('cm-teamA').value.trim();
    const teamB = document.getElementById('cm-teamB').value.trim();
    const competition = document.getElementById('cm-competition').value.trim();
    const kickoff = document.getElementById('cm-kickoff').value;
    if (!teamA || !teamB || !kickoff) { alert('Bitte Team A, Team B und Anstoßzeit ausfüllen.'); return; }
    dbPush('wetten/matches', {
        teamA, teamB, competition,
        kickoff: new Date(kickoff).toISOString(),
        status: 'upcoming',
        startedAt: null
    });
    closeCreateMatchModal();
    showBookingToast(`Spiel angelegt: ${teamA} vs ${teamB}`);
}

function startMatch(id) {
    requireAdmin(() => {
        const match = matches.find(m => m.id === id);
        if (!match) return;
        dbUpdate('wetten/matches/' + id, { status: 'live', startedAt: new Date().toISOString() });
        showBookingToast(`Anpfiff: ${match.teamA} vs ${match.teamB}`);
    });
}

function undoLastGoal(id) {
    requireAdmin(() => {
        const match = matches.find(m => m.id === id);
        if (!match || !match.goals.length) return;
        const last = match.goals[match.goals.length - 1];
        dbRemove(`wetten/matches/${id}/goals/${last.id}`);
    });
}

function finishMatch(id) {
    requireAdmin(() => {
        const match = matches.find(m => m.id === id);
        if (!match) return;
        if (!confirm('Spiel wirklich beenden? Die Tipps werden jetzt ausgewertet.')) return;
        dbUpdate('wetten/matches/' + id, { status: 'finished' });
        openWinnerReveal(id);
    });
}

function deleteMatch(id) {
    requireAdmin(() => {
        if (!confirm('Dieses Spiel und alle zugehörigen Tipps löschen?')) return;
        const toDelete = predictions.filter(p => p.matchId === id);
        const updates = {};
        updates['wetten/matches/' + id] = null;
        toDelete.forEach(p => { updates['wetten/predictions/' + p.id] = null; });
        if (db) db.ref().update(updates).catch(handleDbError);
        else console.warn('Firebase nicht konfiguriert – Aktion wurde nicht gespeichert.');
    });
}

// --- ADMIN: LIVE-TOR EINTRAGEN ---
function populateScorerSuggestions() {
    const names = new Set();
    matches.forEach(m => m.goals.forEach(g => names.add(g.player)));
    const dl = document.getElementById('scorer-suggestions');
    if (dl) dl.innerHTML = Array.from(names).map(n => `<option value="${n.replace(/"/g, '&quot;')}">`).join('');
}

function openGoalModal(matchId, team) {
    requireAdmin(() => {
        const match = matches.find(m => m.id === matchId);
        if (!match) return;
        goalDraft = { matchId, team };
        document.getElementById('goal-modal-team').textContent = `Tor für ${team === 'A' ? match.teamA : match.teamB}`;
        document.getElementById('goal-player-input').value = '';
        document.getElementById('goal-minute-input').value = matchElapsedMinute(match) || '';
        document.getElementById('goal-modal').style.display = 'flex';
        setTimeout(() => document.getElementById('goal-player-input').focus(), 150);
    });
}
function closeGoalModal() { document.getElementById('goal-modal').style.display = 'none'; goalDraft = null; }

function confirmGoal() {
    const player = document.getElementById('goal-player-input').value.trim();
    const minute = parseInt(document.getElementById('goal-minute-input').value, 10) || 0;
    if (!player || !goalDraft) return;
    dbPush(`wetten/matches/${goalDraft.matchId}/goals`, { team: goalDraft.team, player, minute });
    closeGoalModal();
    fireConfetti();
    playGoalChime();
    showBookingToast(`⚽ Tor! ${player}`);
}

// --- TIPP ABGEBEN ---
function openTipFlow(matchId) {
    const match = matches.find(m => m.id === matchId);
    if (!match) return;
    openPersonPicker(`${match.teamA} vs ${match.teamB} · Wer tippt?`, (userName) => openTipEntryModal(matchId, userName));
}

function stepTip(team, delta) {
    if (!tipDraft) return;
    const key = team === 'A' ? 'a' : 'b';
    tipDraft[key] = Math.max(0, Math.min(15, tipDraft[key] + delta));
    document.getElementById(`tip-score-${key}`).textContent = tipDraft[key];
}

function openTipEntryModal(matchId, userName) {
    const match = matches.find(m => m.id === matchId);
    if (!match) return;
    const existing = predictions.find(p => p.matchId === matchId && p.user === userName);
    tipDraft = { matchId, user: userName, a: existing ? existing.scoreA : 0, b: existing ? existing.scoreB : 0 };

    document.getElementById('tip-entry-title').textContent = `${match.teamA} vs ${match.teamB}`;
    document.getElementById('tip-entry-eyebrow').textContent = `Tipp von ${userName}`;
    document.getElementById('tip-score-a').textContent = tipDraft.a;
    document.getElementById('tip-score-b').textContent = tipDraft.b;
    document.getElementById('tip-scorer-input').value = existing ? existing.scorer : '';

    const locked = match.status !== 'upcoming';
    document.getElementById('tip-scorer-input').disabled = locked;
    document.getElementById('tip-save-btn').style.display = locked ? 'none' : 'flex';
    const noteEl = document.getElementById('tip-locked-note');
    noteEl.textContent = existing
        ? '🔒 Dieses Spiel läuft bereits – dein Tipp ist gespeichert und gesperrt.'
        : '🔒 Dieses Spiel läuft bereits – du hast keinen Tipp mehr abgeben können.';
    noteEl.style.display = locked ? 'block' : 'none';
    document.querySelectorAll('#tip-entry-modal .stepper button').forEach(b => b.disabled = locked);

    document.getElementById('tip-entry-modal').style.display = 'flex';
}

function closeTipEntryModal() {
    document.getElementById('tip-entry-modal').style.display = 'none';
    tipDraft = null;
}

function saveTip() {
    if (!tipDraft) return;
    const scorer = document.getElementById('tip-scorer-input').value.trim();
    if (!scorer) { alert('Bitte einen Torschützen eintippen.'); return; }
    const existing = predictions.find(p => p.matchId === tipDraft.matchId && p.user === tipDraft.user);
    const entry = { matchId: tipDraft.matchId, user: tipDraft.user, scoreA: tipDraft.a, scoreB: tipDraft.b, scorer, ts: Date.now() };
    if (existing) dbSet('wetten/predictions/' + existing.id, entry);
    else dbPush('wetten/predictions', entry);
    showBookingToast(`Tipp gespeichert: ${tipDraft.a}:${tipDraft.b}, ${scorer}`);
    playBookChime();
    closeTipEntryModal();
}

// --- GEWINNER-REVEAL ---
function openWinnerReveal(matchId) {
    const match = matches.find(m => m.id === matchId);
    if (!match) return;
    const s = matchScore(match);
    const rows = predictions.filter(p => p.matchId === matchId).map(p => {
        const resultOk = p.scoreA === s.a && p.scoreB === s.b;
        const scorerOk = match.goals.some(g => g.player.trim().toLowerCase() === p.scorer.trim().toLowerCase());
        return { ...p, resultOk, scorerOk, win: resultOk && scorerOk };
    }).sort((a, b) => (b.win - a.win) || (b.resultOk - a.resultOk));

    const winners = rows.filter(r => r.win);

    document.getElementById('winner-headline').textContent = `${match.teamA} ${s.a} : ${s.b} ${match.teamB}`;
    document.getElementById('winner-names').innerHTML = winners.length
        ? winners.map(w => `<span class="winner-chip">🏆 ${w.user}</span>`).join('')
        : `<span class="winner-chip winner-chip--none">Diesmal kein Volltreffer 😅</span>`;
    document.getElementById('winner-recap-body').innerHTML = rows.length
        ? rows.map(r => `
            <tr class="${r.win ? 'winner-row' : ''}">
                <td>${r.user}</td>
                <td>${r.scoreA}:${r.scoreB} · ${r.scorer}</td>
                <td>${r.resultOk ? '✅' : '❌'}</td>
                <td>${r.scorerOk ? '✅' : '❌'}</td>
            </tr>`).join('')
        : `<tr><td colspan="4" style="text-align:center; color:var(--ink-soft);">Keine Tipps abgegeben.</td></tr>`;

    document.getElementById('winner-modal').style.display = 'flex';
    if (winners.length) {
        fireConfetti();
        setTimeout(fireConfetti, 350);
        playWinChime();
    }
}

function closeWinnerModal() {
    document.getElementById('winner-modal').style.display = 'none';
}

init();
