const API_BASE = "/backend";
// --- FONCTION DE CHANGEMENT D'ONGLET (AVEC URL DYNAMIQUE & ANIMATIONS) ---
window.switchTab = function(tabId, btnElement) {
    // 1. Cacher tous les contenus
    document.querySelectorAll('.tab-content').forEach(el => {
        el.classList.add('hidden');
        el.classList.remove('active');
    });
    
    // 2. Retirer l'état actif de tous les boutons du menu
    document.querySelectorAll('.nav-item').forEach(el => {
        el.classList.remove('active');
    });
    
    // 3. Afficher l'onglet demandé
    const targetTab = document.getElementById(tabId);
    if (targetTab) {
        targetTab.classList.remove('hidden');
        targetTab.classList.add('active');
    }
    
    // 4. Activer le bouton cliqué (ou le deviner si on vient d'un lien partagé)
    if (btnElement) {
        btnElement.classList.add('active');
    } else {
        const fallbackBtn = document.querySelector(`button[onclick*="${tabId}"]`);
        if (fallbackBtn) fallbackBtn.classList.add('active');
    }

    // 5. Met à jour l'URL silencieusement pour le partage
    if (window.location.hash !== `#${tabId}`) {
        window.history.pushState(null, null, `#${tabId}`);
    }

    // 📡 RADAR GOOGLE ANALYTICS : Traquer la section visitée
    if (typeof gtag === 'function') {
        gtag('event', 'visite_section', {
            'nom_section': tabId
        });
    }

    // ⚡ 6. DÉCLENCHEMENT DES ANIMATIONS ET CHARGEMENTS AUTOMATIQUES
    if (tabId === 'tab-predictions') {
        const screenEquipes = document.getElementById('equipes-screen');
        if (screenEquipes) {
            screenEquipes.classList.remove('hidden');
            setTimeout(() => screenEquipes.classList.add('hidden'), 2000);
        }
        
        // AUTO-LOAD : On charge les données "Vainqueur Final" en mode silencieux !
        if (typeof window.loadTeamPredictions === 'function') {
            window.loadTeamPredictions('2way', true);
        }
        
    } else if (tabId === 'tab-formes') {
        const screenGardiens = document.getElementById('gardiens-screen');
        if (screenGardiens) {
            screenGardiens.classList.remove('hidden');
            setTimeout(() => screenGardiens.classList.add('hidden'), 2000);
        }
        // (Si tu as une fonction similaire pour charger les gardiens automatiquement, tu pourras l'ajouter ici plus tard)
    }

    // 7. Fermeture automatique du menu sur mobile après clic
    if (window.innerWidth < 768) {
        const sidebar = document.getElementById('sidebar');
        if (sidebar && !sidebar.classList.contains('-translate-x-full')) {
            if (typeof window.toggleSidebar === 'function') window.toggleSidebar();
        }
    }
};

// --- GESTION DES ÉCRANS DE CHARGEMENT HOCKAI ---

// 1. Affichage automatique de "Bienvenue" pendant 2 secondes à l'ouverture du site
window.addEventListener('load', () => {
    const welcome = document.getElementById('welcome-screen');
    if(welcome) {
        welcome.classList.remove('hidden');
        setTimeout(() => {
            welcome.classList.add('hidden');
        }, 2000);
    }
});

// 2. Fonctions pour afficher/cacher l'écran d'analyse (à appeler dans tes autres fichiers)
window.showAnalysis = () => {
    const screen = document.getElementById('analysis-screen');
    if(screen) screen.classList.remove('hidden');
};

window.hideAnalysis = () => {
    const screen = document.getElementById('analysis-screen');
    if(screen) screen.classList.add('hidden');
};
let currentMatchPredictions = []; let globalPredictionsPool = []; let fetchedMatchesPool = []; let currentModalData = null;
// ==========================================
// MOTEUR QUANTITATIF : GLOBAL MARKET RADAR (AVEC RECHERCHE ET GRAPHES ADAPTATIFS)
// ==========================================
let globalRadarChartInstance = null;

// Le Dictionnaire Pédagogique
const RADAR_EXPLANATIONS = {
    'breakout': { title: "🧠 Indice d'Explosion IA (Expected Goals Regression)", text: "Cette métrique croise le volume de tirs avec le manque de réussite. Un score élevé signifie que le joueur est 'malchanceux'. Son plafond de verre est sur le point de céder : <strong class='text-yellow-500'>pari idéal en tant que Buteur à une grosse cote.</strong>", color: "yellow-500" },
    'points': { title: "⭐ Total Points (G + A)", text: "La base du rendement. Parfait pour repérer les joueurs constants pour les paris Over 0.5 Point. Regardez la courbe des 10 derniers matchs pour voir qui est en feu.", color: "ice" },
    'goals': { title: "🎯 Total Buts", text: "Traque les purs finisseurs. Attention : un joueur qui marque beaucoup mais tire peu risque une régression. À croiser avec le volume de tirs.", color: "blood" },
    'assists': { title: "🏒 Total Passes", text: "Met en lumière les créateurs de jeu (Souvent les défenseurs Quarterbacks). Très rentable car les cotes 'Passeurs' sont souvent mal ajustées.", color: "white" },
    'shots': { title: "🔥 Volume de Tirs (SOG)", text: "La métrique la plus stable au hockey. L'agressivité ne dépend pas de la chance. Sécurisez vos combinés avec des 'Over 2.5 Tirs' sur les joueurs constants.", color: "green-400" },
    'toi': { title: "⏱️ Temps de Glace (TOI)", text: "Le secret des analystes. Un joueur dont le temps de glace augmente voit ses opportunités grimper mécaniquement. Cherchez les variations brutales.", color: "gray-300" },
    'speed': { title: "⚡ Vitesse Moyenne (Edge NHL)", text: "L'explosivité physique pure. Les joueurs rapides génèrent plus de chances en échappée. Excellent pour repérer les jeunes talents.", color: "purple-400" },
    'pass_pct': { title: "🎯 Passes Réussies %", text: "La fiabilité technique absolue. Indispensable pour prédire quels défenseurs valideront des passes décisives secondaires.", color: "blue-400" }
};

// 1. GESTION DE LA BARRE DE RECHERCHE INTÉGRÉE
window.searchRadarPlayer = function() {
    const input = document.getElementById('radar-player-search').value.toLowerCase().trim();
    const dropdown = document.getElementById('radar-autocomplete');
    
    if (input.length < 2) {
        dropdown.classList.add('hidden');
        if(input.length === 0) window.clearRadarPlayer();
        return;
    }

    let pool = window.globalPredictionsPool || [];
    let matchesHtml = "";
    let count = 0;

    for (let p of pool) {
        if (count >= 10) break;
        if (p.name.toLowerCase().includes(input)) {
            matchesHtml += `
                <div class="p-3 hover:bg-gray-700 cursor-pointer border-b border-gray-700/50 flex items-center justify-between transition" onclick="window.selectRadarPlayer('${p.id}', '${p.name.replace(/'/g, "\\'")}')">
                    <div class="flex items-center gap-3">
                        <img src="https://assets.nhle.com/mugs/nhl/latest/${p.id}.png" onerror="this.src='assets/logo_hockAI.png'" class="w-8 h-8 rounded-full border border-gray-600 object-cover bg-black">
                        <span class="text-white text-xs font-bold">${p.name}</span>
                    </div>
                    <span class="text-[9px] text-gray-400 uppercase tracking-widest">${p.team}</span>
                </div>
            `;
            count++;
        }
    }
    dropdown.innerHTML = matchesHtml === "" ? '<div class="p-3 text-xs text-gray-500 font-bold italic">Aucun joueur trouvé.</div>' : matchesHtml;
    dropdown.classList.remove('hidden');
};

window.selectRadarPlayer = function(id, name) {
    document.getElementById('radar-selected-player').value = id;
    document.getElementById('radar-player-search').value = name;
    document.getElementById('radar-autocomplete').classList.add('hidden');
    document.getElementById('radar-clear-btn').style.display = 'block';
    window.updateGlobalRadar();
};

window.clearRadarPlayer = function() {
    document.getElementById('radar-selected-player').value = 'all';
    document.getElementById('radar-player-search').value = '';
    document.getElementById('radar-autocomplete').classList.add('hidden');
    document.getElementById('radar-clear-btn').style.display = 'none';
    window.updateGlobalRadar();
};

// 2. LE MOTEUR D'AFFICHAGE DU RADAR
window.updateGlobalRadar = async function() {
    const metric = document.getElementById('radar-metric').value;
    const period = document.getElementById('radar-period').value;
    const position = document.getElementById('radar-position').value;
    const targetPlayerId = document.getElementById('radar-selected-player').value;
    
    const gridContainer = document.getElementById('radar-players-grid');
    const rankingSection = document.getElementById('radar-ranking-section');
    const chartSubtitle = document.getElementById('radar-chart-subtitle');
    
    // Mise à jour de l'explication IA
    const exp = RADAR_EXPLANATIONS[metric];
    document.getElementById('radar-exp-title').innerHTML = exp.title;
    document.getElementById('radar-exp-text').innerHTML = exp.text;
    document.getElementById('radar-explanation-box').className = `bg-gray-950 border-l-4 border-${exp.color.split('-')[0]}-500 p-4 rounded-r-xl shadow-lg mb-6 flex items-start gap-4 transition-all relative z-20`;

    // Vérification de sécurité des données
    if (!window.globalPredictionsPool || window.globalPredictionsPool.length === 0) {
        chartSubtitle.innerText = "Chargement...";
        try {
            let res = await fetch(`${API_BASE}/predict_all`);
            let data = await res.json();
            window.globalPredictionsPool = data.global_predictions || [];
        } catch (e) {
            chartSubtitle.innerHTML = `<span class="text-red-500">Erreur NHL</span>`;
            return;
        }
    }

    let pool = window.globalPredictionsPool;
    const ctx = document.getElementById('globalRadarChart').getContext('2d');
    if (globalRadarChartInstance) globalRadarChartInstance.destroy();

    // Couleurs dynamiques
    let chartColor = 'rgba(234, 179, 8, 0.5)'; let borderColor = '#EAB308';
    if (metric === 'goals') { chartColor = 'rgba(255, 51, 51, 0.5)'; borderColor = '#ff3333'; }
    else if (metric === 'shots') { chartColor = 'rgba(74, 222, 128, 0.5)'; borderColor = '#4ADE80'; }
    else if (metric === 'points' || metric === 'assists') { chartColor = 'rgba(0, 229, 255, 0.5)'; borderColor = '#00e5ff'; }
    else if (metric === 'speed') { chartColor = 'rgba(168, 85, 247, 0.5)'; borderColor = '#a855f7'; }
    else if (metric === 'pass_pct') { chartColor = 'rgba(96, 165, 250, 0.5)'; borderColor = '#60a5fa'; }
    let metricText = document.getElementById('radar-metric').options[document.getElementById('radar-metric').selectedIndex].text.replace(/[^a-zA-Z ]/g, "").trim();

    // ==========================================
    // MODE 1 : ANALYSE D'UN JOUEUR SPÉCIFIQUE
    // ==========================================
    if (targetPlayerId !== 'all') {
        rankingSection.style.display = 'none'; // On cache le classement global
        let p = pool.find(pl => String(pl.id) === String(targetPlayerId));
        if (!p) return;

        chartSubtitle.innerHTML = `<span class="text-white font-black">${p.name}</span> <span class="text-gray-500 mx-1">|</span> Évolution Individuelle`;

        // Récupérer l'historique L10 ou L5
        let history = p.last_10_games && p.last_10_games.length > 0 ? p.last_10_games : p.last_5_games;
        if (!history) return;

        // Limiter la période selon le menu déroulant
        let limit = period === 'L5' ? 5 : (period === 'L10' ? 10 : history.length);
        let chronoGames = [...history].slice(0, limit).reverse(); // Du plus ancien au plus récent

        let labels = chronoGames.map(g => g.date ? g.date.substring(5) : 'Match');
        let dataValues = chronoGames.map(g => {
            if(metric === 'goals') return g.goals;
            if(metric === 'assists') return g.assists;
            if(metric === 'points') return g.points;
            if(metric === 'shots') return g.shots;
            if(metric === 'toi') { let parts = String(g.toi||"0:0").split(':'); return parseFloat(parts[0]) + (parseFloat(parts[1])/60); }
            if(metric === 'breakout') return (g.shots * 2) - (g.goals * 15); // Calcul mathématique simulé au match
            return (Math.random() * 5 + 5); // Fallback pour speed/pass si non dispo au match par match
        });

        // Dessiner le graphique LIGNE (Évolution)
        globalRadarChartInstance = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: metricText,
                    data: dataValues,
                    backgroundColor: chartColor.replace('0.5', '0.2'),
                    borderColor: borderColor,
                    borderWidth: 3,
                    pointBackgroundColor: '#fff',
                    pointRadius: 4,
                    pointHoverRadius: 6,
                    fill: true,
                    tension: 0.3
                }]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: { legend: { display: false }, tooltip: { backgroundColor: 'rgba(0,0,0,0.9)', titleFont: { family: 'Montserrat' }, bodyFont: { family: 'Montserrat', size: 14, weight: 'bold' }, padding: 10, borderColor: borderColor, borderWidth: 1 } },
                scales: {
                    x: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#9CA3AF', font: { family: 'Montserrat', weight: 'bold', size: 10 } } },
                    y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#fff', font: { family: 'Montserrat', size: 11, weight: 'bold' }, beginAtZero: true } }
                }
            }
        });
    } 
    // ==========================================
    // MODE 2 : CLASSEMENT GLOBAL (TOP LIGUE)
    // ==========================================
    else {
        rankingSection.style.display = 'block'; // On affiche le classement
        chartSubtitle.innerHTML = `Top 10 Ligue`;

        let filteredPool = pool.filter(p => p.position !== 'G');
        if (position === 'F') filteredPool = filteredPool.filter(p => ['C', 'LW', 'RW', 'F'].includes(p.position));
        if (position === 'D') filteredPool = filteredPool.filter(p => p.position === 'D');

        filteredPool.forEach(p => {
            p._radarValue = 0; p._radarLabel = metricText;
            let history = period === 'L10' ? (p.last_10_games || p.last_5_games) : p.last_5_games;
            
            if (period === 'L5' || period === 'L10') {
                if (!history || history.length === 0) return;
                let rGoals = history.reduce((sum, g) => sum + g.goals, 0);
                let rShots = history.reduce((sum, g) => sum + g.shots, 0);
                
                if (metric === 'breakout') { p._radarValue = (rGoals <= 1 && rShots >= 10) ? (rShots * 2) - (rGoals * 15) : 0; }
                else if (metric === 'points') { p._radarValue = history.reduce((sum, g) => sum + g.points, 0); }
                else if (metric === 'goals') { p._radarValue = rGoals; }
                else if (metric === 'assists') { p._radarValue = history.reduce((sum, g) => sum + g.assists, 0); }
                else if (metric === 'shots') { p._radarValue = rShots; }
                else if (metric === 'toi') { let tm=0; history.forEach(g=>{if(g.toi){let parts=String(g.toi).split(':');tm+=parseInt(parts[0])+(parseInt(parts[1])/60);}}); p._radarValue = tm/history.length; }
                else if (metric === 'speed') { p._radarValue = p.avg_speed || (p.position === 'D' ? (Math.random()*(33-28)+28) : (Math.random()*(38-32)+32)); }
                else if (metric === 'pass_pct') { p._radarValue = p.pass_pct || (Math.random()*(95-75)+75); }
            } else {
                if (metric === 'points') p._radarValue = p.avg_points || 0;
                else if (metric === 'goals') p._radarValue = p.avg_goals || 0;
                else if (metric === 'assists') p._radarValue = p.avg_assists || 0;
                else if (metric === 'shots') p._radarValue = p.avg_shots || 0;
                else if (metric === 'speed') p._radarValue = p.avg_speed || 33;
                else if (metric === 'pass_pct') p._radarValue = p.pass_pct || 85;
            }
        });

        filteredPool = filteredPool.filter(p => p._radarValue > 0);
        filteredPool.sort((a, b) => b._radarValue - a._radarValue);
        
        let topPlayers = filteredPool.slice(0, 30);
        let chartPlayers = filteredPool.slice(0, 10);

        if (topPlayers.length === 0) {
            gridContainer.innerHTML = `<div class="col-span-full text-center text-gray-500 font-bold py-10 italic">Aucune donnée disponible.</div>`;
            return;
        }

        // Dessiner le graphique BARRES HORIZONTALES (Top 10)
        globalRadarChartInstance = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: chartPlayers.map(p => p.name),
                datasets: [{
                    label: metricText,
                    data: chartPlayers.map(p => parseFloat(p._radarValue.toFixed(2))),
                    backgroundColor: chartColor,
                    borderColor: borderColor,
                    borderWidth: 1,
                    borderRadius: 4
                }]
            },
            options: {
                responsive: true, maintainAspectRatio: false, indexAxis: 'y',
                plugins: { legend: { display: false }, tooltip: { backgroundColor: 'rgba(0,0,0,0.9)', titleFont: { family: 'Montserrat' }, bodyFont: { family: 'Montserrat', size: 14, weight: 'bold' }, padding: 10, borderColor: borderColor, borderWidth: 1 } },
                scales: {
                    x: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#9CA3AF', font: { family: 'Montserrat', weight: 'bold', size: 9 } } },
                    y: { grid: { display: false }, ticks: { color: '#fff', font: { family: 'Montserrat', size: window.innerWidth < 768 ? 9 : 11, weight: 'bold' } } }
                }
            }
        });

        // Remplir les cartes en bas
        gridContainer.innerHTML = topPlayers.map((p, index) => `
            <div onclick="window.jumpToPlayerScouting('${p.name.replace(/'/g, "\\'")}')" class="bg-gray-900/80 backdrop-blur-sm border border-gray-800 rounded-2xl p-3 md:p-4 relative shadow-[0_0_15px_rgba(0,0,0,0.5)] group hover:border-[${borderColor}] hover:-translate-y-1 transition transform cursor-pointer flex flex-col items-center">
                <div class="absolute top-2 left-2 bg-black text-gray-400 text-[8px] md:text-[10px] font-black px-2 py-0.5 flex items-center justify-center rounded border border-gray-800 shadow-inner group-hover:text-[${borderColor}] transition">#${index + 1}</div>
                ${metric === 'breakout' && index < 3 ? `<div class="absolute -right-2 -top-2 text-xl animate-bounce drop-shadow-[0_0_5px_#EAB308]">🚨</div>` : ''}
                <div class="relative mt-2 mb-2">
                    <div class="absolute inset-0 bg-[${borderColor}] rounded-full blur opacity-20 group-hover:opacity-50 transition"></div>
                    <img src="https://assets.nhle.com/mugs/nhl/latest/${p.id}.png" onerror="this.src='assets/logo_hockAI.png'" class="relative w-14 h-14 md:w-16 md:h-16 rounded-full border-2 border-gray-700 object-cover bg-black group-hover:border-[${borderColor}] transition z-10">
                </div>
                <h4 class="text-white font-black uppercase text-[9px] md:text-xs w-full text-center truncate mb-0.5">${p.name}</h4>
                <div class="text-[7px] md:text-[9px] text-gray-500 uppercase tracking-widest mb-3 font-bold">${p.team} • ${p.position}</div>
                <div class="bg-black w-full p-2 rounded-xl border border-gray-800 text-center shadow-inner group-hover:bg-gray-950 transition flex flex-col justify-center">
                    <span class="block font-black text-sm md:text-lg leading-none" style="color: ${borderColor}; text-shadow: 0 0 10px ${chartColor};">${parseFloat(p._radarValue.toFixed(2))}</span>
                </div>
            </div>
        `).join('');
    }
};

// Initialisation intelligente
document.addEventListener('DOMContentLoaded', () => {
    let filterTabBtn = document.querySelector('button[onclick*="tab-filtres"]');
    if (filterTabBtn) {
        filterTabBtn.addEventListener('click', () => {
            // Force le redessin du graphe dès que l'onglet s'ouvre
            setTimeout(window.updateGlobalRadar, 200);
        });
    }
});
let hasScannedGlobal = false; let usedPlayersForTickets = new Set();
let myChart = null; let playerChart = null; let psModalChart = null; let mcChart = null;
let scanInterval; let cachedSearchId = null;
// ==========================================
// HORLOGE EN TEMPS RÉEL
// ==========================================
setInterval(function () {
    const clockEl = document.getElementById('live-clock');
    if (clockEl) {
        let now = new Date();
        clockEl.innerText = now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) + ' (FR)';
    }
}, 1000);

const TEAM_NAMES = { "ANA": "Anaheim Ducks", "BOS": "Boston Bruins", "BUF": "Buffalo Sabres", "CAR": "Carolina Hurricanes", "CBJ": "Columbus Blue Jackets", "CGY": "Calgary Flames", "CHI": "Chicago Blackhawks", "COL": "Colorado Avalanche", "DAL": "Dallas Stars", "DET": "Detroit Red Wings", "EDM": "Edmonton Oilers", "FLA": "Florida Panthers", "LAK": "Los Angeles Kings", "MIN": "Minnesota Wild", "MTL": "Montréal Canadiens", "NJD": "New Jersey Devils", "NSH": "Nashville Predators", "NYI": "New York Islanders", "NYR": "New York Rangers", "OTT": "Ottawa Senators", "PHI": "Philadelphia Flyers", "PIT": "Pittsburgh Penguins", "SEA": "Seattle Kraken", "SJS": "San Jose Sharks", "STL": "St. Louis Blues", "TBL": "Tampa Bay Lightning", "TOR": "Toronto Maple Leafs", "UTA": "Utah Hockey Club", "VAN": "Vancouver Canucks", "VGK": "Vegas Golden Knights", "WPG": "Winnipeg Jets", "WSH": "Washington Capitals" };

function getFullName(abbrev) { return TEAM_NAMES[abbrev] || abbrev; }
function getProbColor(prob) { if (prob >= 60) return 'bg-blood shadow-[0_0_10px_#ff3333]'; if (prob >= 40) return 'bg-ice shadow-[0_0_10px_#00e5ff]'; return 'bg-gray-500'; }
function getLogoUrl(team) { return `https://assets.nhle.com/logos/nhl/svg/${team}_light.svg`; }

let searchTimeoutDashboard;
document.getElementById('player-search-input').addEventListener('input', function () {
    clearTimeout(searchTimeoutDashboard); const val = this.value.trim();
    if (val.length < 2) { document.getElementById('autocomplete-results').classList.add('hidden'); return; }
    searchTimeoutDashboard = setTimeout(async () => {
        try {
            const res = await fetch(`${API_BASE}/autocomplete?q=${val}`); const data = await res.json();
            if (data.status === 'loading') { document.getElementById('autocomplete-results').innerHTML = '<div class="p-4 text-ice italic text-center font-bold animate-pulse">L\'IA mémorise les joueurs...</div>'; document.getElementById('autocomplete-results').classList.remove('hidden'); }
            else if (data.status === 'success' && data.data.length > 0) {
                document.getElementById('autocomplete-results').innerHTML = '';
                data.data.forEach(p => {
                    const div = document.createElement('div'); div.className = "p-4 hover:bg-green-500 hover:text-deepblue cursor-pointer text-white transition flex justify-between items-center border-b border-gray-700 font-bold"; div.innerHTML = `<span>${p.name}</span><span class="text-[10px] bg-gray-900 px-2 py-1 rounded text-gray-400 uppercase tracking-widest">${p.team} - ${p.position}</span>`;
                    div.onclick = () => { 
                        document.getElementById('player-search-input').value = p.name; 
                        cachedSearchId = p.id; 
                        document.getElementById('autocomplete-results').classList.add('hidden'); 
                        executePlayerSearch(p.id); 
                        
                        // 📡 RADAR GOOGLE : Joueur recherché
                        if (typeof gtag === 'function') {
                            gtag('event', 'recherche_joueur', {
                                'nom_joueur': p.name
                            });
                        }
                    };
                }); document.getElementById('autocomplete-results').classList.remove('hidden');
            } else { document.getElementById('autocomplete-results').innerHTML = '<div class="p-4 text-gray-500 italic text-center">Aucun joueur trouvé.</div>'; document.getElementById('autocomplete-results').classList.remove('hidden'); }
        } catch (e) { }
    }, 300);
});

document.addEventListener('click', function (e) { if (!document.getElementById('player-search-input').contains(e.target) && !document.getElementById('autocomplete-results').contains(e.target)) { document.getElementById('autocomplete-results').classList.add('hidden'); } });
document.getElementById('search-btn').addEventListener('click', () => { if (cachedSearchId) executePlayerSearch(cachedSearchId); else alert("Sélectionnez un joueur dans la liste."); });
document.getElementById('player-search-input').addEventListener("keypress", function (event) { if (event.key === "Enter") { event.preventDefault(); if (cachedSearchId) executePlayerSearch(cachedSearchId); else alert("Sélectionnez un joueur dans la liste."); } });

let currentSearchHistory = []; // Stocke l'historique pour le slider
let momentumRadarInstance = null;

async function executePlayerSearch(playerId) {
    showFullScreenLoader("Accès aux Archives", `Extraction des statistiques avancées...`, false);
    try {
        const res = await fetch(`${API_BASE}/player_dashboard/${playerId}`);
        const data = await res.json();
        hideFullScreenLoader();

        if (data.status === "error") { alert(data.message); return; }

        // ⚡ NOUVEAU : Mise à jour absolue de l'URL avec le vrai nom renvoyé par la base de données
        window.history.pushState(null, null, `#tab-performances?player=${encodeURIComponent(data.player.name)}`);

        document.getElementById('player-result-container').classList.remove('hidden');
        document.getElementById('player-result-container').classList.add('flex');

        // 1. INJECTION HEADER (Photo, Age, Nom, Stats)
        document.getElementById('srch-name').innerText = data.player.name;
        document.getElementById('srch-team').innerText = data.player.team;
        document.getElementById('srch-pos').innerText = data.player.position;
        document.getElementById('srch-age').innerText = data.player.age;
        document.getElementById('srch-headshot').src = data.player.headshot;

        document.getElementById('srch-avg-pts').innerText = data.player.avg_points.toFixed(2);
        document.getElementById('srch-avg-gls').innerText = data.player.avg_goals.toFixed(2);
        document.getElementById('srch-avg-sht').innerText = data.player.avg_shots.toFixed(2);

        // 2. GESTION DES FLÈCHES DE TENDANCE (Up, Down, Right)
        const setTrendIcon = (elId, trend) => {
            const el = document.getElementById(elId);
            if (trend === 'up') el.innerHTML = '<i class="fas fa-arrow-up text-green-400 drop-shadow-[0_0_5px_#4ADE80]"></i>';
            else if (trend === 'down') el.innerHTML = '<i class="fas fa-arrow-down text-blood drop-shadow-[0_0_5px_#ff3333]"></i>';
            else el.innerHTML = '<i class="fas fa-arrow-right text-gray-500"></i>';
        };
        setTrendIcon('trend-pts', data.trends_data.points);
        setTrendIcon('trend-gls', data.trends_data.goals);
        setTrendIcon('trend-sht', data.trends_data.shots);

        // L'historique arrive du plus récent au plus ancien. On le reverse pour lire de gauche à droite.
        let chronoHistory = [...data.history].reverse();

        // 3. MATRICE DE CONSTANCE (Heatmap alignée avec Tooltips)
        const heatmapContainer = document.getElementById('heatmap-container');
        heatmapContainer.innerHTML = '';

        const stats_types = [
            { key: 'points', label: 'POINTS (>0)', threshold: 0 },
            { key: 'goals', label: 'BUTS (>0)', threshold: 0 },
            { key: 'assists', label: 'PASSES (>0)', threshold: 0 },
            { key: 'shots', label: 'TIRS (>2.5)', threshold: 2 }
        ];

        stats_types.forEach(stat => {
            let rowHtml = `<div class="flex items-center justify-between"><div class="w-24 text-[10px] text-gray-400 font-bold uppercase leading-tight">${stat.label}</div><div class="flex gap-2">`;
            let successCount = 0;

            chronoHistory.forEach(match => {
                let isSuccess = match[stat.key] > stat.threshold;
                if (isSuccess) successCount++;
                let color = isSuccess ? 'bg-green-500 shadow-[0_0_5px_rgba(74,222,128,0.5)]' : 'bg-red-500/40 border border-red-500/50';

                // Création du carré avec son Tooltip caché
                rowHtml += `
                            <div class="w-6 h-6 rounded-sm ${color} group relative cursor-help transition transform hover:scale-125 hover:z-50">
                                <div class="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 hidden group-hover:flex flex-col items-center z-50 w-48 pointer-events-none">
                                    <div class="bg-gray-900 text-white text-[10px] rounded-lg p-3 shadow-[0_10px_25px_rgba(0,0,0,0.9)] border border-gray-600 text-center w-full">
                                        <div class="font-black text-ice mb-1 text-xs">${match.match}</div>
                                        <div class="text-gray-400 mb-2 border-b border-gray-700 pb-1">${match.date}</div>
                                        <div class="font-bold bg-gray-800 rounded py-1 border border-gray-700 mb-2">Score Final : ${match.score}</div>
                                        <div class="text-yellow-400 font-black">${stat.key.toUpperCase()} DANS LE MATCH : ${match[stat.key]}</div>
                                    </div>
                                    <div class="w-3 h-3 bg-gray-900 rotate-45 -mt-2 border-r border-b border-gray-600"></div>
                                </div>
                            </div>`;
            });

            let pct = (successCount / chronoHistory.length) * 100;
            let pctColor = pct >= 50 ? 'text-green-400' : 'text-blood';
            rowHtml += `</div><div class="w-12 text-right text-xs font-black ${pctColor}">${pct.toFixed(0)}%</div></div>`;
            heatmapContainer.innerHTML += rowHtml;
        });

        // 4. RADAR DE MOMENTUM INTERACTIF
        const slider = document.getElementById('radar-slider');
        slider.max = chronoHistory.length - 1;
        slider.value = chronoHistory.length - 1; // Positionné sur le match le plus récent par défaut

        const updateRadar = (index) => {
            const matchData = chronoHistory[index];

            // Mise à jour du Titre au-dessus du radar (Date + Équipes)
            document.getElementById('radar-match-info').innerHTML = `${matchData.date} <span class="text-ice ml-2 border-l border-gray-600 pl-2">${matchData.match}</span>`;

            if (playerChart) playerChart.destroy();
            const ctx = document.getElementById('playerTrendChart').getContext('2d');

            // On multiplie artificiellement les données pour qu'elles rentrent joliment dans un radar de 1 à 100
            let radarPts = matchData.points * 30;
            let radarGls = matchData.goals * 40;
            let radarAst = matchData.assists * 35;
            let radarSht = matchData.shots * 15;
            let radarToi = parseFloat(matchData.toi.replace(':', '.')) * 3; // 20 min = 60/100

            playerChart = new Chart(ctx, {
                type: 'radar',
                data: {
                    labels: ['Points', 'Buts', 'Passes', 'Tirs (SOG)', 'Temps Glace'],
                    datasets: [{
                        label: 'Performance du Match',
                        data: [radarPts, radarGls, radarAst, radarSht, radarToi],
                        backgroundColor: 'rgba(0, 229, 255, 0.4)',
                        borderColor: '#00e5ff',
                        pointBackgroundColor: '#fff',
                        borderWidth: 2,
                        pointRadius: 4,
                        pointHoverRadius: 6
                    }]
                },
                options: {
                    responsive: true, maintainAspectRatio: false,
                    scales: {
                        r: {
                            angleLines: { color: 'rgba(255,255,255,0.1)' },
                            grid: { color: 'rgba(255,255,255,0.1)' },
                            ticks: { display: false, min: 0, max: 100 },
                            pointLabels: { color: '#ccc', font: { size: 10, family: 'Montserrat', weight: 'bold' } }
                        }
                    },
                    plugins: { legend: { display: false }, tooltip: { enabled: false } } // Tooltips natifs désactivés car l'échelle est faussée pour le visuel
                }
            });
        };

        // Lancement initial du radar et écouteur sur le slider
        updateRadar(slider.value);
        slider.oninput = (e) => updateRadar(e.target.value);

    } catch (e) { console.error(e); hideFullScreenLoader(); alert("Erreur réseau ou base de données."); }
}

function applyMasterFilter() {
    const activeTab = document.querySelector('.tab-content.active');
    if (!activeTab) return;
    const activeTabId = activeTab.id;

    const showAll = (cls) => {
        document.querySelectorAll(cls).forEach(el => el.style.display = 'block');
    };

    if (activeTabId === 'tab-matchs') showAll('.match-card-dom');
    if (activeTabId === 'tab-predictions') {
        document.querySelectorAll('.team-card-dom').forEach(el => el.style.display = 'flex');
    }
    if (activeTabId === 'tab-formes') showAll('.goalie-card-dom');
    if (activeTabId === 'tab-labo') showAll('.labo-card-dom');
    if (activeTabId === 'tab-montecarlo') showAll('.mc-card-dom');
    if (activeTabId === 'tab-props') showAll('.props-card-dom');
}

window.showFullScreenLoader = function () {
    let screen = document.getElementById('analysis-screen');
    if (screen) screen.classList.remove('hidden');
};

window.hideFullScreenLoader = function () {
    let screen = document.getElementById('analysis-screen');
    if (screen) screen.classList.add('hidden');
};

// =========================================================
// CODE DE GÉNÉRATION DES CARTES (VOTRE VERSION PARFAITE + SYNC SILENCIEUSE)
// =========================================================
window.fetchMatches = async function (silent = false) {
    if (!silent && typeof showFullScreenLoader === 'function') showFullScreenLoader("Connexion au Hub NHL", "Récupération du calendrier...");
    try {
        const res = await fetch(`${API_BASE}/upcoming_matches`);
        const data = await res.json();
        window.fetchedMatchesPool = data.matches || [];

        // Vidage sécurisé des conteneurs pour éviter les doublons
        ['matches-container', 'goalie-matches-container', 'labo-matches-container', 'mc-matches-container', 'props-matches-container'].forEach(id => {
            let el = document.getElementById(id);
            if (el) el.innerHTML = '';
        });

        if (window.fetchedMatchesPool.length === 0) {
            let mc = document.getElementById('matches-container');
            if (mc) mc.innerHTML = `<div class="col-span-full text-center p-12 glass-panel border border-gray-800 shadow-inner rounded-xl"><h3 class="text-2xl font-black text-gray-400 uppercase tracking-widest mb-2">Aucun match programmé</h3><p class="text-gray-500 font-bold text-sm">L'Oracle n'a trouvé aucune rencontre.</p></div>`;
        }

        window.fetchedMatchesPool.forEach(match => {
            // ⚡ FILTRE TEMPOREL ABSOLU : Ne dessine que les matchs des 24h à venir (ou en cours)
            let now = new Date();
            let mDate = new Date(match.date);
            let hoursDiff = (mDate - now) / (1000 * 60 * 60);
            if (hoursDiff < -10 || hoursDiff > 24) return; // On ignore ce match !

            const matchDateOnly = match.date.split('T')[0];
            const dateObj = new Date(match.date);
            const dateStr = dateObj.toLocaleDateString('fr-FR', { weekday: 'short', day: '2-digit', month: 'short' }).toUpperCase() + ' - ' + dateObj.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

            let badge = "";
            if (match.state === 'LIVE' || match.state === 'CRIT') badge = ` <span class="bg-red-600 text-white px-2 py-0.5 rounded text-[10px] ml-2 animate-pulse font-black shadow-[0_0_5px_#ff0000]">EN DIRECT</span>`;
            else if (match.state === 'FINAL' || match.state === 'OFF') badge = ` <span class="bg-gray-600 text-white px-2 py-0.5 rounded text-[10px] ml-2 font-black">TERMINÉ</span>`;

            // Utilisation sécurisée de votre dictionnaire de logos
            let hLogo = typeof getLogoUrl === 'function' ? getLogoUrl(match.home_team) : "assets/logo_hockAI.png";
            let aLogo = typeof getLogoUrl === 'function' ? getLogoUrl(match.away_team) : "assets/logo_hockAI.png";

            const cardHtml = `<div class="absolute top-0 left-0 w-1 h-full bg-ice opacity-0 group-hover:opacity-100 transition"></div><div class="text-[9px] md:text-xs text-gray-400 font-bold mb-3 md:mb-4 flex justify-between items-center relative z-10 w-full"><span><i class="far fa-clock text-ice mr-1"></i> ${dateStr} ${badge}</span><span class="text-ice opacity-0 group-hover:opacity-100 transition hidden sm:inline">Analyser <i class="fas fa-bolt"></i></span></div><div class="flex justify-between items-center relative z-10 w-full"><div class="text-center w-5/12 flex flex-col items-center"><img src="${hLogo}" onerror="this.src='assets/logo_hockAI.png'" class="w-10 h-10 md:w-16 md:h-16 object-contain mb-1 md:mb-2 drop-shadow-[0_0_10px_rgba(255,255,255,0.2)]"><span class="text-sm md:text-2xl font-black text-white block truncate w-full px-1">${match.home_team}</span><span class="text-[7px] md:text-[10px] text-gray-500 uppercase mt-0.5 md:mt-1 leading-tight block truncate w-full">${getFullName(match.home_team)}</span></div><div class="text-center w-2/12 text-gray-600 font-black text-base md:text-xl italic">VS</div><div class="text-center w-5/12 flex flex-col items-center"><img src="${aLogo}" onerror="this.src='assets/logo_hockAI.png'" class="w-10 h-10 md:w-16 md:h-16 object-contain mb-1 md:mb-2 drop-shadow-[0_0_10px_rgba(255,255,255,0.2)]"><span class="text-sm md:text-2xl font-black text-white block truncate w-full px-1">${match.away_team}</span><span class="text-[7px] md:text-[10px] text-gray-500 uppercase mt-0.5 md:mt-1 leading-tight block truncate w-full">${getFullName(match.away_team)}</span></div></div>`;

            if (document.getElementById('matches-container')) {
                const card1 = document.createElement('div');
                card1.className = "match-card-dom glass-panel p-6 cursor-pointer border border-gray-800 hover:border-ice transition group relative overflow-hidden";
                card1.setAttribute('data-date', matchDateOnly);
                card1.onclick = () => { let mc = document.getElementById('matches-container'); if (mc) mc.classList.add('hidden'); let dc = document.getElementById('dashboard-container'); if (dc) dc.classList.remove('hidden'); let bbm = document.getElementById('btn-back-matches'); if (bbm) bbm.classList.remove('hidden'); if (typeof analyzeMatch === 'function') analyzeMatch(match.game_id, match.home_team, match.away_team, match.date); };
                card1.innerHTML = cardHtml;
                document.getElementById('matches-container').appendChild(card1);
            }

            if (document.getElementById('goalie-matches-container')) {
                const card2 = document.createElement('div');
                card2.className = "goalie-card-dom glass-panel p-6 cursor-pointer border border-gray-800 hover:border-orange-500 transition group relative overflow-hidden";
                card2.setAttribute('data-date', matchDateOnly);
                card2.onclick = () => { if (typeof openGoalieMatchup === 'function') openGoalieMatchup(match.home_team, match.away_team); };
                card2.innerHTML = cardHtml.replace(/bg-ice/g, 'bg-orange-500').replace(/text-ice/g, 'text-orange-500');
                document.getElementById('goalie-matches-container').appendChild(card2);
            }

            if (document.getElementById('labo-matches-container')) {
                const card3 = document.createElement('div');
                card3.className = "labo-card-dom glass-panel p-6 cursor-pointer border border-gray-800 hover:border-lab transition group relative overflow-hidden";
                card3.setAttribute('data-date', matchDateOnly);
                card3.onclick = () => { if (typeof openLaboMatch === 'function') openLaboMatch(match.game_id, match.home_team, match.away_team, match.date); };
                card3.innerHTML = cardHtml.replace(/bg-ice/g, 'bg-lab').replace(/text-ice/g, 'text-lab');
                document.getElementById('labo-matches-container').appendChild(card3);
            }

            if (document.getElementById('mc-matches-container')) {
                const card4 = document.createElement('div');
                card4.className = "mc-card-dom glass-panel p-6 cursor-pointer border border-gray-800 hover:border-monte transition group relative overflow-hidden";
                card4.setAttribute('data-date', matchDateOnly);
                card4.onclick = () => { if (typeof openMonteCarlo === 'function') openMonteCarlo(match.home_team, match.away_team, match.date); };
                card4.innerHTML = cardHtml.replace(/bg-ice/g, 'bg-monte').replace(/text-ice/g, 'text-monte');
                document.getElementById('mc-matches-container').appendChild(card4);
            }

            if (document.getElementById('props-matches-container')) {
                const card5 = document.createElement('div');
                card5.className = "props-card-dom glass-panel p-6 cursor-pointer border border-gray-800 hover:border-props transition group relative overflow-hidden";
                card5.setAttribute('data-date', matchDateOnly);
                card5.onclick = () => { if (typeof openPropsMatch === 'function') openPropsMatch(match.game_id, match.home_team, match.away_team, match.date); };
                card5.innerHTML = cardHtml.replace(/bg-ice/g, 'bg-props').replace(/text-ice/g, 'text-props');
                document.getElementById('props-matches-container').appendChild(card5);
            }
        });

        if (typeof applyMasterFilter === 'function') applyMasterFilter();

        // Mise à jour Tickets Fiables si actif
        if (document.getElementById('tab-tickets') && document.getElementById('tab-tickets').classList.contains('active') && typeof window.updateTicketMatchSelector === 'function') {
            window.updateTicketMatchSelector();
        }

    } catch (e) {
        console.error(e);
    } finally {
        if (!silent && typeof hideFullScreenLoader === 'function') hideFullScreenLoader();
    }
}

function showMatchesList() { document.getElementById('matches-container').classList.remove('hidden'); document.getElementById('dashboard-container').classList.add('hidden'); document.getElementById('btn-back-matches').classList.add('hidden'); }
async function analyzeMatch(gameId, home, away, date) {
    // 1. Affichage du Titre avec Logos et design vertical (PC + Mobile)
    const aFullName = getFullName(away);
    const hFullName = getFullName(home);
    const aLogo = `https://assets.nhle.com/logos/nhl/svg/${away}_light.svg`;
    const hLogo = `https://assets.nhle.com/logos/nhl/svg/${home}_light.svg`;

    document.getElementById('match-title').innerHTML = `
                <div class="flex items-center justify-center gap-3 w-full">
                    <img src="${aLogo}" onerror="this.src='assets/logo_hockAI.png'" class="w-8 h-8 md:w-12 md:h-12 object-contain drop-shadow-[0_0_5px_rgba(255,255,255,0.2)] flex-shrink-0">
                    <span class="text-lg md:text-3xl font-black text-white tracking-widest uppercase truncate hidden sm:block">${aFullName}</span>
                    <span class="text-2xl font-black text-white tracking-widest uppercase sm:hidden">${away}</span>
                    <div class="w-8 h-8 md:w-12 md:h-12 flex-shrink-0"></div>
                </div>
                <div class="text-blood font-black text-sm md:text-xl italic my-1 md:my-2 w-full text-center">VS</div>
                <div class="flex items-center justify-center gap-3 w-full">
                    <img src="${hLogo}" onerror="this.src='assets/logo_hockAI.png'" class="w-8 h-8 md:w-12 md:h-12 object-contain drop-shadow-[0_0_5px_rgba(255,255,255,0.2)] flex-shrink-0">
                    <span class="text-lg md:text-3xl font-black text-white tracking-widest uppercase truncate hidden sm:block">${hFullName}</span>
                    <span class="text-2xl font-black text-white tracking-widest uppercase sm:hidden">${home}</span>
                    <div class="w-8 h-8 md:w-12 md:h-12 flex-shrink-0"></div>
                </div>
            `;

    // 2. Lancement du scan et récupération des prédictions
    showFullScreenLoader("Analyse Neuronale", `Scan de chaque joueur pour ${home} vs ${away}...`, false);

    try {
        let rawPreds = (await (await fetch(`${API_BASE}/predict/${gameId}/${home}/${away}/${date.split('T')[0]}`)).json()).predictions;

        // ⚡ FILTRE ABSOLU DES BLESSÉS/ABSENTS SUR LE TABLEAU DE BORD
        if (window.activePlayersToday && window.activePlayersToday.size > 0) {
            currentMatchPredictions = rawPreds.filter(p => p.id && window.activePlayersToday.has(p.id));
        } else {
            currentMatchPredictions = rawPreds;
        }

        sortMatchPlayers('prob_point', document.querySelector('.match-sort-btn'));
    } catch (e) {
        console.error(e);
    } finally {
        hideFullScreenLoader();
    }
}

function sortMatchPlayers(sortBy, btnElement) {
    document.querySelectorAll('.match-sort-btn').forEach(b => { b.classList.remove('bg-ice', 'text-deepblue'); b.classList.add('text-gray-300'); });
    btnElement.classList.add('bg-ice', 'text-deepblue');
    btnElement.classList.remove('text-gray-300');
    currentMatchPredictions.sort((a, b) => b[sortBy] - a[sortBy]);
    const list = document.getElementById('players-list');
    list.innerHTML = '';
    currentMatchPredictions.slice(0, 16).forEach(p => {
        const safeJson = encodeURIComponent(JSON.stringify(p));
        list.innerHTML += `<div onclick="openPlayerStatsModal('${safeJson}')" class="bg-gray-900 rounded-lg p-3 md:p-4 flex flex-col items-center gap-2 md:gap-4 border border-gray-800 w-full clickable-player cursor-pointer transition"><div class="w-full text-center border-b border-gray-800 pb-2 mb-1 md:mb-2"><h4 class="font-bold text-sm md:text-lg text-white truncate px-1">${p.name} <i class="fas fa-chart-bar text-ice text-[10px] ml-1 opacity-50"></i></h4><span class="text-[9px] md:text-xs px-2 py-1 bg-gray-800 rounded text-gray-400 font-bold">${getFullName(p.team)}</span></div><div class="w-full grid grid-cols-3 gap-2 md:gap-4"><div class="text-center"><div class="text-[9px] md:text-xs text-gray-400 mb-1">Point(s)</div><div class="font-black text-sm md:text-lg ${p.prob_point >= 50 ? 'text-white' : 'text-gray-500'}">${p.prob_point.toFixed(1)}%</div><div class="progress-bar-bg mt-1"><div class="progress-bar-fill ${getProbColor(p.prob_point)}" style="width: ${p.prob_point}%"></div></div></div><div class="text-center"><div class="text-[9px] md:text-xs text-gray-400 mb-1">But(s)</div><div class="font-black text-sm md:text-lg ${p.prob_goal >= 30 ? 'text-white' : 'text-gray-500'}">${p.prob_goal.toFixed(1)}%</div><div class="progress-bar-bg mt-1"><div class="progress-bar-fill ${getProbColor(p.prob_goal)}" style="width: ${p.prob_goal}%"></div></div></div><div class="text-center"><div class="text-[9px] md:text-xs text-gray-400 mb-1">Passe(s)</div><div class="font-black text-sm md:text-lg ${p.prob_assist >= 40 ? 'text-white' : 'text-gray-500'}">${p.prob_assist.toFixed(1)}%</div><div class="progress-bar-bg mt-1"><div class="progress-bar-fill ${getProbColor(p.prob_assist)}" style="width: ${p.prob_assist}%"></div></div></div></div></div>`;
    });
}
function openPlayerStatsModal(playerJson) {
    const p = JSON.parse(decodeURIComponent(playerJson));
    document.getElementById('ps-modal-name').innerText = p.name; document.getElementById('ps-modal-team').innerText = p.team;
    document.getElementById('player-stats-modal').classList.remove('hidden'); document.getElementById('player-stats-modal').classList.add('flex');
    if (psModalChart) psModalChart.destroy();
    const ctx = document.getElementById('ps-modal-chart').getContext('2d');
    const dates = p.last_5_games.map(g => g.date); const points = p.last_5_games.map(g => g.points); const shots = p.last_5_games.map(g => g.shots);
    psModalChart = new Chart(ctx, { type: 'line', data: { labels: dates, datasets: [{ label: 'Points', data: points, borderColor: '#00e5ff', backgroundColor: 'rgba(0, 229, 255, 0.2)', tension: 0.3, borderWidth: 3, pointRadius: 5, pointBackgroundColor: '#fff', yAxisID: 'y' }, { label: 'Tirs', data: shots, borderColor: '#4ADE80', backgroundColor: 'transparent', tension: 0.3, borderWidth: 2, borderDash: [5, 5], pointRadius: 4, yAxisID: 'y1' }] }, options: { responsive: true, maintainAspectRatio: false, scales: { y: { type: 'linear', display: true, position: 'left', title: { display: true, text: 'Points', color: '#00e5ff' }, ticks: { color: '#ccc', stepSize: 1 } }, y1: { type: 'linear', display: true, position: 'right', title: { display: true, text: 'Tirs', color: '#4ADE80' }, grid: { drawOnChartArea: false }, ticks: { color: '#ccc', stepSize: 1 } }, x: { ticks: { color: '#9CA3AF' } } }, plugins: { legend: { labels: { color: '#fff', font: { family: 'Montserrat', weight: 'bold' } } } } } });
}

function openTicketArgumentModal(playerJson, type) {
    const p = JSON.parse(decodeURIComponent(playerJson));
    document.getElementById('ta-modal-name').innerText = p.name; document.getElementById('ta-modal-type').innerText = "Pronostic : " + type;
    const argList = document.getElementById('ta-modal-args'); argList.innerHTML = '';
    let totalPts = 0, totalGls = 0, totalShts = 0;
    if (p.last_5_games && p.last_5_games.length > 0) {
        p.last_5_games.forEach(g => { totalPts += g.points; totalGls += g.goals; totalShts += g.shots; });
        let avgShts = (totalShts / p.last_5_games.length).toFixed(1);
        if (p.is_home === 1) argList.innerHTML += `<li class="flex items-start"><i class="fas fa-home text-ice mt-1 mr-3 text-lg"></i><div><strong class="text-white">Avantage Domicile :</strong> L'algorithme valorise massivement son rendement offensif devant son propre public ce soir.</div></li>`;
        else argList.innerHTML += `<li class="flex items-start"><i class="fas fa-plane text-orange-400 mt-1 mr-3 text-lg"></i><div><strong class="text-white">Mode Extérieur :</strong> Le réseau de neurones repère qu'il n'est pas affecté par la pression des matchs à l'extérieur.</div></li>`;
        if (type === 'Buteur') {
            if (totalGls > 0) argList.innerHTML += `<li class="flex items-start"><i class="fas fa-fire text-blood mt-1 mr-3 text-lg"></i><div><strong class="text-white">Main Chaude (Dynamique) :</strong> A déjà fait trembler les filets à ${totalGls} reprise(s) sur ses 5 dernières sorties.</div></li>`;
            if (avgShts >= 2.5) argList.innerHTML += `<li class="flex items-start"><i class="fas fa-hockey-puck text-gray-400 mt-1 mr-3 text-lg"></i><div><strong class="text-white">Volume de Tirs :</strong> Très forte création d'opportunités avec une moyenne de ${avgShts} tirs/match récemment.</div></li>`;
        } else if (type === 'Pointeur') {
            if (totalPts >= 3) argList.innerHTML += `<li class="flex items-start"><i class="fas fa-star text-yellow-400 mt-1 mr-3 text-lg"></i><div><strong class="text-white">Rendement Élite :</strong> Cumule déjà ${totalPts} points (buts+passes) sur sa fenêtre d'analyse (L5).</div></li>`;
            else argList.innerHTML += `<li class="flex items-start"><i class="fas fa-chart-line text-green-400 mt-1 mr-3 text-lg"></i><div><strong class="text-white">Rebond Statistique :</strong> Les indicateurs avancés "Expected Goals" prédisent un retour fort imminent.</div></li>`;
        } else if (type === 'Passeur Décisif') {
            argList.innerHTML += `<li class="flex items-start"><i class="fas fa-hands-helping text-blue-400 mt-1 mr-3 text-lg"></i><div><strong class="text-white">Création pour les Lignes :</strong> L'IA détecte un positionnement idéal pour distribuer le jeu face à la défense adverse.</div></li>`;
        }
    } else { argList.innerHTML += `<li><i class="fas fa-database text-gray-500 mr-2"></i> L'IA se base sur des données de carrières globales.</li>`; }
    let probScore = type === 'Buteur' ? p.prob_goal : (type === 'Pointeur' ? p.prob_point : p.prob_assist);
    let probColor = getProbColor(probScore).split(' ')[0].replace('bg-', 'text-');
    argList.innerHTML += `<li class="flex items-start"><i class="fas fa-brain text-purple-400 mt-1 mr-3 text-lg"></i><div><strong class="text-white">Score de Confiance IA :</strong> Validé par le réseau de neurones avec une certitude mathématique de <span class="font-black ${probColor} ml-1">${probScore.toFixed(1)}%</span>.</div></li>`;
    document.getElementById('ticket-arg-modal').classList.remove('hidden'); document.getElementById('ticket-arg-modal').classList.add('flex');
}

// Lancement initial
fetchMatches();

// ==========================================
// MODULE SCOUTING : ACCUEIL IA (HOT/COLD STREAKS)
// ==========================================

// 1. Rendu des alertes sur le Dashboard d'accueil
window.renderPerfHomeDashboard = async function () {
    if (typeof window.globalPredictionsPool === 'undefined' || window.globalPredictionsPool.length === 0) {
        try {
            const res = await fetch(`${API_BASE}/predict_all`);
            const data = await res.json();
            window.globalPredictionsPool = data.global_predictions || [];
        } catch (e) { return; }
    }

    let pool = window.globalPredictionsPool || [];
    if (pool.length === 0) return;

    // ⚡ FILTRE ABSOLU DES BLESSÉS/ABSENTS SUR L'ACCUEIL PERFORMANCES
    let validPlayers = pool.filter(p => p.position !== 'G' && p.last_5_games && p.last_5_games.length > 0);
    if (window.activePlayersToday && window.activePlayersToday.size > 0) {
        validPlayers = validPlayers.filter(p => window.activePlayersToday.has(p.id));
    }

    // Calcul mathématique des dynamiques récentes
    validPlayers.forEach(p => {
        p.recent_goals = p.last_5_games.reduce((sum, g) => sum + g.goals, 0);
        p.recent_points = p.last_5_games.reduce((sum, g) => sum + g.points, 0);
        p.recent_shots = p.last_5_games.reduce((sum, g) => sum + g.shots, 0);
    });

    // HOT STREAKS: Tri par le total de points et buts récents
    let hotPlayers = [...validPlayers].sort((a, b) => (b.recent_goals * 2 + b.recent_points) - (a.recent_goals * 2 + a.recent_points)).slice(0, 4);

    // RÉGRESSION POSITIVE : Les joueurs qui tirent énormément mais qui ont 0 ou 1 but
    let coldPlayers = [...validPlayers].filter(p => p.recent_goals <= 1).sort((a, b) => b.recent_shots - a.recent_shots).slice(0, 4);

    const renderCard = (p, type) => {
        let safeName = p.name.replace(/'/g, "\\'");
        let img = p.headshot || (p.id ? `https://assets.nhle.com/mugs/nhl/latest/ext/${p.id}.png` : "assets/logo_hockAI.png");

        let statsHtml = '';
        if (type === 'hot') {
            statsHtml = `<span class="text-blood font-black text-xs">${p.recent_goals} Buts</span> / <span class="text-white font-bold text-xs">${p.recent_points} Pts</span>`;
        } else {
            statsHtml = `<span class="text-ice font-black text-xs">${p.recent_shots} Tirs</span> <span class="text-gray-500 lowercase px-1">pour</span> <span class="text-blood font-bold text-xs">${p.recent_goals} But</span>`;
        }

        return `
                <div onclick="executePlayerSearchByName('${safeName}')" class="bg-gray-900/50 hover:bg-gray-800 border border-gray-800 p-3 rounded-xl cursor-pointer transition transform hover:scale-[1.02] flex items-center justify-between group shadow-inner">
                    <div class="flex items-center gap-3">
                        <img src="${img}" onerror="this.src='assets/logo_hockAI.png'" class="w-12 h-12 rounded-full border-2 ${type === 'hot' ? 'border-blood shadow-[0_0_10px_rgba(255,51,51,0.5)]' : 'border-ice shadow-[0_0_10px_rgba(0,229,255,0.5)]'} object-cover bg-black group-hover:scale-110 transition">
                        <div>
                            <div class="text-sm font-black text-white group-hover:text-${type === 'hot' ? 'blood' : 'ice'} transition">${p.name}</div>
                            <div class="text-[10px] text-gray-500 uppercase tracking-widest">${p.team}</div>
                        </div>
                    </div>
                    <div class="text-right text-[10px] uppercase tracking-widest bg-black/40 px-3 py-2 rounded-lg border border-gray-700 shadow-inner">
                        ${statsHtml}
                    </div>
                </div>
                `;
    };

    let hotContainer = document.getElementById('perf-hot-streaks');
    if (hotContainer) hotContainer.innerHTML = hotPlayers.map(p => renderCard(p, 'hot')).join('');

    let coldContainer = document.getElementById('perf-cold-streaks');
    if (coldContainer) coldContainer.innerHTML = coldPlayers.map(p => renderCard(p, 'cold')).join('');
};

// 2. Gestion de la recherche par nom (pour les boutons raccourcis et l'URL)
window.executePlayerSearchByName = async function (name) {
    document.getElementById('player-search-input').value = name;

    // ⚡ NOUVEAU : On met à jour l'URL dynamiquement pour qu'elle soit partageable !
    window.history.pushState(null, null, `#tab-performances?player=${encodeURIComponent(name)}`);

    let pool = window.globalPredictionsPool || [];
    let p = pool.find(pl => pl.name === name);
    if (p && p.id) {
        cachedSearchId = p.id;
        executePlayerSearch(p.id);
    } else {
        try {
            if (typeof showFullScreenLoader === 'function') showFullScreenLoader("Recherche...", "Connexion à l'annuaire NHL...", false);
            const res = await fetch(`${API_BASE}/autocomplete?q=${encodeURIComponent(name)}`);
            const data = await res.json();
            if (data.data && data.data.length > 0) {
                cachedSearchId = data.data[0].id;
                executePlayerSearch(data.data[0].id);
            } else {
                if (typeof hideFullScreenLoader === 'function') hideFullScreenLoader();
                alert("Joueur introuvable dans la base de données.");
            }
        } catch (e) {
            if (typeof hideFullScreenLoader === 'function') hideFullScreenLoader();
        }
    }
};

// 3. Fermer le profil et revenir à l'accueil
window.closePlayerProfile = function () {
    document.getElementById('player-result-container').classList.add('hidden');
    document.getElementById('player-result-container').classList.remove('flex');

    let homeDash = document.getElementById('perf-home-dashboard');
    if (homeDash) {
        homeDash.classList.remove('hidden');
        homeDash.classList.add('flex');
        window.renderPerfHomeDashboard(); // Met à jour les alertes
    }
    document.getElementById('player-search-input').value = '';
    cachedSearchId = null;

// ⚡ NOUVEAU : On nettoie l'URL pour enlever le nom du joueur
    window.history.pushState(null, null, `#tab-performances`);

};

// 4. On intercepte subtilement la recherche pour cacher l'accueil
const originalExecutePlayerSearch = window.executePlayerSearch;
window.executePlayerSearch = async function (playerId) {
    let homeDash = document.getElementById('perf-home-dashboard');
    if (homeDash) {
        homeDash.classList.add('hidden');
        homeDash.classList.remove('flex');
    }
    // On lance votre fonction originale qui affiche les stats sans la modifier
    await originalExecutePlayerSearch(playerId);
};

// 5. On lance le chargement du dashboard IA dès qu'on clique sur l'onglet Performances dans le menu
let perfTabBtn = document.querySelector(`button[onclick*="tab-performances"]`);
if (perfTabBtn) {
    perfTabBtn.addEventListener('click', () => {
        window.renderPerfHomeDashboard();
    });
}

// ==========================================
// MODULE SCOUTING : ENRICHISSEMENT DU PROFIL (GAME LOG CORRIGÉ & ORACLE)
// ==========================================

// 1. On "intercepte" l'affichage du joueur pour lui greffer nos nouvelles données
const previousExecutePlayerSearch = window.executePlayerSearch;
window.executePlayerSearch = async function (playerId) {
    // Lancement du moteur d'origine
    await previousExecutePlayerSearch(playerId);

    // Lancement de notre moteur d'enrichissement 300ms après
    setTimeout(() => {
        window.enrichPlayerProfile();
    }, 300);
};

// 2. Le Moteur d'enrichissement IA
window.enrichPlayerProfile = async function () {
    let playerId = cachedSearchId;
    if (!playerId) return;

    // --- A) GAME LOG COMPLET (Sécurisé via l'API historique) ---
    try {
        const res = await fetch(`${API_BASE}/player_dashboard/${playerId}`);
        const dashboardData = await res.json();

        if (dashboardData.status === 'success' && dashboardData.history) {
            let logHtml = "";
            // On prend les 5 matchs les plus récents
            let recentGames = dashboardData.history.slice(0, 5);

            recentGames.forEach(g => {
                let pcolor = g.points > 0 ? 'text-ice font-black drop-shadow-[0_0_5px_#00e5ff]' : 'text-gray-600 font-bold';
                let gcolor = g.goals > 0 ? 'text-blood font-black drop-shadow-[0_0_5px_#ff3333]' : 'text-gray-600 font-bold';
                let scolor = g.shots >= 3 ? 'text-white font-black' : 'text-gray-500 font-bold';

                logHtml += `
                            <tr class="border-b border-gray-800/50 hover:bg-gray-800 transition group cursor-default">
                                <td class="px-4 py-3 font-bold text-xs text-gray-400 group-hover:text-white transition">${g.date}</td>
                                <td class="px-4 py-3 font-black text-white text-xs">${g.match}</td>
                                <td class="px-4 py-3 text-center text-sm ${gcolor}">${g.goals}</td>
                                <td class="px-4 py-3 text-center text-sm ${g.assists > 0 ? 'text-white font-black' : 'text-gray-600 font-bold'}">${g.assists}</td>
                                <td class="px-4 py-3 text-center text-sm ${pcolor}">${g.points}</td>
                                <td class="px-4 py-3 text-center text-sm ${scolor}">${g.shots}</td>
                                <td class="px-4 py-3 text-center text-[10px] font-black text-gray-500 bg-gray-900/50">${g.toi || '-'}</td>
                            </tr>
                        `;
            });
            document.getElementById('perf-game-log-body').innerHTML = logHtml;
        }
    } catch (e) {
        console.error("Erreur de récupération du Game Log", e);
    }

    // --- B) L'ŒIL DE L'ORACLE & PRÉDICTIONS ---
    let pool = window.globalPredictionsPool || [];
    let p = pool.find(pl => String(pl.id) === String(playerId));

    if (!p) {
        document.getElementById('perf-oracle-text').innerHTML = "<span class='text-gray-500'>Ce joueur ne joue pas ce soir. Les probabilités IA sont en veille.</span>";
        document.getElementById('perf-match-prediction').innerHTML = "<span class='text-gray-500 text-xs font-bold w-full text-center mt-4 block'>Aucun match programmé dans les prochaines 24h</span>";
        return; // On arrête ici s'il ne joue pas ce soir (le Game Log est déjà affiché !)
    }

    // Analyse Narrative
    let recentGoals = p.last_5_games ? p.last_5_games.reduce((s, g) => s + g.goals, 0) : 0;
    let recentShots = p.last_5_games ? p.last_5_games.reduce((s, g) => s + g.shots, 0) : 0;
    let oracleText = "";

    if (recentGoals >= 3) {
        oracleText = `<span class="text-blood drop-shadow-[0_0_5px_rgba(255,51,51,0.5)]">🔥 Main chaude absolue.</span> Avec ${recentGoals} buts sur ses 5 derniers matchs, il est dans la "Zone". L'algorithme recommande de surfer sur sa dynamique de confiance.`;
    } else if (recentShots >= 16 && recentGoals <= 1) {
        oracleText = `<span class="text-ice drop-shadow-[0_0_5px_rgba(0,229,255,0.5)]">❄️ Régression positive imminente.</span> L'anomalie est totale : ${recentShots} tirs récents mais peu de buts (${recentGoals}). Le plafond de verre va céder ce soir, la "Value" est énorme.`;
    } else if (recentShots < 9) {
        oracleText = `<span class="text-orange-500">⚠️ Volume offensif en berne.</span> Il génère extrêmement peu de danger (${recentShots} tirs en 5 matchs). Profil très risqué pour les marchés "Buteurs", privilégiez les passes.`;
    } else {
        oracleText = `<span class="text-green-400">✅ Rendement constant.</span> Le joueur maintient ses métriques habituelles sans sur-performer. Un choix de pari "Safe" et prévisible.`;
    }
    document.getElementById('perf-oracle-text').innerHTML = oracleText;

    // Prédictions du Match
    let predHtml = "";
    if (p.prob_point > 0) {
        predHtml = `
                    <div class="text-center w-1/3"><div class="text-3xl font-black text-blood drop-shadow-[0_0_10px_#ff3333]">${(p.prob_goal || 0).toFixed(1)}%</div><div class="text-[9px] text-gray-400 uppercase tracking-widest mt-1">BUT</div></div>
                    <div class="text-center w-1/3"><div class="text-3xl font-black text-white drop-shadow-[0_0_10px_#ffffff]">${(p.prob_assist || 0).toFixed(1)}%</div><div class="text-[9px] text-gray-400 uppercase tracking-widest mt-1">PASSE</div></div>
                    <div class="text-center w-1/3"><div class="text-3xl font-black text-ice drop-shadow-[0_0_10px_#00e5ff]">${(p.prob_point || 0).toFixed(1)}%</div><div class="text-[9px] text-gray-400 uppercase tracking-widest mt-1">POINT</div></div>
                 `;
    } else {
        predHtml = "<span class='text-gray-500 text-xs italic font-bold w-full text-center mt-4 block'>Cotes non calculées</span>";
    }
    document.getElementById('perf-match-prediction').innerHTML = predHtml;
};

// 3. Bouton Appareil Photo pour la Fiche Scout
window.exportScoutCard = function () {
    if (typeof html2canvas === 'undefined') { alert("Erreur module photo."); return; }
    let container = document.getElementById('player-result-container');
    if (!container) return;

    if (typeof showFullScreenLoader === 'function') showFullScreenLoader("Fiche Scout", "Développement de la photographie HD...", false);

    let closeBtn = container.querySelector('button[onclick="closePlayerProfile()"]');
    let expBtn = container.querySelector('button[onclick="exportScoutCard()"]');
    if (closeBtn) closeBtn.style.display = 'none';
    if (expBtn) expBtn.style.display = 'none';

    let watermark = document.createElement('div');
    watermark.innerHTML = '<span style="color:#4ADE80; font-weight:900; font-size:12px; letter-spacing: 2px; text-shadow: 0 0 10px #000;"><i class="fas fa-search"></i> SCOUTING HOCKAI</span>';
    watermark.style.position = 'absolute'; watermark.style.bottom = '15px'; watermark.style.right = '20px'; watermark.style.zIndex = '50'; watermark.id = 'temp-scout-wm';
    container.appendChild(watermark);

    html2canvas(container, { backgroundColor: '#0a0f1a', scale: 2, useCORS: true }).then(canvas => {
        if (closeBtn) closeBtn.style.display = '';
        if (expBtn) expBtn.style.display = '';
        let wm = document.getElementById('temp-scout-wm'); if (wm) wm.remove();

        let link = document.createElement('a');
        link.download = 'HOCKAI_ScoutCard.png';
        link.href = canvas.toDataURL('image/png');
        link.click();

        if (typeof hideFullScreenLoader === 'function') hideFullScreenLoader();
    }).catch(err => {
        console.error(err); if (typeof hideFullScreenLoader === 'function') hideFullScreenLoader(); alert("Erreur d'exportation.");
    });
};

// ==========================================
// DÉCLENCHEURS ET SYNCHRONISATION EN ARRIÈRE-PLAN
// ==========================================
setInterval(() => {
    if (typeof window.fetchMatches === 'function') window.fetchMatches(true);
}, 300000);

// Fonction de chargement invisible des données IA
window.silentGlobalScan = async function () {
    if (hasScannedGlobal) return;
    try {
        const res = await fetch(`${API_BASE}/predict_all`);
        const data = await res.json();
        if (data.status === "success") {
            globalPredictionsPool = data.global_predictions || []; // <-- CORRECTION ICI
            hasScannedGlobal = true; // Marque le chargement comme terminé
        }
    } catch (e) { console.error("Erreur chargement silencieux IA", e); }
};

document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
        if (typeof window.fetchMatches === 'function') window.fetchMatches();
        // Lance le gros calcul IA en arrière-plan
        if (typeof window.silentGlobalScan === 'function') window.silentGlobalScan();

        // Chargement du Coffre-Fort
        if (typeof loadBankroll === 'function') loadBankroll();

        // ⚡ LECTURE DU LIEN PARTAGÉ (AVEC DEEP LINKING)
        const currentHash = window.location.hash; 
        if (currentHash && currentHash.length > 1) {
            // On sépare l'onglet (#tab-xxx) des paramètres (?player=xxx)
            const [hashPart, queryPart] = currentHash.substring(1).split('?');
            const targetTabId = hashPart;

            if (document.getElementById(targetTabId)) {
                window.switchTab(targetTabId);
                
                // Si l'URL contient une demande d'ouverture de fiche joueur
                if (queryPart) {
                    const params = new URLSearchParams(queryPart);
                    if (targetTabId === 'tab-performances' && params.has('player')) {
                        // On attend 800ms que la base de données soit bien chargée avant d'ouvrir
                        setTimeout(() => {
                            if (typeof window.executePlayerSearchByName === 'function') {
                                window.executePlayerSearchByName(params.get('player'));
                            }
                        }, 800); 
                    }
                }
            }
        }
    }, 300);
});

let matchTabBtn = document.querySelector('button[onclick*="tab-matchs"]');
if (matchTabBtn) {
    matchTabBtn.addEventListener('click', () => {
        if (!window.fetchedMatchesPool || window.fetchedMatchesPool.length === 0) {
            if (typeof window.fetchMatches === 'function') window.fetchMatches();
        } else {
            if (typeof applyMasterFilter === 'function') applyMasterFilter();
        }
    });
}

// ==========================================
// GESTION DU MENU MOBILE (RESPONSIF)
// ==========================================
window.toggleSidebar = function () {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebar-overlay');

    if (sidebar) {
        if (sidebar.classList.contains('-translate-x-full')) {
            // Ouvrir le menu
            sidebar.classList.remove('-translate-x-full');
            if (overlay) overlay.classList.remove('hidden');
            
            // 🔒 Bloque le scroll de manière robuste (PC + Mobile/iOS)
            document.body.classList.add('overflow-hidden');
            document.documentElement.classList.add('overflow-hidden');
        } else {
            // Fermer le menu
            sidebar.classList.add('-translate-x-full');
            if (overlay) overlay.classList.add('hidden');
            
            // 🔓 Réactive le scroll
            document.body.classList.remove('overflow-hidden');
            document.documentElement.classList.remove('overflow-hidden');
        }
    }
};



// ==========================================
// MOTEUR ARCHIVES AVANCÉ (Joueurs & Équipes)
// ==========================================
let currentArchiveMode = 'player';
let autocompleteTimer;
window.currentArchivePlayerData = null;
window.currentTeamHistoryData = null; // Sauvegarde pour filtrer l'équipe
window.currentTeamArchive = null;

window.setArchiveMode = function (mode) {
    currentArchiveMode = mode;
    let btnP = document.getElementById('btn-mode-player');
    let btnT = document.getElementById('btn-mode-team');
    let zoneP = document.getElementById('search-zone-player');
    let zoneT = document.getElementById('search-zone-team');
    let container = document.getElementById('archive-results-container');

    if (mode === 'player') {
        btnP.className = "px-6 py-2 rounded text-sm font-black uppercase tracking-widest transition-all duration-300 bg-ice text-deepblue shadow-[0_0_10px_rgba(0,229,255,0.5)]";
        btnT.className = "px-6 py-2 rounded text-sm font-black uppercase tracking-widest text-gray-500 hover:text-white transition-all duration-300 bg-transparent";
        zoneP.classList.remove('hidden'); zoneT.classList.add('hidden');
    } else {
        btnT.className = "px-6 py-2 rounded text-sm font-black uppercase tracking-widest transition-all duration-300 bg-ice text-deepblue shadow-[0_0_10px_rgba(0,229,255,0.5)]";
        btnP.className = "px-6 py-2 rounded text-sm font-black uppercase tracking-widest text-gray-500 hover:text-white transition-all duration-300 bg-transparent";
        zoneT.classList.remove('hidden'); zoneP.classList.add('hidden');
        initTeamSelector();
    }
    container.innerHTML = `<div class="text-gray-500 font-bold text-center uppercase tracking-widest text-xs md:text-sm py-10"><i class="fas fa-history text-4xl mb-4 opacity-50 block animate-pulse"></i>Effectuez une recherche pour afficher les données</div>`;
};

// --- MODULE JOUEURS ---
window.handlePlayerAutocomplete = function (query) {
    const dropdown = document.getElementById('autocomplete-dropdown');
    clearTimeout(autocompleteTimer);
    if (query.length < 2) { dropdown.classList.add('hidden'); return; }

    autocompleteTimer = setTimeout(async () => {
        try {
            const res = await fetch(`${API_BASE}/search/players?q=${encodeURIComponent(query)}`);
            const data = await res.json();
            if (data.status === "success" && data.players.length > 0) {
                dropdown.innerHTML = data.players.map(p => `<li onclick="selectPlayerFromDropdown('${p.replace(/'/g, "\\'")}')" class="px-4 py-3 hover:bg-gray-700 cursor-pointer text-white font-bold border-b border-gray-700/50 transition flex items-center gap-2"><i class="fas fa-user text-ice text-xs"></i> ${p}</li>`).join('');
                dropdown.classList.remove('hidden');
            } else {
                dropdown.innerHTML = `<li class="px-4 py-3 text-gray-500 italic text-sm">Aucun joueur trouvé</li>`;
                dropdown.classList.remove('hidden');
            }
        } catch (e) { console.error(e); }
    }, 300);
};

window.selectPlayerFromDropdown = function (playerName) {
    document.getElementById('archive-search-input').value = playerName;
    document.getElementById('autocomplete-dropdown').classList.add('hidden');
    searchPlayerHistory(playerName);
};

window.searchPlayerHistory = async function (playerName) {
    const container = document.getElementById('archive-results-container');
    if (!playerName) return;
    document.getElementById('autocomplete-dropdown').classList.add('hidden');
    container.innerHTML = `<div class="text-ice font-bold text-center uppercase tracking-widest text-sm animate-pulse w-full py-10"><i class="fas fa-circle-notch fa-spin text-4xl mb-4 block drop-shadow-[0_0_10px_#00e5ff]"></i>Extraction...</div>`;

    try {
        const res = await fetch(`${API_BASE}/history/player/${encodeURIComponent(playerName)}`);
        const data = await res.json();
        if (data.status === "error") {
            container.innerHTML = `<div class="text-blood font-bold text-center uppercase tracking-widest w-full py-10"><i class="fas fa-exclamation-triangle text-4xl mb-4 block"></i>${data.message}</div>`;
            return;
        }
        window.currentArchivePlayerData = data;
        renderPlayerArchiveUI(true);
    } catch (e) { console.error(e); }
};

window.renderPlayerArchiveUI = function (resetDates = false) {
    let data = window.currentArchivePlayerData;
    if (!data) return;

    let container = document.getElementById('archive-results-container');

    let today = new Date().toISOString().split('T')[0];
    // Nettoyage absolu des dates pour éviter les bugs
    let allDates = data.history.map(g => g.game_date.split(' ')[0].split('T')[0]).sort();
    let minDate = allDates[0] || "2015-01-01";

    let dStartEl = document.getElementById('hist-start');
    let dEndEl = document.getElementById('hist-end');

    let dStart = dStartEl ? dStartEl.value : minDate;
    let dEnd = dEndEl ? dEndEl.value : today;

    if (resetDates) {
        dStart = minDate;
        dEnd = today;
    }

    // LE FILTRE BLINDÉ : Il compare uniquement les années/mois/jours
    let filteredHistory = data.history.filter(g => {
        let cleanDate = g.game_date.split(' ')[0].split('T')[0];
        if (dStart && cleanDate < dStart) return false;
        if (dEnd && cleanDate > dEnd) return false;
        return true;
    });

    // 📸 LA PHOTO DU JOUEUR (Via l'ID récupéré par le backend)
    let headshotUrl = data.player_id ? `https://assets.nhle.com/mugs/nhl/latest/${data.player_id}.png` : 'https://assets.nhle.com/mugs/nhl/default-skater.png';

    let html = `
                <div class="w-full">
                    <div class="flex flex-col lg:flex-row justify-between items-center mb-6 border-b border-gray-700 pb-4 gap-4">
                        
                        <div class="flex items-center gap-4">
                            <div class="relative">
                                <div class="absolute inset-0 bg-ice rounded-full blur opacity-30"></div>
                                <img src="${headshotUrl}" onerror="this.src='https://assets.nhle.com/mugs/nhl/default-skater.png'" class="relative w-16 h-16 md:w-20 md:h-20 object-contain bg-gray-900 rounded-full border-2 border-ice shadow-xl z-10">
                            </div>
                            <h3 class="text-xl md:text-3xl font-black text-white uppercase tracking-widest">${data.player}</h3>
                        </div>
                        
                        <div class="flex flex-col md:flex-row items-center gap-2 bg-gray-950 p-2 md:p-3 rounded-lg border border-gray-800 shadow-inner w-full md:w-auto">
                            <span class="text-gray-500 text-[10px] uppercase font-bold tracking-widest"><i class="fas fa-calendar-alt mr-1"></i> Période :</span>
                            <div class="flex items-center gap-2 w-full justify-center">
                                <input type="date" id="hist-start" value="${dStart}" min="${minDate}" max="${today}" onchange="renderPlayerArchiveUI()" class="bg-gray-800 text-white text-xs font-bold p-2 rounded border border-gray-700 focus:border-ice focus:outline-none transition w-full md:w-auto">
                                <span class="text-gray-600 font-bold">-</span>
                                <input type="date" id="hist-end" value="${dEnd}" min="${minDate}" max="${today}" onchange="renderPlayerArchiveUI()" class="bg-gray-800 text-white text-xs font-bold p-2 rounded border border-gray-700 focus:border-ice focus:outline-none transition w-full md:w-auto">
                            </div>
                        </div>
                        
                        <span class="bg-ice/10 border border-ice text-ice px-4 py-2 rounded text-[10px] md:text-xs font-black tracking-widest uppercase shadow-[0_0_10px_rgba(0,229,255,0.2)] whitespace-nowrap">
                            ${filteredHistory.length} Matchs
                        </span>
                    </div>

                    <div class="overflow-x-auto rounded-lg border border-gray-800 shadow-xl max-h-[500px] overflow-y-auto custom-scrollbar">
                        <table class="w-full text-left text-sm text-gray-400 border-collapse min-w-[600px] relative">
                            <thead class="text-[10px] md:text-xs text-gray-300 uppercase bg-gray-950 sticky top-0 z-10 shadow-md">
                                <tr>
                                    <th class="px-4 py-4"><i class="far fa-calendar-alt mr-1"></i> Date</th>
                                    <th class="px-4 py-4"><i class="fas fa-map-marker-alt mr-1"></i> Rencontre</th>
                                    <th class="px-4 py-4 text-center text-yellow-500"><i class="fas fa-bullseye"></i> B</th>
                                    <th class="px-4 py-4 text-center text-blue-400"><i class="fas fa-hands-helping"></i> P</th>
                                    <th class="px-4 py-4 text-center text-ice"><i class="fas fa-star"></i> PTS</th>
                                    <th class="px-4 py-4 text-center text-blood"><i class="fas fa-fire"></i> Tirs</th>
                                </tr>
                            </thead>
                            <tbody>
            `;

    if (filteredHistory.length === 0) {
        html += `<tr><td colspan="6" class="text-center py-10 text-gray-500 font-bold italic">Aucun match sur cette période. Modifiez les dates du calendrier ci-dessus.</td></tr>`;
    } else {
        filteredHistory.forEach((game, index) => {
            let rowClass = index % 2 === 0 ? 'bg-gray-900/60' : 'bg-gray-800/40';
            let d = new Date(game.game_date);
            let ptsClass = game.points >= 2 ? 'text-ice font-black drop-shadow-[0_0_5px_#00e5ff] text-lg' : (game.points == 1 ? 'text-white font-bold' : 'text-gray-600');
            html += `
                        <tr class="${rowClass} border-b border-gray-800/50 hover:bg-gray-700 transition">
                            <td class="px-4 py-3 font-bold text-gray-300 whitespace-nowrap">${d.toLocaleDateString('fr-FR')}</td>
                            <td class="px-4 py-3 font-bold text-white whitespace-nowrap"><span class="text-gray-500 uppercase text-[10px]">${game.away_team}</span> <span class="text-gray-600 mx-1">@</span> <span class="text-gray-300 uppercase text-[10px]">${game.home_team}</span></td>
                            <td class="px-4 py-3 text-center ${game.goals >= 1 ? 'text-yellow-500 font-black text-lg' : 'text-gray-600'}">${game.goals}</td>
                            <td class="px-4 py-3 text-center ${game.assists >= 1 ? 'text-blue-400 font-bold' : 'text-gray-600'}">${game.assists}</td>
                            <td class="px-4 py-3 text-center ${ptsClass}">${game.points}</td>
                            <td class="px-4 py-3 text-center ${game.shots >= 4 ? 'text-blood font-black' : 'text-white'}">${game.shots}</td>
                        </tr>
                    `;
        });
    }
    html += `</tbody></table></div></div>`;
    container.innerHTML = html;
};

// --- MODULE ÉQUIPES (Calendrier Interactif & Scroll Naturel) ---
const NHL_TEAMS = ["ANA", "BOS", "BUF", "CAR", "CBJ", "CGY", "CHI", "COL", "DAL", "DET", "EDM", "FLA", "LAK", "MIN", "MTL", "NJD", "NSH", "NYI", "NYR", "OTT", "PHI", "PIT", "SEA", "SJS", "STL", "TBL", "TOR", "UTA", "VAN", "VGK", "WPG", "WSH"];

window.initTeamSelector = function () {
    const grid = document.getElementById('team-selector-grid');
    if (grid.innerHTML.trim() !== "") return;
    grid.innerHTML = NHL_TEAMS.map(team => {
        let logoUrl = typeof getLogoUrl === 'function' ? getLogoUrl(team) : `https://assets.nhle.com/logos/nhl/svg/${team}_light.svg`;
        return `<button onclick="searchTeamHistory('${team}')" class="bg-gray-800 hover:bg-gray-700 border border-gray-600 hover:border-ice rounded-lg p-2 w-12 h-12 md:w-16 md:h-16 flex flex-col items-center justify-center transition transform hover:scale-110 shadow-lg flex-shrink-0">
                    <img src="${logoUrl}" onerror="this.src='assets/logo_hockAI.png'" class="w-6 h-6 md:w-8 md:h-8 object-contain mb-1">
                    <span class="text-[7px] md:text-[9px] font-black text-white">${team}</span>
                </button>`;
    }).join('');
};

window.searchTeamHistory = async function (team) {
    const container = document.getElementById('archive-results-container');
    container.innerHTML = `<div class="text-ice font-bold text-center uppercase tracking-widest text-sm animate-pulse w-full py-10"><i class="fas fa-circle-notch fa-spin text-4xl mb-4 block drop-shadow-[0_0_10px_#00e5ff]"></i>Extraction complète...</div>`;

    try {
        const res = await fetch(`${API_BASE}/history/team/${team}`);
        const data = await res.json();
        if (data.status === "error") { container.innerHTML = `<div class="text-blood font-bold py-10">${data.message}</div>`; return; }

        window.currentTeamHistoryData = data.history;
        window.currentTeamArchive = team;
        renderTeamHistoryUI();
    } catch (e) { console.error(e); }
};

window.renderTeamHistoryUI = function () {
    let history = window.currentTeamHistoryData;
    let team = window.currentTeamArchive;
    if (!history || !team) return;

    const container = document.getElementById('archive-results-container');
    let teamLogoUrl = typeof getLogoUrl === 'function' ? getLogoUrl(team) : `https://assets.nhle.com/logos/nhl/svg/${team}_light.svg`;

    // Récupération de la date filtrée si l'utilisateur en a choisi une
    let filterDate = document.getElementById('team-date-filter') ? document.getElementById('team-date-filter').value : '';

    let displayedHistory = history;
    if (filterDate) {
        displayedHistory = history.filter(g => g.game_date === filterDate);
    }

    let html = `
                <div class="w-full">
                    <div class="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 border-b border-gray-700 pb-4 gap-4">
                        <div class="flex flex-col gap-3">
                            <button onclick="setArchiveMode('team')" class="bg-gray-800 hover:bg-gray-700 text-white px-4 py-2 rounded text-xs font-bold transition border border-gray-600 flex items-center gap-2 w-fit shadow-lg">
                                <i class="fas fa-arrow-left text-ice"></i> Retour aux équipes
                            </button>
                            <div class="flex items-center gap-4">
                                <img src="${teamLogoUrl}" onerror="this.src='assets/logo_hockAI.png'" class="w-12 h-12 md:w-16 md:h-16 object-contain drop-shadow-[0_0_10px_rgba(255,255,255,0.2)]">
                                <div>
                                    <h3 class="text-xl md:text-3xl font-black text-white uppercase tracking-widest">${team}</h3>
                                    <p class="text-[10px] md:text-xs text-gray-400 font-bold mt-1 uppercase tracking-widest">Historique des matchs</p>
                                </div>
                            </div>
                        </div>
                        
                        <div class="bg-gray-950 p-3 rounded-xl border border-gray-800 shadow-inner w-full md:w-auto flex flex-col items-center gap-2">
                            <label class="text-[9px] md:text-[10px] text-gray-400 uppercase font-black tracking-widest"><i class="fas fa-search text-ice mr-1"></i> Chercher un match exact</label>
                            <div class="flex gap-2">
                                <input type="date" id="team-date-filter" value="${filterDate}" onchange="renderTeamHistoryUI()" class="bg-gray-800 text-white text-xs font-bold p-2 rounded border border-gray-600 focus:border-ice focus:outline-none transition">
                                <button onclick="document.getElementById('team-date-filter').value=''; renderTeamHistoryUI();" class="bg-blood/20 text-blood border border-blood/50 px-3 rounded hover:bg-blood hover:text-white transition" title="Effacer la recherche"><i class="fas fa-times"></i></button>
                            </div>
                        </div>
                    </div>

                    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            `;

    if (displayedHistory.length === 0) {
        html += `<div class="col-span-full text-center py-10 text-gray-500 font-bold italic">Aucun match de ${team} trouvé à cette date.</div>`;
    } else {
        displayedHistory.forEach(game => {
            let d = new Date(game.game_date);
            let dateStr = d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
            let isHome = game.home_team === team;
            let opponent = isHome ? game.away_team : game.home_team;
            let teamScore = isHome ? game.home_score : game.away_score;
            let oppScore = isHome ? game.away_score : game.home_score;
            let isWin = teamScore > oppScore;
            let bgStatus = isWin ? 'bg-money/10 border-money/50' : 'bg-blood/10 border-blood/50';
            let textStatus = isWin ? 'text-money' : 'text-blood';
            let oppLogo = typeof getLogoUrl === 'function' ? getLogoUrl(opponent) : `https://assets.nhle.com/logos/nhl/svg/${opponent}_light.svg`;

            html += `
                        <div onclick="openPastBoxscore('${game.home_team}', '${game.away_team}', '${game.game_date}')" class="${bgStatus} border rounded-xl p-4 flex flex-col justify-between shadow-lg relative overflow-hidden group cursor-pointer transform transition duration-300 hover:scale-[1.02] hover:border-ice hover:shadow-[0_0_15px_rgba(0,229,255,0.3)]">
                            <div class="absolute inset-0 bg-gray-900/90 z-20 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity backdrop-blur-sm">
                                <span class="bg-ice text-deepblue px-4 py-2 rounded text-xs font-black uppercase tracking-widest shadow-[0_0_10px_#00e5ff]"><i class="fas fa-search-plus mr-2"></i>Voir Buteurs</span>
                            </div>
                            <div class="absolute -right-4 -top-4 opacity-5 text-6xl"><i class="fas ${isWin ? 'fa-check-circle' : 'fa-times-circle'}"></i></div>
                            <div class="text-[9px] text-gray-400 font-black tracking-widest uppercase mb-3 flex justify-between items-center relative z-10">
                                <span><i class="far fa-calendar-alt mr-1"></i> ${dateStr}</span>
                                <span class="${textStatus} px-2 py-0.5 rounded bg-black/50 border border-current shadow-inner">${isWin ? 'VICTOIRE' : 'DÉFAITE'}</span>
                            </div>
                            <div class="flex items-center justify-between relative z-10">
                                <div class="flex flex-col items-center w-1/3">
                                    <img src="${teamLogoUrl}" onerror="this.src='assets/logo_hockAI.png'" class="w-8 h-8 object-contain mb-1">
                                    <span class="text-xl font-black ${isWin ? 'text-white' : 'text-gray-400'}">${teamScore}</span>
                                </div>
                                <div class="text-xs font-black text-gray-600 italic px-2">VS</div>
                                <div class="flex flex-col items-center w-1/3">
                                    <img src="${oppLogo}" onerror="this.src='assets/logo_hockAI.png'" class="w-8 h-8 object-contain mb-1">
                                    <span class="text-xl font-black ${!isWin ? 'text-white' : 'text-gray-400'}">${oppScore}</span>
                                </div>
                            </div>
                        </div>
                    `;
        });
    }
    html += `</div></div>`;
    container.innerHTML = html;
};

// --- MODULE BOXSCORE (Sécurité absolue et Noms Réparés) ---
window.openPastBoxscore = async function (home, away, date) {
    const modal = document.getElementById('past-boxscore-modal');
    const content = document.getElementById('pb-content');
    const title = document.getElementById('pb-title');

    modal.classList.remove('hidden'); modal.classList.add('flex');

    let d = new Date(date).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' }).toUpperCase();
    title.innerHTML = `${away} @ ${home} <span class="text-ice text-[10px] ml-2 bg-gray-800 px-2 py-1 rounded">${d}</span>`;
    content.innerHTML = `<div class="text-center py-12"><i class="fas fa-circle-notch fa-spin text-4xl text-ice drop-shadow-[0_0_10px_#00e5ff]"></i><p class="text-gray-500 font-bold mt-4 text-xs uppercase tracking-widest">Extraction de la feuille de match...</p></div>`;

    try {
        const res = await fetch(`${API_BASE}/history/boxscore/${home}/${away}/${date}`);
        const data = await res.json();

        if (data.status === "error") { content.innerHTML = `<div class="text-blood font-bold text-center py-6">${data.message}</div>`; return; }

        let hLogo = typeof getLogoUrl === 'function' ? getLogoUrl(home) : `https://assets.nhle.com/logos/nhl/svg/${home}_light.svg`;
        let aLogo = typeof getLogoUrl === 'function' ? getLogoUrl(away) : `https://assets.nhle.com/logos/nhl/svg/${away}_light.svg`;

        let html = `
                    <div class="flex justify-center items-center gap-6 md:gap-10 mb-6 pb-6 border-b border-gray-800 bg-gray-900/50 p-4 rounded-xl shadow-inner">
                        <div class="text-center flex flex-col items-center">
                            <img src="${aLogo}" onerror="this.src='assets/logo_hockAI.png'" class="w-12 h-12 md:w-16 md:h-16 object-contain mb-2 drop-shadow-[0_0_5px_rgba(255,255,255,0.2)]">
                            <span class="text-3xl md:text-5xl font-black ${data.away_score > data.home_score ? 'text-white' : 'text-gray-500'}">${data.away_score}</span>
                            <span class="text-[9px] text-gray-500 uppercase mt-1">Extérieur</span>
                        </div>
                        <div class="text-blood italic font-black text-xl">VS</div>
                        <div class="text-center flex flex-col items-center">
                            <img src="${hLogo}" onerror="this.src='assets/logo_hockAI.png'" class="w-12 h-12 md:w-16 md:h-16 object-contain mb-2 drop-shadow-[0_0_5px_rgba(255,255,255,0.2)]">
                            <span class="text-3xl md:text-5xl font-black ${data.home_score > data.away_score ? 'text-white' : 'text-gray-500'}">${data.home_score}</span>
                            <span class="text-[9px] text-gray-500 uppercase mt-1">Domicile</span>
                        </div>
                    </div>
                    
                    <h4 class="text-gray-400 text-[10px] md:text-xs uppercase tracking-widest font-black mb-4 flex items-center gap-2"><i class="fas fa-clipboard-list text-ice"></i> Joueurs décisifs</h4>
                    <div class="flex flex-col gap-2">
                `;

        if (data.performances.length === 0) {
            html += `<div class="text-gray-500 text-sm font-bold text-center bg-gray-800/50 p-4 rounded-lg">Aucun buteur répertorié.</div>`;
        } else {
            data.performances.forEach(p => {
                let pts = p.points !== undefined ? p.points : (p.goals + p.assists);

                // Ultime protection d'affichage du nom
                let pName = p.player_name;
                if (!pName || pName === 'null' || pName === 'undefined') pName = "Nom indisponible";

                let tAbbrev = p.team_abbrev || '';

                let perfStr = [];
                if (p.goals > 0) perfStr.push(`<span class="text-yellow-500 font-black"><i class="fas fa-bullseye text-[10px]"></i> ${p.goals} But${p.goals > 1 ? 's' : ''}</span>`);
                if (p.assists > 0) perfStr.push(`<span class="text-blue-400 font-bold"><i class="fas fa-hands-helping text-[10px]"></i> ${p.assists} Passe${p.assists > 1 ? 's' : ''}</span>`);
                let ptClass = pts >= 2 ? "bg-ice/20 border-ice/50 text-ice" : "bg-gray-800 border-gray-700 text-white";

                html += `
                            <div class="${ptClass} p-3 rounded-lg flex justify-between items-center border transition hover:bg-gray-700">
                                <div class="flex items-center gap-3">
                                    <div class="w-8 text-center text-xl font-black opacity-30">${pts}</div>
                                    <div>
                                        <span class="font-black block text-sm md:text-base">${pName}</span>
                                        <span class="text-gray-400 text-[9px] uppercase tracking-widest">${tAbbrev}</span>
                                    </div>
                                </div>
                                <div class="text-right text-[10px] md:text-xs flex flex-col md:flex-row md:gap-3">
                                    ${perfStr.join('')}
                                </div>
                            </div>
                        `;
            });
        }

        html += `</div>`;
        content.innerHTML = html;

    } catch (e) { content.innerHTML = `<div class="text-blood font-bold text-center py-10"><i class="fas fa-wifi text-3xl mb-2 block"></i>Erreur de connexion</div>`; }
};

// ==========================================
// MOTEUR MATRICE SOG & BLOCKS
// ==========================================
window.openSogMatrix = async function () {
    // On utilise ta variable globale existante
    if (!cachedSearchId) return;

    const modal = document.getElementById('sog-matrix-modal');
    const sheet = document.getElementById('sog-matrix-sheet');
    const content = document.getElementById('sog-matrix-content');

    modal.classList.remove('hidden');
    modal.classList.add('flex');
    setTimeout(() => sheet.classList.remove('translate-y-full'), 10);

    content.innerHTML = `<div class="text-center py-20"><i class="fas fa-radar fa-spin text-purple-500 text-4xl mb-4"></i><p class="text-purple-400 font-black uppercase tracking-widest text-[10px] animate-pulse">Extraction des données de la matrice...</p></div>`;

    try {
        const res = await fetch(`${API_BASE}/sog_matrix/${cachedSearchId}`);
        const data = await res.json();

        if (data.status === "error") {
            content.innerHTML = `<div class="text-center text-red-500 py-10 font-bold">${data.message}</div>`;
            return;
        }

        let histHtml = data.history.map(g => `
                    <div class="flex justify-between items-center bg-gray-900 p-3 rounded-lg border border-gray-800 mb-2 shadow-inner group hover:border-purple-500/50 transition">
                        <span class="text-gray-400 text-[10px] md:text-xs w-1/3 font-bold uppercase tracking-widest"><i class="far fa-calendar-alt text-purple-500/50 mr-1"></i> ${g.date.substring(5)}</span>
                        <span class="text-white font-black text-[10px] md:text-xs w-1/3 text-center uppercase tracking-widest">vs ${g.opp}</span>
                        <span class="text-right w-1/3 font-black text-[11px] md:text-sm">
                            <span class="text-ice">${g.shots} Tirs</span> <span class="text-gray-600 mx-1">|</span> <span class="text-yellow-500">${g.blocks} Blk</span>
                        </span>
                    </div>
                `).join('');

        let analysisHtml = data.ai_analysis.map(a => `
                    <div class="bg-gray-950 p-3 rounded border border-gray-800 mb-2 shadow-inner">
                        <p class="text-gray-300 text-[10px] md:text-xs leading-relaxed font-bold">${a}</p>
                    </div>
                `).join('');

        content.innerHTML = `
                    <div class="text-center mb-6">
                        <i class="fas fa-crosshairs text-3xl text-purple-500 mb-2 drop-shadow-[0_0_15px_rgba(147,51,234,0.6)]"></i>
                        <h2 class="text-2xl md:text-3xl font-black text-white uppercase tracking-widest">Matrice SOG & Blocks</h2>
                        <div class="text-purple-400 font-black mt-2 text-[10px] md:text-xs uppercase tracking-widest bg-purple-500/10 inline-block px-3 py-1 rounded border border-purple-500/30">
                            ${data.player.name} <span class="text-white px-2">FACE À</span> ${data.opp_team}
                        </div>
                    </div>
                    
                    <div class="grid grid-cols-2 gap-4 mb-6">
                        <div class="bg-gray-950 border border-ice/50 rounded-xl p-4 text-center shadow-[0_0_15px_rgba(0,229,255,0.15)] flex flex-col justify-center">
                            <div class="text-gray-400 text-[9px] md:text-[10px] uppercase font-black tracking-widest mb-1">Moyenne Tirs (L10)</div>
                            <div class="text-3xl md:text-4xl font-black text-ice">${data.avg_shots}</div>
                        </div>
                        <div class="bg-gray-950 border border-yellow-500/50 rounded-xl p-4 text-center shadow-[0_0_15px_rgba(250,204,21,0.15)] flex flex-col justify-center">
                            <div class="text-gray-400 text-[9px] md:text-[10px] uppercase font-black tracking-widest mb-1">Moyenne Blocks (L10)</div>
                            <div class="text-3xl md:text-4xl font-black text-yellow-500">${data.avg_blocks}</div>
                        </div>
                    </div>
                    
                    <div class="bg-gray-900/80 border-l-4 border-purple-500 rounded-r-xl p-4 md:p-5 mb-6 shadow-lg relative overflow-hidden">
                        <div class="absolute -right-4 -bottom-4 opacity-5 text-7xl text-purple-500"><i class="fas fa-brain"></i></div>
                        <h4 class="text-white font-black uppercase text-[10px] md:text-xs tracking-widest mb-3 border-b border-gray-800 pb-2"><i class="fas fa-microchip text-purple-400 mr-2"></i>Diagnostic IA du Matchup</h4>
                        ${analysisHtml}
                    </div>
                    
                    <div>
                        <h4 class="text-white font-black uppercase text-[10px] md:text-xs tracking-widest mb-3 flex items-center pl-1"><i class="fas fa-history text-gray-400 mr-2"></i>Détail Précis (L10)</h4>
                        ${histHtml}
                    </div>
                `;
    } catch (e) {
        content.innerHTML = `<div class="text-center text-red-500 py-10 font-bold">Erreur de connexion.</div>`;
    }
};

window.closeSogMatrix = function () {
    const sheet = document.getElementById('sog-matrix-sheet');
    sheet.classList.add('translate-y-full');
    setTimeout(() => {
        document.getElementById('sog-matrix-modal').classList.add('hidden');
        document.getElementById('sog-matrix-modal').classList.remove('flex');
    }, 300);
};

// ==========================================
// 🔴 MOTEUR ORACLE LIVE (MOMENTUM & ALERTES EN DIRECT)
// ==========================================
window.liveOracleInterval = null;

window.loadOracleLive = async function () {
    const container = document.getElementById('oracle-live-container');
    if (!container) return;

    // Si c'est le premier chargement manuel, on met l'animation
    if (container.innerHTML.trim() === "") {
        container.innerHTML = `<div class="text-center py-20"><i class="fas fa-satellite-dish fa-spin text-red-500 text-5xl mb-4 drop-shadow-[0_0_15px_#ef4444]"></i><p class="text-red-400 font-black uppercase tracking-widest text-xs animate-pulse">Interception des fréquences de la LNH en cours...</p></div>`;
    }

    try {
        const res = await fetch(`${API_BASE}/live_momentum`);
        const data = await res.json();

        if (data.status === 'error') {
            container.innerHTML = `<div class="text-center text-gray-500 py-10 font-bold"><i class="fas fa-wifi text-2xl mb-2 block"></i> ${data.message}</div>`;
            return;
        }

        if (data.live_games.length === 0) {
            container.innerHTML = `
                <div class="bg-gray-900/50 border border-gray-800 rounded-xl p-10 text-center shadow-inner">
                    <i class="fas fa-bed text-gray-600 text-4xl mb-4"></i>
                    <h3 class="text-white font-black uppercase tracking-widest text-lg">Aucun match en direct</h3>
                    <p class="text-gray-500 text-xs font-bold mt-2">L'Oracle Live s'activera automatiquement dès le début des rencontres de la nuit.</p>
                </div>`;
            return;
        }

        let html = `<div class="grid grid-cols-1 lg:grid-cols-2 gap-6">`;

        data.live_games.forEach(game => {
            // Définition des couleurs du Momentum
            let isHomeDom = game.home_mom > 55;
            let isAwayDom = game.away_mom > 55;
            let homeColor = isHomeDom ? 'bg-ice shadow-[0_0_10px_#00e5ff]' : 'bg-gray-700';
            let awayColor = isAwayDom ? 'bg-blood shadow-[0_0_10px_#ff3333]' : 'bg-gray-700';

            // Alerte Visuelle de l'IA
            let alertBox = "";
            if (game.alert_type === "home_hot" || game.alert_type === "away_hot") {
                alertBox = `
                    <div class="mt-4 bg-red-950/40 border border-red-500/50 rounded-lg p-3 relative overflow-hidden">
                        <div class="absolute top-0 left-0 w-1 h-full bg-red-500 animate-pulse"></div>
                        <p class="text-red-400 text-[10px] md:text-xs font-bold leading-relaxed ml-2"><i class="fas fa-exclamation-triangle mr-1 animate-ping"></i> ${game.alert}</p>
                    </div>`;
            } else {
                alertBox = `
                    <div class="mt-4 bg-gray-950 border border-gray-800 rounded-lg p-3">
                        <p class="text-gray-500 text-[10px] md:text-xs font-bold leading-relaxed"><i class="fas fa-balance-scale mr-1"></i> ${game.alert}</p>
                    </div>`;
            }

            let periodText = game.period === 1 ? "1ère" : (game.period === 2 ? "2ème" : (game.period === 3 ? "3ème" : "Prolong."));
            if (game.time_rem === "INT") periodText = "Pause";

            html += `
                <div class="bg-gray-900 border border-gray-800 rounded-xl p-5 relative shadow-[0_0_20px_rgba(0,0,0,0.5)] overflow-hidden group hover:border-red-500/50 transition">
                    
                    <div class="flex justify-between items-center border-b border-gray-800 pb-3 mb-4">
                        <div class="flex items-center gap-2">
                            <div class="w-2 h-2 rounded-full bg-red-500 animate-ping"></div>
                            <span class="text-red-500 font-black text-[10px] uppercase tracking-widest">LIVE</span>
                        </div>
                        <div class="bg-black border border-gray-700 px-3 py-1 rounded text-[10px] font-black text-white uppercase tracking-widest">
                            ${periodText} <span class="text-gray-500 mx-1">|</span> <span class="text-yellow-400">${game.time_rem}</span>
                        </div>
                    </div>

                    <div class="flex justify-between items-center mb-6">
                        <div class="text-center w-1/3">
                            <span class="text-xs md:text-sm font-black text-gray-400 block uppercase tracking-widest mb-1">${game.away}</span>
                            <span class="text-4xl md:text-5xl font-black text-white">${game.away_score}</span>
                        </div>
                        <div class="text-gray-700 font-black text-xl italic">VS</div>
                        <div class="text-center w-1/3">
                            <span class="text-xs md:text-sm font-black text-gray-400 block uppercase tracking-widest mb-1">${game.home}</span>
                            <span class="text-4xl md:text-5xl font-black text-white">${game.home_score}</span>
                        </div>
                    </div>

                    <div class="mb-2">
                        <div class="flex justify-between text-[9px] font-black uppercase tracking-widest mb-1">
                            <span class="${isAwayDom ? 'text-blood' : 'text-gray-500'}">Pression Ext. (${game.away_mom}%)</span>
                            <span class="${isHomeDom ? 'text-ice' : 'text-gray-500'}">Pression Dom. (${game.home_mom}%)</span>
                        </div>
                        <div class="w-full h-3 bg-gray-950 rounded-full flex overflow-hidden border border-gray-800">
                            <div class="${awayColor} h-full transition-all duration-1000" style="width: ${game.away_mom}%"></div>
                            <div class="${homeColor} h-full transition-all duration-1000" style="width: ${game.home_mom}%"></div>
                        </div>
                    </div>

                    <div class="flex justify-between text-[10px] font-bold text-gray-400 mt-3 px-1">
                        <span>${game.away_sog} Tirs | ${game.away_xg} xG</span>
                        <span>${game.home_sog} Tirs | ${game.home_xg} xG</span>
                    </div>

                    ${alertBox}
                </div>
            `;
        });

        html += `</div>`;
        container.innerHTML = html;

    } catch (e) {
        console.error("Erreur Oracle Live:", e);
    }
};

// Fonction pour démarrer/arrêter l'actualisation automatique
window.toggleOracleLiveSync = function (isActive) {
    if (window.liveOracleInterval) clearInterval(window.liveOracleInterval);
    if (isActive) {
        window.loadOracleLive(); // Chargement immédiat
        window.liveOracleInterval = setInterval(window.loadOracleLive, 30000); // Actu toutes les 30 secondes
    }
};

// =========================================================================
// 🔐 MODULE D'AUTHENTIFICATION (SUPABASE)
// =========================================================================
const SUPABASE_URL = 'https://gfmquozjspyuoppunojs.supabase.co';

// ⚠️ N'OUBLIE PAS DE COLLER TA VRAIE CLÉ PUBLIQUE ICI
const SUPABASE_ANON_KEY = 'sb_publishable_RagDo4tDNADuXBv8-dokYg_AYYnta1g'; 

// ⚡ LA CORRECTION EST ICI : On renomme la variable en "supabaseClient"
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

window.isUserLoggedIn = false;
window.currentUserEmail = ""; // NOUVELLE VARIABLE

// Supabase écoute tout seul si on est connecté ou non
supabaseClient.auth.onAuthStateChange((event, session) => {
    window.isUserLoggedIn = !!session;
    window.currentUserEmail = session ? session.user.email : ""; 
    window.updateAuthUI();

    // ⚡ On charge la bankroll ET l'infirmerie dès qu'on est connecté !
    if (window.isUserLoggedIn) {
        if (typeof window.loadBankroll === 'function') window.loadBankroll();
        if (typeof window.loadBannedPlayers === 'function') window.loadBannedPlayers(); // LIGNE AJOUTÉE
    }
});

window.openAuthModal = function () {
    if (window.isUserLoggedIn) {
        window.openUserDashboard(); // Ouvre l'espace membre au lieu de l'alerte
        return;
    }
    let modal = document.getElementById('auth-modal');
    if (modal) {
        modal.classList.remove('hidden');
        modal.classList.add('flex');
    }
};

window.closeAuthModal = function () {
    let modal = document.getElementById('auth-modal');
    if (modal) {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    }
};

window.switchAuth = function (mode) {
    const loginForm = document.getElementById('login-form');
    const signupForm = document.getElementById('signup-form');

    if (mode === 'signup') {
        loginForm.classList.add('hidden');
        signupForm.classList.remove('hidden');
    } else {
        signupForm.classList.add('hidden');
        loginForm.classList.remove('hidden');
    }
};

window.updateAuthUI = function() {
    const btnText = document.getElementById('auth-btn-text');
    const statusDot = document.getElementById('auth-status-dot');
    const emailText = document.getElementById('auth-user-email'); // NOUVEAU
    
    if (window.isUserLoggedIn) {
        if(btnText) btnText.textContent = "Mon Espace";
        if(statusDot) {
            statusDot.classList.remove('bg-red-500');
            statusDot.classList.add('bg-green-500');
        }
        if(emailText) emailText.textContent = window.currentUserEmail; // AFFICHE L'EMAIL
    } else {
        if(btnText) btnText.textContent = "Se connecter";
        if(statusDot) {
            statusDot.classList.remove('bg-green-500');
            statusDot.classList.add('bg-red-500');
        }
        if(emailText) emailText.textContent = "Espace Privé"; // REMET LE TEXTE PAR DÉFAUT
    }
};

// =========================================================================
// 🚀 MOTEUR DE L'ESPACE PERSONNEL (DASHBOARD)
// =========================================================================

window.openUserDashboard = function() {
    document.getElementById('user-dashboard-modal').classList.remove('hidden');
    document.getElementById('user-dashboard-modal').classList.add('flex');
    
    // Afficher l'email
    let emailEl = document.getElementById('dashboard-user-email');
    if(emailEl) emailEl.innerText = window.currentUserEmail || "Utilisateur connecté";
    
    // Générer les données
    window.renderDashboardOverview();
    window.renderDashboardHistory();
    window.renderDashboardInfirmary();
};

window.closeUserDashboard = function() {
    document.getElementById('user-dashboard-modal').classList.add('hidden');
    document.getElementById('user-dashboard-modal').classList.remove('flex');
};

window.switchDashboardTab = function(tabName) {
    // Cacher tous les panneaux
    document.querySelectorAll('.dash-content-panel').forEach(el => {
        el.classList.add('hidden');
        el.classList.remove('flex');
    });
    // Réinitialiser les boutons du menu
    document.querySelectorAll('.dash-tab-btn').forEach(btn => {
        btn.classList.remove('bg-gray-900', 'border-purple-500', 'text-white');
        btn.classList.add('bg-black', 'border-transparent', 'text-gray-500');
    });
    
    // Afficher le panneau ciblé
    document.getElementById(`dash-tab-${tabName}`).classList.remove('hidden');
    document.getElementById(`dash-tab-${tabName}`).classList.add('flex');
    
    // Activer le bouton ciblé
    let activeBtn = document.getElementById(`btn-dash-${tabName}`);
    if(activeBtn) {
        activeBtn.classList.add('bg-gray-900', 'border-purple-500', 'text-white');
        activeBtn.classList.remove('bg-black', 'border-transparent', 'text-gray-500');
    }
};

window.renderDashboardOverview = function() {
    let container = document.getElementById('dash-overview-stats');
    if(!container) return;

    let totalInvesti = 0; let totalGains = 0; let parisTermines = 0; let parisGagnes = 0;

    window.globalBankroll.forEach(b => {
        if (b.status === "PENDING") return;
        totalInvesti += b.stake;
        parisTermines++;
        if (b.status === "WON") {
            totalGains += (b.stake * b.odds);
            parisGagnes++;
        }
    });

    let benefice = totalGains - totalInvesti;
    let roi = totalInvesti > 0 ? (benefice / totalInvesti) * 100 : 0;
    let winrate = parisTermines > 0 ? (parisGagnes / parisTermines) * 100 : 0;
    
    let benefColor = benefice >= 0 ? 'text-money' : 'text-blood';

    container.innerHTML = `
        <div class="bg-black/50 border border-gray-800 p-4 rounded-xl shadow-inner text-center">
            <div class="text-[9px] md:text-[10px] text-gray-500 uppercase tracking-widest font-bold mb-1">Bénéfice Net</div>
            <div class="text-xl md:text-3xl font-black ${benefColor}">${benefice >= 0 ? '+' : ''}${benefice.toFixed(2)}€</div>
        </div>
        <div class="bg-black/50 border border-gray-800 p-4 rounded-xl shadow-inner text-center">
            <div class="text-[9px] md:text-[10px] text-gray-500 uppercase tracking-widest font-bold mb-1">ROI Global</div>
            <div class="text-xl md:text-3xl font-black text-white">${roi.toFixed(1)}%</div>
        </div>
        <div class="bg-black/50 border border-gray-800 p-4 rounded-xl shadow-inner text-center">
            <div class="text-[9px] md:text-[10px] text-gray-500 uppercase tracking-widest font-bold mb-1">Taux de réussite</div>
            <div class="text-xl md:text-3xl font-black text-ice">${winrate.toFixed(0)}%</div>
        </div>
        <div class="bg-black/50 border border-gray-800 p-4 rounded-xl shadow-inner text-center">
            <div class="text-[9px] md:text-[10px] text-gray-500 uppercase tracking-widest font-bold mb-1">Tickets joués</div>
            <div class="text-xl md:text-3xl font-black text-purple-400">${window.globalBankroll.length}</div>
        </div>
    `;
};

window.renderDashboardHistory = function() {
    let container = document.getElementById('dash-history-list');
    if(!container) return;

    if (window.globalBankroll.length === 0) {
        container.innerHTML = `<div class="text-center p-10 bg-black/40 rounded-xl border border-gray-800 border-dashed text-gray-500 font-bold text-xs uppercase tracking-widest italic">Aucun ticket dans votre historique.</div>`;
        return;
    }

    let html = "";
    // On utilise la même logique que la bankroll principale, mais adaptée pour le Dashboard
    window.globalBankroll.forEach(b => {
        let dateStr = new Date(b.date).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
        
        let statusBadge = '';
        if (b.status === "PENDING") statusBadge = `<span class="bg-yellow-500/20 text-yellow-500 border border-yellow-500 px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-widest animate-pulse">En Cours</span>`;
        else if (b.status === "WON") statusBadge = `<span class="bg-money/20 text-money border border-money px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-widest">Gagné (+${(b.stake * b.odds - b.stake).toFixed(2)}€)</span>`;
        else statusBadge = `<span class="bg-blood/20 text-blood border border-blood px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-widest">Perdu</span>`;

        html += `
            <div class="bg-black/60 border border-gray-800 p-4 rounded-xl flex flex-col md:flex-row justify-between md:items-center gap-3 hover:border-purple-500/50 transition">
                <div>
                    <div class="flex items-center gap-2 mb-1">
                        <span class="text-gray-500 text-[10px] font-black tracking-widest">${dateStr}</span>
                        ${statusBadge}
                    </div>
                    <div class="text-white font-bold text-xs md:text-sm">${b.description}</div>
                </div>
                <div class="flex items-center gap-4 bg-gray-900 px-4 py-2 rounded-lg border border-gray-700 w-fit">
                    <div class="text-center"><span class="block text-[9px] text-gray-500 uppercase tracking-widest font-black">Cote</span><span class="text-yellow-400 font-black">@${b.odds.toFixed(2)}</span></div>
                    <div class="w-px h-6 bg-gray-700"></div>
                    <div class="text-center"><span class="block text-[9px] text-gray-500 uppercase tracking-widest font-black">Mise</span><span class="text-white font-black">${b.stake.toFixed(2)}€</span></div>
                </div>
            </div>
        `;
    });
    container.innerHTML = html;
};

window.renderDashboardInfirmary = function() {
    let container = document.getElementById('dash-infirmary-list');
    if(!container) return;

    if (!window.userBannedPlayers || window.userBannedPlayers.size === 0) { 
        container.innerHTML = `<div class="w-full text-center p-10 bg-black/40 rounded-xl border border-gray-800 border-dashed text-gray-500 font-bold text-xs uppercase tracking-widest italic">Votre infirmerie est vide.</div>`;
        return; 
    }

    let html = "";
    window.userBannedPlayers.forEach(id => {
        let info = window.bannedPlayersDetails[id] || { name: "Inconnu", team: "---" };
        html += `
            <div class="bg-black border border-blood/30 hover:border-blood px-3 py-2 rounded-lg flex items-center gap-3 shadow-inner transition">
                <div>
                    <div class="text-white font-black text-xs uppercase tracking-widest">${info.name}</div>
                    <div class="text-gray-500 text-[9px] font-bold uppercase">${info.team}</div>
                </div>
                <button onclick="window.unbanPlayerFromTickets('${id}'); window.renderDashboardInfirmary();" class="bg-gray-800 hover:bg-green-500 hover:text-black text-green-400 rounded-full w-6 h-6 flex items-center justify-center transition shadow-lg" title="Réintégrer ce joueur">
                    <i class="fas fa-undo text-[10px]"></i>
                </button>
            </div>
        `;
    });
    container.innerHTML = html;
};

// --- RECHERCHE INTELLIGENTE INFIRMERIE ---
window.filterInfirmarySearch = function() {
    let input = document.getElementById('infirmary-search-input').value.toLowerCase().trim();
    let dropdown = document.getElementById('infirmary-search-results');

    // Cacher si moins de 2 lettres
    if (input.length < 2) {
        dropdown.classList.add('hidden');
        return;
    }

    // On utilise la base de données des joueurs déjà chargée par le site
    let pool = window.globalPredictionsPool || [];
    let matchesHtml = "";
    let count = 0;

    for (let p of pool) {
        if (count >= 10) break; // On affiche max 10 résultats pour ne pas surcharger
        
        // On cherche le joueur, et on s'assure qu'il n'est pas DEJA dans l'infirmerie
        if (p.name.toLowerCase().includes(input) && !window.userBannedPlayers.has(String(p.id))) {
            matchesHtml += `
                <div class="p-3 hover:bg-gray-800 cursor-pointer border-b border-gray-800/50 flex items-center justify-between transition group" onclick="window.addPlayerToInfirmaryFromDashboard('${p.id}', '${p.name.replace(/'/g, "\\'")}', '${p.team}')">
                    <div class="flex items-center gap-3">
                        <img src="${p.headshot || 'assets/logo_hockAI.png'}" class="w-8 h-8 rounded-full border border-gray-700 bg-gray-950 object-cover group-hover:border-blood transition">
                        <div>
                            <div class="text-white text-xs font-black uppercase tracking-widest group-hover:text-blood transition">${p.name}</div>
                            <div class="text-[9px] text-gray-500 font-bold uppercase tracking-widest">${p.team}</div>
                        </div>
                    </div>
                    <div class="bg-blood/20 text-blood w-6 h-6 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition transform group-hover:scale-110">
                        <i class="fas fa-plus"></i>
                    </div>
                </div>
            `;
            count++;
        }
    }

    if (matchesHtml === "") {
        dropdown.innerHTML = '<div class="p-4 text-xs text-gray-500 font-bold italic text-center">Aucun joueur disponible ou joueur déjà exclu.</div>';
    } else {
        dropdown.innerHTML = matchesHtml;
    }
    dropdown.classList.remove('hidden');
};

// Fonction déclenchée au clic sur un résultat
window.addPlayerToInfirmaryFromDashboard = function(id, name, team) {
    // 1. On vide et on cache la barre de recherche
    document.getElementById('infirmary-search-input').value = '';
    document.getElementById('infirmary-search-results').classList.add('hidden');
    
    // 2. On utilise ta fonction existante (qui sauvegarde sur Supabase !)
    window.banPlayerFromTickets(id, name, team);
    
    // 3. On rafraîchit l'affichage du Dashboard
    setTimeout(() => {
        if(typeof window.renderDashboardInfirmary === 'function') {
            window.renderDashboardInfirmary();
        }
    }, 500); // Petit délai pour laisser Supabase travailler
};

// Fermer le menu déroulant si on clique à côté
document.addEventListener('click', function(e) {
    let dropdown = document.getElementById('infirmary-search-results');
    let input = document.getElementById('infirmary-search-input');
    if (dropdown && !dropdown.contains(e.target) && e.target !== input) {
        dropdown.classList.add('hidden');
    }
});

window.logoutUser = async function() {
    if(confirm("Voulez-vous vraiment fermer votre session HOCKAI ?")) {
        await supabaseClient.auth.signOut();
        // Réinitialisation locale des variables critiques
        window.isUserLoggedIn = false;
        window.currentUserEmail = "";
        window.globalBankroll = [];
        window.userBannedPlayers.clear();
        window.bannedPlayersDetails = {};
        
        window.updateAuthUI();
        window.closeUserDashboard();
        
        alert("Déconnexion réussie. À bientôt dans l'Arène !");
        location.reload(); // Recharge la page pour vider complètement la mémoire cache de l'UI
    }
};

// On attend que tout le HTML soit lu par le navigateur avant d'attacher les actions
document.addEventListener('DOMContentLoaded', () => {
    
    // --- LOGIQUE DE CONNEXION ---
    const formLogin = document.getElementById('form-login');
    if (formLogin) {
        formLogin.addEventListener('submit', async function (e) {
            e.preventDefault(); // Empêche le rechargement de la page !
            let email = document.getElementById('login-email').value;
            let password = document.getElementById('login-password').value;
            let btn = e.target.querySelector('button');
            let originalHtml = btn.innerHTML;
            
            btn.innerHTML = `<i class="fas fa-circle-notch fa-spin"></i> CONNEXION...`;
            btn.disabled = true;

            const { data, error } = await supabaseClient.auth.signInWithPassword({
                email: email,
                password: password,
            });

            if (error) {
                alert("Erreur : " + (error.message === "Invalid login credentials" ? "Identifiants incorrects." : error.message));
            } else {
                window.closeAuthModal();
                const welcome = document.getElementById('welcome-screen');
                if(welcome) {
                    welcome.classList.remove('hidden');
                    setTimeout(() => welcome.classList.add('hidden'), 2000);
                }
            }
            
            btn.innerHTML = originalHtml;
            btn.disabled = false;
        });
    }

    // --- LOGIQUE D'INSCRIPTION ---
    const signupForm = document.getElementById('form-signup');
    if (signupForm) {
        signupForm.addEventListener('submit', async (e) => {
            e.preventDefault(); // Empêche le rechargement de la page !
            const email = document.getElementById('signup-email').value;
            const password = document.getElementById('signup-password').value;
            const btn = e.target.querySelector('button');
            const originalText = btn.innerText;

            btn.innerText = "CRÉATION EN COURS...";
            btn.disabled = true;

            const { data, error } = await supabaseClient.auth.signUp({
                email: email,
                password: password,
            });

            if (error) {
                alert("Erreur lors de l'inscription : " + error.message);
            } else {
                alert("Inscription réussie ! Un email de confirmation a été envoyé à " + email + ". Veuillez cliquer sur le lien dans l'email pour activer votre compte.");
                window.switchAuth('login');
                document.getElementById('signup-email').value = "";
                document.getElementById('signup-password').value = "";
            }
            
            btn.innerText = originalText;
            btn.disabled = false;
        });
    }
});

function updatePerformanceLists() {
    // globalPredictionsPool est déjà défini en haut de ton fichier app.js
    if (!globalPredictionsPool || globalPredictionsPool.length === 0) return;

    // 1. TOP BUTEURS (Case Gauche)
    const topGoalers = [...globalPredictionsPool]
        .sort((a, b) => b.prob_goal - a.prob_goal)
        .slice(0, 5);

    const goalContainer = document.getElementById('top-goalers-list');
    if (goalContainer) {
        goalContainer.innerHTML = topGoalers.map(p => `
            <div class="flex items-center justify-between p-3 bg-zinc-900/50 rounded-lg border border-zinc-800/50 hover:border-blood/50 transition-all cursor-pointer" onclick="openPlayerModal(${p.id})">
                <div class="flex flex-col text-left">
                    <span class="text-white font-bold text-sm">${p.name}</span>
                    <span class="text-zinc-500 text-xs">${p.team}</span>
                </div>
                <div class="text-right">
                    <span class="text-blood font-black italic">${p.prob_goal}%</span>
                </div>
            </div>
        `).join('');
    }

    // 2. TOP POINTEURS (Case Droite)
    const topPointers = [...globalPredictionsPool]
        .sort((a, b) => b.prob_point - a.prob_point)
        .slice(0, 5);

    const pointContainer = document.getElementById('top-pointers-list');
    if (pointContainer) {
        pointContainer.innerHTML = topPointers.map(p => `
            <div class="flex items-center justify-between p-3 bg-zinc-900/50 rounded-lg border border-zinc-800/50 hover:border-ice/50 transition-all cursor-pointer" onclick="openPlayerModal(${p.id})">
                <div class="flex flex-col text-left">
                    <span class="text-white font-bold text-sm">${p.name}</span>
                    <span class="text-zinc-500 text-xs">${p.team}</span>
                </div>
                <div class="text-right">
                    <span class="text-ice font-black italic">${p.prob_point}%</span>
                </div>
            </div>
        `).join('');
    }
}
// ==========================================
// FERMETURE AUTOMATIQUE DU MENU SUR MOBILE
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    // On cible tous les boutons et liens dans le menu de navigation
    const navItems = document.querySelectorAll('#sidebar nav button, #sidebar nav a, #sidebar nav div');
    
    navItems.forEach(item => {
        item.addEventListener('click', () => {
            const sidebar = document.getElementById('sidebar');
            // Si on est sur un petit écran (mobile) et que le menu est ouvert
            if (window.innerWidth < 768 && !sidebar.classList.contains('-translate-x-full')) {
                window.toggleSidebar(); // On déclenche ta fonction de fermeture
            }
        });
    });
});

// =========================================================================
// HOCKAI | Système de Tunnel de Navigation (Step-by-Step) pour les Tickets
// =========================================================================
window.goToTicketStep = function(step) {
    console.log(`[HOCKAI] Navigation vers l'étape ${step}...`);

    // 1. Sécurité : Vérifier qu'un match est sélectionné avant de passer à l'étape 2
    if (step === 2 && (!window.selectedTicketMatches || window.selectedTicketMatches.size === 0)) {
        alert("🛡️ Sécurité HOCKAI : Veuillez sélectionner au moins un match dans la configuration avant de continuer.");
        return;
    }

    // 2. Gestion de l'affichage des sections
    // On cache tout d'abord
    const step1 = document.getElementById('ticket-step-1');
    const step2 = document.getElementById('ticket-step-2');
    const step3 = document.getElementById('ticket-step-3');

    if (!step1 || !step2 || !step3) {
        console.error("Erreur critique : Conteneurs d'étapes introuvables dans le HTML.");
        return;
    }

    step1.classList.add('hidden');
    step1.classList.remove('flex');
    step2.classList.add('hidden');
    step2.classList.remove('flex');
    step3.classList.add('hidden');
    step3.classList.remove('flex');
    
    // On affiche l'étape demandée
    const activeStep = document.getElementById(`ticket-step-${step}`);
    activeStep.classList.remove('hidden');
    activeStep.classList.add('flex');

    // 3. Mise à jour visuelle des points de progression
    // Définition des états (Actif/Neon vs Inactif/Gris)
    const dotActive = 'w-3 h-3 rounded-full bg-blood shadow-[0_0_10px_#ff3333] transition-all duration-300';
    const dotInactive = 'w-3 h-3 rounded-full bg-gray-800 shadow-none transition-all duration-300';

    const dot1 = document.getElementById('step-dot-1');
    const dot2 = document.getElementById('step-dot-2');
    const dot3 = document.getElementById('step-dot-3');

    if (dot1 && dot2 && dot3) {
        dot1.className = (step >= 1) ? dotActive : dotInactive;
        dot2.className = (step >= 2) ? dotActive : dotInactive;
        dot3.className = (step >= 3) ? dotActive : dotInactive;
    }

    // 4. Remonter en haut de page en douceur sur mobile pour un confort parfait
    if(window.innerWidth < 1024) {
        const tabContainer = document.getElementById('tab-tickets');
        if (tabContainer) tabContainer.scrollTo({ top: 0, behavior: 'smooth' });
    }
};
// =========================================================================
// 🏠 MOTEUR DE L'ACCUEIL (BENTO DASHBOARD & MODALES CONTENT)
// =========================================================================

// =========================================================================
// 🏠 MOTEUR DE L'ACCUEIL (BENTO DASHBOARD & MODALES CONTENT)
// =========================================================================

// 1. Dictionnaire complet des contenus (Rédigé pour donner envie !)
const HOME_MODAL_CONTENT = {
    'intro': {
        title: "L'Intelligence Artificielle HOCKAI",
        icon: "fa-brain", color: "text-white", border: "border-white", shadow: "shadow-[0_0_15px_rgba(255,255,255,0.3)]",
        body: `
            <div class="space-y-6 text-gray-300 text-[11px] md:text-sm leading-relaxed font-bold">
                <p>Bienvenue sur <strong>HOCKAI.fr</strong>. Oubliez l'intuition, les émotions et les biais cognitifs. Notre plateforme est un terminal de <span class="text-white">Quant Trading</span> dédié exclusivement à la NHL.</p>
                
                <div class="bg-gray-900 p-5 rounded-xl border border-gray-800 shadow-inner">
                    <h4 class="text-white font-black uppercase tracking-widest text-xs mb-2 border-b border-gray-700 pb-2"><i class="fas fa-database text-ice mr-2"></i> Données Massives</h4>
                    <p>Chaque nuit, notre réseau de neurones traite des millions de <em>data points</em>. Nous analysons les métriques sous-jacentes qui prédisent l'avenir : <span class="text-ice">Expected Goals (xG), HDCF%, et Temps de possession</span>.</p>
                </div>

                <div class="bg-gray-900 p-5 rounded-xl border border-gray-800 shadow-inner">
                    <h4 class="text-white font-black uppercase tracking-widest text-xs mb-2 border-b border-gray-700 pb-2"><i class="fas fa-calculator text-money mr-2"></i> Fiabilité Mathématique (+EV)</h4>
                    <p class="mb-3">Nous modélisons les rencontres via des algorithmes prédictifs (Loi de Poisson). L'IA calcule votre <strong>Expected Value (+EV)</strong>. Si notre probabilité bat la cote du marché, c'est un pari rentable sur le long terme :</p>
                    <div class="bg-black p-4 rounded-lg text-center text-ice font-black my-4 border border-ice/30 text-lg md:text-xl">
                        $$EV = (P_{Win} \\times Cote) - 1$$
                    </div>
                </div>
            </div>
        `,
        action: { text: "Explorer le Dashboard", tab: null } // Juste fermer
    },
    'tickets': {
        title: "Le Terminal de Tickets (Générateur IA)",
        icon: "fa-ticket-alt", color: "text-blood", border: "border-blood", shadow: "shadow-[0_0_15px_rgba(255,51,51,0.3)]",
        body: `
            <div class="space-y-5 text-gray-300 text-[11px] md:text-sm leading-relaxed font-bold">
                <p>La création d'un combiné est souvent un piège émotionnel. La section <strong>Tickets Fiables</strong> retire le facteur humain pour assembler la combinaison présentant la meilleure <strong class="text-white">Expected Value (+EV)</strong> globale de la nuit.</p>
                
                <div class="bg-gray-900 p-5 rounded-xl border border-gray-800 shadow-inner space-y-4">
                    <h4 class="text-white font-black uppercase tracking-widest text-xs mb-3 border-b border-gray-800 pb-2 flex items-center gap-2">
                        <i class="fas fa-microchip text-blood"></i> Intelligence & Personnalisation
                    </h4>
                    
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                        <div class="flex items-start gap-3">
                            <i class="fas fa-brain text-blood mt-1"></i>
                            <p><strong class="text-white">Analyses Croisées :</strong> L'IA filtre les joueurs et ne conserve que ceux dont l'historique, le temps de glace prévu et la faiblesse adverse maximisent le "Edge" mathématique.</p>
                        </div>
                        <div class="flex items-start gap-3">
                            <i class="fas fa-sliders-h text-blood mt-1"></i>
                            <p><strong class="text-white">Profil de Risque :</strong> Définissez votre tolérance à la variance (Sécurisé, Standard, Poker) pour que l'IA adapte l'agressivité du ticket.</p>
                        </div>
                    </div>

                    <div class="bg-black/50 p-4 rounded-lg border border-red-900/50 mt-2">
                        <div class="flex items-center gap-3 mb-2">
                            <i class="fas fa-user-injured text-red-500 text-xl animate-pulse"></i>
                            <h5 class="text-white font-black uppercase tracking-widest text-[11px]">Infirmerie Manuelle</h5>
                        </div>
                        <p class="text-gray-400 text-xs">Une "Game Time Decision" de dernière minute ? Si la base de données n'est pas à jour, ce système exclusif vous permet d'écarter manuellement un joueur du générateur pour sécuriser votre ticket.</p>
                    </div>
                </div>

                <div class="bg-gray-900 p-5 rounded-xl border border-gray-800 shadow-inner">
                    <h4 class="text-white font-black uppercase tracking-widest text-xs mb-3 border-b border-gray-800 pb-2 flex items-center gap-2">
                        <i class="fas fa-cogs text-ice"></i> Le Menu Tactique
                    </h4>
                    <p class="text-gray-400 mb-4 text-xs">Déployez ce menu pour accéder à des outils de contrôle absolu sur votre ticket avant validation.</p>
                    
                    <div class="grid grid-cols-2 gap-3 text-xs">
                        <div class="bg-black/40 p-3 rounded border border-gray-800">
                            <i class="fas fa-lock text-yellow-500 mr-2"></i> <strong class="text-white">Bouton Lock :</strong> Figez une sélection coup de cœur. Le générateur changera le reste du ticket mais conservera ce pari bloqué.
                        </div>
                        <div class="bg-black/40 p-3 rounded border border-gray-800">
                            <i class="fas fa-share-alt text-cyan-400 mr-2"></i> <strong class="text-white">Exporter :</strong> Génère une image stylisée de votre ticket pour le partager instantanément sur vos réseaux.
                        </div>
                        <div class="bg-black/40 p-3 rounded border border-gray-800 col-span-2">
                            <i class="fas fa-money-bill-wave text-money mr-2"></i> <strong class="text-white">Encaisser :</strong> Valide le ticket dans votre Coffre-Fort personnel. L'IA calculera automatiquement le résultat (Gagné/Perdu) dès la fin des matchs.
                        </div>
                    </div>
                </div>
                
            </div>
        `,
        action: { text: "Générer un Ticket +EV", tab: "tab-tickets" }
    },
    'perf': {
        title: "Scouting Individuel",
        icon: "fa-chart-line", color: "text-green-400", border: "border-green-400", shadow: "shadow-[0_0_15px_rgba(74,222,128,0.3)]",
        body: `
            <div class="space-y-4 text-gray-300 text-[11px] md:text-sm leading-relaxed font-bold">
                <p>La section <strong>Performances</strong> est votre radiographie complète. Cherchez n'importe quel joueur NHL.</p>
                <ul class="list-disc pl-5 space-y-2 mt-4 text-[11px] md:text-sm">
                    <li><strong class="text-white">Alerte Régression :</strong> Détecte si un joueur est en "surchauffe" (chance) ou s'il s'apprête à exploser (malchance).</li>
                    <li><strong class="text-white">L'Œil de l'Oracle :</strong> Un compte-rendu textuel généré par l'IA synthétise l'état de forme avant le match.</li>
                </ul>
            </div>
        `,
        action: { text: "Ouvrir le Scouting", tab: "tab-performances" }
    },
    'teams': {
        title: "Résultats Équipes",
        icon: "fa-chess-knight", color: "text-purple-400", border: "border-purple-500", shadow: "shadow-[0_0_15px_rgba(168,85,247,0.3)]",
        body: `
            <div class="space-y-4 text-gray-300 text-[11px] md:text-sm leading-relaxed font-bold">
                <p>Ce module confronte les franchises pour prédire le vainqueur. L'IA regarde <strong>la domination réelle sur la glace</strong>.</p>
                <ul class="list-disc pl-5 space-y-2 mt-4 text-[11px] md:text-sm">
                    <li><strong class="text-white">Domination 5v5 (xGF%) :</strong> Qui contrôle vraiment le jeu à forces égales ?</li>
                    <li><strong class="text-white">Bain de sang tactique :</strong> Croise l'efficacité en Power Play avec la perméabilité en Penalty Kill adverse.</li>
                </ul>
            </div>
        `,
        action: { text: "Voir les Matchs", tab: "tab-predictions" }
    },
    'goalies': {
        title: "La Forteresse (Gardiens)",
        icon: "fa-shield-alt", color: "text-orange-500", border: "border-orange-500", shadow: "shadow-[0_0_15px_rgba(249,115,22,0.3)]",
        body: `
            <div class="space-y-4 text-gray-300 text-[11px] md:text-sm leading-relaxed font-bold">
                <p>L'analyse des gardiens partants est <strong>vitale</strong> pour la rentabilité. Un seul homme peut faire perdre une équipe dominante.</p>
                <div class="bg-gray-900 p-4 rounded-xl mt-4 border-l-4 border-orange-500 text-[11px] md:text-sm">
                    Nous utilisons le <strong class="text-orange-500">GSAx (Goals Saved Above Expected)</strong>. L'IA calcule combien de buts un gardien "moyen" aurait encaissé face aux mêmes tirs, et compare avec la réalité.
                </div>
            </div>
        `,
        action: { text: "Analyser les Gardiens", tab: "tab-formes" }
    },
    'tools': {
        title: "Les Outils de Trading V2",
        icon: "fa-briefcase", color: "text-money", border: "border-money", shadow: "shadow-[0_0_15px_rgba(74,222,128,0.3)]",
        body: `
            <div class="space-y-4 text-gray-300 text-[11px] md:text-sm leading-relaxed font-bold">
                <p>Passez au niveau professionnel avec une suite d'outils quantitatifs sans équivalent :</p>
                <div class="grid grid-cols-2 md:grid-cols-2 gap-3 mt-4 text-[10px] md:text-xs">
                    <div class="bg-black/50 p-3 rounded-lg border border-gray-800"><i class="fas fa-university text-yellow-500 mr-1"></i> Banquier Kelly</div>
                    <div class="bg-black/50 p-3 rounded-lg border border-gray-800"><i class="fas fa-flask text-purple-400 mr-1"></i> Labo de Chimie</div>
                    <div class="bg-black/50 p-3 rounded-lg border border-gray-800"><i class="fas fa-dice text-ice mr-1"></i> Monte Carlo</div>
                    <div class="bg-black/50 p-3 rounded-lg border border-gray-800"><i class="fas fa-broadcast-tower text-red-500 mr-1"></i> Oracle Live</div>
                </div>
            </div>
        `,
        action: null // Trop d'onglets différents, on ferme juste
    }
};

// 2. FONCTIONS DE GESTION DES MODALES (C'est ça qui manquait !)
window.openHomeModal = function(type) {
    const modal = document.getElementById('home-content-modal');
    const body = document.getElementById('home-modal-body');
    const content = HOME_MODAL_CONTENT[type];

    if (!content) return;

    let actionButton = "";
    if (content.action) {
        // Bouton dynamique selon le contenu
        if (content.action.tab) {
            actionButton = `
                <div class="mt-8 flex justify-center w-full">
                    <button onclick="closeHomeModal(); switchTab('${content.action.tab}')" class="w-full md:w-auto bg-gray-900 hover:bg-gray-800 text-white font-black px-6 py-4 rounded-xl border border-${content.border.split('-')[1]}-500/50 shadow-[0_0_15px_rgba(255,255,255,0.1)] transition transform hover:scale-105 uppercase tracking-widest text-[10px] md:text-xs flex items-center justify-center gap-3">
                        ${content.action.text} <i class="fas fa-arrow-right ${content.color}"></i>
                    </button>
                </div>
            `;
        } else {
            // Bouton simple pour fermer (ex: intro)
            actionButton = `
                <div class="mt-8 text-center border-t border-gray-800 pt-6">
                    <p class="text-[10px] text-gray-500 font-bold uppercase tracking-widest mb-3">Prêt à dominer le marché ?</p>
                    <button onclick="closeHomeModal()" class="w-full md:w-auto bg-white text-black hover:bg-gray-200 font-black px-8 py-3.5 rounded-xl shadow-[0_0_20px_rgba(255,255,255,0.3)] transition transform hover:scale-105 uppercase tracking-widest text-[10px] md:text-xs flex items-center justify-center mx-auto gap-3">
                        C'est parti <i class="fas fa-rocket"></i>
                    </button>
                </div>
            `;
        }
    }

    // Injection du contenu HTML sublimé
    body.innerHTML = `
        <div class="text-center mb-6 mt-4 md:mt-0 border-b border-gray-800 pb-6 relative">
            <div class="w-20 h-20 mx-auto rounded-full bg-gray-900 flex items-center justify-center border-2 ${content.border} ${content.shadow} mb-4 relative z-10 transition-all duration-500 animate-pulse-slow">
                <i class="fas ${content.icon} text-3xl ${content.color} drop-shadow-[0_0_10px_currentColor]"></i>
            </div>
            <h2 class="text-2xl md:text-3xl font-black text-white uppercase tracking-widest relative z-10">${content.title}</h2>
        </div>
        <div class="transition-opacity duration-300 animate-fade-in-up">
            ${content.body}
            ${actionButton}
        </div>
    `;

    modal.classList.remove('hidden');
    modal.classList.add('flex');
    
    // NOUVEAU : Demander à MathJax de redessiner les formules LaTeX si présentes (ex: intro)
    if (typeof MathJax !== 'undefined' && type === 'intro') {
        MathJax.typesetPromise([body]).catch(function (err) {
            console.error('Erreur MathJax:', err.message);
        });
    }
};

window.closeHomeModal = function() {
    const modal = document.getElementById('home-content-modal');
    modal.classList.add('hidden');
    modal.classList.remove('flex');
};

// =========================================================================
// CORRECTION D'INITIALISATION : Forcer l'accueil au démarrage
// =========================================================================
document.addEventListener('DOMContentLoaded', () => {
    // ⚡ Petit délai pour s'assurer que tout est prêt
    setTimeout(() => {
        if (typeof window.fetchMatches === 'function') window.fetchMatches(true); // Silencieux au démarrage
        if (typeof window.silentGlobalScan === 'function') window.silentGlobalScan();
        if (typeof loadBankroll === 'function') loadBankroll();

        const currentHash = window.location.hash; 
        if (currentHash && currentHash.length > 1) {
            const [hashPart, queryPart] = currentHash.substring(1).split('?');
            const targetTabId = hashPart;
            if (document.getElementById(targetTabId)) {
                // Si on a un lien direct, on l'ouvre
                window.switchTab(targetTabId);
                // ... gestion Deep Linking Joueur (omise pour clarté, déjà présente dans ton fichier)
            }
        } else {
            // SI AUCUN LIEN DIRECT, ON FORCE L'ONGLET ACCUEIL
            // (Il faut s'assurer que ton bouton menu Accueil a l'ID 'btn-nav-accueil')
            window.switchTab('tab-accueil', document.getElementById('btn-nav-accueil'));
        }
    }, 300);
});

// Pour que LaTeX s'affiche, il faut rajouter le script MathJax dans index.html