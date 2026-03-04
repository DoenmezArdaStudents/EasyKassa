// --- KONFIGURATION & DATEN ---
const produkte = [
    { name: "Cola", preis: 3.00, img: "https://d893f0a989.clvaw-cdnwnd.com/3a833f8ce13c4679f534a76193b82fdd/200000745-49fe949fea/cola%20500ml%20glas.png?ph=d893f0a989" },
    { name: "Cola Zero", preis: 3.00, img: "https://lifewater.ch/wp-content/uploads/2023/07/Coca-Cola-Zero-033.webp" },
    { name: "Red Bull", preis: 3.50, img: "https://images.cdn.europe-west1.gcp.commercetools.com/723b2575-66c7-4d92-ae49-82bf1d168d26/00-768916-0161977304-oB8g000P-large.jpg" },
    { name: "Eiste Zitrone", preis: 3.00, img: "https://www.friesacher.co/wp/wp-content/uploads/2020/06/Rauch_Ice_Tea_Zitrone_033.jpg" },
    { name: "Eiste Pfirsich", preis: 3.00, img: "https://www.austriansupermarket.com/media/catalog/product/1/4/144691_1_1_large.jpg" }
];

let users = JSON.parse(localStorage.getItem('biz_users')) || ["Gast"];
let trans = JSON.parse(localStorage.getItem('biz_trans')) || [];
let archive = JSON.parse(localStorage.getItem('biz_archive')) || [];
let revenueOffset = parseFloat(localStorage.getItem('biz_revenue_offset')) || 0; // WICHTIG: Damit Gesamtumsatz stimmt
let isSuperUser = localStorage.getItem('isSuperUser') === 'true';
let viewDate = new Date();
let chart = null;
let pendingAdminAction = null;
const ADMIN_PASSWORD = "122461";

// --- CORE LOGIK ---
function init() {
    renderDrinks();
    checkSuperUser(); // Prüfen ob bereits eingeloggt
    sync();
}

// --- ADMIN & AUTH SYSTEM ---
function checkSuperUser() {
    if (isSuperUser) {
        document.body.classList.add('admin-logged-in');
    } else {
        document.body.classList.remove('admin-logged-in');
    }
}

function handleLogoClick() {
    if (!isSuperUser) {
        requireAdmin();
    } else {
        if (confirm("Möchtest du dich abmelden?")) {
            logout();
        }
    }
}

function requireAdmin(callback = null) {
    if (isSuperUser) {
        if (callback) callback();
        return;
    }
    pendingAdminAction = callback;
    const modal = document.getElementById('admin-login-modal');
    modal.style.display = 'block';
    document.getElementById('admin-password-input').value = "";
    document.getElementById('admin-password-input').focus();
}

function submitAdminAuth() {
    const input = document.getElementById('admin-password-input');
    if (input.value === ADMIN_PASSWORD) {
        isSuperUser = true;
        localStorage.setItem('isSuperUser', 'true');
        input.value = ""; 
        document.getElementById('admin-login-modal').style.display = 'none';
        checkSuperUser();
        if (pendingAdminAction) {
            pendingAdminAction();
            pendingAdminAction = null;
        }
    } else {
        alert("Passwort falsch!");
        input.value = "";
    }
}

function cancelAdminAuth() {
    document.getElementById('admin-login-modal').style.display = 'none';
    pendingAdminAction = null;
}

function logout() {
    isSuperUser = false;
    localStorage.setItem('isSuperUser', 'false');
    document.body.classList.remove('admin-logged-in');
    showSection('kassa');
    alert("Abgemeldet.");
}

// --- APP FUNKTIONEN ---
function renderDrinks() {
    const grid = document.getElementById('drink-grid');
    grid.innerHTML = produkte.map(p => `
        <div class="drink-card">
            <img src="${p.img}">
            <h3>${p.name}</h3>
            <p style="color:var(--primary); font-weight:bold;">${p.preis.toFixed(2)} €</p>
            <button class="btn-book" onclick="buy('${p.name}', ${p.preis}, event)">Buchen</button>
        </div>
    `).join('') + `
        <div class="drink-card" style="border-style:dashed; cursor:pointer;" onclick="openExtraModal()">
            <div style="font-size:2rem; color:#ccc; margin-top:10px;"><i class="fas fa-plus-circle"></i></div>
            <h3>Extra</h3>
        </div>
    `;
}

function buy(name, preis, event) {
    const user = document.getElementById('active-user-select').value;
    const txId = "tx_" + Date.now();
    trans.push({ id: txId, person: user, product: name, price: preis, date: new Date().toISOString(), status: 'open' });
    sync();
    showBookingFeedback(event?.currentTarget, `${name} • ${preis.toFixed(2)} €`);
}

function showBookingFeedback(buttonEl, text) {
    if (buttonEl) {
        const card = buttonEl.closest('.drink-card');
        if (card) {
            card.classList.remove('booked-flash');
            void card.offsetWidth;
            card.classList.add('booked-flash');
            setTimeout(() => card.classList.remove('booked-flash'), 450);
        }

        const originalText = buttonEl.dataset.originalText || buttonEl.textContent;
        buttonEl.dataset.originalText = originalText;
        buttonEl.textContent = '✅ Gebucht';
        buttonEl.classList.add('booked-ok');
        setTimeout(() => {
            buttonEl.textContent = originalText;
            buttonEl.classList.remove('booked-ok');
        }, 900);
    }

    showBookingToast(text);
}

function showBookingToast(message) {
    const existing = document.getElementById('booking-toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.id = 'booking-toast';
    toast.className = 'booking-toast';
    toast.textContent = `Gebucht: ${message}`;
    document.body.appendChild(toast);

    requestAnimationFrame(() => toast.classList.add('show'));
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 260);
    }, 1400);
}

function sync() {
    localStorage.setItem('biz_users', JSON.stringify(users));
    localStorage.setItem('biz_trans', JSON.stringify(trans));
    localStorage.setItem('biz_archive', JSON.stringify(archive));
    localStorage.setItem('biz_revenue_offset', revenueOffset);
    
    users.sort();
    const select = document.getElementById('active-user-select');
    const last = select.value;
    select.innerHTML = users.map(u => `<option value="${u}">${u}</option>`).join('');
    if(users.includes(last)) select.value = last;

    const tbody = document.getElementById('user-billing-body');
    tbody.innerHTML = users.map(u => {
        const userTrans = trans.filter(t => t.person === u);
        const total = userTrans.reduce((s,t) => s + t.price, 0);
        const productCount = {};
        userTrans.forEach(t => {
            const key = t.product || 'Unbekannt';
            productCount[key] = (productCount[key] || 0) + 1;
        });
        const productsText = Object.entries(productCount)
            .map(([product, count]) => `${count}x ${product}`)
            .join(', ') || '-';

        return `<tr><td><strong>${u}</strong></td><td>${productsText}</td><td>${total.toFixed(2)} €</td>
            <td><div class="action-buttons">
                <button onclick="pay('${u}')" class="btn-pay"><i class="fas fa-check-circle"></i></button>
                <button onclick="removeUser('${u}')" class="btn-delete"><i class="fas fa-trash-alt"></i></button>
            </div></td></tr>`;
    }).join('');

    renderAdminBookings();
    if(document.getElementById('section-stats').classList.contains('active-section')) updateStats();
}

function pay(name) {
    requireAdmin(() => {
        const userTrans = trans.filter(t => t.person === name);
        if(userTrans.length === 0) return;
        if(confirm(`${name} hat bezahlt?`)) {
            userTrans.forEach(t => { t.status = 'paid'; archive.push(t); });
            trans = trans.filter(t => t.person !== name);
            sync();
        }
    });
}

function removeUser(name) {
    requireAdmin(() => {
        if(confirm(`${name} löschen?`)) {
            users = users.filter(u => u !== name);
            sync();
        }
    });
}

// --- STATS SYSTEM (DEIN NEUES DASHBOARD) ---
function updateStats() {
    if(!isSuperUser) return;

    const m = viewDate.getMonth();
    const y = viewDate.getFullYear();
    document.getElementById('current-month-display').innerText = 
        viewDate.toLocaleString('de-DE', { month: 'long', year: 'numeric' });
    
    const allTrans = [...trans, ...archive];
    const monthlyData = allTrans.filter(t => {
        const d = new Date(t.date);
        return d.getMonth() === m && d.getFullYear() === y;
    });

    const monthRevenue = monthlyData.reduce((s, t) => s + t.price, 0);
    const totalRevenue = allTrans.reduce((s, t) => s + t.price, 0) + revenueOffset;
    const avgSale = monthlyData.length > 0 ? (monthRevenue / monthlyData.length) : 0;

    document.getElementById('month-revenue').innerText = monthRevenue.toFixed(2) + " €";
    document.getElementById('total-revenue').innerText = totalRevenue.toFixed(2) + " €";
    document.getElementById('month-sales-count').innerText = monthlyData.length;
    document.getElementById('avg-sale').innerText = avgSale.toFixed(2) + " €";

    renderRankings(monthlyData);
    renderJournal(allTrans);
    renderChart(allTrans);
}

function renderRankings(data) {
    const counts = {};
    data.forEach(t => { counts[t.product] = (counts[t.product] || 0) + 1; });
    const sorted = Object.entries(counts).sort((a,b) => b[1] - a[1]).slice(0, 5);
    let html = '<h4>Beliebteste Produkte</h4>';
    sorted.forEach(([name, count]) => {
        html += `<div class="rank-item"><span>${name}</span><span>${count}x</span></div>`;
    });
    document.getElementById('top-lists-content').innerHTML = html;
}

function renderJournal(data) {
    const body = document.getElementById('journal-body');
    const latest = [...data].sort((a,b) => new Date(b.date) - new Date(a.date)).slice(0, 50);
    body.innerHTML = latest.map(t => `
        <tr>
            <td><small>${new Date(t.date).toLocaleDateString('de-DE')}</small></td>
            <td>${t.person}</td>
            <td>${t.product}</td>
            <td>${t.price.toFixed(2)} €</td>
            <td><span class="status-badge ${t.status === 'paid' ? 'paid' : 'open'}">${t.status === 'paid' ? 'Bezahlt' : 'Offen'}</span></td>
        </tr>
    `).join('');
}

function renderChart(dataList) {
    const ctx = document.getElementById('revenueChart').getContext('2d');
    if(chart) chart.destroy();
    const labels = []; const chartData = [];
    for(let i = 5; i >= 0; i--) {
        let d = new Date(); d.setMonth(d.getMonth() - i);
        labels.push(d.toLocaleString('de-DE', { month: 'short' }));
        const sum = dataList.filter(t => {
            const td = new Date(t.date);
            return td.getMonth() === d.getMonth() && td.getFullYear() === d.getFullYear();
        }).reduce((s, x) => s + x.price, 0);
        chartData.push(sum);
    }
    chart = new Chart(ctx, {
        type: 'line',
        data: { labels, datasets: [{ label: 'Umsatz', data: chartData, borderColor: '#2563eb', fill: true, tension: 0.4 }] }
    });
}

function renderAdminBookings() {
    const body = document.getElementById('admin-booking-body');
    const allHistory = [...trans, ...archive].sort((a,b) => new Date(b.date) - new Date(a.date)).slice(0, 20);
    body.innerHTML = allHistory.map(t => `
        <tr>
            <td>${new Date(t.date).toLocaleDateString('de-DE')}</td>
            <td>${t.person}</td>
            <td>${t.product}</td>
            <td>${t.price.toFixed(2)} €</td>
            <td>${t.status === 'paid' ? '✅ Bezahlt' : 'Offen'}</td>
        </tr>
    `).join('');
}

// --- NAV & MODAL ---
function showSection(id) {
    document.querySelectorAll('section').forEach(s => s.classList.replace('active-section', 'hidden-section'));
    document.getElementById(`section-${id}`).classList.replace('hidden-section', 'active-section');
    document.querySelectorAll('nav li').forEach(l => l.classList.remove('active'));
    document.getElementById(`nav-${id}`).classList.add('active');
    if(id === 'stats') updateStats();
}

function changeMonth(delta) { viewDate.setMonth(viewDate.getMonth() + delta); updateStats(); }
function addUser() { const n = document.getElementById('new-user-name'); if(n.value) { users.push(n.value); n.value=""; sync(); } }
function openExtraModal() { document.getElementById('extra-modal').style.display = 'block'; }
function closeExtraModal() { document.getElementById('extra-modal').style.display = 'none'; }
function confirmExtra() {
    const u = document.getElementById('active-user-select').value;
    const d = document.getElementById('modal-extra-desc').value;
    const a = parseFloat(document.getElementById('modal-extra-amount').value);
    if(!isNaN(a)) {
        trans.push({ id: "ex_"+Date.now(), person: u, product: d || 'Extra', price: a, date: new Date().toISOString(), status: 'open' });
        sync();
        showBookingToast(`${d || 'Extra'} • ${a.toFixed(2)} €`);
        closeExtraModal();
    }
}

init();
