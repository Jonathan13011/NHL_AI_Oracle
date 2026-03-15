// =========================================================================
// 🎯 HOCKAI - PLAYER PROPS ENGINE (Analyse Individuelle & Deep Dive V2)
// =========================================================================

window.selectedPropsMatches = new Set();
window.propsZappingMemory = new Set();
window.lockedPropsPlayers = window.lockedPropsPlayers || [];
window.propsSeenPlayers = window.propsSeenPlayers || [];
window.propsRollCycle = window.propsRollCycle || 0;
window.currentModalPlayerProb = window.currentModalPlayerProb || 0;

let propsPlayersPool = [];
let currentPropsPlayerSplitData = null;
let currentPlayerCardData = null;

// 1. Initialisation de la frise des matchs
window.updatePropsMatchSelector = function () {
    let container = document.getElementById('props-match-selector');
    if (!container) return;
    container.innerHTML = '';
    let activeMatches = (window.fetchedMatchesPool || []).filter(m => !['FINAL', 'OFF', 'LIVE', 'CRIT'].includes(m.state));

    if (activeMatches.length === 0) {
        container.innerHTML = '<span class="text-[10px] text-gray-500 italic font-bold">Aucun match disponible.</span>';
        return;
    }

    activeMatches.forEach(m => {
        let matchStr = `${m.home_team} vs ${m.away_team}`;
        let isSelected = window.selectedPropsMatches.has(matchStr);
        let btn = document.createElement('button');
        btn.className = isSelected
            ? "bg-props text-black px-2 py-1 rounded text-[10px] font-black uppercase tracking-widest border border-yellow-400 shadow-[0_0_10px_rgba(234,179,8,0.4)] transition"
            : "bg-gray-900 text-gray-500 hover:text-white px-2 py-1 rounded text-[10px] font-bold uppercase tracking-widest border border-gray-700 transition";
        btn.innerText = matchStr;
        btn.onclick = () => {
            if (isSelected) window.selectedPropsMatches.delete(matchStr);
            else window.selectedPropsMatches.add(matchStr);
            window.updatePropsMatchSelector();
        };
        container.appendChild(btn);
    });
};

window.selectAllPropsMatches = function () {
    (window.fetchedMatchesPool || []).forEach(m => {
        if (!['FINAL', 'OFF', 'LIVE', 'CRIT'].includes(m.state)) window.selectedPropsMatches.add(`${m.home_team} vs ${m.away_team}`);
    });
    window.updatePropsMatchSelector();
};

window.deselectAllPropsMatches = function () {
    window.selectedPropsMatches.clear();
    window.updatePropsMatchSelector();
};

// 2. Les Fonctions de Génération (Boutons HTML)
window.generatePropsTicket = function (isZapping = false) { window.runPropsEngine('classic', isZapping); };
window.generateArchetypeTicket = function (isZapping = false) { window.runPropsEngine('archetype', isZapping); };

// 3. LE CERVEAU CENTRAL
window.runPropsEngine = async function (mode, isZapping) {
    let container = document.getElementById('props-ticket-display');
    if (!container) return;

    container.innerHTML = `<div class="text-center py-12"><i class="fas fa-radar animate-spin-slow text-props text-5xl drop-shadow-[0_0_20px_rgba(234,179,8,0.8)] mb-6"></i><div class="text-sm text-white uppercase tracking-widest font-black">L'IA Quantique croise les données...</div><div class="text-[10px] text-gray-400 font-bold mt-2 uppercase">Recherche d'anomalies de marché en cours.</div></div>`;

    if (!window.globalPredictionsPool || window.globalPredictionsPool.length === 0) {
        try { let res = await fetch(`${API_BASE}/predict_all`); let data = await res.json(); window.globalPredictionsPool = data.global_predictions || []; } catch (e) { }
    }

    if (!window.globalPredictionsPool || window.globalPredictionsPool.length === 0) { container.innerHTML = `<div class="text-blood font-bold text-center py-10">Impossible de joindre l'Oracle.</div>`; return; }
    await new Promise(r => setTimeout(r, 600));

    let typeRaw = document.getElementById('global-props-type').value;
    let risk = document.getElementById('global-props-risk').value;
    let total = parseInt(document.getElementById('slider-props-total').value);
    let maxPerMatch = parseInt(document.getElementById('slider-props-max').value);

    if (!isZapping) window.propsZappingMemory.clear();

    let pool = window.globalPredictionsPool.filter(p => {
        if (p.position === 'G') return false;
        if (window.activePlayersToday && !window.activePlayersToday.has(Number(p.id))) return false;
        if (window.propsZappingMemory.has(p.id)) return false;
        if (window.selectedPropsMatches.size > 0) {
            let isMatchOk = false;
            window.selectedPropsMatches.forEach(mStr => { if (mStr.includes(p.team)) isMatchOk = true; });
            if (!isMatchOk) return false;
        }
        return true;
    });

    let validPlayers = [];
    pool.forEach(p => {
        let prob = typeRaw === 'mixte' ? Math.max(p.prob_goal, p.prob_assist, p.prob_point) : (p[typeRaw] || 0);
        let activeType = typeRaw === 'mixte' ? (p.prob_goal === prob ? 'Buteur' : (p.prob_assist === prob ? 'Passeur' : 'Pointeur')) : (typeRaw === 'prob_goal' ? 'Buteur' : (typeRaw === 'prob_assist' ? 'Passeur' : 'Pointeur'));

        p._propsProb = prob; p._propsType = activeType; p._propsScore = prob; p.is_gem = false;

        if (mode === 'archetype') {
            let toi = p.toi_avg || 15;
            if (toi > 19.0 || prob > 65.0) return;
            let recentShots = p.last_5_games ? p.last_5_games.reduce((s, g) => s + g.shots, 0) : 0;
            let recentGoals = p.last_5_games ? p.last_5_games.reduce((s, g) => s + g.goals, 0) : 0;
            let valueScore = (recentShots * 2) - (recentGoals * 5);
            if (valueScore > 15) { p._propsScore += valueScore; p.is_gem = true; }
            if (p._propsScore > 35) validPlayers.push(p);
        } else {
            if (risk === 'safe') p._propsScore += (p.toi_avg || 0);
            else if (risk === 'poker' && prob > 55) p._propsScore -= 50;
            validPlayers.push(p);
        }

        let exactMatch = (window.fetchedMatchesPool || []).find(m => (m.home_team === p.team || m.away_team === p.team) && m.state !== 'FINAL' && m.state !== 'OFF');
        p._matchStr = exactMatch ? `${exactMatch.home_team} vs ${exactMatch.away_team}` : `Match de ${p.team}`;
    });

    validPlayers.sort((a, b) => b._propsScore - a._propsScore);

    let selected = []; let matchCounts = {};
    for (let p of validPlayers) {
        if (selected.length >= total) break;
        if (!matchCounts[p._matchStr]) matchCounts[p._matchStr] = 0;
        if (matchCounts[p._matchStr] < maxPerMatch) { selected.push(p); matchCounts[p._matchStr]++; window.propsZappingMemory.add(p.id); }
    }

    if (selected.length < total && isZapping) window.propsZappingMemory.clear();
    if (selected.length === 0) { container.innerHTML = `<div class="text-gray-500 font-bold text-center py-10"><i class="fas fa-exclamation-triangle mb-2 text-2xl"></i><br>L'IA ne trouve aucune anomalie. Élargissez les matchs.</div>`; return; }

    let grouped = {}; let totalOdds = 1.0;
    selected.forEach(p => { if (!grouped[p._matchStr]) grouped[p._matchStr] = []; grouped[p._matchStr].push(p); });

    let titleStr = mode === 'archetype' ? 'CASTING PARFAIT (Pépites IA)' : 'TICKET CLASSIQUE IA';
    let titleColor = mode === 'archetype' ? 'text-purple-400' : 'text-props';
    let titleBorder = mode === 'archetype' ? 'border-purple-500/50' : 'border-props/50';

    let html = `
        <div class="flex justify-between items-center bg-gray-950 border ${titleBorder} p-4 rounded-xl mb-4 shadow-inner" id="props-export-zone-header">
            <span class="${titleColor} font-black uppercase tracking-widest text-xs md:text-sm flex items-center gap-2">
                <i class="${mode === 'archetype' ? 'fas fa-theater-masks' : 'fas fa-ticket-alt'}"></i> ${titleStr}
            </span>
            <button onclick="${mode === 'archetype' ? 'window.generateArchetypeTicket(true)' : 'window.generatePropsTicket(true)'}" class="bg-gray-900 hover:bg-white hover:text-black text-[10px] md:text-xs px-4 py-2 rounded-lg font-black uppercase tracking-widest transition border border-gray-700 shadow-lg flex items-center gap-2">
                <i class="fas fa-random text-props"></i> Zapping
            </button>
        </div>
        <div id="props-export-zone" class="bg-black/50 p-2 rounded-xl relative">
    `;

    Object.keys(grouped).forEach(matchStr => {
        html += `
            <div class="bg-gray-900/40 border border-gray-800 rounded-xl mb-4 shadow-[0_0_15px_rgba(0,0,0,0.3)] overflow-hidden relative">
                <div class="absolute left-0 top-0 w-1 h-full ${mode === 'archetype' ? 'bg-purple-500' : 'bg-props'}"></div>
                <div class="bg-black/50 p-2.5 border-b border-gray-800 text-[10px] md:text-xs font-black text-gray-400 uppercase tracking-widest flex items-center gap-2 px-4">
                    <i class="fas fa-hockey-puck ${mode === 'archetype' ? 'text-purple-400' : 'text-props'}"></i> MATCH : <span class="text-white">${matchStr}</span>
                </div>
                <div class="p-3 flex flex-col gap-2">
        `;

        grouped[matchStr].forEach(p => {
            let probTextCol = p._propsProb >= 50 ? 'text-green-400 drop-shadow-[0_0_5px_#4ADE80]' : 'text-gray-300';
            let itemOdds = p.odds ? parseFloat(p.odds) : Math.max(1.10, 0.93 / (p._propsProb / 100));
            totalOdds *= itemOdds;

            let gemBadge = p.is_gem ? `<div class="bg-purple-500/20 text-purple-400 border border-purple-500 px-1.5 py-0.5 rounded text-[8px] uppercase font-black tracking-widest text-center mt-1 w-max"><i class="fas fa-gem animate-pulse"></i> Pépite Sous les Radars</div>` : '';
            let modalData = { id: p.id, name: p.name, team: p.team, prob: p._propsProb, type: p._propsType };
            let safeJson = encodeURIComponent(JSON.stringify(modalData)).replace(/'/g, "%27");

            html += `
                <div class="flex items-center justify-between bg-gray-950/80 p-3 rounded-lg border border-gray-800/80 hover:border-props transition cursor-pointer group" onclick="if(window.openSmartTicketModal) window.openSmartTicketModal('${safeJson}')">
                    <div class="flex items-center gap-3">
                        <img src="${p.headshot || 'assets/logo_hockAI.png'}" class="w-10 h-10 md:w-12 md:h-12 rounded-full border border-gray-700 bg-gray-900 group-hover:scale-110 transition object-cover">
                        <div>
                            <div class="font-black text-white text-sm md:text-base uppercase tracking-widest leading-none flex items-center flex-wrap gap-2">
                                ${p.name} 
                                <button onclick="event.stopPropagation(); if(window.jumpToPlayerScouting) window.jumpToPlayerScouting('${p.name.replace(/'/g, "\\'")}')" class="bg-gray-800 hover:bg-green-500 hover:text-black border border-gray-600 hover:border-green-500 text-gray-400 px-2 py-1 rounded text-[8px] md:text-[9px] transition-all shadow-lg flex items-center gap-1 z-50"><i class="fas fa-chart-line"></i> <span class="hidden md:inline">Scouting</span></button>
                            </div>
                            <div class="text-[9px] md:text-[10px] text-gray-500 font-bold tracking-widest mt-1"><span class="${mode === 'archetype' ? 'text-purple-400' : 'text-props'}">${p.team}</span> • ${p.position}</div>
                            ${gemBadge}
                        </div>
                    </div>
                    <div class="text-right">
                        <div class="text-[8px] md:text-[10px] text-gray-500 uppercase font-black tracking-widest mb-1">${p._propsType}</div>
                        <div class="font-black text-lg md:text-xl ${probTextCol}">${p._propsProb.toFixed(1)}% <span class="text-gray-400 text-sm ml-1 font-bold">(@${itemOdds.toFixed(2)})</span></div>
                    </div>
                </div>
            `;
        });
        html += `</div></div>`;
    });

    html += `
        <div class="mt-4 bg-gray-900 border border-gray-800 rounded-xl p-4 flex flex-col md:flex-row justify-between items-center gap-4 shadow-[0_0_20px_rgba(0,0,0,0.5)]">
            <div class="flex flex-col items-center md:items-start w-full md:w-auto text-center md:text-left">
                <div class="text-[10px] text-gray-500 uppercase tracking-widest font-bold mb-1">Cote Totale</div>
                <div class="text-3xl font-black ${mode === 'archetype' ? 'text-purple-400 drop-shadow-[0_0_10px_rgba(168,85,247,0.5)]' : 'text-props drop-shadow-[0_0_10px_rgba(234,179,8,0.5)]'}">@${totalOdds.toFixed(2)}</div>
            </div>
            <div class="ticket-actions flex flex-col sm:flex-row items-center gap-3 w-full md:w-auto">
                <button onclick="window.exportPropsTicketImage()" class="w-full sm:w-auto bg-gray-800 hover:bg-gray-700 text-white px-5 py-3 rounded-lg font-black text-xs uppercase tracking-widest transition shadow-lg border border-gray-600 flex items-center justify-center gap-2"><i class="fas fa-camera text-lg"></i> Exporter</button>
                <div class="flex items-center gap-2 bg-black border border-gray-700 p-1.5 rounded-lg w-full sm:w-auto">
                    <input type="number" id="quick-props-stake" placeholder="Mise (€)" value="10" class="w-24 bg-gray-900 border border-gray-800 text-white text-xs font-bold text-center rounded px-2 py-2.5 outline-none focus:border-money shadow-inner">
                    <button onclick="window.addBetToBankroll('PROPS IA', '${titleStr} (${selected.length} Sél.)', ${totalOdds.toFixed(2)}, document.getElementById('quick-props-stake').value || 10)" class="w-full sm:w-auto bg-money/20 hover:bg-money text-money hover:text-black border border-money px-5 py-2.5 rounded text-xs font-black uppercase tracking-widest transition flex items-center justify-center gap-2"><i class="fas fa-save text-lg"></i> Encaisser</button>
                </div>
            </div>
        </div>
        </div>
    `;
    container.innerHTML = html;
};

// 4. Export Photo
window.exportPropsTicketImage = async function () {
    if (typeof html2canvas === 'undefined') return;
    let ticketContainer = document.getElementById('props-export-zone'); if (!ticketContainer) return;
    let actionDiv = ticketContainer.querySelector('.ticket-actions'); if (actionDiv) actionDiv.style.display = 'none';

    let watermark = document.createElement('div');
    watermark.innerHTML = '<span style="color:#EAB308; font-weight:900; font-size:12px; letter-spacing: 2px;">⚡ HOCKAI PROPS ENGINE</span>';
    watermark.style.position = 'absolute'; watermark.style.bottom = '15px'; watermark.style.right = '20px'; watermark.style.zIndex = '50'; watermark.id = 'temp-watermark';
    ticketContainer.appendChild(watermark);

    html2canvas(ticketContainer, { backgroundColor: '#0a0f1a', scale: 2, useCORS: true, logging: false }).then(canvas => {
        if (actionDiv) actionDiv.style.display = ''; let wm = document.getElementById('temp-watermark'); if (wm) wm.remove();
        let link = document.createElement('a'); link.download = 'HOCKAI_Props_Ticket.png'; link.href = canvas.toDataURL('image/png'); link.click();
    });
};

// 5. GESTION DU MODAL EV
window.openSmartReasonModal = function (playerDataStr, propTypeStr) {
    let p = JSON.parse(decodeURIComponent(playerDataStr));
    document.getElementById('sr-player-name').innerText = p.name;
    document.getElementById('sr-player-img').src = p.headshot ? p.headshot : (p.id ? `https://assets.nhle.com/mugs/nhl/latest/ext/${p.id}.png` : "assets/logo_hockAI.png");

    let matchTimeFull = "Heure Inconnue";
    if (p.exact_match_date) {
        let d = new Date(p.exact_match_date);
        matchTimeFull = `${d.toLocaleDateString('fr-FR', { weekday: 'short', day: '2-digit', month: 'short' }).toUpperCase()} - ${d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`;
    }
    document.getElementById('sr-match-info').innerText = `${p.team} • ${matchTimeFull} ${p.is_home ? '(DOM)' : '(EXT)'}`;

    let typeName = propTypeStr === 'prob_goal' ? 'BUT' : (propTypeStr === 'prob_assist' ? 'PASSE' : 'POINT');
    document.getElementById('sr-market-type').innerText = `+ DE 0.5 ${typeName}`;

    window.currentModalPlayerProb = p[propTypeStr] || p.best_prop_val || 0;
    document.getElementById('sr-market-prob').innerText = window.currentModalPlayerProb.toFixed(1) + "%";

    document.getElementById('ev-odds-input').value = '';
    document.getElementById('ev-result-display').innerHTML = '<span class="text-gray-500 text-[10px] uppercase font-bold tracking-widest"><i class="fas fa-keyboard animate-pulse"></i> Saisissez la cote</span>';

    let reasonsHtml = "";
    if (p.calc_base >= 15.0) reasonsHtml += `<li class="flex items-start gap-3"><i class="fas fa-robot text-blue-400 mt-1"></i> <span>Le réseau de neurones détecte une probabilité puissante <b>(${p.calc_base.toFixed(1)}%)</b>.</span></li>`;
    if (p.calc_goals >= 3.0) reasonsHtml += `<li class="flex items-start gap-3"><i class="fas fa-fire text-blood mt-1"></i> <span><b>Hot Streak :</b> Joueur en feu absolue (L5).</span></li>`;
    if (p.calc_shots >= 4.0) reasonsHtml += `<li class="flex items-start gap-3"><i class="fas fa-crosshairs text-orange-500 mt-1"></i> <span><b>Volume offensif :</b> But imminent.</span></li>`;
    if (p.calc_toi >= 14.0) reasonsHtml += `<li class="flex items-start gap-3"><i class="fas fa-stopwatch text-cyan-400 mt-1"></i> <span><b>Usage Élite :</b> Très fort temps de glace.</span></li>`;
    if (reasonsHtml === "") reasonsHtml = `<li class="flex items-start gap-3"><i class="fas fa-check-circle text-green-400 mt-1"></i> <span>Value Bet validé par l'IA.</span></li>`;

    document.getElementById('sr-reasons-list').innerHTML = reasonsHtml;
    document.getElementById('smart-reason-modal').classList.remove('hidden'); document.getElementById('smart-reason-modal').classList.add('flex');
};

window.closeSmartReasonModal = function () { document.getElementById('smart-reason-modal').classList.add('hidden'); document.getElementById('smart-reason-modal').classList.remove('flex'); };

window.calculateRealTimeEV = function () {
    let odds = parseFloat(document.getElementById('ev-odds-input').value.replace(',', '.'));
    let evResult = document.getElementById('ev-result-display');
    if (isNaN(odds) || odds <= 1.0) { evResult.innerHTML = '<span class="text-gray-500 text-[10px] uppercase font-bold tracking-widest"><i class="fas fa-keyboard animate-pulse"></i> Saisissez la cote</span>'; return; }
    let ev = ((window.currentModalPlayerProb / 100) * odds) - 1; let evPct = (ev * 100).toFixed(2);
    if (ev > 0) evResult.innerHTML = `<div class="text-green-400 font-black text-2xl drop-shadow-[0_0_5px_rgba(74,222,128,0.5)]">+${evPct}% EV</div><div class="text-[9px] text-green-500 uppercase font-black tracking-widest mt-1"><i class="fas fa-check-circle"></i> Value Bet IA</div>`;
    else evResult.innerHTML = `<div class="text-blood font-black text-2xl drop-shadow-[0_0_5px_rgba(255,51,51,0.5)]">${evPct}% EV</div><div class="text-[9px] text-red-500 uppercase font-black tracking-widest mt-1"><i class="fas fa-times-circle"></i> Pari Perdant (LT)</div>`;
};

// 6. MODULE : DEEP DIVE V2 (Audit Réel)
window.showPropsMatches = function() {
    document.getElementById('props-matches-container').classList.remove('hidden'); document.getElementById('props-dashboard').classList.add('hidden');
    document.getElementById('props-dashboard').classList.remove('flex'); document.getElementById('btn-back-props').classList.add('hidden');
};

window.openPropsMatch = async function(gameId, home, away, date) {
    document.getElementById('props-matches-container').classList.add('hidden'); document.getElementById('props-dashboard').classList.remove('hidden');
    document.getElementById('props-dashboard').classList.add('flex'); document.getElementById('btn-back-props').classList.remove('hidden');
    document.getElementById('props-match-title').innerText = `${home} VS ${away}`;
    if(typeof showFullScreenLoader === 'function') showFullScreenLoader("Empire des Tirs", "L'IA calcule les lignes via la Loi de Poisson...", false);
    try {
        const res = await fetch(`${API_BASE}/props/${gameId}/${home}/${away}/${date.split('T')[0]}`);
        const data = await res.json();
        if (data.status === "error") {
            document.getElementById('props-players-grid').innerHTML = `<div class="col-span-full text-center text-blood font-black py-10 bg-gray-900 rounded-lg shadow-inner"><i class="fas fa-exclamation-triangle mr-2 text-2xl mb-2 block"></i>${data.message}</div>`;
            if(typeof hideFullScreenLoader === 'function') hideFullScreenLoader(); return;
        }
        propsPlayersPool = data.props || [];
        window.renderPropsGrid();
        if(typeof hideFullScreenLoader === 'function') hideFullScreenLoader();
    } catch (e) { document.getElementById('props-players-grid').innerHTML = `<div class="col-span-full text-center text-blood font-black py-10 bg-gray-900 rounded-lg">Erreur de connexion.</div>`; if(typeof hideFullScreenLoader === 'function') hideFullScreenLoader(); }
};

window.renderPropsGrid = function() {
    const grid = document.getElementById('props-players-grid'); grid.innerHTML = '';
    const propType = document.getElementById('props-type-select').value;
    if (!propsPlayersPool || propsPlayersPool.length === 0) { grid.innerHTML = `<div class="col-span-full text-center text-gray-500 font-bold py-10 bg-gray-900 rounded-lg">Aucun joueur ne remplit les critères.</div>`; return; }
    let sortedPlayers = [...propsPlayersPool].sort((a, b) => b[propType] - a[propType]);
    let typeName = propType === 'prob_goal' ? 'But' : (propType === 'prob_assist' ? 'Passe' : 'Point');
    let colorClass = propType === 'prob_goal' ? 'text-blood' : (propType === 'prob_assist' ? 'text-white' : 'text-ice');
    let borderClass = propType === 'prob_goal' ? 'border-blood' : (propType === 'prob_assist' ? 'border-white' : 'border-ice');

    sortedPlayers.slice(0, 21).forEach((p, index) => {
        if (p[propType] <= 0) return;
        const safeJson = encodeURIComponent(JSON.stringify(p)).replace(/'/g, "%27");
        grid.innerHTML += `
            <div onclick="openPropsDeepDive('${safeJson}')" class="glass-panel p-5 border-l-4 ${borderClass} hover:scale-[1.02] transition-transform flex justify-between items-center group cursor-pointer shadow-lg">
                <div class="flex items-center gap-4 w-2/3"><div class="text-xl font-black text-gray-700 w-6">#${index + 1}</div><div class="overflow-hidden"><h4 class="text-lg font-black text-white truncate w-full group-hover:${colorClass} transition">${p.name}</h4><span class="text-[10px] text-gray-500 uppercase tracking-widest">${p.team} • ${p.position}</span></div></div>
                <div class="text-right w-1/3"><div class="text-[10px] text-gray-400 uppercase tracking-widest mb-1">Over 0.5 ${typeName}</div><div class="text-3xl font-black ${colorClass}">${p[propType].toFixed(1)}%</div><div class="text-[10px] text-props mt-1 uppercase tracking-widest opacity-0 group-hover:opacity-100 transition"><i class="fas fa-search-plus mr-1"></i> Audit Réel</div></div>
            </div>`;
    });
};

window.openPropsDeepDive = async function(playerJson) {
    currentPlayerCardData = JSON.parse(decodeURIComponent(playerJson));
    if(typeof showFullScreenLoader === 'function') showFullScreenLoader("Audit du Joueur", "Extraction des statistiques...", false);
    try {
        const res = await fetch(`${API_BASE}/player_full_stats/${currentPlayerCardData.id}/${currentPlayerCardData.team}`);
        const data = await res.json();
        if(typeof hideFullScreenLoader === 'function') hideFullScreenLoader();
        if (data.status === "error") { alert(data.message); return; }
        currentPropsPlayerSplitData = data;
        document.getElementById('pd-name').innerText = currentPlayerCardData.name; document.getElementById('pd-team').innerText = currentPlayerCardData.team; document.getElementById('pd-pos').innerText = currentPlayerCardData.position; document.getElementById('pd-headshot').src = currentPlayerCardData.headshot;
        document.getElementById('pd-prob-goal').innerText = currentPlayerCardData.prob_goal.toFixed(1) + "%"; document.getElementById('pd-prob-assist').innerText = currentPlayerCardData.prob_assist.toFixed(1) + "%"; document.getElementById('pd-prob-point').innerText = currentPlayerCardData.prob_point.toFixed(1) + "%";
        document.getElementById('props-detail-modal').classList.remove('hidden'); document.getElementById('props-detail-modal').classList.add('flex');
        
        if (data.ai_insights) {
            const reg = data.ai_insights;
            document.getElementById('pd-reg-status').innerText = reg.regression_status; document.getElementById('pd-reg-status').className = `text-lg font-black leading-none mb-2 ${reg.regression_color}`; document.getElementById('pd-reg-desc').innerHTML = reg.regression_desc;
            document.getElementById('pd-matchup-status').innerText = reg.matchup_pos; document.getElementById('pd-matchup-status').className = `text-lg font-black leading-none mb-2 ${reg.matchup_color}`; document.getElementById('pd-matchup-desc').innerHTML = reg.matchup_desc;
        }
        window.loadPropsSplit('L5');
    } catch (e) { if(typeof hideFullScreenLoader === 'function') hideFullScreenLoader(); }
};

window.loadPropsSplit = function(splitType) {
    ['L5', 'L10', 'Season'].forEach(id => document.getElementById(`btn-split-${id}`).classList.remove('active'));
    document.getElementById(`btn-split-${splitType}`).classList.add('active');
    const stats = currentPropsPlayerSplitData[splitType];

    if (!stats) {
        document.getElementById('pd-stat-games').innerText = "0"; document.getElementById('pd-stat-goals').innerText = "0"; document.getElementById('pd-stat-assists').innerText = "0"; document.getElementById('pd-stat-points').innerText = "0";
        return;
    }
    document.getElementById('pd-stat-games').innerText = stats.games; document.getElementById('pd-stat-goals').innerText = stats.goals; document.getElementById('pd-stat-assists').innerText = stats.assists; document.getElementById('pd-stat-points').innerText = stats.points;
    document.getElementById('pd-stat-pts60').innerText = stats.pts_60; document.getElementById('pd-stat-ppp').innerText = stats.ppp; document.getElementById('pd-stat-shotpct').innerText = stats.shot_pct; document.getElementById('pd-stat-toi').innerText = stats.toi_avg;
    
    if (document.getElementById('pd-stat-sog')) document.getElementById('pd-stat-sog').innerText = stats.shots;
    if (document.getElementById('pd-stat-trend')) {
        const trendEl = document.getElementById('pd-stat-trend'); trendEl.innerText = stats.toi_trend;
        if (stats.toi_trend.includes('Hausse')) trendEl.className = "text-xl font-black mt-2 text-green-400 drop-shadow-[0_0_5px_#4ADE80]";
        else if (stats.toi_trend.includes('Baisse')) trendEl.className = "text-xl font-black mt-2 text-blood drop-shadow-[0_0_5px_#ff3333]";
        else trendEl.className = "text-xl font-black mt-2 text-gray-400";
    }
};

window.toggleSatAnalysis = function() {
    const div = document.getElementById('pd-sat-analysis'); const icon = document.getElementById('pd-sat-icon');
    if (div.classList.contains('hidden')) { div.classList.remove('hidden'); icon.style.transform = 'rotate(180deg)'; } 
    else { div.classList.add('hidden'); icon.style.transform = 'rotate(0deg)'; }
};

let propsTabBtn = document.querySelector('button[onclick*="tab-props"]');
if (propsTabBtn) propsTabBtn.addEventListener('click', () => { window.updatePropsMatchSelector(); });