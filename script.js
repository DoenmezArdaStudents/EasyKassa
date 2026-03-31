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
let revenueOffset = parseFloat(localStorage.getItem('biz_revenue_offset')) || 0;
let isSuperUser = localStorage.getItem('isSuperUser') === 'true';
let viewDate = new Date();
let chart = null;
let pendingAdminAction = null;
let currentPendingDrink = null;
const ADMIN_PASSWORD = "122461";

// --- CORE LOGIK ---
function init() {
    renderDrinks();
    checkSuperUser();
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
    document.getElementById('admin-login-modal').style.display = 'block';
    document.getElementById('admin-password-input').value = "";
    document.getElementById('admin-password-input').focus();
}

function submitAdminAuth() {
    const input = document.getElementById('admin-password-input');
    if (input.value === ADMIN_PASSWORD) {
        isSuperUser = true;
        localStorage.setItem('isSuperUser', 'true');
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
}

// --- BUCHUNGS-LOGIK (MODAL) ---
function renderDrinks() {
    const grid = document.getElementById('drink-grid');
    grid.innerHTML = produkte.map(p => `
        <div class="drink-card">
            <img src="${p.img}">
            <h3>${p.name}</h3>
            <p style="color:var(--primary); font-weight:bold;">${p.preis.toFixed(2)} €</p>
            <button class="btn-book" onclick="buy('${p.name}', ${p.preis})">Buchen</button>
        </div>
    `).join('') + `
        <div class="drink-card" style="border-style:dashed; cursor:pointer;" onclick="openExtraModal()">
            <div style="font-size:2rem; color:#ccc; margin-top:10px;"><i class="fas fa-plus-circle"></i></div>
            <h3>Extra</h3>
        </div>
    `;
}

function buy(name, preis) {
    currentPendingDrink = { name, preis };
    openUserModal();
}

// --- OPTIMIERTES NUTZER-MODAL ---
function openUserModal() {
    const modal = document.getElementById('user-select-modal');
    const listContainer = document.getElementById('user-selection-list');
    
    // Header & Container Styling
    listContainer.style.background = "#f1f5f9";
    listContainer.style.padding = "15px";
    listContainer.style.borderRadius = "12px";

    listContainer.innerHTML = users.map(u => `
        <div onclick="confirmBookingForUser('${u}')" class="user-grid-item">
            <span>${u}</span>
            <i class="fas fa-chevron-right"></i>
        </div>
    `).join('');
    
    modal.style.display = 'block';
}

// --- OPTIMIERTES KORREKTUR-MODAL ---
function showItemDetails(userName) {
    requireAdmin(() => {
        const modal = document.getElementById('item-details-modal');
        const container = document.getElementById('item-list-container');
        document.getElementById('details-user-name').innerHTML = `
            <i class="fas fa-user-edit" style="color:var(--primary); margin-right:10px;"></i>
            Korrektur: ${userName}
        `;

        const userItems = trans.filter(t => t.person === userName);
        
        if (userItems.length === 0) {
            container.innerHTML = `
                <div style="padding:40px; text-align:center;">
                    <i class="fas fa-check-circle" style="font-size:3rem; color:#10b981; margin-bottom:15px; display:block;"></i>
                    <p style="color:gray;">Alles erledigt! Keine offenen Posten.</p>
                </div>`;
        } else {
            container.innerHTML = userItems.map(t => `
                <div class="correction-item">
                    <div>
                        <div style="font-weight:800; color:#1e293b;">${t.product}</div>
                        <div style="font-size:0.8rem; color:#64748b;">
                            <i class="far fa-clock"></i> ${new Date(t.date).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                        </div>
                    </div>
                    <div style="display: flex; align-items: center; gap: 15px;">
                        <span style="font-weight:700; color:var(--primary);">${t.price.toFixed(2)} €</span>
                        <button onclick="deleteSingleItem('${t.id}', '${userName}')" 
                                style="background:#fee2e2; border:none; color:#ef4444; width:35px; height:35px; border-radius:10px; cursor:pointer; display:flex; align-items:center; justify-content:center; transition:0.2s;">
                            <i class="fas fa-trash-alt"></i>
                        </button>
                    </div>
                </div>
            `).join('');
        }
        modal.style.display = 'block';
    });
}

function confirmBookingForUser(userName) {
    if (!currentPendingDrink) return;
    const { name, preis } = currentPendingDrink;
    
    trans.push({ 
        id: "tx_" + Date.now(), 
        person: userName, 
        product: name, 
        price: preis, 
        date: new Date().toISOString(), 
        status: 'open' 
    });
    
    sync();
    showBookingToast(`${name} für ${userName}`);
    closeUserModal();
}

function closeUserModal() {
    document.getElementById('user-select-modal').style.display = 'none';
    currentPendingDrink = null;
}

function deleteSingleItem(txId, userName) {
    if(confirm("Dieses Produkt stornieren? (Kein Einfluss auf Umsatz-Archiv)")) {
        trans = trans.filter(t => t.id !== txId);
        sync();
        showItemDetails(userName); 
    }
}

function closeDetailsModal() {
    document.getElementById('item-details-modal').style.display = 'none';
}

// --- CORE SYSTEM (SYNC & ADMIN) ---
// --- OPTIMIERTE SYNC FUNKTION MIT SCHÖNEN BADGES ---
function sync() {
    localStorage.setItem('biz_users', JSON.stringify(users));
    localStorage.setItem('biz_trans', JSON.stringify(trans));
    localStorage.setItem('biz_archive', JSON.stringify(archive));
    localStorage.setItem('biz_revenue_offset', revenueOffset);
    
    users.sort();

    const tbody = document.getElementById('user-billing-body');
    if (tbody) {
        tbody.innerHTML = users.map(u => {
            const userTrans = trans.filter(t => t.person === u);
            const total = userTrans.reduce((s,t) => s + t.price, 0);
            const count = userTrans.length;

            // Definition des Badges basierend auf der Anzahl
            let itemsBadge = '';
            if (count === 0) {
                // Leer-Zustand: Grau und unauffällig
                itemsBadge = `
                    <span class="items-badge badge-empty">
                        <i class="fas fa-circle" style="font-size:0.6rem; opacity:0.4;"></i> 0
                    </span>`;
            } else {
                // Offene Posten: Blau, fett und klickbar
                itemsBadge = `
                    <span class="items-badge badge-open" onclick="showItemDetails('${u}')">
                        <i class="fas fa-shopping-basket"></i> ${count}
                    </span>`;
            }

            // ... innerhalb der sync() Funktion im Loop:
            return `
                <tr>
                    <td>
                        <div style="font-weight:800; color:#1e293b; font-size:1.1rem;">${u}</div>
                    </td>
                    <td>
                        ${itemsBadge}
                    </td>
                    <td>
                        <div style="font-weight:800; color:var(--primary); font-size:1.1rem;">
                            ${total.toFixed(2)} €
                        </div>
                    </td>
                    <td>
                        <div class="action-buttons">
                            <button onclick="pay('${u}')" class="btn-pay" style="color:#10b981;">
                                <i class="fas fa-check-circle"></i>
                            </button>
                            <button onclick="removeUser('${u}')" class="btn-delete" style="color:#f87171;">
                                <i class="fas fa-minus-circle"></i>
                            </button>
                        </div>
                    </td>
                </tr>`;
                    }).join('');
    }

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

// --- STATS & NAV ---
function showSection(id) {
    document.querySelectorAll('section').forEach(s => s.className = 'hidden-section');
    document.getElementById(`section-${id}`).className = 'active-section';
    document.querySelectorAll('nav li').forEach(l => l.classList.remove('active'));
    document.getElementById(`nav-${id}`).classList.add('active');
    if(id === 'stats') updateStats();
}

function updateStats() {
    if(!isSuperUser) return;
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
    const sorted = Object.entries(counts).sort((a,b) => b[1] - a[1]).slice(0, 5);
    document.getElementById('top-lists-content').innerHTML = '<h4>Top Produkte</h4>' + sorted.map(([n, c]) => `<div class="rank-item"><span>${n}</span><span>${c}x</span></div>`).join('');
}

function renderJournal(data) {
    const latest = [...data].sort((a,b) => new Date(b.date) - new Date(a.date)).slice(0, 50);
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
    if(chart) chart.destroy();
    const labels = []; const chartData = [];
    for(let i = 5; i >= 0; i--) {
        let d = new Date(); d.setMonth(d.getMonth() - i);
        labels.push(d.toLocaleString('de-DE', { month: 'short' }));
        chartData.push(dataList.filter(t => {
            const td = new Date(t.date);
            return td.getMonth() === d.getMonth() && td.getFullYear() === d.getFullYear();
        }).reduce((s, x) => s + x.price, 0));
    }
    chart = new Chart(ctx, { type: 'line', data: { labels, datasets: [{ label: 'Umsatz', data: chartData, borderColor: '#2563eb', tension: 0.4 }] } });
}

function renderAdminBookings() {
    const allHistory = [...trans, ...archive].sort((a,b) => new Date(b.date) - new Date(a.date)).slice(0, 20);
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
function addUser() { const n = document.getElementById('new-user-name'); if(n.value) { users.push(n.value); n.value=""; sync(); } }
function openExtraModal() { document.getElementById('extra-modal').style.display = 'block'; }
function closeExtraModal() { document.getElementById('extra-modal').style.display = 'none'; }
function confirmExtra() {
    const d = document.getElementById('modal-extra-desc').value;
    const a = parseFloat(document.getElementById('modal-extra-amount').value);
    if(!isNaN(a)) {
        currentPendingDrink = { name: d || 'Extra', preis: a };
        closeExtraModal();
        openUserModal();
    }
}

init();