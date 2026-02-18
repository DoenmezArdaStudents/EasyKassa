const produkte = [
    { name: "Cola", preis: 3.00, img: "https://d893f0a989.clvaw-cdnwnd.com/3a833f8ce13c4679f534a76193b82fdd/200000745-49fe949fea/cola%20500ml%20glas.png?ph=d893f0a989" },
    { name: "Cola Zero", preis: 3.00, img: "https://lifewater.ch/wp-content/uploads/2023/07/Coca-Cola-Zero-033.webp" },
    { name: "Eistee Zitrone", preis: 3.00, img: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQKfThdiOFzVKwmoL7702ATSvimiTcp_RGkWQ&s" },
    { name: "Eistee Pfirsich", preis: 3.00, img: "https://www.austriansupermarket.com/media/catalog/product/1/4/144691_1_1_large.jpg" },
    { name: "Red Bull", preis: 3.50, img: "https://images.cdn.europe-west1.gcp.commercetools.com/723b2575-66c7-4d92-ae49-82bf1d168d26/00-768916-0161977304-oB8g000P-large.jpg" },
];

let db_personen = JSON.parse(localStorage.getItem('drinkDB_V3_users')) || ["Gast"];
let db_transaktionen = JSON.parse(localStorage.getItem('drinkDB_V3_trans')) || [];
let viewDate = new Date();
let chartInstance = null;

function init() {
    renderKassa();
    sync();
}

// Erstellt das Grid
function renderKassa() {
    const grid = document.getElementById('drink-grid');
    let html = produkte.map(p => `
        <div class="drink-card">
            <img src="${p.img}" style="height:100px; object-fit:contain;">
            <h3>${p.name}</h3>
            <p class="price-tag">${p.preis.toFixed(2)} €</p>
            <button class="btn-book" onclick="processPurchase('${p.name}', ${p.preis})">Buchen</button>
        </div>
    `).join('');
    
    html += `
        <div class="drink-card" style="border-style: dashed; cursor:pointer;" onclick="openExtraModal()">
            <div style="font-size:2.5rem; color:#cbd5e1; margin-top:20px;"><i class="fas fa-plus-circle"></i></div>
            <h3>Sonderbuchung</h3>
            <p style="color:#94a3b8;">Snack / Sonstiges</p>
        </div>
    `;
    grid.innerHTML = html;
}

function processPurchase(name, preis, event) {
    const user = document.getElementById('active-user-select').value;
    if(!user) return alert("Bitte zuerst einen Nutzer auswählen!");

    const card = event.currentTarget.closest('.drink-card');
    const button = event.currentTarget;
    const originalText = button.innerText;

    db_transaktionen.push({ 
        person: user, 
        produkt: name, 
        preis: preis, 
        time: new Date().toISOString() 
    });

    card.classList.add('booked', 'animate-success');
    button.innerText = "✓ Gebucht";
    button.style.backgroundColor = "#10b981";

    setTimeout(() => {
        card.classList.remove('booked', 'animate-success');
        button.innerText = originalText;
        button.style.backgroundColor = "";
        sync();
    }, 800);
}

// Damit das 'event' übergeben wird, müssen wir die renderKassa Funktion leicht anpassen:
function renderKassa() {
    const grid = document.getElementById('drink-grid');
    let html = produkte.map(p => `
        <div class="drink-card">
            <img src="${p.img}" style="height:100px; object-fit:contain;">
            <h3>${p.name}</h3>
            <p class="price-tag">${p.preis.toFixed(2)} €</p>
            <button class="btn-book" onclick="processPurchase('${p.name}', ${p.preis}, event)">Buchen</button>
        </div>
    `).join('');
    
    html += `
        <div class="drink-card" style="border-style: dashed; cursor:pointer;" onclick="openExtraModal()">
            <div style="font-size:2.5rem; color:#cbd5e1; margin-top:20px;"><i class="fas fa-plus-circle"></i></div>
            <h3>Sonderbuchung</h3>
            <p style="color:#94a3b8;">Snack / Sonstiges</p>
        </div>
    `;
    grid.innerHTML = html;
}

// Modal Logik
function openExtraModal() { document.getElementById('extra-modal').style.display = 'block'; }
function closeExtraModal() { document.getElementById('extra-modal').style.display = 'none'; }
function confirmExtra() {
    const user = document.getElementById('active-user-select').value;
    const desc = document.getElementById('modal-extra-desc').value.trim() || "Sonderposten";
    const amount = parseFloat(document.getElementById('modal-extra-amount').value);
    if(isNaN(amount)) return alert("Bitte gültigen Betrag eingeben!");
    db_transaktionen.push({ person: user, produkt: desc, preis: amount, time: new Date().toISOString() });
    document.getElementById('modal-extra-desc').value = "";
    document.getElementById('modal-extra-amount').value = "";
    closeExtraModal();
    sync();
}

// Daten Abgleich & UI Refresh
function sync() {
    localStorage.setItem('drinkDB_V3_users', JSON.stringify(db_personen));
    localStorage.setItem('drinkDB_V3_trans', JSON.stringify(db_transaktionen));
    
    db_personen.sort((a,b) => a.localeCompare(b));

    // Update User Dropdown
    const select = document.getElementById('active-user-select');
    const current = select.value;
    select.innerHTML = db_personen.map(p => `<option value="${p}">${p}</option>`).join('');
    if(db_personen.includes(current)) select.value = current;

    // Update Billing Table
    const tbody = document.getElementById('user-billing-body');
    tbody.innerHTML = db_personen.map(p => {
        const t = db_transaktionen.filter(x => x.person === p);
        const total = t.reduce((sum, item) => sum + item.preis, 0);
        const counts = {};
        t.forEach(item => counts[item.produkt] = (counts[item.produkt] || 0) + 1);
        const details = Object.entries(counts).map(([name, qty]) => `<span class="item-tag">${qty}x ${name}</span>`).join('');
        
        return `<tr>
            <td><strong>${p}</strong></td>
            <td>${details || '<span style="color:#cbd5e1">Keine Buchungen</span>'}</td>
            <td style="font-weight:800; color:var(--primary)">${total.toFixed(2)} €</td>
            <td>
                <button onclick="settle('${p}')" style="background:none; border:none; color:#10b981; cursor:pointer; font-size:1.2rem; margin-right:15px;" title="Bezahlen"><i class="fas fa-check-double"></i></button>
                <button onclick="removeUser('${p}')" style="background:none; border:none; color:#ef4444; cursor:pointer;" title="Löschen"><i class="fas fa-trash-alt"></i></button>
            </td>
        </tr>`;
    }).join('');
}

// Administration
function addUser() {
    const nameInput = document.getElementById('new-user-name');
    const name = nameInput.value.trim();
    if(name && !db_personen.includes(name)) {
        db_personen.push(name);
        nameInput.value = "";
        sync();
    }
}

function settle(name) {
    if(confirm(`${name} hat den gesamten Betrag beglichen?`)) {
        db_transaktionen = db_transaktionen.filter(x => x.person !== name);
        sync();
    }
}

function removeUser(name) {
    if(confirm(`${name} wirklich aus der Datenbank löschen?`)) {
        db_personen = db_personen.filter(x => x !== name);
        db_transaktionen = db_transaktionen.filter(x => x.person !== name);
        sync();
    }
}

// Navigation & Statistik
function showSection(id) {
    document.querySelectorAll('section').forEach(s => s.classList.replace('active-section', 'hidden-section'));
    document.getElementById(`section-${id}`).classList.replace('hidden-section', 'active-section');
    document.querySelectorAll('.sidebar li').forEach(l => l.classList.remove('active'));
    document.getElementById(`nav-${id}`).classList.add('active');
    if(id === 'stats') renderStats();
}

function changeMonth(d) {
    viewDate.setMonth(viewDate.getMonth() + d);
    renderStats();
}

function renderStats() {
    const m = viewDate.getMonth();
    const y = viewDate.getFullYear();
    document.getElementById('current-month-display').innerText = viewDate.toLocaleString('de-DE', { month: 'long', year: 'numeric' });

    const filtered = db_transaktionen.filter(t => {
        const d = new Date(t.time);
        return d.getMonth() === m && d.getFullYear() === y;
    });

    const rev = filtered.reduce((s,t) => s + t.preis, 0);
    document.getElementById('month-revenue').innerText = rev.toFixed(2) + " €";
    document.getElementById('month-sales').innerText = filtered.length;
    document.getElementById('avg-revenue').innerText = (rev / 30).toFixed(2) + " €";

    const ctx = document.getElementById('revenueChart').getContext('2d');
    if(chartInstance) chartInstance.destroy();
    
    const labels = []; const data = [];
    for(let i = 5; i >= 0; i--) {
        let temp = new Date(); temp.setMonth(temp.getMonth() - i);
        labels.push(temp.toLocaleString('de-DE', { month: 'short' }));
        const sum = db_transaktionen.filter(t => {
            const td = new Date(t.time);
            return td.getMonth() === temp.getMonth() && td.getFullYear() === temp.getFullYear();
        }).reduce((s, x) => s + x.preis, 0);
        data.push(sum);
    }

    chartInstance = new Chart(ctx, {
        type: 'line',
        data: { labels: labels, datasets: [{ label: 'Umsatz €', data: data, borderColor: '#2563eb', tension: 0.3, fill: true, backgroundColor: 'rgba(37, 99, 235, 0.05)' }] },
        options: { plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } }
    });
}

init();