// --- KONFIGURATION & DATEN ---
const produkte = [
    { name: "Cola",           preis: 3.00, icon: "bottle", c1: "#c1272d", c2: "#7a1a1f", badge: "🥤" },
    { name: "Cola Zero",      preis: 3.00, icon: "bottle", c1: "#2e2b2b", c2: "#0c0b0b", badge: "⚫" },
    { name: "Red Bull",       preis: 3.50, icon: "can",    c1: "#2f5fc7", c2: "#122a63", badge: "⚡" },
    { name: "Eiste Zitrone",  preis: 3.00, icon: "glass",  c1: "#f2d94e", c2: "#d1ac1a", badge: "🍋" },
    { name: "Eiste Pfirsich", preis: 3.00, icon: "glass",  c1: "#f4a35f", c2: "#dd7a35", badge: "🍑" }
];

const EMOJI_CHOICES = ["😀", "🔥", "⚡", "🎉", "🥇", "⚽", "🎮", "🍀", "👑", "🌟", "🐺", "🦅"];

// Alle Daten unten (users/trans/archive/matches/predictions) kommen live aus
// Firebase Realtime Database (siehe firebase-config.js) und werden von den
// Listenern in initFirebaseSync() befüllt — hier nur leere Startwerte.
let users = [normalizeUser("Gast")];
let trans = [];
let archive = [];
let revenueOffset = 0;
let matches = [];
let predictions = [];
let spieleHistory = [];

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

let showOnlyOpen = false;

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
    initRippleEffects();
    initFirebaseSync();
    sync();
    syncWetten();
}

// --- MIKRO-INTERAKTION: RIPPLE-EFFEKT AUF BUTTONS/KACHELN ---
function initRippleEffects() {
    document.addEventListener('click', e => {
        const btn = e.target.closest('.btn-primary, .btn-book, .btn-confirm-extra, .open-posten-chip, .ww-player-tile, .game-card, .totd-btn-truth, .totd-btn-dare');
        if (!btn || btn.disabled) return;
        const rect = btn.getBoundingClientRect();
        const size = Math.max(rect.width, rect.height);
        const ripple = document.createElement('span');
        ripple.className = 'ripple-effect';
        ripple.style.width = ripple.style.height = size + 'px';
        ripple.style.left = (e.clientX - rect.left - size / 2) + 'px';
        ripple.style.top = (e.clientY - rect.top - size / 2) + 'px';
        btn.appendChild(ripple);
        setTimeout(() => ripple.remove(), 620);
    });
}

// --- FIREBASE REALTIME SYNC ---
// Wandelt alte reine Namens-Strings (Altbestand) automatisch in vollwertige
// Mitgliedsprofile um, damit nichts bricht, egal was noch in der DB liegt.
function normalizeUser(u) {
    if (typeof u === 'string') {
        return { name: u, description: '', role: 'Mitglied', status: 'active', emoji: '', joinedAt: null };
    }
    return {
        description: '', role: 'Mitglied', status: 'active', emoji: '', joinedAt: null,
        ...u
    };
}

function hashHue(str) {
    let h = 0;
    for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) % 360;
    return h;
}

function avatarInitials(name) {
    return (name || '?').trim().split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase();
}
function userAvatar(profile) {
    if (profile.photo) return `<span class="user-avatar user-avatar--photo" style="background-image:url('${profile.photo}')"></span>`;
    if (profile.emoji) return `<span class="user-avatar" style="background:var(--paper-2)">${profile.emoji}</span>`;
    const hue = hashHue(profile.name || '?');
    return `<span class="user-avatar" style="background:hsl(${hue},55%,40%); color:#fff;">${avatarInitials(profile.name)}</span>`;
}

function roleBadge(profile) {
    const role = profile.role || 'Mitglied';
    return `<span class="role-badge role-${role}">${role}</span>`;
}

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

    db.ref('kassa/users').on('value', snap => { users = (snap.val() || ["Gast"]).map(normalizeUser); sync(); });
    db.ref('kassa/trans').on('value', snap => { trans = snapshotToArray(snap); sync(); });
    db.ref('kassa/archive').on('value', snap => { archive = snapshotToArray(snap); sync(); });
    db.ref('kassa/revenueOffset').on('value', snap => { revenueOffset = snap.val() || 0; sync(); });
    db.ref('wetten/matches').on('value', snap => { matches = matchesSnapshotToArray(snap); syncWetten(); });
    db.ref('wetten/predictions').on('value', snap => { predictions = snapshotToArray(snap); syncWetten(); });
    db.ref('spiele/history').on('value', snap => { spieleHistory = snapshotToArray(snap); syncSpieleHistory(); });
}

function syncSpieleHistory() {
    if (activeGamePanel === 'bestenliste') renderBestenliste();
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
    renderUserTiles(activeUsers());
    document.getElementById('user-select-modal').style.display = 'flex';
    setTimeout(() => searchInput.focus(), 150);
}

function activeUsers() {
    return users.filter(u => u.status !== 'inactive');
}

function renderUserTiles(list) {
    const container = document.getElementById('user-selection-list');
    if (list.length === 0) {
        container.innerHTML = `<div class="user-tile-empty"><i class="fas fa-user-slash"></i><p>Kein Treffer.</p></div>`;
        return;
    }
    container.innerHTML = list.map(u => `
        <div onclick="onPersonPicked('${u.name.replace(/'/g, "\\'")}')" class="user-grid-item">
            <span style="display:flex; align-items:center; gap:12px;">${userAvatar(u)} ${u.name}</span>
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
    const list = activeUsers();
    renderUserTiles(q ? list.filter(u => u.name.toLowerCase().includes(q)) : list);
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
    users = [...users].sort((a, b) => a.name.localeCompare(b.name, 'de'));
    renderActiveUserSelect();

    const countTag = document.getElementById('member-count-tag');
    if (countTag) {
        const activeCount = activeUsers().length;
        countTag.textContent = `${activeCount} aktiv${users.length !== activeCount ? ` · ${users.length - activeCount} archiviert` : ''}`;
    }

    renderUserBilling();
    renderOpenPostenPanel();
    renderAdminBookings();
    if (document.getElementById('section-stats').classList.contains('active-section')) updateStats();
}

function renderActiveUserSelect() {
    const sel = document.getElementById('active-user-select');
    if (!sel) return;
    const prev = sel.value;
    const list = activeUsers();
    sel.innerHTML = list.map(u => `<option value="${u.name}">${u.name}</option>`).join('');
    if (list.some(u => u.name === prev)) sel.value = prev;
}

function openBalanceOf(name) {
    return trans.filter(t => t.person === name).reduce((s, t) => s + t.price, 0);
}

// --- MITGLIEDERTABELLE (mit "Nur Offene"-Filter) ---
function renderUserBilling() {
    const tbody = document.getElementById('user-billing-body');
    if (!tbody) return;

    const list = showOnlyOpen ? users.filter(u => openBalanceOf(u.name) > 0) : users;

    if (showOnlyOpen && list.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; padding:30px; color:var(--ink-soft);"><i class="fas fa-circle-check"></i> Alle Salden sind ausgeglichen.</td></tr>`;
        return;
    }

    tbody.innerHTML = list.map(u => {
        const userTrans = trans.filter(t => t.person === u.name);
        const total = userTrans.reduce((s, t) => s + t.price, 0);
        const count = userTrans.length;
        const nameEsc = u.name.replace(/'/g, "\\'");
        const inactive = u.status === 'inactive';

        const itemsBadge = count === 0
            ? `<span class="items-badge badge-empty"><i class="fas fa-circle" style="font-size:0.5rem; opacity:0.5;"></i> 0</span>`
            : `<span class="items-badge badge-open" onclick="showItemDetails('${nameEsc}')"><i class="fas fa-basket-shopping"></i> ${count}</span>`;

        return `
            <tr class="${inactive ? 'member-row-inactive' : ''}">
                <td>
                    <div class="member-cell">
                        ${userAvatar(u)}
                        <div class="member-name-block">
                            <div class="member-name-row">
                                <span class="member-name">${u.name}</span>
                                ${inactive ? `<span class="inactive-tag">Archiviert</span>` : roleBadge(u)}
                            </div>
                            ${u.description ? `<span class="member-note">${u.description}</span>` : ''}
                        </div>
                    </div>
                </td>
                <td>${itemsBadge}</td>
                <td><div style="font-weight:800; color:var(--brand); font-size:1.05rem;">${total.toFixed(2)} €</div></td>
                <td>
                    <div class="action-buttons">
                        ${!inactive ? `<button onclick="pay('${nameEsc}')" class="btn-pay"><i class="fas fa-circle-check"></i></button>` : ''}
                        <button onclick="openEditUserModal('${nameEsc}')" class="btn-edit admin-only-inline"><i class="fas fa-pen"></i></button>
                        <button onclick="removeUser('${nameEsc}')" class="btn-delete"><i class="fas fa-circle-minus"></i></button>
                    </div>
                </td>
            </tr>`;
    }).join('');
}

function toggleOpenFilter() {
    showOnlyOpen = !showOnlyOpen;
    const btn = document.getElementById('filter-open-toggle');
    if (btn) {
        btn.classList.toggle('active', showOnlyOpen);
        btn.innerHTML = showOnlyOpen ? '<i class="fas fa-list"></i> Alle anzeigen' : '<i class="fas fa-filter"></i> Nur Offene';
    }
    renderUserBilling();
}

// --- OFFENE POSTEN — SCHNELLZUGRIFF ---
// Zeigt alle Personen mit offenem Saldo als antippbare Pills, damit man beim
// Abkassieren nicht erst durch die ganze Mitgliederliste scrollen/suchen muss.
function renderOpenPostenPanel() {
    const card = document.getElementById('open-posten-card');
    if (!card) return;

    const openUsers = users
        .map(u => ({ u, total: openBalanceOf(u.name) }))
        .filter(x => x.total > 0)
        .sort((a, b) => b.total - a.total);

    if (openUsers.length === 0) {
        card.style.display = 'none';
        return;
    }
    card.style.display = '';

    const grandTotal = openUsers.reduce((s, x) => s + x.total, 0);
    animateNumber(document.getElementById('open-posten-total'), grandTotal, { suffix: ' €' });

    document.getElementById('open-posten-chip-row').innerHTML = openUsers.map(({ u, total }) => `
        <button class="open-posten-chip" onclick="pay('${u.name.replace(/'/g, "\\'")}')" title="Direkt abrechnen">
            ${userAvatar(u)}
            <span class="open-posten-chip-name">${u.name}</span>
            <span class="open-posten-chip-amount">${total.toFixed(2)} €</span>
        </button>
    `).join('');
}

function payAllOpen() {
    requireAdmin(() => {
        const openNames = [...new Set(trans.map(t => t.person))];
        if (openNames.length === 0) return;
        const total = trans.reduce((s, t) => s + t.price, 0);
        if (!confirm(`${openNames.length} Person(en) mit insgesamt ${total.toFixed(2)} € jetzt als bezahlt markieren?`)) return;

        const updates = {};
        trans.forEach(t => {
            const { id, ...rest } = t;
            updates['kassa/archive/' + id] = { ...rest, status: 'paid' };
            updates['kassa/trans/' + id] = null;
        });
        if (db) {
            db.ref().update(updates).then(() => {
                fireConfetti();
                setTimeout(fireConfetti, 250);
                playPayChime();
            }).catch(handleDbError);
        } else {
            console.warn('Firebase nicht konfiguriert – Aktion wurde nicht gespeichert.');
        }
    });
}

// --- ANIMIERTE ZAHLEN (Count-up) ---
function animateNumber(el, target, opts = {}) {
    if (!el) return;
    const { suffix = '', decimals = 2, duration = 500 } = opts;
    const prev = el.dataset.raw !== undefined ? parseFloat(el.dataset.raw) : 0;
    const from = isNaN(prev) ? 0 : prev;
    if (Math.abs(from - target) < 0.005) {
        el.textContent = target.toFixed(decimals) + suffix;
        el.dataset.raw = target;
        return;
    }
    const startTime = performance.now();
    function tick(now) {
        const p = Math.min(1, (now - startTime) / duration);
        const eased = 1 - Math.pow(1 - p, 3);
        const val = from + (target - from) * eased;
        el.textContent = val.toFixed(decimals) + suffix;
        if (p < 1) requestAnimationFrame(tick);
        else { el.textContent = target.toFixed(decimals) + suffix; el.dataset.raw = target; }
    }
    requestAnimationFrame(tick);
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
        const openTotal = trans.filter(t => t.person === name).reduce((s, t) => s + t.price, 0);
        const warn = openTotal > 0
            ? `${name} hat noch ${openTotal.toFixed(2)} € offene Posten! Trotzdem endgültig löschen? Die Buchungen bleiben in der Datenbank, tauchen aber nirgends mehr auf.`
            : `${name} endgültig löschen?`;
        if (confirm(warn)) {
            dbSet('kassa/users', users.filter(u => u.name !== name));
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

    // Umsatz zählt erst, wenn wirklich bezahlt wurde (grünes Hackerl -> pay()
    // verschiebt den Posten von "trans" (offen) nach "archive" (bezahlt)).
    // Offene, noch nicht bestätigte Buchungen tauchen hier bewusst nicht auf.
    const paidTrans = archive;
    const monthlyData = paidTrans.filter(t => {
        const d = new Date(t.date);
        return d.getMonth() === m && d.getFullYear() === y;
    });

    const monthRevenue = monthlyData.reduce((s, t) => s + t.price, 0);
    const totalRevenue = paidTrans.reduce((s, t) => s + t.price, 0) + revenueOffset;

    animateNumber(document.getElementById('month-revenue'), monthRevenue, { suffix: ' €' });
    animateNumber(document.getElementById('total-revenue'), totalRevenue, { suffix: ' €' });
    animateNumber(document.getElementById('month-sales-count'), monthlyData.length, { decimals: 0 });
    animateNumber(document.getElementById('avg-sale'), monthlyData.length > 0 ? monthRevenue / monthlyData.length : 0, { suffix: ' €' });

    renderRankings(monthlyData);
    renderJournal(paidTrans);
    renderChart(paidTrans);
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
    const name = n.value.trim();
    if (!name) return;
    if (users.some(u => u.name.toLowerCase() === name.toLowerCase())) {
        alert('Es gibt schon ein Mitglied mit diesem Namen.');
        return;
    }
    dbSet('kassa/users', [...users, {
        name, description: '', role: 'Mitglied', status: 'active', emoji: '',
        joinedAt: new Date().toISOString()
    }]);
    n.value = "";
}

// --- MITGLIED BEARBEITEN (Admin) ---
let editUserOriginalName = null;
let editUserDraft = null;

function openEditUserModal(name) {
    requireAdmin(() => {
        const profile = users.find(u => u.name === name);
        if (!profile) return;
        editUserOriginalName = name;
        editUserDraft = { ...profile };

        document.getElementById('eu-title-name').textContent = profile.name;
        document.getElementById('eu-name').value = profile.name;
        document.getElementById('eu-role').value = profile.role || 'Mitglied';
        document.getElementById('eu-description').value = profile.description || '';
        document.getElementById('eu-emoji').value = profile.emoji || '';
        renderEmojiPicker(profile.emoji || '');
        setEditUserStatus(profile.status === 'inactive' ? 'inactive' : 'active');
        renderEditUserStats(name);
        renderEuPhotoPreview();

        document.getElementById('edit-user-modal').style.display = 'flex';
    });
}

function closeEditUserModal() {
    document.getElementById('edit-user-modal').style.display = 'none';
    closeEuCamera();
    editUserOriginalName = null;
    editUserDraft = null;
}

// --- PROFILFOTO (Upload, Kamera, Entfernen) ---
function renderEuPhotoPreview() {
    const el = document.getElementById('eu-photo-preview');
    if (!el || !editUserDraft) return;
    const nameNow = document.getElementById('eu-name').value || editUserDraft.name;
    const emojiNow = document.getElementById('eu-emoji').value;
    if (editUserDraft.photo) {
        el.style.backgroundImage = `url('${editUserDraft.photo}')`;
        el.textContent = '';
    } else {
        el.style.backgroundImage = '';
        el.textContent = emojiNow || avatarInitials(nameNow);
    }
    const removeBtn = document.getElementById('eu-photo-remove');
    if (removeBtn) removeBtn.style.display = editUserDraft.photo ? '' : 'none';
}

function processImageToAvatar(srcDataUrl, callback) {
    const img = new Image();
    img.onload = () => {
        const size = 240;
        const canvas = document.createElement('canvas');
        canvas.width = size; canvas.height = size;
        const ctx = canvas.getContext('2d');
        const scale = Math.max(size / img.width, size / img.height);
        const w = img.width * scale, h = img.height * scale;
        ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
        callback(canvas.toDataURL('image/jpeg', 0.82));
    };
    img.src = srcDataUrl;
}

function handleEuPhotoFile(file) {
    if (!file || !editUserDraft) return;
    if (!file.type.startsWith('image/')) { alert('Bitte eine Bilddatei wählen.'); return; }
    const reader = new FileReader();
    reader.onload = e => processImageToAvatar(e.target.result, dataUrl => {
        editUserDraft.photo = dataUrl;
        renderEuPhotoPreview();
    });
    reader.readAsDataURL(file);
    document.getElementById('eu-photo-file').value = '';
}

let euCameraStream = null;
function openEuCamera() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        alert('Kamerazugriff wird von diesem Browser/Gerät nicht unterstützt.');
        return;
    }
    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false }).then(stream => {
        euCameraStream = stream;
        const video = document.getElementById('eu-camera-video');
        video.srcObject = stream;
        document.getElementById('eu-camera-box').classList.add('show');
    }).catch(() => alert('Kamerazugriff wurde verweigert oder ist nicht möglich.'));
}
function closeEuCamera() {
    if (euCameraStream) { euCameraStream.getTracks().forEach(t => t.stop()); euCameraStream = null; }
    const box = document.getElementById('eu-camera-box');
    if (box) box.classList.remove('show');
}
function captureEuPhoto() {
    const video = document.getElementById('eu-camera-video');
    if (!video.videoWidth) return;
    const size = Math.min(video.videoWidth, video.videoHeight);
    const sx = (video.videoWidth - size) / 2, sy = (video.videoHeight - size) / 2;
    const canvas = document.createElement('canvas');
    canvas.width = 240; canvas.height = 240;
    const ctx = canvas.getContext('2d');
    ctx.translate(240, 0); ctx.scale(-1, 1); // gespiegelt = natürliche Selfie-Ansicht
    ctx.drawImage(video, sx, sy, size, size, 0, 0, 240, 240);
    editUserDraft.photo = canvas.toDataURL('image/jpeg', 0.82);
    renderEuPhotoPreview();
    closeEuCamera();
}
function removeEuPhoto() {
    if (!editUserDraft) return;
    editUserDraft.photo = null;
    renderEuPhotoPreview();
}

// ==========================================================================
// 3D-CHARAKTER-EDITOR (Three.js) — manuelle, primitiven-basierte Figur.
// Bewusst KEINE Gesichtserkennung/-vermessung: kein Kamerabild wird
// analysiert, nur bewusst gewählte Farben/Formen. Ergebnis wird als
// PNG-Snapshot in profile.photo übernommen, die Auswahl selbst in
// profile.character3d gespeichert, damit man später weiterbearbeiten kann.
// ==========================================================================

let a3dScene = null, a3dCamera = null, a3dRenderer = null, a3dGroup = null, a3dAnimId = null;
let a3dConfig = { skin: '#f2c9a1', hairStyle: 'short', hairColor: '#3a2a1a', outfit: '#a8342c', glasses: false };
let a3dDragging = false, a3dLastX = 0, a3dLastY = 0, a3dRotY = 0.4, a3dRotX = -0.1;

const A3D_SKIN_TONES = ['#ffdfc4', '#f2c9a1', '#d9a066', '#a9714f', '#7a4a2b', '#4a2e1c'];
const A3D_HAIR_COLORS = ['#1c1410', '#3a2a1a', '#6b4423', '#c9932f', '#d94f4f', '#e8e8e8'];
const A3D_OUTFIT_COLORS = ['#a8342c', '#c9932f', '#5c6e4f', '#4066a3', '#7a2b6e', '#2a1c16'];
const A3D_HAIRSTYLES = [
    { key: 'none', label: '❌ Kahl' },
    { key: 'short', label: '✂️ Kurz' },
    { key: 'long', label: '💇 Lang' },
    { key: 'mohawk', label: '🤘 Irokese' },
    { key: 'cap', label: '🧢 Mütze' }
];

function openAvatar3dModal() {
    if (!editUserDraft) return;
    if (typeof THREE === 'undefined') { alert('3D-Bibliothek konnte nicht geladen werden (Internetverbindung prüfen).'); return; }
    a3dConfig = editUserDraft.character3d
        ? { ...editUserDraft.character3d }
        : { skin: '#f2c9a1', hairStyle: 'short', hairColor: '#3a2a1a', outfit: '#a8342c', glasses: false };
    document.getElementById('avatar3d-modal').style.display = 'flex';
    renderA3dControls();
    setTimeout(() => { initA3dScene(); rebuildA3dCharacter(); startA3dLoop(); }, 30);
}
function closeAvatar3dModal() {
    document.getElementById('avatar3d-modal').style.display = 'none';
    stopA3dLoop();
}

function renderA3dControls() {
    document.getElementById('a3d-skin-row').innerHTML = A3D_SKIN_TONES.map(c => `
        <button type="button" class="a3d-swatch ${a3dConfig.skin === c ? 'selected' : ''}" style="background:${c}" onclick="a3dSetConfig('skin','${c}')"></button>
    `).join('');
    document.getElementById('a3d-haircolor-row').innerHTML = A3D_HAIR_COLORS.map(c => `
        <button type="button" class="a3d-swatch ${a3dConfig.hairColor === c ? 'selected' : ''}" style="background:${c}" onclick="a3dSetConfig('hairColor','${c}')"></button>
    `).join('');
    document.getElementById('a3d-outfit-row').innerHTML = A3D_OUTFIT_COLORS.map(c => `
        <button type="button" class="a3d-swatch ${a3dConfig.outfit === c ? 'selected' : ''}" style="background:${c}" onclick="a3dSetConfig('outfit','${c}')"></button>
    `).join('');
    document.getElementById('a3d-hairstyle-row').innerHTML = A3D_HAIRSTYLES.map(h => `
        <button type="button" class="ww-role-chip ${a3dConfig.hairStyle === h.key ? 'on' : ''}" onclick="a3dSetConfig('hairStyle','${h.key}')">${h.label}</button>
    `).join('');
    const glassesBtn = document.getElementById('a3d-glasses-toggle');
    if (glassesBtn) glassesBtn.classList.toggle('on', a3dConfig.glasses);
}
function a3dSetConfig(key, value) {
    a3dConfig[key] = value;
    renderA3dControls();
    rebuildA3dCharacter();
}
function a3dToggleGlasses() {
    a3dConfig.glasses = !a3dConfig.glasses;
    renderA3dControls();
    rebuildA3dCharacter();
}

function initA3dScene() {
    const container = document.getElementById('a3d-stage');
    if (!container) return;
    const w = container.clientWidth || 300, h = container.clientHeight || 300;
    if (!a3dRenderer) {
        a3dScene = new THREE.Scene();
        a3dCamera = new THREE.PerspectiveCamera(35, w / h, 0.1, 100);
        a3dCamera.position.set(0, 1.3, 5.2);
        a3dCamera.lookAt(0, 1.1, 0);
        a3dRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        container.innerHTML = '';
        container.appendChild(a3dRenderer.domElement);

        a3dScene.add(new THREE.AmbientLight(0xffffff, 0.65));
        const dir = new THREE.DirectionalLight(0xffffff, 0.9);
        dir.position.set(3, 5, 4);
        a3dScene.add(dir);
        const dir2 = new THREE.DirectionalLight(0xffd9b0, 0.35);
        dir2.position.set(-4, 2, -3);
        a3dScene.add(dir2);

        a3dGroup = new THREE.Group();
        a3dScene.add(a3dGroup);

        wireA3dDragControls(container);
    }
    a3dRenderer.setSize(w, h);
    a3dCamera.aspect = w / h;
    a3dCamera.updateProjectionMatrix();
}

function wireA3dDragControls(container) {
    container.addEventListener('pointerdown', e => {
        a3dDragging = true;
        a3dLastX = e.clientX; a3dLastY = e.clientY;
        container.setPointerCapture(e.pointerId);
    });
    container.addEventListener('pointermove', e => {
        if (!a3dDragging) return;
        const dx = e.clientX - a3dLastX, dy = e.clientY - a3dLastY;
        a3dLastX = e.clientX; a3dLastY = e.clientY;
        a3dRotY += dx * 0.01;
        a3dRotX = Math.max(-0.4, Math.min(0.4, a3dRotX + dy * 0.01));
    });
    container.addEventListener('pointerup', () => { a3dDragging = false; });
    container.addEventListener('pointerleave', () => { a3dDragging = false; });
}

function rebuildA3dCharacter() {
    if (!a3dGroup) return;
    while (a3dGroup.children.length) {
        const obj = a3dGroup.children.pop();
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) obj.material.dispose();
    }

    const skinMat = new THREE.MeshStandardMaterial({ color: a3dConfig.skin, roughness: 0.7 });
    const hairMat = new THREE.MeshStandardMaterial({ color: a3dConfig.hairColor, roughness: 0.6 });
    const outfitMat = new THREE.MeshStandardMaterial({ color: a3dConfig.outfit, roughness: 0.55 });
    const eyeMat = new THREE.MeshStandardMaterial({ color: 0x1c1410, roughness: 0.3 });
    const pantsMat = new THREE.MeshStandardMaterial({ color: 0x2a1c16, roughness: 0.6 });

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.52, 24, 24), skinMat);
    head.position.y = 1.68;
    a3dGroup.add(head);

    [-0.19, 0.19].forEach(x => {
        const eye = new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 12), eyeMat);
        eye.position.set(x, 1.7, 0.47);
        a3dGroup.add(eye);
    });

    const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.42, 0.85, 16), outfitMat);
    torso.position.y = 0.85;
    a3dGroup.add(torso);

    [-1, 1].forEach(side => {
        const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.09, 0.75, 12), skinMat);
        arm.position.set(side * 0.52, 0.85, 0);
        arm.rotation.z = side * 0.18;
        a3dGroup.add(arm);
    });

    [-1, 1].forEach(side => {
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.12, 0.8, 12), pantsMat);
        leg.position.set(side * 0.2, 0.02, 0);
        a3dGroup.add(leg);
    });

    if (a3dConfig.hairStyle === 'short') {
        const cap = new THREE.Mesh(new THREE.SphereGeometry(0.54, 20, 20, 0, Math.PI * 2, 0, Math.PI / 2), hairMat);
        cap.position.y = 1.72;
        a3dGroup.add(cap);
    } else if (a3dConfig.hairStyle === 'long') {
        const cap = new THREE.Mesh(new THREE.SphereGeometry(0.56, 20, 20, 0, Math.PI * 2, 0, Math.PI / 2), hairMat);
        cap.position.y = 1.73;
        a3dGroup.add(cap);
        const back = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.3, 0.6, 16), hairMat);
        back.position.set(0, 1.42, -0.15);
        a3dGroup.add(back);
    } else if (a3dConfig.hairStyle === 'mohawk') {
        const strip = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.28, 0.62), hairMat);
        strip.position.y = 2.05;
        a3dGroup.add(strip);
    } else if (a3dConfig.hairStyle === 'cap') {
        const hat = new THREE.Mesh(new THREE.CylinderGeometry(0.56, 0.58, 0.3, 20), hairMat);
        hat.position.y = 1.98;
        a3dGroup.add(hat);
        const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, 0.05, 20), hairMat);
        brim.position.y = 1.85;
        a3dGroup.add(brim);
    }

    if (a3dConfig.glasses) {
        const glassMat = new THREE.MeshStandardMaterial({ color: 0x2a1c16, roughness: 0.3, metalness: 0.4 });
        [-0.19, 0.19].forEach(x => {
            const lens = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.02, 8, 20), glassMat);
            lens.position.set(x, 1.7, 0.5);
            a3dGroup.add(lens);
        });
        const bridge = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.02, 0.02), glassMat);
        bridge.position.set(0, 1.7, 0.5);
        a3dGroup.add(bridge);
    }
}

function startA3dLoop() {
    stopA3dLoop();
    function tick() {
        if (!a3dDragging) a3dRotY += 0.003;
        if (a3dGroup) { a3dGroup.rotation.y = a3dRotY; a3dGroup.rotation.x = a3dRotX; }
        if (a3dRenderer && a3dScene && a3dCamera) a3dRenderer.render(a3dScene, a3dCamera);
        a3dAnimId = requestAnimationFrame(tick);
    }
    tick();
}
function stopA3dLoop() {
    if (a3dAnimId) cancelAnimationFrame(a3dAnimId);
    a3dAnimId = null;
}

function saveAvatar3d() {
    if (!editUserDraft || !a3dRenderer) return;
    a3dRenderer.render(a3dScene, a3dCamera);
    editUserDraft.photo = a3dRenderer.domElement.toDataURL('image/png');
    editUserDraft.character3d = { ...a3dConfig };
    renderEuPhotoPreview();
    closeAvatar3dModal();
    showBookingToast('3D-Charakter gespeichert');
}

function renderEmojiPicker(selected) {
    const row = document.getElementById('eu-emoji-row');
    row.innerHTML = EMOJI_CHOICES.map(e => `
        <button type="button" class="${e === selected ? 'selected' : ''}" onclick="pickEmoji('${e}')">${e}</button>
    `).join('');
}

function pickEmoji(e) {
    const input = document.getElementById('eu-emoji');
    input.value = input.value === e ? '' : e;
    renderEmojiPicker(input.value);
    renderEuPhotoPreview();
}

function setEditUserStatus(status) {
    if (editUserDraft) editUserDraft.status = status;
    document.getElementById('eu-status-active').classList.toggle('selected', status === 'active');
    document.getElementById('eu-status-inactive').classList.toggle('selected', status === 'inactive');
}

function userStats(name) {
    const allTrans = [...trans, ...archive].filter(t => t.person === name);
    const totalSpent = allTrans.reduce((s, t) => s + t.price, 0);
    const tipCount = predictions.filter(p => p.user === name).length;
    let wins = 0;
    matches.filter(m => m.status === 'finished').forEach(match => {
        const s = matchScore(match);
        const pred = predictions.find(p => p.matchId === match.id && p.user === name);
        if (!pred) return;
        const resultOk = pred.scoreA === s.a && pred.scoreB === s.b;
        const scorerOk = match.goals.some(g => g.player.trim().toLowerCase() === pred.scorer.trim().toLowerCase());
        if (resultOk && scorerOk) wins++;
    });
    return { totalSpent, bookingCount: allTrans.length, tipCount, wins };
}

function renderEditUserStats(name) {
    const s = userStats(name);
    document.getElementById('eu-stats-row').innerHTML = `
        <div class="eu-stat"><small>Ausgegeben</small><b>${s.totalSpent.toFixed(2)} €</b></div>
        <div class="eu-stat"><small>Buchungen</small><b>${s.bookingCount}</b></div>
        <div class="eu-stat"><small>Wett-Tipps</small><b>${s.tipCount}</b></div>
        <div class="eu-stat"><small>Volltreffer 🏆</small><b>${s.wins}</b></div>
    `;
}

function saveEditUser() {
    if (!editUserOriginalName) return;
    const newName = document.getElementById('eu-name').value.trim();
    if (!newName) { alert('Name darf nicht leer sein.'); return; }
    const renamed = newName !== editUserOriginalName;
    if (renamed && users.some(u => u.name.toLowerCase() === newName.toLowerCase())) {
        alert('Es gibt schon ein Mitglied mit diesem Namen.');
        return;
    }

    const updatedProfile = {
        ...editUserDraft,
        name: newName,
        role: document.getElementById('eu-role').value,
        description: document.getElementById('eu-description').value.trim(),
        emoji: document.getElementById('eu-emoji').value.trim()
    };

    const newUsersList = users.map(u => u.name === editUserOriginalName ? updatedProfile : u);

    if (renamed) {
        if (!confirm(`Name wirklich zu "${newName}" ändern? Alle bisherigen Buchungen und Tipps von "${editUserOriginalName}" werden mit umbenannt, damit die Historie erhalten bleibt.`)) return;
        const updates = { 'kassa/users': newUsersList };
        trans.filter(t => t.person === editUserOriginalName).forEach(t => { updates['kassa/trans/' + t.id + '/person'] = newName; });
        archive.filter(t => t.person === editUserOriginalName).forEach(t => { updates['kassa/archive/' + t.id + '/person'] = newName; });
        predictions.filter(p => p.user === editUserOriginalName).forEach(p => { updates['wetten/predictions/' + p.id + '/user'] = newName; });
        if (db) db.ref().update(updates).catch(handleDbError);
        else console.warn('Firebase nicht konfiguriert – Aktion wurde nicht gespeichert.');
    } else {
        dbSet('kassa/users', newUsersList);
    }

    showBookingToast(`Profil gespeichert: ${newName}`);
    closeEditUserModal();
}

function deleteUserPermanently() {
    if (!editUserOriginalName) return;
    const name = editUserOriginalName;
    const openTotal = trans.filter(t => t.person === name).reduce((s, t) => s + t.price, 0);
    const tipCount = predictions.filter(p => p.user === name).length;
    let warn = `${name} unwiderruflich löschen?`;
    if (openTotal > 0) warn += ` Achtung: noch ${openTotal.toFixed(2)} € offene Posten!`;
    if (tipCount > 0) warn += ` ${tipCount} Wett-Tipp(s) bleiben ohne Namenszuordnung in der Historie.`;
    if (!confirm(warn)) return;
    dbSet('kassa/users', users.filter(u => u.name !== name));
    closeEditUserModal();
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

// ==========================================================================
// SPIELE — Pass-the-Tablet Gruppenspiele
// Rein lokal (nicht über Firebase synchronisiert) — jede Gruppe spielt auf
// einem geteilten Tablet, das reihum weitergegeben wird. Nur die
// Spielerliste (gamePlayers) wird im localStorage gemerkt, damit man beim
// nächsten Treffen nicht alle Namen neu eintippen muss.
// ==========================================================================

let gamePlayers = JSON.parse(localStorage.getItem('aj_game_players') || '[]');
let activeGamePanel = 'menu';

let ww = null;   // Werwolf-Status
let imp = null;  // Impostor-Status
let totd = null; // Wahrheit-oder-Pflicht-Status
let nhn = null;  // Ich-hab-noch-nie-Status

const WW_ROLE_INFO = {
    werwolf: { label: 'Werwolf', icon: '🐺', team: 'Werwölfe', desc: 'Du gehörst zu den Werwölfen. Einigt euch in der Nacht leise auf ein Opfer aus dem Dorf.' },
    dorf: { label: 'Dorfbewohner', icon: '🧑‍🌾', team: 'Dorf', desc: 'Du bist ein einfacher Dorfbewohner. Findet gemeinsam die Werwölfe, bevor es zu spät ist!' },
    seherin: { label: 'Seherin', icon: '🔮', team: 'Dorf', desc: 'Du darfst jede Nacht heimlich auf eine Person zeigen — der Moderator verrät dir per Nicken, ob sie ein Werwolf ist.' },
    hexe: { label: 'Hexe', icon: '🧪', team: 'Dorf', desc: 'Du besitzt einen Heiltrank und einen Gifttrank — beide je einmal pro Spiel einsetzbar.' },
    jaeger: { label: 'Jäger', icon: '🏹', team: 'Dorf', desc: 'Wenn du stirbst, darfst du sofort eine weitere Person mit in den Tod reißen.' },
    amor: { label: 'Amor', icon: '💘', team: 'Dorf', desc: 'Bestimme in der ersten Nacht zwei Verliebte. Stirbt eine*r der beiden, stirbt der/die andere aus Kummer mit.' }
};

const IMPOSTOR_CATEGORIES = {
    essen: { label: '🍔 Essen', words: ['Pizza', 'Döner', 'Sushi', 'Baklava', 'Falafel', 'Burger', 'Lahmacun', 'Pasta', 'Kebab', 'Pancake', 'Sarma', 'Köfte', 'Tiramisu', 'Popcorn', 'Suppe'] },
    orte: { label: '🌍 Orte', words: ['Strand', 'Flughafen', 'Schule', 'Krankenhaus', 'Moschee', 'Stadion', 'Kino', 'Bibliothek', 'Zoo', 'Berg', 'Konzert', 'Friseur', 'Bäckerei', 'Bahnhof', 'Camping'] },
    berufe: { label: '💼 Berufe', words: ['Lehrer', 'Ärztin', 'Feuerwehrmann', 'Bäcker', 'Polizistin', 'Pilot', 'Friseurin', 'Koch', 'Anwältin', 'Kellner', 'Bauarbeiter', 'Sängerin', 'Trainer', 'Kassiererin', 'Elektriker'] },
    tiere: { label: '🐾 Tiere', words: ['Löwe', 'Wolf', 'Adler', 'Delfin', 'Elefant', 'Papagei', 'Fuchs', 'Bär', 'Pinguin', 'Tiger', 'Schlange', 'Pferd', 'Hase', 'Eule', 'Hai'] },
    filme: { label: '🎬 Filme & Serien', words: ['Titanic', 'Avatar', 'Squid Game', 'Money Heist', 'Matrix', 'Shrek', 'Frozen', 'Joker', 'Interstellar', 'Friends', 'Dark', 'Stranger Things', 'Batman', 'Herr der Ringe', 'Star Wars'] }
};

const TRUTH_PROMPTS = [
    'Was ist deine peinlichste Erinnerung aus der Schule?',
    'Wen in dieser Runde würdest du am ehesten um Rat fragen?',
    'Was war dein bisher schlechtestes Date oder Treffen?',
    'Welche Lüge hast du als Kind erzählt und bist nie erwischt worden?',
    'Was ist etwas, das du noch niemandem hier erzählt hast?',
    'Wer war deine erste große Schwärmerei?',
    'Was ist deine größte Angst?',
    'Welche App checkst du am häufigsten, wenn dir langweilig ist?',
    'Was würdest du an dir selbst gerne ändern?',
    'Was ist die verrückteste Ausrede, die du je benutzt hast?',
    'Über welches Thema regst du dich am schnellsten auf?',
    'Was ist dein guilty pleasure?',
    'Welche Person in der Runde kennst du am wenigsten gut?',
    'Was war dein größter Fehltritt in einer Freundschaft?',
    'Wann hast du das letzte Mal geweint und warum?'
];
const DARE_PROMPTS = [
    'Imitiere eine Person aus der Runde, bis jemand rät, wer es ist.',
    'Sing die erste Strophe deines Lieblingslieds.',
    'Tanze 30 Sekunden ohne Musik, so überzeugend wie möglich.',
    'Sprich für die nächste Runde nur in Fragen.',
    'Mach 10 Liegestütze oder Kniebeugen.',
    'Erzähle einen Witz — wenn niemand lacht, nochmal.',
    'Lass dir von jemandem ein Wort geben und erkläre es 30 Sekunden, ohne das Wort selbst zu benutzen.',
    'Tausche für 2 Minuten den Sitzplatz mit deinem Nachbarn.',
    'Rede 1 Minute im Nachrichtensprecher-Stil über dein Frühstück heute.',
    'Mach das peinlichste Selfie und zeig es der Runde.',
    'Erfinde spontan ein Gedicht über die Person rechts von dir.',
    'Balanciere einen Gegenstand 20 Sekunden auf dem Kopf.',
    'Beantworte die nächste Frage nur mit Tierlauten.',
    'Lass dich von der Gruppe für die nächste Runde einen Spitznamen geben — und benutze ihn.',
    'Halte 30 Sekunden lang Augenkontakt mit deinem Nachbarn, ohne zu lachen.'
];
const NHN_PROMPTS = [
    '...habe ich in der Schule geschummelt.',
    '...habe ich jemanden heimlich verliebt beobachtet.',
    '...bin ich in aller Öffentlichkeit hingefallen.',
    '...habe ich ein Geheimnis nicht für mich behalten können.',
    '...habe ich mehr als 24 Stunden nicht geschlafen.',
    '...habe ich vorgetäuscht, krank zu sein, um nicht zur Schule/Arbeit zu müssen.',
    '...habe ich jemandem eine Nachricht geschickt und es sofort bereut.',
    '...bin ich ohne Ticket erwischt worden.',
    '...habe ich bei einem Streit als Erstes nachgegeben, obwohl ich Recht hatte.',
    '...habe ich ein Lied so oft gehört, dass ich es hassen gelernt habe.',
    '...habe ich jemandem einen falschen Namen gesagt.',
    '...habe ich eine ganze Serie an einem Tag durchgeschaut.',
    '...habe ich beim Zocken laut geschrien.',
    '...bin ich zu spät zu meiner eigenen Verabredung gekommen.',
    '...habe ich den Geburtstag eines guten Freundes vergessen.',
    '...habe ich heimlich das Essen von jemand anderem probiert.',
    '...habe ich in der Öffentlichkeit laut gesungen.',
    '...habe ich eine Prüfung ohne Lernen bestanden.',
    '...habe ich ein Foto von mir gelöscht, weil es zu peinlich war.',
    '...bin ich in der falschen Bahn/Bus gelandet.',
    '...habe ich einen Streich gespielt, der nach hinten losging.',
    '...habe ich bei einem Film geweint.',
    '...habe ich mich für jemand anderen ausgegeben.',
    '...habe ich mein Handy in die Toilette fallen lassen.',
    '...habe ich jemanden angelogen, um früher gehen zu können.',
    '...habe ich ein Rezept komplett ruiniert.',
    '...habe ich mir etwas Peinliches im Sportunterricht geleistet.',
    '...habe ich mich verlaufen, obwohl ich den Weg kannte.',
    '...habe ich eine falsche Telefonnummer gewählt und lange geredet.'
];

function shuffleArray(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

function openGame(id) {
    activeGamePanel = id;
    ['menu', 'werwolf', 'impostor', 'totd', 'nhn', 'bestenliste'].forEach(k => {
        document.getElementById(`spiele-panel-${k}`).classList.toggle('hidden-section', k !== id);
    });
    if (id === 'werwolf') renderWerwolf();
    if (id === 'impostor') renderImpostor();
    if (id === 'totd') renderTotd();
    if (id === 'nhn') renderNhn();
    if (id === 'bestenliste') renderBestenliste();
}

function backToGameMenu() {
    activeGamePanel = 'menu';
    ['menu', 'werwolf', 'impostor', 'totd', 'nhn', 'bestenliste'].forEach(k => {
        document.getElementById(`spiele-panel-${k}`).classList.toggle('hidden-section', k !== 'menu');
    });
}

// --- Gemeinsame Spieler-Roster-Komponente (für alle Spiele) ---
function rosterEditorHtml(hint) {
    return `
        <div class="game-roster-card">
            <div class="game-roster-head">
                <h3><i class="fas fa-people-group"></i> Mitspieler</h3>
                <span class="game-roster-hint">${hint}</span>
            </div>
            <div class="input-group">
                <input type="text" id="game-player-input" placeholder="Name eintippen…" autocomplete="off" onkeydown="if(event.key==='Enter')addGamePlayer()">
                <button class="btn-primary" onclick="addGamePlayer()"><i class="fas fa-user-plus"></i></button>
                <button class="btn-primary" onclick="openGameRosterModal()" style="background:linear-gradient(135deg, var(--sage-light), var(--sage));"><i class="fas fa-database"></i> Aus Mitgliedern wählen</button>
            </div>
            <div class="game-chip-row" id="game-chip-row">${gamePlayers.length ? gamePlayers.map((n, i) => `
                <span class="game-chip">${n} <i class="fas fa-xmark" onclick="removeGamePlayer(${i})"></i></span>
            `).join('') : '<span class="game-chip-empty">Noch keine Spieler hinzugefügt.</span>'}</div>
        </div>
    `;
}

// --- Mehrfachauswahl-Modal: Mitspieler direkt aus den Firebase-Mitgliedern
// wählen (Suche + Scrollen), statt Namen manuell einzutippen. ---
function openGameRosterModal() {
    const searchInput = document.getElementById('game-roster-search-input');
    searchInput.value = '';
    renderGameRosterTiles(activeUsers());
    document.getElementById('game-roster-modal').style.display = 'flex';
    setTimeout(() => searchInput.focus(), 150);
}
function closeGameRosterModal() {
    document.getElementById('game-roster-modal').style.display = 'none';
    renderActiveGamePanel();
}
function filterGameRosterModal(query) {
    const q = query.trim().toLowerCase();
    const list = activeUsers();
    renderGameRosterTiles(q ? list.filter(u => u.name.toLowerCase().includes(q)) : list);
}
function renderGameRosterTiles(list) {
    const container = document.getElementById('game-roster-selection-list');
    if (list.length === 0) {
        container.innerHTML = `<div class="user-tile-empty"><i class="fas fa-user-slash"></i><p>Kein Treffer.</p></div>`;
        return;
    }
    container.innerHTML = list.map(u => {
        const selected = gamePlayers.includes(u.name);
        return `
        <div onclick="toggleGameRosterMember('${u.name.replace(/'/g, "\\'")}')" class="user-grid-item ${selected ? 'selected' : ''}">
            <span style="display:flex; align-items:center; gap:12px;">${userAvatar(u)} ${u.name}</span>
            <i class="fas ${selected ? 'fa-circle-check' : 'fa-circle'}"></i>
        </div>`;
    }).join('');
}
function toggleGameRosterMember(name) {
    const i = gamePlayers.indexOf(name);
    if (i === -1) gamePlayers.push(name); else gamePlayers.splice(i, 1);
    localStorage.setItem('aj_game_players', JSON.stringify(gamePlayers));
    filterGameRosterModal(document.getElementById('game-roster-search-input').value);
}
function addGamePlayer() {
    const input = document.getElementById('game-player-input');
    const name = input.value.trim();
    if (!name) return;
    if (gamePlayers.some(n => n.toLowerCase() === name.toLowerCase())) { input.value = ''; return; }
    gamePlayers.push(name);
    localStorage.setItem('aj_game_players', JSON.stringify(gamePlayers));
    input.value = '';
    renderActiveGamePanel();
    const fresh = document.getElementById('game-player-input');
    if (fresh) fresh.focus();
}
function removeGamePlayer(i) {
    gamePlayers.splice(i, 1);
    localStorage.setItem('aj_game_players', JSON.stringify(gamePlayers));
    renderActiveGamePanel();
}
function renderActiveGamePanel() {
    if (activeGamePanel === 'werwolf') renderWerwolf();
    else if (activeGamePanel === 'impostor') renderImpostor();
    else if (activeGamePanel === 'totd') renderTotd();
    else if (activeGamePanel === 'nhn') renderNhn();
}

// --- BESTENLISTE (geteilt über Firebase, spiele/history) ---
function recordGameResult(game, players, winners) {
    dbPush('spiele/history', { game, players, winners, date: new Date().toISOString() });
}
function renderBestenliste() {
    const panel = document.getElementById('spiele-panel-bestenliste');
    if (!panel) return;

    const stats = {};
    spieleHistory.forEach(h => {
        (h.players || []).forEach(name => {
            stats[name] = stats[name] || { played: 0, wins: 0 };
            stats[name].played++;
        });
        (h.winners || []).forEach(name => {
            if (stats[name]) stats[name].wins++;
        });
    });
    const rows = Object.entries(stats)
        .map(([name, s]) => ({ name, ...s }))
        .sort((a, b) => b.wins - a.wins || b.played - a.played || a.name.localeCompare(b.name, 'de'));

    panel.innerHTML = `
        <button class="game-back-btn" onclick="backToGameMenu()"><i class="fas fa-arrow-left"></i> Spieleauswahl</button>
        <div class="game-hero game-hero--compact">
            <span class="game-hero-icon">🏆</span>
            <h2>Bestenliste</h2>
            <p>Werwolf, Impostor &amp; Ich hab noch nie zählen mit — geteilt über alle Geräte.</p>
        </div>
        <div class="card leaderboard-card">
            ${rows.length ? rows.map((r, i) => `
                <div class="leaderboard-row ${i === 0 ? 'top-1' : i === 1 ? 'top-2' : i === 2 ? 'top-3' : ''}">
                    <span class="lb-rank">${i + 1}</span>
                    <span class="lb-name">${r.name}</span>
                    <span class="lb-stats"><span>Runden: <b>${r.played}</b></span></span>
                    <span class="lb-wins">${r.wins} 🏆</span>
                </div>
            `).join('') : `<p style="text-align:center; color:var(--ink-soft); padding:24px 10px;">Noch keine gewerteten Runden — spiel einmal Werwolf, Impostor oder Ich hab noch nie bis zum Sieg!</p>`}
        </div>
    `;
}

// ==========================================================================
// WERWOLF
// ==========================================================================

function renderWerwolf() {
    const panel = document.getElementById('spiele-panel-werwolf');
    if (!ww || ww.phase === 'setup') return renderWwSetup(panel);
    if (ww.phase === 'reveal') return renderWwReveal(panel);
    return renderWwMod(panel);
}

function renderWwSetup(panel) {
    if (!ww) ww = { phase: 'setup', config: { wolves: 1, seherin: true, hexe: false, jaeger: false, amor: false } };
    const n = gamePlayers.length;
    const maxWolves = Math.max(1, Math.floor(n / 3));
    if (ww.config.wolves > maxWolves) ww.config.wolves = maxWolves;
    const specialCount = ['seherin', 'hexe', 'jaeger', 'amor'].filter(k => ww.config[k]).length;
    const required = ww.config.wolves + specialCount + 1;
    const canStart = n >= 4 && n >= required;

    panel.innerHTML = `
        <button class="game-back-btn" onclick="backToGameMenu()"><i class="fas fa-arrow-left"></i> Spieleauswahl</button>
        <div class="game-hero game-hero--werwolf">
            <span class="game-hero-icon">🐺</span>
            <h2>Werwolf</h2>
            <p>Dorf gegen Werwölfe — Rollen verteilen, Tablet reihum geben, dann führt der Moderator durch Nacht &amp; Tag.</p>
        </div>
        ${rosterEditorHtml('Mindestens 4 Spieler empfohlen.')}
        <div class="card">
            <h3><i class="fas fa-sliders"></i> Rollen festlegen</h3>
            <div class="ww-config-row">
                <span>Anzahl Werwölfe</span>
                <div class="stepper">
                    <button onclick="wwSetWolves(-1)" ${ww.config.wolves <= 1 ? 'disabled' : ''}><i class="fas fa-minus"></i></button>
                    <span>${ww.config.wolves}</span>
                    <button onclick="wwSetWolves(1)" ${ww.config.wolves >= maxWolves ? 'disabled' : ''}><i class="fas fa-plus"></i></button>
                </div>
            </div>
            <div class="ww-role-toggles">
                ${wwRoleToggle('seherin', '🔮 Seherin')}
                ${wwRoleToggle('hexe', '🧪 Hexe')}
                ${wwRoleToggle('jaeger', '🏹 Jäger')}
                ${wwRoleToggle('amor', '💘 Amor')}
            </div>
        </div>
        <button class="btn-confirm-extra" onclick="startWerwolf()" ${canStart ? '' : 'disabled'}><i class="fas fa-play"></i> Rollen verteilen &amp; starten</button>
        <p class="game-setup-note">${n < 4 ? 'Mindestens 4 Spieler hinzufügen.' : (!canStart ? `Für diese Rollenauswahl werden mindestens ${required} Spieler benötigt.` : `${n} Spieler bereit — ${ww.config.wolves} Werwölfe, ${n - ww.config.wolves} Dorf-Rollen.`)}</p>
    `;
}
function wwRoleToggle(key, label) {
    return `<button type="button" class="ww-role-chip ${ww.config[key] ? 'on' : ''}" onclick="wwToggleRole('${key}')">${label}</button>`;
}
function wwToggleRole(key) { ww.config[key] = !ww.config[key]; renderWerwolf(); }
function wwSetWolves(delta) {
    const maxWolves = Math.max(1, Math.floor(gamePlayers.length / 3));
    ww.config.wolves = Math.min(maxWolves, Math.max(1, ww.config.wolves + delta));
    renderWerwolf();
}
function startWerwolf() {
    const n = gamePlayers.length;
    const specialCount = ['seherin', 'hexe', 'jaeger', 'amor'].filter(k => ww.config[k]).length;
    if (n < 4 || n < ww.config.wolves + specialCount + 1) return;

    const shuffledNames = shuffleArray(gamePlayers);
    const roles = [];
    for (let i = 0; i < ww.config.wolves; i++) roles.push('werwolf');
    ['seherin', 'hexe', 'jaeger', 'amor'].forEach(k => { if (ww.config[k]) roles.push(k); });
    while (roles.length < n) roles.push('dorf');
    const shuffledRoles = shuffleArray(roles);

    ww.players = shuffledNames.map((name, i) => ({ name, role: shuffledRoles[i], alive: true }));
    ww.phase = 'reveal';
    ww.revealIndex = 0;
    ww.revealed = false;
    renderWerwolf();
}
function renderWwReveal(panel) {
    const p = ww.players[ww.revealIndex];
    const info = WW_ROLE_INFO[p.role];
    panel.innerHTML = `
        <div class="reveal-stage">
            <span class="reveal-progress">Spieler ${ww.revealIndex + 1} / ${ww.players.length}</span>
            ${!ww.revealed ? `
                <div class="reveal-pass-card">
                    <i class="fas fa-mobile-screen-button"></i>
                    <h2>Gib das Tablet an</h2>
                    <div class="reveal-name">${p.name}</div>
                    <p>Alle anderen bitte wegschauen.</p>
                    <button class="btn-confirm-extra" onclick="wwReveal()"><i class="fas fa-eye"></i> Ich bin ${p.name} — Rolle zeigen</button>
                </div>
            ` : `
                <div class="reveal-role-card team-${info.team === 'Werwölfe' ? 'wolf' : 'village'}">
                    <div class="reveal-role-icon">${info.icon}</div>
                    <span class="reveal-role-team">${info.team}</span>
                    <h2>${info.label}</h2>
                    <p>${info.desc}</p>
                </div>
                <button class="btn-confirm-extra" onclick="wwNextReveal()"><i class="fas fa-check"></i> Rolle gemerkt, weiter</button>
            `}
        </div>
    `;
}
function wwReveal() { ww.revealed = true; renderWerwolf(); }
function wwNextReveal() {
    ww.revealIndex++;
    ww.revealed = false;
    if (ww.revealIndex >= ww.players.length) ww.phase = 'mod';
    renderWerwolf();
}
function wwAliveCounts() {
    const alive = ww.players.filter(p => p.alive);
    const wolves = alive.filter(p => p.role === 'werwolf').length;
    return { wolves, village: alive.length - wolves, alive: alive.length };
}
function wwWinner() {
    const { wolves, village } = wwAliveCounts();
    if (wolves === 0) return 'dorf';
    if (wolves >= village) return 'werwolf';
    return null;
}
function renderWwMod(panel) {
    const { wolves, village } = wwAliveCounts();
    const winner = wwWinner();
    const steps = [
        'Alle schließen die Augen.',
        ww.config.amor ? 'Amor öffnet die Augen und wählt zwei Verliebte.' : null,
        'Werwölfe wachen auf und einigen sich leise auf ein Opfer.',
        ww.config.seherin ? 'Seherin wacht auf und zeigt heimlich auf eine Person — Moderator nickt oder schüttelt den Kopf.' : null,
        ww.config.hexe ? 'Hexe wacht auf, erfährt das Opfer und entscheidet über Heil-/Gifttrank.' : null,
        'Alle schließen wieder die Augen — es wird Tag. Moderator verkündet, wer in der Nacht gestorben ist.',
        'Das Dorf diskutiert und stimmt ab, wer gehängt wird — dann unten markieren.'
    ].filter(Boolean);

    panel.innerHTML = `
        <button class="game-back-btn" onclick="backToGameMenu()"><i class="fas fa-arrow-left"></i> Spieleauswahl</button>
        <div class="game-hero game-hero--werwolf game-hero--compact">
            <span class="game-hero-icon">🌙</span>
            <h2>Moderation</h2>
            <p>Das Tablet bleibt jetzt beim Moderator / Spielleiter.</p>
        </div>
        ${winner ? `
            <div class="game-winner-banner ${winner === 'werwolf' ? 'winner-wolf' : 'winner-village'}">
                <i class="fas fa-trophy"></i> ${winner === 'werwolf' ? 'Die Werwölfe gewinnen! 🐺' : 'Das Dorf gewinnt! 🎉'}
            </div>
        ` : ''}
        <div class="card">
            <h3><i class="fas fa-list-check"></i> Ablauf pro Runde</h3>
            <ol class="game-steps">${steps.map(s => `<li>${s}</li>`).join('')}</ol>
        </div>
        <div class="card">
            <h3 class="card-h3-row"><span><i class="fas fa-users"></i> Spielerliste</span> <span class="member-count-tag">${village} Dorf · ${wolves} Werwölfe übrig</span></h3>
            <div class="ww-player-grid">
                ${ww.players.map((p, i) => `
                    <button class="ww-player-tile ${p.alive ? '' : 'is-dead'}" onclick="wwToggleAlive(${i})">
                        <span class="ww-player-name">${p.name}</span>
                        <span class="ww-player-state">${p.alive ? 'Lebt' : '☠️ Tot — ' + WW_ROLE_INFO[p.role].label}</span>
                    </button>
                `).join('')}
            </div>
            <p class="game-setup-note">Tippe auf einen Spieler, um ihn als eliminiert zu markieren (Nachtopfer oder Abstimmung).</p>
        </div>
        <button class="eu-danger-link" onclick="resetWerwolf()"><i class="fas fa-rotate-left"></i> Neues Spiel starten</button>
    `;
}
function wwToggleAlive(i) {
    const wasWinner = !!wwWinner();
    ww.players[i].alive = !ww.players[i].alive;
    const winner = wwWinner();
    renderWerwolf();
    if (winner && !wasWinner) {
        fireConfetti();
        playWinChime();
        if (!ww.recorded) {
            ww.recorded = true;
            const players = ww.players.map(p => p.name);
            const winners = ww.players.filter(p => (winner === 'werwolf' ? p.role === 'werwolf' : p.role !== 'werwolf')).map(p => p.name);
            recordGameResult('werwolf', players, winners);
        }
    }
}
function resetWerwolf() {
    if (!confirm('Neues Werwolf-Spiel starten? Die aktuelle Runde geht verloren.')) return;
    ww = null;
    renderWerwolf();
}

// ==========================================================================
// IMPOSTOR
// ==========================================================================

function renderImpostor() {
    const panel = document.getElementById('spiele-panel-impostor');
    if (!imp || imp.phase === 'setup') return renderImpSetup(panel);
    if (imp.phase === 'reveal') return renderImpReveal(panel);
    return renderImpMod(panel);
}
function renderImpSetup(panel) {
    if (!imp) imp = { phase: 'setup', category: 'essen', count: 1 };
    const n = gamePlayers.length;
    const maxImp = Math.max(1, Math.floor(n / 3));
    if (imp.count > maxImp) imp.count = maxImp;
    const canStart = n >= 3 && n > imp.count;

    panel.innerHTML = `
        <button class="game-back-btn" onclick="backToGameMenu()"><i class="fas fa-arrow-left"></i> Spieleauswahl</button>
        <div class="game-hero game-hero--impostor">
            <span class="game-hero-icon">🕵️</span>
            <h2>Impostor</h2>
            <p>Alle sehen ein Geheimwort — außer dem Impostor. Durch geschicktes Fragen müsst ihr ihn enttarnen.</p>
        </div>
        ${rosterEditorHtml('Mindestens 3 Spieler empfohlen.')}
        <div class="card">
            <h3><i class="fas fa-layer-group"></i> Kategorie</h3>
            <div class="ww-role-toggles">
                ${Object.entries(IMPOSTOR_CATEGORIES).map(([key, c]) => `
                    <button type="button" class="ww-role-chip ${imp.category === key ? 'on' : ''}" onclick="impSetCategory('${key}')">${c.label}</button>
                `).join('')}
            </div>
            <div class="ww-config-row" style="margin-top:14px;">
                <span>Anzahl Impostoren</span>
                <div class="stepper">
                    <button onclick="impSetCount(-1)" ${imp.count <= 1 ? 'disabled' : ''}><i class="fas fa-minus"></i></button>
                    <span>${imp.count}</span>
                    <button onclick="impSetCount(1)" ${imp.count >= maxImp ? 'disabled' : ''}><i class="fas fa-plus"></i></button>
                </div>
            </div>
        </div>
        <button class="btn-confirm-extra" onclick="startImpostor()" ${canStart ? '' : 'disabled'}><i class="fas fa-play"></i> Wort wählen &amp; starten</button>
        <p class="game-setup-note">${n < 3 ? 'Mindestens 3 Spieler hinzufügen.' : `${n} Spieler bereit — ${imp.count} Impostor(en).`}</p>
    `;
}
function impSetCategory(key) { imp.category = key; renderImpostor(); }
function impSetCount(delta) {
    const maxImp = Math.max(1, Math.floor(gamePlayers.length / 3));
    imp.count = Math.min(maxImp, Math.max(1, imp.count + delta));
    renderImpostor();
}
function startImpostor() {
    const n = gamePlayers.length;
    if (n < 3 || n <= imp.count) return;
    const cat = IMPOSTOR_CATEGORIES[imp.category];
    const word = cat.words[Math.floor(Math.random() * cat.words.length)];
    const shuffled = shuffleArray(gamePlayers);
    const impostorSet = new Set(shuffled.slice(0, imp.count));
    imp.word = word;
    imp.players = shuffled.map(name => ({ name, isImpostor: impostorSet.has(name), alive: true }));
    imp.phase = 'reveal';
    imp.revealIndex = 0;
    imp.revealed = false;
    renderImpostor();
}
function renderImpReveal(panel) {
    const p = imp.players[imp.revealIndex];
    panel.innerHTML = `
        <div class="reveal-stage">
            <span class="reveal-progress">Spieler ${imp.revealIndex + 1} / ${imp.players.length}</span>
            ${!imp.revealed ? `
                <div class="reveal-pass-card">
                    <i class="fas fa-mobile-screen-button"></i>
                    <h2>Gib das Tablet an</h2>
                    <div class="reveal-name">${p.name}</div>
                    <p>Alle anderen bitte wegschauen.</p>
                    <button class="btn-confirm-extra" onclick="impReveal()"><i class="fas fa-eye"></i> Ich bin ${p.name} — anzeigen</button>
                </div>
            ` : `
                <div class="reveal-role-card team-${p.isImpostor ? 'wolf' : 'village'}">
                    <div class="reveal-role-icon">${p.isImpostor ? '🕵️' : '🔑'}</div>
                    <span class="reveal-role-team">${p.isImpostor ? 'Impostor' : 'Geheimwort'}</span>
                    <h2>${p.isImpostor ? 'Du bist der Impostor!' : imp.word}</h2>
                    <p>${p.isImpostor ? 'Du kennst das Wort nicht. Hör gut zu und tu so, als wüsstest du es.' : 'Merk dir das Wort — verrate es nicht zu offensichtlich!'}</p>
                </div>
                <button class="btn-confirm-extra" onclick="impNextReveal()"><i class="fas fa-check"></i> Weiter</button>
            `}
        </div>
    `;
}
function impReveal() { imp.revealed = true; renderImpostor(); }
function impNextReveal() {
    imp.revealIndex++;
    imp.revealed = false;
    if (imp.revealIndex >= imp.players.length) imp.phase = 'mod';
    renderImpostor();
}
function impAliveCounts() {
    const alive = imp.players.filter(p => p.alive);
    const impostors = alive.filter(p => p.isImpostor).length;
    return { impostors, others: alive.length - impostors, alive: alive.length };
}
function impWinner() {
    const { impostors, others } = impAliveCounts();
    if (impostors === 0) return 'dorf';
    if (impostors >= others) return 'impostor';
    return null;
}
function renderImpMod(panel) {
    const winner = impWinner();
    panel.innerHTML = `
        <button class="game-back-btn" onclick="backToGameMenu()"><i class="fas fa-arrow-left"></i> Spieleauswahl</button>
        <div class="game-hero game-hero--impostor game-hero--compact">
            <span class="game-hero-icon">💬</span>
            <h2>Diskussion &amp; Abstimmung</h2>
            <p>Reihum Hinweise zum Wort geben — wer wirkt verdächtig? Danach abstimmen und unten eliminieren.</p>
        </div>
        ${winner ? `
            <div class="game-winner-banner ${winner === 'impostor' ? 'winner-wolf' : 'winner-village'}">
                <i class="fas fa-trophy"></i> ${winner === 'impostor' ? 'Der Impostor gewinnt! 🕵️' : 'Die Gruppe gewinnt! 🎉'}
            </div>
        ` : ''}
        <div class="card">
            <h3><i class="fas fa-users"></i> Spieler</h3>
            <div class="ww-player-grid">
                ${imp.players.map((p, i) => `
                    <button class="ww-player-tile ${p.alive ? '' : 'is-dead'}" onclick="impToggleAlive(${i})">
                        <span class="ww-player-name">${p.name}</span>
                        <span class="ww-player-state">${p.alive ? 'Dabei' : '❌ Raus — war ' + (p.isImpostor ? 'Impostor' : 'unschuldig')}</span>
                    </button>
                `).join('')}
            </div>
            <p class="game-setup-note">Nach der Abstimmung: Tippe auf die rausgewählte Person.</p>
        </div>
        <div class="card">
            <h3><i class="fas fa-key"></i> Geheimwort</h3>
            <p style="font-weight:800; font-size:1.2rem; color:var(--brand);">${imp.word}</p>
        </div>
        <button class="eu-danger-link" onclick="resetImpostor()"><i class="fas fa-rotate-left"></i> Neues Spiel starten</button>
    `;
}
function impToggleAlive(i) {
    const wasWinner = !!impWinner();
    imp.players[i].alive = !imp.players[i].alive;
    const winner = impWinner();
    renderImpostor();
    if (winner && !wasWinner) {
        fireConfetti();
        playWinChime();
        if (!imp.recorded) {
            imp.recorded = true;
            const players = imp.players.map(p => p.name);
            const winners = imp.players.filter(p => (winner === 'impostor' ? p.isImpostor : !p.isImpostor)).map(p => p.name);
            recordGameResult('impostor', players, winners);
        }
    }
}
function resetImpostor() {
    if (!confirm('Neues Impostor-Spiel starten?')) return;
    imp = null;
    renderImpostor();
}

// ==========================================================================
// WAHRHEIT ODER PFLICHT
// ==========================================================================

function renderTotd() {
    const panel = document.getElementById('spiele-panel-totd');
    if (!totd) totd = { phase: 'setup' };
    if (totd.phase === 'setup') return renderTotdSetup(panel);
    return renderTotdPlay(panel);
}
function renderTotdSetup(panel) {
    const n = gamePlayers.length;
    panel.innerHTML = `
        <button class="game-back-btn" onclick="backToGameMenu()"><i class="fas fa-arrow-left"></i> Spieleauswahl</button>
        <div class="game-hero game-hero--totd">
            <span class="game-hero-icon">🎯</span>
            <h2>Wahrheit oder Pflicht</h2>
            <p>Reihum entscheidet jede*r: ehrlich antworten oder die Aufgabe wagen.</p>
        </div>
        ${rosterEditorHtml('Mindestens 2 Spieler.')}
        <button class="btn-confirm-extra" onclick="startTotd()" ${n >= 2 ? '' : 'disabled'}><i class="fas fa-play"></i> Runde starten</button>
        <p class="game-setup-note">${n < 2 ? 'Mindestens 2 Spieler hinzufügen.' : `${n} Spieler bereit.`}</p>
    `;
}
function startTotd() {
    if (gamePlayers.length < 2) return;
    totd = { phase: 'play', order: shuffleArray(gamePlayers), idx: 0, truthPool: shuffleArray(TRUTH_PROMPTS), darePool: shuffleArray(DARE_PROMPTS), current: null };
    renderTotd();
}
function totdDrawPrompt(kind) {
    const poolKey = kind === 'truth' ? 'truthPool' : 'darePool';
    const source = kind === 'truth' ? TRUTH_PROMPTS : DARE_PROMPTS;
    if (totd[poolKey].length === 0) totd[poolKey] = shuffleArray(source);
    totd.current = { kind, text: totd[poolKey].pop() };
    renderTotd();
}
function totdNextPlayer() {
    totd.idx = (totd.idx + 1) % totd.order.length;
    totd.current = null;
    renderTotd();
}
function renderTotdPlay(panel) {
    const name = totd.order[totd.idx];
    panel.innerHTML = `
        <button class="game-back-btn" onclick="backToGameMenu()"><i class="fas fa-arrow-left"></i> Spieleauswahl</button>
        <div class="reveal-stage">
            <span class="reveal-progress">Runde · Spieler ${totd.idx + 1} / ${totd.order.length}</span>
            <div class="reveal-pass-card">
                <i class="fas fa-hand-point-up"></i>
                <h2>${name} ist dran</h2>
                ${!totd.current ? `
                    <div class="totd-choice-row">
                        <button class="btn-confirm-extra totd-btn-truth" onclick="totdDrawPrompt('truth')"><i class="fas fa-comment"></i> Wahrheit</button>
                        <button class="btn-confirm-extra totd-btn-dare" onclick="totdDrawPrompt('dare')"><i class="fas fa-bolt"></i> Pflicht</button>
                    </div>
                ` : `
                    <div class="reveal-role-card team-${totd.current.kind === 'dare' ? 'wolf' : 'village'}">
                        <div class="reveal-role-icon">${totd.current.kind === 'dare' ? '⚡' : '💬'}</div>
                        <p style="font-size:1.1rem; font-weight:700;">${totd.current.text}</p>
                    </div>
                    <button class="btn-confirm-extra" onclick="totdNextPlayer()"><i class="fas fa-forward"></i> Nächste Person</button>
                `}
            </div>
        </div>
        <button class="eu-danger-link" onclick="resetTotd()"><i class="fas fa-rotate-left"></i> Spiel beenden</button>
    `;
}
function resetTotd() {
    if (!confirm('Wahrheit-oder-Pflicht-Runde beenden?')) return;
    totd = { phase: 'setup' };
    renderTotd();
}

// ==========================================================================
// ICH HAB NOCH NIE
// ==========================================================================

function renderNhn() {
    const panel = document.getElementById('spiele-panel-nhn');
    if (!nhn) nhn = { phase: 'setup', lives: 5 };
    if (nhn.phase === 'setup') return renderNhnSetup(panel);
    return renderNhnPlay(panel);
}
function renderNhnSetup(panel) {
    const n = gamePlayers.length;
    panel.innerHTML = `
        <button class="game-back-btn" onclick="backToGameMenu()"><i class="fas fa-arrow-left"></i> Spieleauswahl</button>
        <div class="game-hero game-hero--nhn">
            <span class="game-hero-icon">🖐️</span>
            <h2>Ich hab noch nie</h2>
            <p>Wer die Aussage schon erlebt hat, verliert ein Leben. Wer übersteht alle Runden?</p>
        </div>
        ${rosterEditorHtml('Mindestens 2 Spieler.')}
        <div class="card">
            <h3><i class="fas fa-heart"></i> Leben pro Spieler</h3>
            <div class="ww-config-row">
                <span>Startleben</span>
                <div class="stepper">
                    <button onclick="nhnSetLives(-1)" ${nhn.lives <= 1 ? 'disabled' : ''}><i class="fas fa-minus"></i></button>
                    <span>${nhn.lives}</span>
                    <button onclick="nhnSetLives(1)" ${nhn.lives >= 10 ? 'disabled' : ''}><i class="fas fa-plus"></i></button>
                </div>
            </div>
        </div>
        <button class="btn-confirm-extra" onclick="startNhn()" ${n >= 2 ? '' : 'disabled'}><i class="fas fa-play"></i> Spiel starten</button>
        <p class="game-setup-note">${n < 2 ? 'Mindestens 2 Spieler hinzufügen.' : `${n} Spieler bereit · ${nhn.lives} Leben.`}</p>
    `;
}
function nhnSetLives(delta) { nhn.lives = Math.min(10, Math.max(1, nhn.lives + delta)); renderNhn(); }
function startNhn() {
    if (gamePlayers.length < 2) return;
    const startLives = nhn.lives;
    nhn = {
        phase: 'play',
        startLives,
        players: gamePlayers.map(name => ({ name, lives: startLives })),
        pool: shuffleArray(NHN_PROMPTS),
        current: null,
        winnerAnnounced: false
    };
    nhnNextPrompt();
}
function nhnNextPrompt() {
    if (nhn.pool.length === 0) nhn.pool = shuffleArray(NHN_PROMPTS);
    nhn.current = nhn.pool.pop();
    renderNhn();
}
function nhnHit(i) {
    const p = nhn.players[i];
    if (p.lives <= 0) return;
    p.lives--;
    renderNhn();
}
function renderNhnPlay(panel) {
    const alive = nhn.players.filter(p => p.lives > 0);
    const winner = alive.length === 1 ? alive[0] : (alive.length === 0 ? 'draw' : null);
    panel.innerHTML = `
        <button class="game-back-btn" onclick="backToGameMenu()"><i class="fas fa-arrow-left"></i> Spieleauswahl</button>
        ${winner ? `
            <div class="game-winner-banner winner-village">
                <i class="fas fa-trophy"></i> ${winner === 'draw' ? 'Alle raus — Unentschieden! 🤝' : `${winner.name} gewinnt die Runde! 🎉`}
            </div>
        ` : ''}
        <div class="card nhn-prompt-card">
            <span class="game-roster-hint">Ich hab noch nie…</span>
            <h2 class="nhn-prompt-text">${nhn.current}</h2>
            <button class="btn-confirm-extra" onclick="nhnNextPrompt()"><i class="fas fa-forward"></i> Nächste Aussage</button>
        </div>
        <div class="card">
            <h3><i class="fas fa-users"></i> Wer hat's schon gemacht? (antippen zum Leben abziehen)</h3>
            <div class="ww-player-grid">
                ${nhn.players.map((p, i) => `
                    <button class="ww-player-tile nhn-tile ${p.lives <= 0 ? 'is-dead' : ''}" onclick="nhnHit(${i})" ${p.lives <= 0 ? 'disabled' : ''}>
                        <span class="ww-player-name">${p.name}</span>
                        <span class="ww-player-state">${p.lives > 0 ? '❤️'.repeat(p.lives) : '☠️ Raus'}</span>
                    </button>
                `).join('')}
            </div>
        </div>
        <button class="eu-danger-link" onclick="resetNhn()"><i class="fas fa-rotate-left"></i> Neues Spiel starten</button>
    `;
    if (winner && winner !== 'draw' && !nhn.winnerAnnounced) {
        nhn.winnerAnnounced = true;
        fireConfetti();
        playWinChime();
        recordGameResult('nhn', nhn.players.map(p => p.name), [winner.name]);
    }
}
function resetNhn() {
    if (!confirm('Neues "Ich hab noch nie"-Spiel starten?')) return;
    const startLives = nhn ? nhn.startLives || 5 : 5;
    nhn = { phase: 'setup', lives: startLives };
    renderNhn();
}

init();
