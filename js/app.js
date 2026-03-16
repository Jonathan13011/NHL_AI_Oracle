const API_BASE = "/backend";
let currentMatchPredictions = []; let globalPredictionsPool = []; let fetchedMatchesPool = []; let currentModalData = null;
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
                    div.onclick = () => { document.getElementById('player-search-input').value = p.name; cachedSearchId = p.id; document.getElementById('autocomplete-results').classList.add('hidden'); executePlayerSearch(p.id); }; document.getElementById('autocomplete-results').appendChild(div);
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

function showFullScreenLoader(title, description, withTimer = false) {
    document.getElementById('loader-title').innerText = title; document.getElementById('loader-desc').innerText = description; const timerEl = document.getElementById('scan-timer'); document.getElementById('global-scanning-screen').classList.remove('hidden');
    clearInterval(scanInterval);
    if (withTimer) { timerEl.classList.remove('hidden'); let timeLeft = 12; timerEl.innerText = `Temps estimé : ${timeLeft}s`; scanInterval = setInterval(() => { timeLeft--; if (timeLeft > 0) timerEl.innerText = `Temps estimé : ${timeLeft}s`; else timerEl.innerText = "Finalisation..."; }, 1000); } else { timerEl.classList.add('hidden'); }
}
function hideFullScreenLoader() { clearInterval(scanInterval); document.getElementById('global-scanning-screen').classList.add('hidden'); }
function switchTab(tabId, btnElement) { document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active')); document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active')); document.getElementById(tabId).classList.add('active'); btnElement.classList.add('active'); if (tabId === 'tab-filtres' && !hasScannedGlobal) window.silentGlobalScan(); else applyMasterFilter(); }
function toggleL5Detail(elementId) { const el = document.getElementById(elementId); el.classList.toggle('hidden'); event.stopPropagation(); }

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

window.currentModalMode = '2way';

async function loadTeamPredictions(mode) {
    window.currentModalMode = mode;
    if (mode === '2way') {
        document.getElementById('btn-2way').className = "px-4 md:px-6 py-2 rounded text-[10px] md:text-sm font-black uppercase tracking-widest transition-all duration-300 bg-ice text-deepblue shadow-[0_0_15px_rgba(0,229,255,0.5)]";
        document.getElementById('btn-3way').className = "px-4 md:px-6 py-2 rounded text-[10px] md:text-sm font-black uppercase tracking-widest text-gray-300 hover:text-white transition-all duration-300 bg-gray-800";
    } else {
        document.getElementById('btn-3way').className = "px-4 md:px-6 py-2 rounded text-[10px] md:text-sm font-black uppercase tracking-widest transition-all duration-300 bg-ice text-deepblue shadow-[0_0_15px_rgba(0,229,255,0.5)]";
        document.getElementById('btn-2way').className = "px-4 md:px-6 py-2 rounded text-[10px] md:text-sm font-black uppercase tracking-widest text-gray-300 hover:text-white transition-all duration-300 bg-gray-800";
    }

    const container = document.getElementById('team-predictions-container');
    showFullScreenLoader("L'Oracle analyse", "Traitement des algorithmes de victoire...", false);

    try {
        if (fetchedMatchesPool.length === 0) { const res = await fetch(`${API_BASE}/upcoming_matches`); const data = await res.json(); fetchedMatchesPool = data.matches || []; }
        if (fetchedMatchesPool.length === 0) { container.innerHTML = '<div class="col-span-full text-center text-gray-400 py-10">Aucun match programmé.</div>'; hideFullScreenLoader(); return; }
        container.innerHTML = '';

        const fetchPromises = fetchedMatchesPool.map(async (match) => {
            const d = new Date(match.date);
            const dateStr = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
            const localYear = d.getFullYear(); const localMonth = String(d.getMonth() + 1).padStart(2, '0'); const localDay = String(d.getDate()).padStart(2, '0');
            const matchDateOnly = `${localYear}-${localMonth}-${localDay}`;
            let endpoint = mode === '2way' ? 'predict_team' : 'predict_team_regulation';

            try {
                const predRes = await fetch(`${API_BASE}/${endpoint}/${match.home_team}/${match.away_team}/${matchDateOnly}`);
                const predData = await predRes.json();
                return { match, predData, matchDateOnly, dateStr, status: 'success' };
            } catch (e) { return { status: 'error' }; }
        });

        const results = await Promise.all(fetchPromises);

        results.forEach(res => {
            if (res.status === 'success' && res.predData && res.predData.status === "success") {
                const { match, matchDateOnly, dateStr, predData } = res;
                const isVisible = (selectedFilterDates.length === 0 || selectedFilterDates.includes(matchDateOnly)) ? 'flex' : 'none';
                const card = document.createElement('div');

                // CARTE DESIGN iOS
                card.className = "bg-gray-900/80 border border-gray-800 rounded-xl p-4 md:p-5 cursor-pointer hover:border-purple-400 transition-all transform hover:-translate-y-1 shadow-lg group overflow-hidden relative flex-col gap-2";
                card.style.display = isVisible;
                card.onclick = () => openTeamModal(match.home_team, match.away_team, matchDateOnly, predData);

                card.innerHTML += `<div class="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-purple-500 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>`;
                card.innerHTML += `<div class="flex justify-between items-center mb-3 border-b border-gray-800 pb-2"><div class="text-[9px] text-purple-400 font-black uppercase tracking-widest"><i class="fas fa-robot"></i> ${mode === '2way' ? 'Vainqueur' : 'Tps Règl.'}</div><span class="text-[10px] font-bold text-gray-500"><i class="far fa-clock"></i> ${dateStr}</span></div>`;

                if (mode === '2way') {
                    const hp = predData.prob_home_win; const ap = predData.prob_away_win;
                    const isHomeFav = hp >= 50;
                    card.innerHTML += `
                                <div class="flex justify-between items-center relative mb-2">
                                    <div class="flex flex-col items-center w-[40%] ${!isHomeFav ? 'scale-110 drop-shadow-[0_0_10px_rgba(192,132,252,0.4)]' : 'opacity-50'} transition-all"><img src="${getLogoUrl(match.away_team)}" onerror="this.src='assets/logo_hockAI.png'" class="w-10 h-10 object-contain mb-1"><span class="text-[10px] font-black text-white uppercase">${match.away_team}</span><span class="text-[10px] font-black ${!isHomeFav ? 'text-purple-400' : 'text-gray-500'}">${ap.toFixed(1)}%</span></div>
                                    <div class="text-xs font-black text-gray-600 italic">@</div>
                                    <div class="flex flex-col items-center w-[40%] ${isHomeFav ? 'scale-110 drop-shadow-[0_0_10px_rgba(192,132,252,0.4)]' : 'opacity-50'} transition-all"><img src="${getLogoUrl(match.home_team)}" onerror="this.src='assets/logo_hockAI.png'" class="w-10 h-10 object-contain mb-1"><span class="text-[10px] font-black text-white uppercase">${match.home_team}</span><span class="text-[10px] font-black ${isHomeFav ? 'text-purple-400' : 'text-gray-500'}">${hp.toFixed(1)}%</span></div>
                                </div>
                            `;
                } else {
                    const hp = predData.prob_home_reg; const tp = predData.prob_tie; const ap = predData.prob_away_reg;
                    card.innerHTML += `
                                <div class="flex justify-between items-center mb-2">
                                    <div class="flex flex-col items-center w-1/3"><img src="${getLogoUrl(match.away_team)}" onerror="this.src='assets/logo_hockAI.png'" class="w-8 h-8 mb-1"><span class="text-[9px] font-black text-white">${match.away_team}</span><span class="text-[10px] font-black text-blood">${ap.toFixed(1)}%</span></div>
                                    <div class="flex flex-col items-center w-1/3 border-l border-r border-gray-800"><span class="text-[8px] font-black text-gray-500 uppercase mb-1">Nul</span><span class="text-sm font-black text-tie">${tp.toFixed(1)}%</span></div>
                                    <div class="flex flex-col items-center w-1/3"><img src="${getLogoUrl(match.home_team)}" onerror="this.src='assets/logo_hockAI.png'" class="w-8 h-8 mb-1"><span class="text-[9px] font-black text-white">${match.home_team}</span><span class="text-[10px] font-black text-ice">${hp.toFixed(1)}%</span></div>
                                </div>
                            `;
                }

                card.innerHTML += `<div class="mt-3 pt-2 border-t border-gray-800 text-center"><span class="text-[9px] text-gray-400 group-hover:text-purple-400 uppercase tracking-widest font-bold transition flex items-center justify-center gap-1">Voir l'analyse <i class="fas fa-arrow-right ml-1"></i></span></div>`;
                container.appendChild(card);
            }
            updatePerformanceLists();
        });
    } catch (e) { console.error(e); } finally { hideFullScreenLoader(); }
}

async function openTeamModal(home, away, date, predData) {
    const modal = document.getElementById('team-modal');
    const content = document.getElementById('team-modal-content');

    modal.classList.remove('hidden');
    modal.classList.add('flex');
    content.innerHTML = `<div class="text-center py-32"><i class="fas fa-circle-notch fa-spin text-5xl text-purple-500 mb-6 drop-shadow-[0_0_15px_#C084FC]"></i><p class="text-purple-400 font-black uppercase tracking-widest text-[10px] animate-pulse">L'Oracle compile le rapport d'équipe...</p></div>`;

    try {
        const res = await fetch(`${API_BASE}/team_comparison/${home}/${away}/${date}`);
        const tData = await res.json();

        let hLogo = typeof getLogoUrl === 'function' ? getLogoUrl(home) : "assets/logo_hockAI.png";
        let aLogo = typeof getLogoUrl === 'function' ? getLogoUrl(away) : "assets/logo_hockAI.png";

        let isHomeFav = false;
        let homeProb = 0, awayProb = 0, tieProb = 0;
        let maxProb = 0;
        let favTeam = "";

        if (window.currentModalMode === '2way') {
            homeProb = predData.prob_home_win;
            awayProb = predData.prob_away_win;
            isHomeFav = homeProb >= 50;
            maxProb = Math.max(homeProb, awayProb);
            favTeam = isHomeFav ? home : away;
        } else {
            homeProb = predData.prob_home_reg;
            awayProb = predData.prob_away_reg;
            tieProb = predData.prob_tie;
            maxProb = Math.max(homeProb, awayProb, tieProb);
            if (maxProb === homeProb) favTeam = home;
            else if (maxProb === awayProb) favTeam = away;
            else favTeam = "Match Nul";
        }

        window.calcPredEV = function () {
            let odds = parseFloat(document.getElementById('pred-ev-odds').value);
            let resDiv = document.getElementById('pred-ev-res');
            if (!odds) { resDiv.innerHTML = `<span class="text-gray-500 text-[9px] uppercase font-bold">Cote</span>`; return; }
            let ev = ((maxProb / 100) * odds) - 1;
            if (ev > 0) resDiv.innerHTML = `<div class="text-green-400 font-black text-sm md:text-base drop-shadow-[0_0_5px_#4ADE80]">+${(ev * 100).toFixed(2)}% EV</div>`;
            else resDiv.innerHTML = `<div class="text-red-500 font-black text-sm md:text-base">${(ev * 100).toFixed(2)}% EV</div>`;
        };

        let html = `
                    <div class="flex justify-center items-center gap-6 bg-gray-900/50 p-6 rounded-xl border border-gray-800 shadow-inner relative overflow-hidden mb-6 mt-4 md:mt-0">
                        <div class="absolute inset-0 bg-gradient-to-b from-purple-500/10 to-transparent pointer-events-none"></div>
                        <div class="flex flex-col items-center w-1/3 z-10"><img src="${aLogo}" onerror="this.src='assets/logo_hockAI.png'" class="w-16 h-16 object-contain mb-2"><span class="text-[10px] font-black text-white uppercase">${away}</span></div>
                        <div class="text-purple-500 font-black italic text-2xl z-10">VS</div>
                        <div class="flex flex-col items-center w-1/3 z-10"><img src="${hLogo}" onerror="this.src='assets/logo_hockAI.png'" class="w-16 h-16 object-contain mb-2"><span class="text-[10px] font-black text-white uppercase">${home}</span></div>
                    </div>

                    <div class="bg-gray-950 p-5 rounded-xl border border-gray-800 mb-6 shadow-lg">
                        <h4 class="text-white font-black text-[10px] uppercase tracking-widest mb-4 flex justify-center items-center"><i class="fas fa-balance-scale text-purple-400 mr-2"></i> Probabilités IA</h4>
                        ${window.currentModalMode === '2way' ? `
                            <div class="flex justify-between items-end mb-2">
                                <div class="text-2xl font-black ${!isHomeFav ? 'text-purple-400' : 'text-gray-600'}">${awayProb.toFixed(1)}%</div>
                                <div class="text-2xl font-black ${isHomeFav ? 'text-purple-400' : 'text-gray-600'}">${homeProb.toFixed(1)}%</div>
                            </div>
                            <div class="w-full h-3 bg-gray-900 rounded-full flex overflow-hidden border border-gray-700">
                                <div class="h-full transition-all duration-1000 ${!isHomeFav ? 'bg-purple-500' : 'bg-gray-700'}" style="width: ${awayProb}%"></div>
                                <div class="h-full transition-all duration-1000 ${isHomeFav ? 'bg-purple-500' : 'bg-gray-700'}" style="width: ${homeProb}%"></div>
                            </div>
                        ` : `
                            <div class="flex justify-between items-center mb-2">
                                <div class="flex flex-col items-start"><span class="text-[8px] text-gray-500 uppercase font-bold">Away</span><span class="text-lg font-black text-blood">${awayProb.toFixed(1)}%</span></div>
                                <div class="flex flex-col items-center"><span class="text-[8px] text-gray-500 uppercase font-bold">Nul</span><span class="text-lg font-black text-tie">${tieProb.toFixed(1)}%</span></div>
                                <div class="flex flex-col items-end"><span class="text-[8px] text-gray-500 uppercase font-bold">Home</span><span class="text-lg font-black text-ice">${homeProb.toFixed(1)}%</span></div>
                            </div>
                            <div class="w-full h-3 bg-gray-900 rounded-full flex overflow-hidden border border-gray-700">
                                <div class="bg-blood h-full" style="width: ${awayProb}%"></div><div class="bg-tie h-full" style="width: ${tieProb}%"></div><div class="bg-ice h-full" style="width: ${homeProb}%"></div>
                            </div>
                        `}
                    </div>

                    <div class="bg-gradient-to-br from-gray-900 to-black border border-green-500/50 p-4 rounded-xl shadow-lg relative overflow-hidden mb-6 flex flex-row justify-between items-center gap-2">
                        <div class="flex flex-col z-10 w-1/2">
                            <h6 class="text-[10px] text-green-500 uppercase font-black tracking-widest mb-1"><i class="fas fa-search-dollar mr-1"></i> Value Bet</h6>
                            <span class="text-[8px] text-gray-400 font-bold uppercase truncate">Cote pour: <span class="text-white">${favTeam}</span></span>
                        </div>
                        <div class="flex items-center gap-2 z-10 w-1/2 justify-end">
                            <input type="number" id="pred-ev-odds" oninput="calcPredEV()" step="0.01" placeholder="Ex: 1.85" class="bg-gray-800 border border-gray-600 text-white font-black rounded-lg w-16 p-2 text-center text-xs focus:border-green-500 outline-none shadow-inner">
                            <div id="pred-ev-res" class="bg-gray-950 border border-gray-800 p-2 rounded-lg text-center min-w-[70px] shadow-inner flex items-center justify-center">
                                <span class="text-gray-500 text-[8px] uppercase font-bold">---</span>
                            </div>
                        </div>
                    </div>
                `;

        // Statistiques Équipes (Saison & Forme)
        if (tData && tData.status === "success") {
            const getFatigue = (b2b, in4) => {
                if (b2b) return `<span class="text-red-500 bg-red-500/10 px-2 py-1 rounded text-[8px] font-black"><i class="fas fa-battery-empty mr-1"></i>B2B</span>`;
                if (in4) return `<span class="text-orange-500 bg-orange-500/10 px-2 py-1 rounded text-[8px] font-black"><i class="fas fa-battery-quarter mr-1"></i>3en4</span>`;
                return `<span class="text-green-400 bg-green-400/10 px-2 py-1 rounded text-[8px] font-black"><i class="fas fa-battery-full mr-1"></i>Repos</span>`;
            };

            html += `
                        <div class="bg-gray-900/80 border border-gray-800 rounded-xl p-5 shadow-lg mb-4">
                            <h4 class="text-white font-black text-[10px] uppercase tracking-widest mb-4 border-b border-gray-800 pb-2"><i class="fas fa-chart-pie text-ice mr-2"></i> Unités Spéciales & Forme</h4>
                            
                            <div class="grid grid-cols-2 gap-4 mb-4">
                                <div class="bg-gray-950 p-3 rounded-xl border border-gray-800 flex flex-col items-center gap-2">
                                    <span class="text-[10px] font-black text-white uppercase">${away}</span>
                                    ${getFatigue(tData.away.b2b, tData.away.in4)}
                                    <div class="w-full flex justify-between text-[9px] mt-1"><span class="text-gray-500">Av. Num:</span><span class="text-white font-bold">${tData.away.pp.toFixed(1)}%</span></div>
                                    <div class="w-full flex justify-between text-[9px]"><span class="text-gray-500">Dés. Num:</span><span class="text-white font-bold">${tData.away.pk.toFixed(1)}%</span></div>
                                </div>
                                <div class="bg-gray-950 p-3 rounded-xl border border-gray-800 flex flex-col items-center gap-2">
                                    <span class="text-[10px] font-black text-white uppercase">${home}</span>
                                    ${getFatigue(tData.home.b2b, tData.home.in4)}
                                    <div class="w-full flex justify-between text-[9px] mt-1"><span class="text-gray-500">Av. Num:</span><span class="text-white font-bold">${tData.home.pp.toFixed(1)}%</span></div>
                                    <div class="w-full flex justify-between text-[9px]"><span class="text-gray-500">Dés. Num:</span><span class="text-white font-bold">${tData.home.pk.toFixed(1)}%</span></div>
                                </div>
                            </div>
                            <div class="text-[10px] text-gray-300 bg-black/50 p-3 rounded-lg border border-gray-700 leading-relaxed font-bold">
                                <i class="fas fa-magic text-purple-400 mr-1"></i> ${tData.ai_st}
                            </div>
                        </div>
                    `;
        }

        content.innerHTML = html;
    } catch (e) {
        console.error(e);
        content.innerHTML = `<div class="text-red-500 font-bold text-center py-10">Erreur de connexion avec l'Oracle.</div>`;
    }
}

function closeTeamModal() {
    document.getElementById('team-modal').classList.add('hidden');
    document.getElementById('team-modal').classList.remove('flex');
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

// 2. Gestion de la recherche par nom (pour les boutons raccourcis)
window.executePlayerSearchByName = async function (name) {
    document.getElementById('player-search-input').value = name;
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
        // Lance le gros calcul IA en arrière-plan sans bloquer l'utilisateur
        window.silentGlobalScan();

        // NOUVEAU : Chargement du Coffre-Fort (Bankroll) au démarrage
        if (typeof loadBankroll === 'function') {
            loadBankroll();
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
// MOTEUR QUANTITATIF : SMART SCREENER (ANOMALIES) V4
// ==========================================
window.selectedScreenerMatches = new Set();
window.screenerCache = {}; // ⚡ MÉMOIRE TEMPORAIRE (Évite les longs rechargements)
window.screenerLastSelectionStr = "";

// ⚡ 1. FILTRE BLESSURES : MISE À JOUR AUTOMATIQUE EN ARRIÈRE-PLAN
window.updateActivePlayersBackground = async function () {
    try {
        let res = await fetch(`${API_BASE}/active_players_today`);
        let data = await res.json();
        if (data.status === 'success') {
            window.activePlayersToday = new Set(data.active_ids);
        }
    } catch (e) { }
};
window.updateActivePlayersBackground(); // Se lance tout de suite
setInterval(window.updateActivePlayersBackground, 30 * 60 * 1000); // Puis s'actualise toutes les 30 min (100% autonome)

// ⚡ 2. REDIRECTION MAGIQUE VERS "PERFORMANCES"
window.jumpToPlayerScouting = function (playerName) {
    let tabBtn = document.querySelector('button[onclick*="tab-performances"]');
    if (tabBtn) tabBtn.click();
    window.scrollTo({ top: 0, behavior: 'smooth' });
    setTimeout(() => {
        if (typeof executePlayerSearchByName === 'function') {
            executePlayerSearchByName(playerName);
        }
    }, 400); // Petit délai pour laisser l'onglet s'ouvrir en douceur
};

// Gestion du sélecteur de matchs
window.updateScreenerMatchSelector = function () {
    let container = document.getElementById('screener-match-selector');
    if (!container) return;
    container.innerHTML = '';

    let now = new Date();
    // ⚡ FILTRE 24H : On ne garde que les matchs qui ont lieu dans les 24 prochaines heures (ou en cours)
    let activeMatches = (window.fetchedMatchesPool || []).filter(m => {
        if (['FINAL', 'OFF'].includes(m.state)) return false;

        let matchDate = new Date(m.date);
        let hoursDiff = (matchDate - now) / (1000 * 60 * 60);

        // Matchs entre -6h (en cours) et +24h (nuit prochaine)
        return hoursDiff >= -6 && hoursDiff <= 24;
    });

    if (activeMatches.length === 0) {
        container.innerHTML = '<span class="text-[10px] text-gray-500 italic font-bold py-2">Aucun match programmé dans les 24 prochaines heures.</span>';
        return;
    }

    activeMatches.forEach(m => {
        let matchStr = `${m.home_team} vs ${m.away_team}`;
        let isSelected = window.selectedScreenerMatches.has(matchStr);
        let btn = document.createElement('button');
        btn.className = isSelected
            ? "bg-yellow-500 text-black px-3 py-1.5 rounded text-[10px] font-black uppercase tracking-widest shadow-[0_0_10px_rgba(234,179,8,0.4)] transition"
            : "bg-black text-gray-400 hover:text-white px-3 py-1.5 rounded text-[10px] font-bold uppercase tracking-widest border border-gray-700 transition";
        btn.innerText = matchStr;
        btn.onclick = () => {
            if (isSelected) window.selectedScreenerMatches.delete(matchStr);
            else window.selectedScreenerMatches.add(matchStr);
            window.screenerCache = {}; // 🧹 Si l'utilisateur change de match, on vide la mémoire
            window.updateScreenerMatchSelector();
        };
        container.appendChild(btn);
    });
};

window.selectAllScreenerMatches = function () {
    let now = new Date();
    (window.fetchedMatchesPool || []).forEach(m => {
        if (!['FINAL', 'OFF'].includes(m.state)) {
            let matchDate = new Date(m.date);
            let hoursDiff = (matchDate - now) / (1000 * 60 * 60);

            // On ne sélectionne QUE les matchs des 24 prochaines heures
            if (hoursDiff >= -6 && hoursDiff <= 24) {
                window.selectedScreenerMatches.add(`${m.home_team} vs ${m.away_team}`);
            }
        }
    });
    window.screenerCache = {};
    window.updateScreenerMatchSelector();
};

window.deselectAllScreenerMatches = function () { window.selectedScreenerMatches.clear(); window.screenerCache = {}; window.updateScreenerMatchSelector(); };

let screenerTabBtn = document.querySelector('button[onclick*="tab-filtres"]');
if (screenerTabBtn) { screenerTabBtn.addEventListener('click', () => { window.updateScreenerMatchSelector(); }); }


// ⚡ 3. LE CERVEAU D'ANALYSE
window.runScreener = async function (mode) {
    if (window.selectedScreenerMatches.size === 0) {
        alert("Action requise : Veuillez sélectionner au moins un match dans la liste ci-dessus.");
        return;
    }

    document.getElementById('screener-home').classList.add('hidden');
    const resContainer = document.getElementById('screener-results');
    resContainer.classList.remove('hidden');
    resContainer.classList.add('flex');

    // VÉRIFICATION DE LA MÉMOIRE CACHE (Chargement instantané)
    let currentSelectionStr = Array.from(window.selectedScreenerMatches).sort().join('|');
    if (window.screenerLastSelectionStr !== currentSelectionStr) {
        window.screenerCache = {};
        window.screenerLastSelectionStr = currentSelectionStr;
    }

    if (window.screenerCache[mode]) {
        resContainer.innerHTML = window.screenerCache[mode]; // Boom ! Affichage instantané.
        return;
    }

    // Animation de chargement
    resContainer.innerHTML = `<div class="text-center py-20 md:py-32"><i class="fas fa-microchip fa-spin text-4xl md:text-5xl text-yellow-500 mb-6 drop-shadow-[0_0_15px_#EAB308]"></i><p class="text-yellow-400 font-black uppercase tracking-widest text-[10px] md:text-xs animate-pulse">L'IA compile les anomalies du marché...</p></div>`;

    // SÉCURITÉ : Vérification de la présence de la base de données
    if (!window.activePlayersToday) await window.updateActivePlayersBackground();
    if (!window.globalPredictionsPool || window.globalPredictionsPool.length === 0) {
        try {
            let res = await fetch(`${API_BASE}/predict_all`);
            let data = await res.json();
            window.globalPredictionsPool = data.global_predictions || [];
        } catch (e) { window.globalPredictionsPool = []; }
    }

    // CROISEMENT : On ne garde que les joueurs Actifs (pas blessés) des Matchs Sélectionnés
    let safePool = window.globalPredictionsPool.filter(p => {
        if (window.activePlayersToday && !window.activePlayersToday.has(p.id)) return false;
        let matchStr = Array.from(window.selectedScreenerMatches).find(m => m.includes(p.team));
        return !!matchStr;
    });

    let html = `
        <button onclick="closeScreener()" class="bg-gray-800 hover:bg-gray-700 text-white px-4 py-2 rounded-lg text-[10px] md:text-xs font-black uppercase tracking-widest transition border border-gray-600 flex items-center justify-center md:justify-start gap-2 shadow-lg w-full md:w-max mb-4">
            <i class="fas fa-arrow-left text-yellow-500"></i> Retour au Scanner
        </button>
    `;

    // ----------------------------------------------------
    // ALGORITHME 1: DUE FACTOR (RÉGRESSION POSITIVE)
    // ----------------------------------------------------
    if (mode === 'due_factor') {
        let pool = safePool.filter(p => p.position !== 'G' && p.last_5_games && p.last_5_games.length > 0);
        let duePlayers = [];

        pool.forEach(p => {
            let recentGoals = p.last_5_games.reduce((sum, g) => sum + g.goals, 0);
            let recentShots = p.last_5_games.reduce((sum, g) => sum + g.shots, 0);
            let lastGame = p.last_5_games[p.last_5_games.length - 1];

            if (recentGoals <= 2 && recentShots >= 12) {
                p._score = recentShots - (recentGoals * 10);
                p._lastGameInfo = lastGame;
                p._goalsL5 = recentGoals;
                duePlayers.push(p);
            }
        });

        duePlayers.sort((a, b) => b._score - a._score);
        duePlayers = duePlayers.slice(0, 12);

        html += `<div class="bg-gray-900 border border-ice p-4 md:p-6 rounded-xl shadow-[0_0_20px_rgba(0,229,255,0.15)] w-full overflow-hidden">`;
        html += `<h3 class="text-lg md:text-2xl font-black text-white uppercase tracking-widest border-b border-gray-800 pb-3 mb-6"><i class="fas fa-snowflake text-ice mr-2"></i> Régression Positive</h3>`;

        if (duePlayers.length === 0) {
            html += `<div class="bg-black/50 border border-gray-800 p-6 rounded-lg text-center text-gray-500 font-bold italic text-xs md:text-sm">Aucune anomalie mathématique détectée dans les matchs sélectionnés.</div>`;
        } else {
            html += `<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 w-full">`;
            duePlayers.forEach(p => {
                let recentShots = p.last_5_games.reduce((sum, g) => sum + g.shots, 0);
                let avgShots = (recentShots / p.last_5_games.length).toFixed(1);
                let lg = p._lastGameInfo;
                let lgToi = lg && lg.toi ? lg.toi : "N/A";

                html += `
                    <div class="bg-gray-950 border border-ice/30 hover:border-ice rounded-xl p-4 md:p-5 relative shadow-inner group transition cursor-pointer flex flex-col items-center w-full" onclick="window.jumpToPlayerScouting('${p.name.replace(/'/g, "\\'")}')">
                        <div class="absolute -right-2 -top-2 bg-ice text-black font-black text-[9px] px-2 py-1 rounded tracking-widest shadow-[0_0_10px_#00e5ff] animate-pulse z-10">ALERTE</div>
                        <img src="https://assets.nhle.com/mugs/nhl/latest/${p.id}.png" onerror="this.src='assets/logo_hockAI.png'" class="w-16 h-16 md:w-20 md:h-20 rounded-full border-2 border-ice mb-3 object-cover bg-gray-900 shadow-lg group-hover:scale-110 transition relative z-0">
                        <h4 class="text-white font-black uppercase text-sm md:text-base w-full text-center truncate relative z-10">${p.name}</h4>
                        <div class="text-[9px] md:text-[10px] text-gray-500 uppercase tracking-widest mb-4 relative z-10 text-center">${p.team} • ${p.position}</div>
                        
                        <div class="bg-black p-3 rounded-lg border border-gray-800 w-full mt-auto relative z-10 grid grid-cols-2 gap-2 text-center">
                            <div class="border-r border-gray-800">
                                <span class="block text-ice font-black text-sm md:text-base">${avgShots} <span class="text-[8px] text-gray-500">Tirs/m (L5)</span></span>
                                <span class="block text-white font-bold text-[10px] mt-1">${lg ? lg.shots : 0} <span class="text-[8px] text-gray-500">Tirs (Dernier)</span></span>
                                <span class="block text-yellow-500 font-bold text-[9px] mt-1"><i class="fas fa-clock"></i> ${lgToi}</span>
                            </div>
                            <div>
                                <span class="block text-red-500 font-black text-sm md:text-base">${p._goalsL5} <span class="text-[8px] text-gray-500">Buts (L5)</span></span>
                                <span class="block text-white font-bold text-[10px] mt-1">${lg ? lg.goals : 0} <span class="text-[8px] text-gray-500">Buts (Dernier)</span></span>
                            </div>
                        </div>
                    </div>
                `;
            });
            html += `</div></div>`;
        }
    }
    // ----------------------------------------------------
    // ALGORITHME 2: CHASSEUR DE FATIGUE (BACK-TO-BACK)
    // ----------------------------------------------------
    else if (mode === 'fatigue') {
        html += `<div class="bg-gray-900 border border-orange-500 p-4 md:p-6 rounded-xl shadow-[0_0_20px_rgba(249,115,22,0.15)] w-full overflow-hidden">`;
        html += `<h3 class="text-lg md:text-2xl font-black text-white uppercase tracking-widest border-b border-gray-800 pb-3 mb-6"><i class="fas fa-battery-empty text-orange-500 mr-2"></i> Chasseur de Fatigue</h3>`;

        let matches = window.fetchedMatchesPool || [];
        let targetTeams = [];

        for (let m of matches) {
            let matchStr = `${m.home_team} vs ${m.away_team}`;
            if (!window.selectedScreenerMatches.has(matchStr)) continue;

            let dStr = m.date.split('T')[0];
            try {
                let tRes = await fetch(`${API_BASE}/team_comparison/${m.home_team}/${m.away_team}/${dStr}`);
                let tData = await tRes.json();
                if (tData.status === 'success') {
                    if (tData.away.b2b) targetTeams.push({ target: m.home_team, tired: m.away_team, context: 'Domicile' });
                    if (tData.home.b2b) targetTeams.push({ target: m.away_team, tired: m.home_team, context: 'Extérieur' });
                }
            } catch (e) { }
        }

        if (targetTeams.length === 0) {
            html += `<div class="bg-black/50 border border-gray-800 p-6 rounded-lg text-center text-gray-500 font-bold italic text-xs md:text-sm">Aucune équipe en Back-to-Back dans les matchs sélectionnés.</div>`;
        } else {
            html += `<div class="grid grid-cols-1 md:grid-cols-2 gap-6 w-full">`;
            targetTeams.forEach(t => {
                let topPlayers = safePool.filter(p => p.team === t.target).sort((a, b) => b.prob_point - a.prob_point).slice(0, 3);

                // ⚡ SÉCURITÉ : S'il n'y a aucun joueur disponible (tous blessés ou introuvables)
                let playersHtml = topPlayers.length > 0
                    ? topPlayers.map(p => `
                        <div class="flex items-center justify-between bg-black/60 p-2 md:p-3 rounded-lg border border-gray-800 hover:border-orange-500 cursor-pointer transition group" onclick="window.jumpToPlayerScouting('${p.name.replace(/'/g, "\\'")}')">
                            <div class="flex items-center gap-2 md:gap-3"><img src="https://assets.nhle.com/mugs/nhl/latest/${p.id}.png" onerror="this.src='assets/logo_hockAI.png'" class="w-8 h-8 rounded-full object-cover border border-gray-700 group-hover:border-orange-500"><span class="text-white font-bold text-xs md:text-sm uppercase">${p.name}</span></div>
                            <span class="text-green-400 font-black text-[10px] md:text-xs bg-green-400/10 px-2 py-1 rounded">${(p.prob_point || 0).toFixed(0)}% Point</span>
                        </div>
                    `).join('')
                    : `<div class="text-gray-500 font-bold italic text-[10px] text-center p-3 bg-black/40 rounded-lg border border-gray-800">Aucun sniper IA valide (Joueurs incertains ou absents ce soir).</div>`;

                html += `
                    <div class="bg-gray-950 border border-orange-500/30 rounded-xl p-4 md:p-5 shadow-inner w-full">
                        <div class="flex flex-col sm:flex-row justify-between items-center mb-5 border-b border-gray-800 pb-4 gap-4">
                            <div class="text-center sm:text-left"><span class="text-[9px] text-green-400 uppercase tracking-widest font-black block mb-1">Cible Confirmée</span><span class="text-xl md:text-2xl font-black text-white">${t.target}</span></div>
                            <div class="text-center sm:text-right"><span class="text-[9px] text-gray-500 uppercase tracking-widest block mb-1">Adversaire Épuisé</span><span class="text-red-500 font-black text-lg md:text-xl drop-shadow-[0_0_5px_#ff3333]">${t.tired} <span class="text-[10px] ml-1">(B2B)</span></span></div>
                        </div>
                        <div class="text-[10px] text-orange-400 uppercase tracking-widest mb-3 font-bold"><i class="fas fa-crosshairs mr-1"></i> Top Snipers :</div>
                        <div class="space-y-2">${playersHtml}</div>
                    </div>
                 `;
            });
            html += `</div>`;
        }
        html += `</div>`;
    }
    // ----------------------------------------------------
    // ALGORITHME 3: MISMATCH PP vs PK (UNITÉS SPÉCIALES)
    // ----------------------------------------------------
    else if (mode === 'mismatch') {
        html += `<div class="bg-gray-900 border border-purple-500 p-4 md:p-6 rounded-xl shadow-[0_0_20px_rgba(168,85,247,0.15)] w-full overflow-hidden">`;
        html += `<h3 class="text-lg md:text-2xl font-black text-white uppercase tracking-widest border-b border-gray-800 pb-3 mb-6"><i class="fas fa-bolt text-purple-500 mr-2"></i> Bain de sang (PP vs PK)</h3>`;

        let matches = window.fetchedMatchesPool || [];
        let mismatchTeams = [];

        for (let m of matches) {
            let matchStr = `${m.home_team} vs ${m.away_team}`;
            if (!window.selectedScreenerMatches.has(matchStr)) continue;

            let dStr = m.date.split('T')[0];
            try {
                let tRes = await fetch(`${API_BASE}/team_comparison/${m.home_team}/${m.away_team}/${dStr}`);
                let tData = await tRes.json();
                if (tData.status === 'success') {
                    if (tData.home.pp > 22 && tData.away.pk < 78) mismatchTeams.push({ target: m.home_team, victim: m.away_team, pp: tData.home.pp, pk: tData.away.pk });
                    if (tData.away.pp > 22 && tData.home.pk < 78) mismatchTeams.push({ target: m.away_team, victim: m.home_team, pp: tData.away.pp, pk: tData.home.pk });
                }
            } catch (e) { }
        }

        if (mismatchTeams.length === 0) {
            html += `<div class="bg-black/50 border border-gray-800 p-6 rounded-lg text-center text-gray-500 font-bold italic text-xs md:text-sm">Aucun déséquilibre majeur repéré dans les matchs sélectionnés.</div>`;
        } else {
            html += `<div class="grid grid-cols-1 md:grid-cols-2 gap-6 w-full">`;
            mismatchTeams.forEach(t => {
                let topPlayers = safePool.filter(p => p.team === t.target).sort((a, b) => b.prob_assist - a.prob_assist).slice(0, 3);

                // ⚡ SÉCURITÉ : Joueurs introuvables / blessés
                let playersHtml = topPlayers.length > 0
                    ? topPlayers.map(p => `
                        <div class="flex items-center justify-between bg-gray-800/50 p-2 md:p-3 rounded-lg border border-gray-700 hover:border-purple-500 cursor-pointer transition group" onclick="window.jumpToPlayerScouting('${p.name.replace(/'/g, "\\'")}')">
                            <div class="flex items-center gap-2 md:gap-3"><img src="https://assets.nhle.com/mugs/nhl/latest/${p.id}.png" onerror="this.src='assets/logo_hockAI.png'" class="w-8 h-8 rounded-full object-cover border border-gray-600 group-hover:border-purple-500"><span class="text-white font-bold text-xs md:text-sm uppercase">${p.name}</span></div>
                            <span class="text-purple-400 font-black text-[9px] md:text-[10px] uppercase bg-purple-500/10 px-2 py-1 rounded">Point PP</span>
                        </div>
                    `).join('')
                    : `<div class="text-gray-500 font-bold italic text-[10px] text-center p-3 bg-black/40 rounded-lg border border-gray-800">Aucun passeur IA valide (Joueurs incertains ou absents).</div>`;

                html += `
                    <div class="bg-gray-950 border border-purple-500/30 rounded-xl p-4 md:p-5 shadow-inner w-full">
                        <div class="flex justify-between items-center mb-5 bg-black p-3 md:p-4 rounded-lg border border-gray-800 shadow-inner">
                            <div class="text-center"><div class="text-xl md:text-3xl font-black text-ice drop-shadow-[0_0_10px_#00e5ff]">${t.pp.toFixed(1)}%</div><div class="text-[8px] md:text-[9px] text-gray-500 uppercase font-bold mt-1">PP ${t.target}</div></div>
                            <div class="text-purple-500 font-black italic text-lg md:text-2xl">VS</div>
                            <div class="text-center"><div class="text-xl md:text-3xl font-black text-blood drop-shadow-[0_0_10px_#ff3333]">${t.pk.toFixed(1)}%</div><div class="text-[8px] md:text-[9px] text-gray-500 uppercase font-bold mt-1">PK ${t.victim}</div></div>
                        </div>
                        <div class="text-[10px] text-purple-400 uppercase tracking-widest mb-3 font-bold"><i class="fas fa-chess-knight mr-1"></i> Quart-arrières (PP1) :</div>
                        <div class="space-y-2">${playersHtml}</div>
                    </div>
                 `;
            });
            html += `</div>`;
        }
        html += `</div>`;
    }
    // ----------------------------------------------------
    // ALGORITHME 4: SHOT VOLUME (PLANCHER SÉCURISÉ)
    // ----------------------------------------------------
    else if (mode === 'shot_volume') {
        let pool = safePool.filter(p => p.position !== 'G' && p.last_5_games && p.last_5_games.length > 0);
        let safePlayers = [];

        pool.forEach(p => {
            let matchesOver2 = 0;
            p.last_5_games.forEach(g => { if (g.shots >= 3) matchesOver2++; });

            if (matchesOver2 >= 4) {
                p._shotRatio = matchesOver2;
                p._avgShots = p.last_5_games.reduce((sum, g) => sum + g.shots, 0) / p.last_5_games.length;
                p._lastGameInfo = p.last_5_games[p.last_5_games.length - 1]; // ⚡ INFOS DU DERNIER MATCH !
                safePlayers.push(p);
            }
        });

        safePlayers.sort((a, b) => b._avgShots - a._avgShots);
        safePlayers = safePlayers.slice(0, 12);

        html += `<div class="bg-gray-900 border border-green-500 p-4 md:p-6 rounded-xl shadow-[0_0_20px_rgba(74,222,128,0.15)] w-full overflow-hidden">`;
        html += `<h3 class="text-lg md:text-2xl font-black text-white uppercase tracking-widest border-b border-gray-800 pb-3 mb-6"><i class="fas fa-bullseye text-green-500 mr-2"></i> Plancher de Tirs (>2.5)</h3>`;

        if (safePlayers.length === 0) {
            html += `<div class="bg-black/50 border border-gray-800 p-6 rounded-lg text-center text-gray-500 font-bold italic text-xs md:text-sm">Aucun Sniper sécurisé trouvé dans les matchs sélectionnés.</div>`;
        } else {
            // ⚡ GRILLE RESPONSIVE MOBILE
            html += `<div class="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 w-full">`;
            safePlayers.forEach(p => {
                let winPct = (p._shotRatio / p.last_5_games.length) * 100;
                let lg = p._lastGameInfo;
                let lgToi = lg && lg.toi ? lg.toi : "N/A"; // Temps de glace

                html += `
                    <div class="bg-gray-950 border border-green-500/30 rounded-xl p-3 md:p-4 relative shadow-inner group hover:border-green-500 transition cursor-pointer text-center flex flex-col items-center w-full" onclick="window.jumpToPlayerScouting('${p.name.replace(/'/g, "\\'")}')">
                        <img src="https://assets.nhle.com/mugs/nhl/latest/${p.id}.png" onerror="this.src='assets/logo_hockAI.png'" class="w-12 h-12 md:w-16 md:h-16 rounded-full border-2 border-green-500 mb-2 md:mb-3 object-cover bg-gray-900 shadow-lg group-hover:scale-110 transition relative z-0">
                        <h4 class="text-white font-black uppercase text-[10px] md:text-xs w-full truncate mb-1 relative z-10">${p.name}</h4>
                        <div class="text-[8px] md:text-[9px] text-gray-500 uppercase tracking-widest mb-2 md:mb-3 relative z-10">${p.team}</div>
                        <div class="bg-black p-2 rounded-lg border border-gray-800 w-full mt-auto relative z-10">
                            <span class="block text-green-400 font-black text-sm md:text-base drop-shadow-[0_0_5px_rgba(74,222,128,0.5)]">${p._avgShots.toFixed(1)} tirs/m <span class="text-[8px] text-gray-500">(L5)</span></span>
                            <span class="block text-white font-bold text-[9px] mt-1"><i class="fas fa-clock text-yellow-500"></i> ${lgToi} <span class="text-gray-500">(Dernier)</span></span>
                            <span class="block text-[8px] text-gray-400 uppercase mt-1 border-t border-gray-800 pt-1">Winrate L5 : <strong class="text-white bg-gray-800 px-1 rounded ml-1">${winPct.toFixed(0)}%</strong></span>
                        </div>
                    </div>
                `;
            });
            html += `</div>`;
        }
        html += `</div>`;
    }

    // ENREGISTREMENT DANS LA MÉMOIRE CACHE
    window.screenerCache[mode] = html;
    resContainer.innerHTML = html;
};

// Fonction pour fermer la page de résultats
window.closeScreener = function () {
    document.getElementById('screener-results').classList.add('hidden');
    document.getElementById('screener-results').classList.remove('flex');
    document.getElementById('screener-home').classList.remove('hidden');
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
// 🔐 MODULE D'AUTHENTIFICATION (FRONTEND)
// =========================================================================
window.currentAuthMode = 'login'; // 'login' ou 'register'

window.openAuthModal = function () {
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

window.switchAuthTab = function (mode) {
    window.currentAuthMode = mode;
    let btnLogin = document.getElementById('tab-btn-login');
    let btnRegister = document.getElementById('tab-btn-register');
    let registerFields = document.getElementById('register-fields');
    let submitBtnText = document.getElementById('auth-submit-btn').querySelector('span');
    let submitBtnIcon = document.getElementById('auth-submit-btn').querySelector('i');
    let forgotLink = document.getElementById('forgot-password-link');

    if (mode === 'login') {
        btnLogin.className = "flex-1 py-4 text-xs font-black uppercase tracking-widest text-purple-400 border-b-2 border-purple-500 bg-gray-900/50 transition";
        btnRegister.className = "flex-1 py-4 text-xs font-black uppercase tracking-widest text-gray-500 hover:text-gray-300 border-b-2 border-transparent transition";
        registerFields.classList.add('hidden');
        document.getElementById('auth-username').removeAttribute('required');
        submitBtnText.innerText = "Se Connecter";
        submitBtnIcon.className = "fas fa-sign-in-alt";
        forgotLink.style.display = "block";
    } else {
        btnRegister.className = "flex-1 py-4 text-xs font-black uppercase tracking-widest text-purple-400 border-b-2 border-purple-500 bg-gray-900/50 transition";
        btnLogin.className = "flex-1 py-4 text-xs font-black uppercase tracking-widest text-gray-500 hover:text-gray-300 border-b-2 border-transparent transition";
        registerFields.classList.remove('hidden');
        document.getElementById('auth-username').setAttribute('required', 'true');
        submitBtnText.innerText = "Créer mon compte";
        submitBtnIcon.className = "fas fa-user-plus";
        forgotLink.style.display = "none";
    }
    document.getElementById('auth-error-msg').classList.add('hidden');
};

window.togglePasswordVisibility = function () {
    let input = document.getElementById('auth-password');
    let icon = document.getElementById('auth-eye-icon');
    if (input.type === "password") {
        input.type = "text";
        icon.classList.remove('fa-eye');
        icon.classList.add('fa-eye-slash');
        icon.classList.add('text-purple-400');
    } else {
        input.type = "password";
        icon.classList.remove('fa-eye-slash');
        icon.classList.add('fa-eye');
        icon.classList.remove('text-purple-400');
    }
};

window.handleAuthSubmit = function (e) {
    e.preventDefault(); // Empêche le rechargement de la page

    let btn = document.getElementById('auth-submit-btn');
    let originalHtml = btn.innerHTML;
    btn.innerHTML = `<i class="fas fa-circle-notch fa-spin"></i> <span>Chiffrement en cours...</span>`;

    // Simulation d'une requête serveur sécurisée (On connectera ça au Python plus tard)
    setTimeout(() => {
        btn.innerHTML = originalHtml;
        let errorMsg = document.getElementById('auth-error-msg');
        errorMsg.classList.remove('hidden');
        errorMsg.innerHTML = `<i class="fas fa-cogs mr-1"></i> Connexion Backend (Python) requise pour la mise en production.`;
    }, 1500);
};

// =========================================================================
// 🚀 GESTION DE L'INSCRIPTION (SÉCURISÉE)
// =========================================================================
const signupForm = document.getElementById('form-signup');

// On vérifie si le formulaire existe sur la page avant d'ajouter l'écouteur
if (signupForm) {
    signupForm.addEventListener('submit', async (e) => {
        e.preventDefault(); // Empêche le rechargement de la page

        const emailInput = document.getElementById('signup-email');
        if (!emailInput) return;

        const email = emailInput.value;
        const btn = e.target.querySelector('button');
        const originalText = btn.innerText;

        // État de chargement
        btn.innerText = "EXPÉDITION...";
        btn.disabled = true;

        try {
            // On utilise le chemin Vercel pour éviter les problèmes de sécurité (CORS)
            const response = await fetch('/backend/signup', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: email })
            });

            const result = await response.json();

            if (result.status === 'success') {
                alert("Génial ! Ton mot de passe est en route vers ton email. 📧");
                emailInput.value = ""; // On vide le champ
            } else {
                alert("Mince, ça n'a pas marché : " + result.message);
            }
        } catch (err) {
            console.error("Erreur Inscription:", err);
            alert("❌ Impossible de joindre le serveur HOCKAI.");
        } finally {
            // On remet le bouton dans son état normal
            btn.innerText = originalText;
            btn.disabled = false;
        }
    });
}

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