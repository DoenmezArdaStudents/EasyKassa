const produkte = [
    { name: "Cola", preis: 3.00, img: "https://d893f0a989.clvaw-cdnwnd.com/3a833f8ce13c4679f534a76193b82fdd/200000745-49fe949fea/cola%20500ml%20glas.png?ph=d893f0a989" },
    { name: "Cola Zero", preis: 3.00, img: "https://lifewater.ch/wp-content/uploads/2023/07/Coca-Cola-Zero-033.webp" },
    { name: "Red Bull", preis: 3.50, img: "https://images.cdn.europe-west1.gcp.commercetools.com/723b2575-66c7-4d92-ae49-82bf1d168d26/00-768916-0161977304-oB8g000P-large.jpg" },
    { name: "Eiste Zitrone", preis: 1.50, img: "https://www.friesacher.co/wp/wp-content/uploads/2020/06/Rauch_Ice_Tea_Zitrone_033.jpg" },
    { name: "Eiste Pfirsich", preis: 1.50, img: "https://www.austriansupermarket.com/media/catalog/product/1/4/144691_1_1_large.jpg" }
];

let users = JSON.parse(localStorage.getItem('biz_users')) || ["Gast"];
let trans = JSON.parse(localStorage.getItem('biz_trans')) || [];
let viewDate = new Date();
let chart = null;

function init() {
    renderDrinks();
    sync();
}

function renderDrinks() {
    const grid = document.getElementById('drink-grid');
    grid.innerHTML = produkte.map(p => `
        <div class="drink-card" id="card-${p.name.replace(/\s/g, '')}">
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
    const card = event.currentTarget.closest('.drink-card');
    
    trans.push({ person: user, product: name, price: preis, date: new Date().toISOString() });
    
    // Feedback
    card.classList.add('booked');
    const btn = event.currentTarget;
    const oldText = btn.innerText;
    btn.innerText = "✓";
    
    setTimeout(() => {
        card.classList.remove('booked');
        btn.innerText = oldText;
        sync();
    }, 600);
}

function sync() {
    localStorage.setItem('biz_users', JSON.stringify(users));
    localStorage.setItem('biz_trans', JSON.stringify(trans));
    
    users.sort();
    const select = document.getElementById('active-user-select');
    const last = select.value;
    select.innerHTML = users.map(u => `<option value="${u}">${u}</option>`).join('');
    if(users.includes(last)) select.value = last;

    const tbody = document.getElementById('user-billing-body');
    tbody.innerHTML = users.map(u => {
        const total = trans.filter(t => t.person === u).reduce((s,t) => s + t.price, 0);
        return `<tr>
            <td><strong>${u}</strong></td>
            <td>${total.toFixed(2)} €</td>
            <td>
                <div class="action-buttons">
                    <button onclick="pay('${u}')" class="btn-pay" title="Abrechnen">
                        <i class="fas fa-check-circle"></i>
                    </button>
                    <button onclick="removeUser('${u}')" class="btn-delete" title="Löschen">
                        <i class="fas fa-trash-alt"></i>
                    </button>
                </div>
            </td>
        </tr>`;
    }).join('');
}

function removeUser(name) {
    if(confirm(`${name} wirklich komplett löschen?`)) {
        users = users.filter(u => u !== name);
        trans = trans.filter(t => t.person !== name);
        sync();
    }
}

function showSection(id) {
    document.querySelectorAll('section').forEach(s => s.classList.replace('active-section', 'hidden-section'));
    document.getElementById(`section-${id}`).classList.replace('hidden-section', 'active-section');
    document.querySelectorAll('nav li').forEach(l => l.classList.remove('active'));
    document.getElementById(`nav-${id}`).classList.add('active');
    if(id === 'stats') updateStats();
}

function updateStats() {
    const m = viewDate.getMonth();
    const y = viewDate.getFullYear();
    document.getElementById('current-month-display').innerText = viewDate.toLocaleString('de-DE', { month: 'long', year: 'numeric' });
    
    const filtered = trans.filter(t => {
        const d = new Date(t.date);
        return d.getMonth() === m && d.getFullYear() === y;
    });
    
    const revenue = filtered.reduce((s,t) => s + t.price, 0);
    document.getElementById('month-revenue').innerText = revenue.toFixed(2) + " €";
    document.getElementById('avg-revenue').innerText = (revenue / 30).toFixed(2) + " €";
    
    renderChart();
}

function renderChart() {
    const ctx = document.getElementById('revenueChart').getContext('2d');
    if(chart) chart.destroy();
    
    const labels = []; const data = [];
    for(let i = 5; i >= 0; i--) {
        let d = new Date(); d.setMonth(d.getMonth() - i);
        labels.push(d.toLocaleString('de-DE', { month: 'short' }));
        const sum = trans.filter(t => {
            const td = new Date(t.date);
            return td.getMonth() === d.getMonth() && td.getFullYear() === d.getFullYear();
        }).reduce((s, x) => s + x.price, 0);
        data.push(sum);
    }

    chart = new Chart(ctx, {
        type: 'line',
        data: { labels, datasets: [{ label: 'Umsatz', data, borderColor: '#2563eb', fill: true, backgroundColor: 'rgba(37, 99, 235, 0.1)', tension: 0.4 }] },
        options: { plugins: { legend: { display: false } } }
    });
}

function changeMonth(delta) { viewDate.setMonth(viewDate.getMonth() + delta); updateStats(); }
function addUser() { const n = document.getElementById('new-user-name'); if(n.value) { users.push(n.value); n.value=""; sync(); } }
function pay(name) { if(confirm(`${name} abrechnen?`)) { trans = trans.filter(t => t.person !== name); sync(); } }
function removeUser(name) {
    if(confirm(`Möchtest du ${name} wirklich komplett aus der Liste löschen? Alle Daten gehen verloren.`)) {
        users = users.filter(u => u !== name);
        trans = trans.filter(t => t.person !== name);
        sync();
    }
}
function openExtraModal() { document.getElementById('extra-modal').style.display = 'block'; }
function closeExtraModal() { document.getElementById('extra-modal').style.display = 'none'; }
function confirmExtra() {
    const u = document.getElementById('active-user-select').value;
    const d = document.getElementById('modal-extra-desc').value;
    const a = parseFloat(document.getElementById('modal-extra-amount').value);
    if(!isNaN(a)) { trans.push({ person: u, product: d || 'Extra', price: a, date: new Date().toISOString() }); sync(); closeExtraModal(); }
}

init();
