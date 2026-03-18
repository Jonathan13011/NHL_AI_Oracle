// =========================================================================
// 🧠 HOCKAI - SMART TICKETS ENGINE (Tickets Fiables, Montante, Couverture)
// =========================================================================
window.activePlayersToday = null;
window.selectedTicketMatches = new Set();
window.ticketCacheMemory = "";
window.globalMatchContexts = {};
window.currentTicketPlayers = [];
window.bannedZappingPlayers = new Set();
window.lastTicketConfig = { type: null, total: null, matchStr: null, risk: null };
window.usedPlayersForTickets = new Set();

// 1. Initialisation silencieuse des joueurs actifs (Anti-Blessures)
window.loadActivePlayers = async function () {
    try {
        let res = await fetch(`${API_BASE}/active_players_today`);
        let data = await res.json();
        if (data.status === 'success') {
            window.activePlayersToday = new Set(data.active_ids);
        }
    } catch (e) { console.warn("Filtre blessures hors ligne."); }
};
setTimeout(window.loadActivePlayers, 1500);

// 2. Gestion des Matchs Sélectionnés
window.updateTicketMatchSelector = function () {
    let container = document.getElementById('ticket-match-selector');
    if (!container) return;
    container.innerHTML = '';

    let now = new Date();
    let activeMatches = (window.fetchedMatchesPool || []).filter(m => {
        if (m.state === 'FINAL' || m.state === 'OFF') return false;
        let matchDate = new Date(m.date);
        let hoursDiff = (matchDate - now) / (1000 * 60 * 60);
        return hoursDiff >= -6 && hoursDiff <= 24;
    });

    if (activeMatches.length === 0) {
        container.innerHTML = '<span class="text-[10px] text-gray-500 italic font-bold py-2">Aucun match disponible dans les 24 prochaines heures.</span>';
        return;
    }

    activeMatches.forEach(m => {
        let matchStr = `${m.home_team} vs ${m.away_team}`;
        let isSelected = window.selectedTicketMatches.has(matchStr);
        let btn = document.createElement('button');
        btn.className = isSelected
            ? "bg-money text-black px-3 py-1.5 rounded text-[10px] font-black uppercase tracking-widest shadow-[0_0_10px_rgba(74,222,128,0.4)] transition"
            : "bg-black text-gray-400 hover:text-white px-3 py-1.5 rounded text-[10px] font-bold uppercase tracking-widest border border-gray-700 transition";
        btn.innerText = matchStr;
        btn.onclick = () => {
            if (isSelected) window.selectedTicketMatches.delete(matchStr);
            else window.selectedTicketMatches.add(matchStr);
            window.updateTicketMatchSelector();
        };
        container.appendChild(btn);
    });
};

window.selectAllTicketMatches = function () {
    let now = new Date();
    (window.fetchedMatchesPool || []).forEach(m => {
        if (m.state !== 'FINAL' && m.state !== 'OFF') {
            let matchDate = new Date(m.date);
            let hoursDiff = (matchDate - now) / (1000 * 60 * 60);
            if (hoursDiff >= -6 && hoursDiff <= 24) window.selectedTicketMatches.add(`${m.home_team} vs ${m.away_team}`);
        }
    });
    window.updateTicketMatchSelector();
};

window.deselectAllTicketMatches = function () {
    window.selectedTicketMatches.clear();
    window.updateTicketMatchSelector();
};

// 3. LE GÉNÉRATEUR IA ULTIME (Tickets Classiques)
window.generateSmartTicket = async function (type, title, isZapping = false) {
    window.showFullScreenLoader();
    window.showAnalysis();
    let container = document.getElementById('ticket-display');
    if (!container) return;

    if (window.selectedTicketMatches.size === 0) {
        container.innerHTML = `<div class="text-gray-500 font-bold text-center py-10"><i class="fas fa-hand-pointer text-2xl mb-2 text-yellow-500"></i><br>Sélectionnez au moins un match dans la liste ci-dessus pour lancer l'IA.</div>`;
        window.hideFullScreenLoader(); // Sécurité
        window.hideAnalysis();
        return;
    }

    let currentSelectionStr = Array.from(window.selectedTicketMatches).sort().join('|');
    let risk = document.getElementById('ticket-risk-profile').value;
    let total = parseInt(document.getElementById('slider-st-total').value);
    let maxPerMatch = parseInt(document.getElementById('slider-st-max').value);

    if (!isZapping || window.lastTicketConfig.type !== type || window.lastTicketConfig.total !== total || window.lastTicketConfig.matchStr !== currentSelectionStr || window.lastTicketConfig.risk !== risk) {
        window.currentTicketPlayers = [];
        window.bannedZappingPlayers = new Set();
        window.lastTicketConfig = { type, title, total, matchStr: currentSelectionStr, risk };
        isZapping = false;
    }

    // --- NOUVEAU LOADER STEP-BY-STEP ---
    container.innerHTML = `
        <div class="flex flex-col items-center justify-center py-20 animate-fade-in">
            <div class="w-32 h-1 bg-gray-800 rounded-full overflow-hidden mb-8">
                <div class="w-full h-full bg-blood animate-pulse"></div>
            </div>
            <div class="text-blood font-black text-[10px] md:text-xs uppercase tracking-[0.3em] mb-4">Moteur Quantique en Action</div>
            <div class="text-gray-500 text-[9px] md:text-[10px] font-bold uppercase tracking-widest" id="loader-step text-center">Initialisation des serveurs...</div>
        </div>
    `;

    const steps = ["Calcul des probabilités de Poisson...", "Scan des gardiens partants...", "Analyse des duels PP vs PK...", "Optimisation du combiné..."];
    let stepIdx = 0;
    const stepInterval = setInterval(() => {
        const el = document.getElementById('loader-step');
        if (el && steps[stepIdx]) {
            el.innerText = steps[stepIdx++];
        } else {
            clearInterval(stepInterval);
        }
    }, 400);

    try {
        // La suite de ton code (fetch, calculs, etc.) reste identique
        if (!window.globalPredictionsPool || window.globalPredictionsPool.length === 0) {
            let res = await fetch(`${API_BASE}/predict_all`);
            let data = await res.json();
            window.globalPredictionsPool = data.global_predictions || [];
        }

        let activeMatchStrings = Array.from(window.selectedTicketMatches);
        let fetchPromises = [];
        activeMatchStrings.forEach(matchStr => {
            if (!window.globalMatchContexts[matchStr]) {
                let parts = matchStr.split(' vs ');
                if (parts.length === 2) {
                    let h = parts[0], a = parts[1];
                    let matchObj = (window.fetchedMatchesPool || []).find(m => m.home_team === h && m.away_team === a);
                    let d = matchObj ? matchObj.date.split('T')[0] : new Date().toISOString().split('T')[0];

                    let promise = Promise.all([
                        fetch(`${API_BASE}/goalie_matchup/${h}/${a}`).catch(() => null),
                        fetch(`${API_BASE}/team_comparison/${h}/${a}/${d}`).catch(() => null)
                    ]).then(async ([gRes, tRes]) => {
                        window.globalMatchContexts[matchStr] = {
                            goalies: gRes ? await gRes.json() : null,
                            teams: tRes ? await tRes.json() : null
                        };
                    });
                    fetchPromises.push(promise);
                }
            }
        });

        if (fetchPromises.length > 0) await Promise.all(fetchPromises);
        window.ticketCacheMemory = currentSelectionStr;

        if (!window.userBannedPlayers) window.userBannedPlayers = new Set();
        if (!window.bannedPlayersDetails) window.bannedPlayersDetails = {};

        let pool = window.globalPredictionsPool.filter(p => {
            if (p.position === 'G') return false;
            if (window.activePlayersToday && window.activePlayersToday.size > 0 && !window.activePlayersToday.has(Number(p.id))) return false;
            if (window.bannedZappingPlayers.has(p.id)) return false;
            if (window.userBannedPlayers.has(String(p.id))) return false;

            if (window.selectedTicketMatches.size > 0) {
                let isTeamInSelectedMatch = false;
                window.selectedTicketMatches.forEach(mStr => {
                    if (mStr.includes(p.team)) isTeamInSelectedMatch = true;
                });
                if (!isTeamInSelectedMatch) return false;
            }
            return true;
        });

        pool.forEach(p => {
            let prob = 0;
            let assignedRole = "Pronostic";
            let mixteSortScore = 0;

            if (type === 'goal') { prob = p.prob_goal; assignedRole = 'Buteur'; }
            else if (type === 'assist') { prob = p.prob_assist; assignedRole = 'Passeur'; }
            else if (type === 'point') { prob = p.prob_point; assignedRole = 'Pointeur'; }
            else if (type === 'mixte') {
                // ⚡ SOLUTION RADICALE : On interdit le rôle "Pointeur". Un Mixte, c'est un Buteur ET un Passeur.
                // On abaisse énormément le seuil mathématique des Buteurs pour qu'ils remontent tout en haut de la liste face aux Passeurs.
                let scoreButeur = (p.prob_goal || 0) / 30.0;  // Un buteur à 30% vaudra le score maximal (1.0)
                let scorePasseur = (p.prob_assist || 0) / 48.0; // Un passeur à 48% vaudra le score maximal (1.0)

                // L'IA force le rôle où le joueur excelle le plus par rapport à la moyenne
                if (scoreButeur >= scorePasseur && (p.prob_goal || 0) >= 20) {
                    prob = p.prob_goal;
                    assignedRole = 'Buteur';
                    mixteSortScore = scoreButeur * 100;
                } else {
                    prob = p.prob_assist;
                    assignedRole = 'Passeur';
                    mixteSortScore = scorePasseur * 100;
                }
            } else {
                prob = Math.max(p.prob_goal || 0, p.prob_assist || 0, p.prob_point || 0);
            }

            p._ticketProb = prob || 0;
            p._ticketRole = assignedRole;

            let exactMatch = (window.fetchedMatchesPool || []).find(m => (m.home_team === p.team || m.away_team === p.team) && m.state !== 'FINAL' && m.state !== 'OFF');
            p._matchStr = exactMatch ? `${exactMatch.home_team} vs ${exactMatch.away_team}` : `Match de ${p.team}`;

            p.ctx_boost = 0; p.ctx_reasons = []; p.has_target_badge = false;

            if (exactMatch && window.globalMatchContexts[p._matchStr]) {
                let ctx = window.globalMatchContexts[p._matchStr];
                let isHome = exactMatch.home_team === p.team;
                let oppGoalie = isHome ? (ctx.goalies?.away_goalie) : (ctx.goalies?.home_goalie);
                let ownTeamStats = isHome ? (ctx.teams?.home) : (ctx.teams?.away);
                let oppTeamStats = isHome ? (ctx.teams?.away) : (ctx.teams?.home);

                if (oppGoalie && oppGoalie.gsax !== undefined) {
                    if (oppGoalie.gsax < -1.0) { p.ctx_boost += 4; p.has_target_badge = true; p.ctx_reasons.push(`<li class="flex items-start gap-3"><i class="fas fa-crosshairs text-blood mt-1"></i> <span><b>Cible Facile :</b> Gardien adverse vulnérable.</span></li>`); }
                    else if (oppGoalie.gsax > 3.0) { p.ctx_boost -= 3; p.ctx_reasons.push(`<li class="flex items-start gap-3"><i class="fas fa-shield-alt text-red-500 mt-1"></i> <span><b>Mur Défensif :</b> Gardien adverse en feu. Danger.</span></li>`); }
                }
                if (oppTeamStats && oppTeamStats.b2b) { p.ctx_boost += 2.5; p.ctx_reasons.push(`<li class="flex items-start gap-3"><i class="fas fa-battery-empty text-green-400 mt-1"></i> <span><b>Fatigue :</b> L'adversaire est en B2B.</span></li>`); }
                if (ownTeamStats && ownTeamStats.b2b) { p.ctx_boost -= 2.0; p.ctx_reasons.push(`<li class="flex items-start gap-3"><i class="fas fa-battery-quarter text-orange-500 mt-1"></i> <span><b>Usure :</b> Joueur en B2B.</span></li>`); }
            }

            p._ticketProb = Math.min(99.0, p._ticketProb + p.ctx_boost);

            if (type === 'mixte') {
                p._ticketScore = mixteSortScore + (p.ctx_boost * 3); // L'IA utilise le score de normalisation pour trier !
                if (risk === 'safe') p._ticketScore += (p.avg_toi || 15);
            } else {
                if (risk === 'safe') p._ticketScore = p._ticketProb + (p.avg_toi || 15);
                else if (risk === 'poker') {
                    let rShots = p.last_5_games ? p.last_5_games.reduce((s, g) => s + g.shots, 0) : 0;
                    let rGoals = p.last_5_games ? p.last_5_games.reduce((s, g) => s + g.goals, 0) : 0;
                    p._ticketScore = (rShots - (rGoals * 5)) * 2 + p.ctx_boost;
                    if (p._ticketProb > 60) p._ticketScore -= 50;
                } else { p._ticketScore = p._ticketProb; }
            }
        });

        pool.sort((a, b) => b._ticketScore - a._ticketScore);

        let selected = [];
        let matchCounts = {};
        let matchRoles = {}; // ⚡ NOUVEAU : Traqueur de rôles (Buteur, Passeur) par Match

        if (isZapping && window.currentTicketPlayers.length > 0) {
            let prev = window.currentTicketPlayers.filter(p => pool.some(v => v.id === p.id)).sort((a, b) => b._ticketScore - a._ticketScore);
            if (prev.length > 0) {
                let pillar = prev[0];
                for (let i = 1; i < prev.length; i++) window.bannedZappingPlayers.add(prev[i].id);
                selected = [pillar];
                matchCounts[pillar._matchStr] = 1;
                matchRoles[pillar._matchStr] = new Set([pillar._ticketRole]);

                for (let p of pool) {
                    if (selected.length >= total) break;
                    if (selected.some(k => k.id === p.id)) continue;
                    if (window.bannedZappingPlayers.has(p.id)) continue;
                    let m = p._matchStr;
                    if (!matchCounts[m]) matchCounts[m] = 0;
                    if (!matchRoles[m]) matchRoles[m] = new Set();

                    // ⚡ RÈGLE D'OR MIXTE : Interdit de choisir 2 fois le même rôle dans le même match !
                    if (type === 'mixte' && matchRoles[m].has(p._ticketRole)) continue;

                    if (matchCounts[m] < maxPerMatch) {
                        selected.push(p);
                        matchCounts[m]++;
                        matchRoles[m].add(p._ticketRole);
                    }
                }
            }
        }

        if (selected.length < total) {
            for (let p of pool) {
                if (selected.length >= total) break;
                if (selected.some(k => k.id === p.id)) continue;
                if (window.bannedZappingPlayers.has(p.id)) continue;
                let m = p._matchStr;
                if (!matchCounts[m]) matchCounts[m] = 0;
                if (!matchRoles[m]) matchRoles[m] = new Set();

                // ⚡ RÈGLE D'OR MIXTE : Interdit de choisir 2 fois le même rôle dans le même match !
                if (type === 'mixte' && matchRoles[m].has(p._ticketRole)) continue;

                if (matchCounts[m] < maxPerMatch) {
                    selected.push(p);
                    matchCounts[m]++;
                    matchRoles[m].add(p._ticketRole);
                }
            }
        }

        // ⚡ SÉCURITÉ ANTI-BLOCAGE : Si la règle des rôles est trop stricte et qu'il manque des joueurs pour finir le ticket, on complète.
        if (selected.length < total && type === 'mixte') {
            for (let p of pool) {
                if (selected.length >= total) break;
                if (selected.some(k => k.id === p.id)) continue;
                if (window.bannedZappingPlayers.has(p.id)) continue;
                let m = p._matchStr;
                if (matchCounts[m] < maxPerMatch) {
                    selected.push(p);
                    matchCounts[m]++;
                }
            }
        }

        if (selected.length < total) window.bannedZappingPlayers = new Set();
        window.currentTicketPlayers = selected;

        if (selected.length === 0) {
            container.innerHTML = `<div class="text-gray-500 font-bold text-center py-10">L'IA n'a trouvé aucun joueur sûr. Cochez plus de matchs !</div>`;
            return;
        }

        let grouped = {}; let totalTicketOdds = 1.0; let avgWinRate = 0;
        selected.forEach(p => {
            if (!grouped[p._matchStr]) grouped[p._matchStr] = [];
            grouped[p._matchStr].push(p);
            let itemOdds = p.odds ? parseFloat(p.odds) : Math.max(1.10, 0.93 / (p._ticketProb / 100));
            totalTicketOdds *= itemOdds;
            avgWinRate += p._ticketProb;
        });

        avgWinRate = selected.length > 0 ? (avgWinRate / selected.length) : 0;
        let scoreIA = avgWinRate;
        if (totalTicketOdds > 10) scoreIA -= 5;
        if (selected.length > 4) scoreIA -= (selected.length - 4) * 2;

        let gradeObj = { letter: 'C', color: 'text-gray-500', border: 'border-gray-500', glow: 'shadow-[0_0_15px_rgba(107,114,128,0.2)]', text: "Risque Élevé. Variance importante." };
        if (scoreIA >= 58) gradeObj = { letter: 'S', color: 'text-yellow-400', border: 'border-yellow-500', glow: 'shadow-[0_0_20px_rgba(234,179,8,0.6)]', text: "🔥 TICKET RANG S : Fiabilité Maximale." };
        else if (scoreIA >= 48) gradeObj = { letter: 'A', color: 'text-money', border: 'border-money', glow: 'shadow-[0_0_15px_rgba(74,222,128,0.4)]', text: "TICKET RANG A : Très solide (+EV)." };
        else if (scoreIA >= 38) gradeObj = { letter: 'B', color: 'text-ice', border: 'border-ice', glow: 'shadow-[0_0_15px_rgba(0,229,255,0.3)]', text: "TICKET RANG B : Standard." };

        let riskColor = risk === 'safe' ? 'text-green-400' : (risk === 'poker' ? 'text-purple-400' : 'text-blood');
        let html = `
            <div class="flex justify-between items-center bg-gray-950 border border-gray-800 p-3 rounded-xl mb-4 shadow-inner relative z-20" id="ticket-export-zone-header">
                <span class="${riskColor} font-black uppercase tracking-widest text-xs md:text-sm flex items-center gap-2"><i class="fas fa-ticket-alt"></i> ${title}</span>
                <button onclick="window.generateSmartTicket('${type}', '${title}', true)" class="bg-gray-900 hover:bg-white hover:text-black text-[10px] md:text-xs px-4 py-2 rounded-lg font-black uppercase tracking-widest transition border border-gray-700 shadow-lg flex items-center gap-2">
                    <i class="fas fa-random text-blood"></i> Zapping IA
                </button>
            </div>

            <div id="ticket-export-zone" class="bg-gray-950/80 p-4 rounded-xl border-2 ${gradeObj.border} ${gradeObj.glow} relative overflow-hidden transition-all">
                <div class="absolute top-0 right-0 bg-gray-900 border-l border-b ${gradeObj.border} rounded-bl-2xl p-2 flex items-center gap-2 z-10 shadow-inner">
                    <div class="text-right hidden sm:block">
                        <div class="text-[8px] text-gray-500 uppercase font-black tracking-widest">Score IA</div>
                        <div class="text-[9px] ${gradeObj.color} font-bold max-w-[100px] leading-tight truncate">${gradeObj.text}</div>
                    </div>
                    <div class="text-2xl md:text-3xl font-black ${gradeObj.color}">${gradeObj.letter}</div>
                </div>
                
                <div class="pt-16 md:pt-4 flex overflow-x-auto snap-x custom-scrollbar gap-4 pb-4 items-stretch">
        `;

        Object.keys(grouped).forEach(matchStr => {
            html += `
                <div class="bg-gray-900/40 border border-gray-800 rounded-xl shadow-[0_0_15px_rgba(0,0,0,0.5)] overflow-hidden relative min-w-[85vw] md:min-w-0 md:flex-1 snap-center shrink-0 flex flex-col">
                    <div class="absolute left-0 top-0 w-1 h-full bg-gray-700"></div>
                    <div class="bg-black/50 p-2.5 border-b border-gray-800 text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-2 px-4 shrink-0">
                        <i class="fas fa-hockey-puck text-ice"></i> <span class="text-white truncate">${matchStr}</span>
                    </div>
                    <div class="p-3 flex flex-col gap-3 overflow-y-auto flex-1">
            `;

            grouped[matchStr].forEach(p => {
                let pType = p._ticketRole;
                let probTextCol = p._ticketProb >= 50 ? 'text-green-400' : (p._ticketProb >= 40 ? 'text-ice' : 'text-gray-400');
                let itemOdds = p.odds ? parseFloat(p.odds) : Math.max(1.10, 0.93 / (p._ticketProb / 100));
                let targetBadgeHtml = p.has_target_badge ? `<span class="bg-blood/20 text-blood border border-blood/50 px-1.5 py-0.5 rounded text-[8px] uppercase font-black ml-2"><i class="fas fa-crosshairs"></i> Cible</span>` : '';
                let safeJson = encodeURIComponent(JSON.stringify({ id: p.id, name: p.name, team: p.team, prob: p._ticketProb, type: pType, ctx_reasons: p.ctx_reasons })).replace(/'/g, "%27");

                // NOUVEAU DESIGN : Format "Ligne" (Row), propre, compact et adapté au mobile
                html += `
                    <div class="flex items-center justify-between bg-black/60 p-3 rounded-xl border border-gray-800 mb-2 shadow-inner" onclick="openSmartTicketModal('${safeJson}')">
                        
                        <div class="flex items-center gap-3 overflow-hidden">
                            <img src="${p.headshot || 'assets/logo_hockAI.png'}" class="w-10 h-10 md:w-12 md:h-12 rounded-full border border-gray-700 bg-gray-900 flex-shrink-0 object-cover">
                            <div class="flex flex-col min-w-0">
                                <div class="font-black text-white text-xs md:text-sm uppercase tracking-widest truncate">${p.name}</div>
                                <div class="text-[9px] text-gray-500 font-bold tracking-widest truncate mt-0.5">${p.team} • ${p.position} ${targetBadgeHtml}</div>
                            </div>
                        </div>

                        <div class="flex flex-col items-end flex-shrink-0 ml-2">
                            <div class="text-[9px] text-gray-500 uppercase font-black tracking-widest mb-0.5">${pType}</div>
                            <div class="font-black text-sm md:text-base ${probTextCol}">${p._ticketProb.toFixed(1)}%</div>
                            <div class="text-[9px] text-gray-400 font-bold mt-0.5">@${itemOdds.toFixed(2)}</div>
                        </div>
                    </div>
                `;
            });

            html += `</div></div>`;
        });

        html += `
                </div> 
                <div class="ticket-actions mt-4 bg-gray-900 border border-gray-800 rounded-xl p-4 flex flex-col gap-3 shadow-[0_0_20px_rgba(0,0,0,0.5)]">
                    <div class="flex flex-col md:flex-row justify-between items-center gap-4 w-full">
                        <div class="flex flex-col items-center md:items-start w-full md:w-auto text-center md:text-left">
                            <div class="text-[10px] text-gray-500 uppercase tracking-widest font-bold mb-1">Cote Totale (Équitable)</div>
                            <div class="text-3xl font-black text-yellow-500 drop-shadow-[0_0_10px_rgba(234,179,8,0.5)]">@${totalTicketOdds.toFixed(2)}</div>
                        </div>
                        <div class="flex flex-col sm:flex-row items-center gap-3 w-full md:w-auto">
                            <button onclick="window.exportSmartTicketImage()" class="w-full sm:w-auto bg-gray-800 hover:bg-gray-700 text-white px-5 py-3 rounded-lg font-black text-xs uppercase tracking-widest transition shadow-lg border border-gray-600 flex items-center justify-center gap-2">
                                <i class="fas fa-camera text-lg"></i> Exporter
                            </button>
                            <div class="flex items-center gap-2 bg-black border border-gray-700 p-1.5 rounded-lg w-full sm:w-auto">
                                <input type="number" id="quick-stake-input" placeholder="Mise (€)" value="10" class="w-24 bg-gray-900 border border-gray-800 text-white text-xs font-bold text-center rounded px-2 py-2.5 outline-none focus:border-money shadow-inner">
                                <button onclick="window.addBetToBankroll('TICKET IA', '${title} (${selected.length} Sélections)', ${totalTicketOdds.toFixed(2)}, document.getElementById('quick-stake-input').value || 10)" class="w-full sm:w-auto bg-money/20 hover:bg-money text-money hover:text-black border border-money px-5 py-2.5 rounded text-xs font-black uppercase tracking-widest transition flex items-center justify-center gap-2">
                                    <i class="fas fa-save text-lg"></i> Encaisser
                                </button>
                            </div>
                        </div>
                    </div>
                    <button onclick="window.generateCoverTicket()" class="w-full bg-gray-950 hover:bg-gray-800 text-gray-400 border border-dashed border-gray-700 hover:border-gray-500 py-3 rounded-lg font-black uppercase tracking-widest text-[10px] md:text-xs transition-all flex items-center justify-center gap-2 group shadow-inner">
                        <i class="fas fa-shield-alt text-lg text-gray-600 group-hover:text-white transition-colors"></i> 
                        Générer une Couverture (Hedging Sécurisé)
                    </button>
                </div>
            </div> `;

        setTimeout(() => {
            if (typeof stepInterval !== 'undefined') clearInterval(stepInterval); // On arrête l'animation de texte
            container.innerHTML = html;
            window.hideAnalysis();
            window.hideFullScreenLoader();
            window.renderBlacklistZone();
        }, 800); 

    } catch (err) {
        console.error("Erreur IA:", err);
        container.innerHTML = `<div class="text-blood font-bold text-center py-10">Erreur de génération.</div>`;
        window.hideFullScreenLoader();
    }
}; // <-- C'EST ICI QUE LA FONCTION SE FERME PROPREMENT

// 4. MOTEUR D'INFIRMERIE & BANNISSEMENT
        window.banPlayerFromTickets = function (id, name, team) {
            if (!window.userBannedPlayers) window.userBannedPlayers = new Set();
            if (!window.bannedPlayersDetails) window.bannedPlayersDetails = {};
            window.userBannedPlayers.add(String(id)); window.bannedPlayersDetails[String(id)] = { name, team };

            // CORRECTION : On relance l'IA normalement (false) pour remplacer le blessé, sans zapper tout le ticket !
            window.generateSmartTicket(window.lastTicketConfig.type, window.lastTicketConfig.title || 'Ticket IA', false);
        };
        window.unbanPlayerFromTickets = function (id) {
            if (window.userBannedPlayers) window.userBannedPlayers.delete(String(id));
            window.renderBlacklistZone();
        };
        window.renderBlacklistZone = function () {
            let container = document.getElementById('blacklist-zone');
            if (!container) {
                let td = document.getElementById('ticket-display');
                container = document.createElement('div'); container.id = 'blacklist-zone'; container.className = 'mt-6 max-w-7xl mx-auto px-2 fade-in';
                td.parentNode.insertBefore(container, td.nextSibling);
            }
            if (!window.userBannedPlayers || window.userBannedPlayers.size === 0) { container.innerHTML = ''; return; }
            let html = `<div class="bg-gray-900 border border-blood/50 p-4 rounded-xl shadow-lg"><h4 class="text-blood font-black uppercase tracking-widest text-xs mb-3 flex items-center"><i class="fas fa-ambulance mr-2"></i> Infirmerie Manuelle</h4><div class="flex flex-wrap gap-2">`;
            window.userBannedPlayers.forEach(id => {
                let info = window.bannedPlayersDetails[id];
                html += `<div class="bg-black border border-gray-700 px-3 py-1.5 rounded-lg flex items-center gap-3 text-xs shadow-inner"><div><span class="text-white font-bold">${info.name}</span><span class="text-gray-500 text-[9px] uppercase ml-1">${info.team}</span></div><button onclick="window.unbanPlayerFromTickets('${id}')" class="text-green-500 hover:text-green-400 bg-gray-800 rounded-full w-5 h-5 flex items-center justify-center transition shadow-lg"><i class="fas fa-undo text-[10px]"></i></button></div>`;
            });
            container.innerHTML = html + `</div></div>`;
        };

        // 5. MOTEUR D'EXPORTATION PHOTO
        window.exportSmartTicketImage = async function () {
            if (typeof html2canvas === 'undefined') { alert("Module photo en cours de chargement..."); return; }
            let ticketContainer = document.getElementById('ticket-export-zone'); if (!ticketContainer) return;
            if (typeof showFullScreenLoader === 'function') showFullScreenLoader("Génération de l'image", "Préparation...", false);

            let actionDiv = ticketContainer.querySelector('.ticket-actions'); if (actionDiv) actionDiv.style.display = 'none';
            let watermark = document.createElement('div');
            watermark.innerHTML = '<span style="color:#EAB308; font-weight:900; font-size:12px; letter-spacing: 2px;">⚡ GÉNÉRÉ PAR L\'IA HOCKAI</span>';
            watermark.style.position = 'absolute'; watermark.style.bottom = '15px'; watermark.style.right = '20px'; watermark.style.zIndex = '50'; watermark.id = 'temp-watermark';
            ticketContainer.appendChild(watermark);

            let images = ticketContainer.querySelectorAll('img'); let originalSrcs = [];
            for (let i = 0; i < images.length; i++) {
                let img = images[i]; originalSrcs[i] = img.src;
                if (img.src.startsWith('http') && img.src.includes('nhle.com')) {
                    try { let res = await fetch(API_BASE + '/proxy-image-base64?url=' + encodeURIComponent(img.src)); let data = await res.json(); if (data.base64) img.src = data.base64; } catch (e) { }
                }
            }
            await new Promise(r => setTimeout(r, 500));

            html2canvas(ticketContainer, {
                backgroundColor: '#0a0f1a', scale: 2, useCORS: true, logging: false,
                onclone: function (doc) { let el = doc.getElementById('ticket-export-zone'); if (el) { el.style.width = '800px'; el.style.maxWidth = '800px'; el.classList.remove('mx-auto'); } }
            }).then(canvas => {
                images.forEach((img, i) => img.src = originalSrcs[i]); if (actionDiv) actionDiv.style.display = ''; let wm = document.getElementById('temp-watermark'); if (wm) wm.remove();
                let link = document.createElement('a'); link.download = 'HOCKAI_Smart_Ticket.png'; link.href = canvas.toDataURL('image/png'); link.click();
                if (typeof hideFullScreenLoader === 'function') hideFullScreenLoader();
            }).catch(e => {
                images.forEach((img, i) => img.src = originalSrcs[i]); if (actionDiv) actionDiv.style.display = ''; let wm = document.getElementById('temp-watermark'); if (wm) wm.remove();
                if (typeof hideFullScreenLoader === 'function') hideFullScreenLoader();
            });
        };

        // 6. MODALS ET UTILITAIRES DE TICKETS
        window.openSmartTicketModal = async function (playerJson) {
            const p = JSON.parse(decodeURIComponent(playerJson));
            document.getElementById('ta-modal-name').innerText = p.name;
            document.getElementById('ta-modal-type').innerText = "Pronostic : " + p.type + " (" + p.team + ")";
            const argList = document.getElementById('ta-modal-args');
            argList.innerHTML = `<div class="text-center py-8"><i class="fas fa-circle-notch fa-spin text-3xl text-ice mb-4 drop-shadow-[0_0_10px_#00e5ff]"></i><div class="text-gray-400 font-bold text-xs uppercase tracking-widest">L'Oracle compile l'historique L5/L10...</div></div>`;
            document.getElementById('ticket-arg-modal').classList.remove('hidden'); document.getElementById('ticket-arg-modal').classList.add('flex');

            try {
                let hist = [];
                if (p.id) { let res = await fetch(`${API_BASE}/player_dashboard/${p.id}`); let data = await res.json(); if (data.status === 'success' && data.history) hist = data.history; }
                const parseToi = (t) => { if (!t) return 0; if (typeof t === 'number') return t; let parts = t.toString().split(':'); if (parts.length === 2) return parseInt(parts[0]) + parseInt(parts[1]) / 60; return parseFloat(t); };
                const formatToi = (m) => { if (!m) return "00:00"; let mins = Math.floor(m); let secs = Math.round((m - mins) * 60); if (secs === 60) { mins++; secs = 0; } return mins + ':' + (secs < 10 ? '0' : '') + secs; };
                let l5 = hist.slice(0, 5); let l10 = hist.slice(0, 10);
                const sumL5 = (key) => l5.reduce((s, g) => s + (g[key] || 0), 0); const sumL10 = (key) => l10.reduce((s, g) => s + (g[key] || 0), 0);
                let gL5 = sumL5('goals'), gL10 = sumL10('goals'), aL5 = sumL5('assists'), aL10 = sumL10('assists'), ptL5 = sumL5('points'), ptL10 = sumL10('points'), sL5 = sumL5('shots');
                let toiL5 = l5.length ? l5.reduce((s, g) => s + parseToi(g.toi), 0) / l5.length : 0; let toiL10 = l10.length ? l10.reduce((s, g) => s + parseToi(g.toi), 0) / l10.length : 0;

                let iaReasoning = ""; let statName = p.type.includes('But') ? 'Buts' : (p.type.includes('Pass') ? 'Passes' : 'Points'); let targetL5 = p.type.includes('But') ? gL5 : (p.type.includes('Pass') ? aL5 : ptL5);
                if (l5.length > 0) {
                    if (targetL5 >= 3) iaReasoning = `<span class="text-blood font-black">🔥 Dynamique Explosive.</span> Forme exceptionnelle avec ${targetL5} ${statName} (L5).`;
                    else if (sL5 >= 15 && p.type.includes('But') && targetL5 <= 1) iaReasoning = `<span class="text-ice font-black">❄️ Régression Positive.</span> Malgré ${sL5} tirs (L5), peu de réussite. Rupture imminente.`;
                    else if (toiL5 > toiL10 + 1) iaReasoning = `<span class="text-green-400 font-black">📈 Sur-utilisation.</span> Temps de glace explose (${formatToi(toiL10)} ➡️ ${formatToi(toiL5)}).`;
                    else iaReasoning = `<span class="text-purple-400 font-black">🧠 Value Bet Mathématique.</span> Cote intéressante par rapport aux volumes.`;
                } else { iaReasoning = `<span class="text-purple-400 font-black">🧠 Avantage Mathématique (+EV).</span> Projection brute de l'algorithme.`; }

                if (p.ctx_reasons && p.ctx_reasons.length > 0) iaReasoning += `<ul class="mt-3 space-y-2 text-xs border-t border-gray-700/50 pt-3">${p.ctx_reasons.join('')}</ul>`;
                let probColor = p.prob > 60 ? 'text-green-400' : (p.prob < 40 ? 'text-blood' : 'text-ice'); let toiColor = toiL5 >= toiL10 ? 'text-green-400' : 'text-orange-500';

                argList.innerHTML = `
            <div class="flex flex-col gap-5 text-sm w-full block">
                <div class="bg-gray-900/80 p-4 rounded-xl border-l-4 border-purple-500 shadow-inner"><h5 class="text-[10px] text-gray-500 font-black uppercase tracking-widest mb-2"><i class="fas fa-robot text-purple-400 mr-2"></i>Le Diagnostic</h5><p class="text-gray-300 leading-relaxed font-bold text-xs">${iaReasoning}</p></div>
                <div class="grid grid-cols-2 gap-4">
                    <div class="bg-gray-900 border border-gray-700 p-3 rounded-xl text-center shadow-lg relative overflow-hidden"><div class="text-[9px] text-gray-500 uppercase font-black tracking-widest mb-2">Forme (L5)</div><div class="flex justify-around text-xs font-bold"><div class="flex flex-col"><span class="text-blood text-lg font-black">${gL5}</span><span>Buts</span></div><div class="flex flex-col"><span class="text-white text-lg font-black">${aL5}</span><span>Passes</span></div><div class="flex flex-col"><span class="text-ice text-lg font-black">${ptL5}</span><span>Pts</span></div></div></div>
                    <div class="bg-gray-900 border border-gray-700 p-3 rounded-xl text-center shadow-inner relative opacity-80"><div class="text-[9px] text-gray-500 uppercase font-black tracking-widest mb-2">Série (L10)</div><div class="flex justify-around text-xs font-bold"><div class="flex flex-col"><span class="text-gray-400 text-lg font-black">${gL10}</span><span>Buts</span></div><div class="flex flex-col"><span class="text-gray-400 text-lg font-black">${aL10}</span><span>Passes</span></div><div class="flex flex-col"><span class="text-gray-400 text-lg font-black">${ptL10}</span><span>Pts</span></div></div></div>
                </div>
                <div class="bg-gray-900 border border-gray-700 p-4 rounded-xl flex items-center justify-between shadow-lg"><div class="flex items-center gap-3"><i class="fas fa-stopwatch text-2xl ${toiColor}"></i><div><div class="text-[10px] text-gray-500 uppercase font-black tracking-widest">Temps de Glace (Moy)</div><div class="text-white font-black text-sm">L5 : ${formatToi(toiL5)} <span class="text-gray-600 font-normal text-xs mx-1">vs</span> L10 : ${formatToi(toiL10)}</div></div></div><div class="text-right"><div class="text-[10px] text-gray-500 uppercase font-black tracking-widest">Tirs (L5)</div><div class="text-white font-black text-lg">${sL5} <i class="fas fa-crosshairs text-gray-600 text-xs ml-1"></i></div></div></div>
                <div class="border-t border-gray-700 pt-4 mt-1 flex items-center justify-between"><div><div class="text-[10px] text-gray-400 uppercase font-black tracking-widest"><i class="fas fa-check-circle text-green-400 mr-1"></i> Score IA</div></div><div class="text-3xl font-black ${probColor} drop-shadow-[0_0_10px_currentColor]">${p.prob.toFixed(1)}%</div></div>
            </div>`;
            } catch (e) { argList.innerHTML = `<div class="text-blood font-bold text-center">Erreur lors de la récupération des archives.</div>`; }
        };
        window.closeSmartTicketModal = function () { let m = document.getElementById('ticket-arg-modal'); if (m) { m.classList.add('hidden'); m.classList.remove('flex'); } };

        window.jumpToPlayerScouting = function (playerName) {
            let tabBtn = document.querySelector('button[onclick*="tab-performances"]'); if (tabBtn) tabBtn.click();
            window.scrollTo({ top: 0, behavior: 'smooth' });
            setTimeout(() => { if (typeof executePlayerSearchByName === 'function') executePlayerSearchByName(playerName); }, 400);
        };

        // 7. ALGORITHMES SPÉCIAUX (Palier, SGP, Rescue, Couverture)
        window.generatePalier200 = function () {
            window.showAnalysis();
            let container = document.getElementById('ticket-display');
            if (!window.globalPredictionsPool || window.globalPredictionsPool.length === 0) { container.innerHTML = `<div class="bg-gray-900 text-yellow-500 p-6 rounded-xl text-center font-black">Mémoire IA vide.</div>`; return; }
            let btn = document.querySelector('button[onclick="generatePalier200()"]'); let originalHtml = btn ? btn.innerHTML : "Palier 2.00";
            if (btn) btn.innerHTML = `<i class="fas fa-spinner fa-spin text-2xl text-yellow-500 drop-shadow-[0_0_10px_#EAB308]"></i><span class="text-white">Scan Quantique...</span>`;

            setTimeout(() => {
                let candidates = [];
                window.globalPredictionsPool.forEach(p => {
                    if (p.position === 'G') return;
                    if (window.activePlayersToday && window.activePlayersToday.size > 0 && !window.activePlayersToday.has(p.id)) return;
                    let goalProb = p.prob_goal || 0; let assistProb = p.prob_assist || 0; let pointProb = p.prob_point || 0;
                    if (goalProb >= 50) candidates.push({ ...p, best_prop_type: 'prob_goal', best_prop_val: goalProb, _ticketProb: goalProb });
                    if (assistProb >= 55) candidates.push({ ...p, best_prop_type: 'prob_assist', best_prop_val: assistProb, _ticketProb: assistProb });
                    if (pointProb >= 60) candidates.push({ ...p, best_prop_type: 'prob_point', best_prop_val: pointProb, _ticketProb: pointProb });
                });
                candidates.sort((a, b) => b.best_prop_val - a.best_prop_val);

                let finalTicket = []; let currentOdds = 1.0; let usedTeams = new Set();
                for (let p of candidates) {
                    if (usedTeams.has(p.team)) continue;
                    let itemOdds = p.odds ? parseFloat(p.odds) : Math.max(1.10, 0.93 / (p.best_prop_val / 100));
                    if (itemOdds < 1.15) continue;
                    p._itemOdds = itemOdds;
                    let exactMatch = (window.fetchedMatchesPool || []).find(m => (m.home_team === p.team || m.away_team === p.team) && m.state !== 'FINAL' && m.state !== 'OFF');
                    p._matchStr = exactMatch ? `${exactMatch.home_team} vs ${exactMatch.away_team}` : `Match de ${p.team}`;
                    finalTicket.push(p); currentOdds *= itemOdds; usedTeams.add(p.team);
                    if (currentOdds >= 2.00) break;
                }

                if (btn) btn.innerHTML = originalHtml;
                if (currentOdds < 1.80 || finalTicket.length < 2) { container.innerHTML = `<div class="bg-gray-900 border border-yellow-500/50 text-yellow-500 p-6 rounded-xl text-center font-black uppercase tracking-widest text-xs shadow-inner">Impossible de construire un palier @2.00 sécurisé ce soir.</div>`; return; }

                let gradeObj = { letter: 'S', color: 'text-yellow-400', border: 'border-yellow-500', glow: 'shadow-[0_0_20px_rgba(234,179,8,0.6)]', text: "🔥 TICKET RANG S : Palier Ultra-Sécurisé." };
                let html = `<div class="flex justify-between items-center bg-gray-950 border border-gray-800 p-3 rounded-xl mb-4 shadow-inner relative z-20" id="ticket-export-zone-header"><span class="text-yellow-500 font-black uppercase tracking-widest text-xs md:text-sm flex items-center gap-2"><i class="fas fa-stairs"></i> MONTANTE : LE PALIER @2.00</span><button onclick="generatePalier200()" class="bg-gray-900 hover:bg-white hover:text-black text-[10px] md:text-xs px-4 py-2 rounded-lg font-black uppercase tracking-widest transition border border-gray-700 shadow-lg flex items-center gap-2"><i class="fas fa-sync-alt text-yellow-500"></i> Relancer</button></div><div id="ticket-export-zone" class="bg-gray-950/80 p-4 rounded-xl border-2 ${gradeObj.border} ${gradeObj.glow} relative overflow-hidden transition-all"><div class="absolute top-0 right-0 bg-gray-900 border-l border-b ${gradeObj.border} rounded-bl-2xl p-2 md:p-3 flex items-center gap-3 z-10 shadow-inner"><div class="text-right hidden sm:block"><div class="text-[8px] md:text-[9px] text-gray-500 uppercase font-black tracking-widest">Score Qualité IA</div><div class="text-[9px] md:text-[10px] ${gradeObj.color} font-bold mt-0.5 max-w-[130px] leading-tight">${gradeObj.text}</div></div><div class="text-3xl md:text-4xl font-black ${gradeObj.color} drop-shadow-[0_0_10px_currentColor]">${gradeObj.letter}</div></div><div class="pt-10 md:pt-4 pr-16 md:pr-48">`;
                let grouped = {}; finalTicket.forEach(p => { if (!grouped[p._matchStr]) grouped[p._matchStr] = []; grouped[p._matchStr].push(p); });
                Object.keys(grouped).forEach(matchStr => {
                    html += `<div class="bg-gray-900/40 border border-gray-800 rounded-xl mb-4 shadow-[0_0_15px_rgba(0,0,0,0.5)] overflow-hidden relative"><div class="absolute left-0 top-0 w-1 h-full bg-yellow-500"></div><div class="bg-black/50 p-2.5 border-b border-gray-800 text-[10px] md:text-xs font-black text-gray-400 uppercase tracking-widest flex items-center gap-2 px-4"><i class="fas fa-hockey-puck text-ice"></i> MATCH : <span class="text-white">${matchStr}</span></div><div class="p-3 flex flex-col gap-2">`;
                    grouped[matchStr].forEach(p => {
                        let pType = p.best_prop_type === 'prob_goal' ? 'But' : (p.best_prop_type === 'prob_assist' ? 'Passe' : 'Point');
                        let safeJson = encodeURIComponent(JSON.stringify({ id: p.id, name: p.name, team: p.team, prob: p._ticketProb, type: pType })).replace(/'/g, "%27");
                        html += `<div onclick="openSmartTicketModal('${safeJson}')" class="flex items-center justify-between bg-gray-950/80 p-3 rounded-lg border border-gray-800/80 hover:border-yellow-500 transition cursor-pointer group"><div class="flex items-center gap-3"><img src="${p.headshot || 'assets/logo_hockAI.png'}" class="w-10 h-10 md:w-12 md:h-12 rounded-full border border-gray-700 bg-gray-900 group-hover:scale-110 transition object-cover"><div><div class="font-black text-white text-sm md:text-base uppercase tracking-widest leading-none">${p.name}</div><div class="text-[9px] md:text-[10px] text-gray-500 font-bold tracking-widest mt-1"><span class="text-yellow-500">${p.team}</span> • ${p.position}</div></div></div><div class="text-right"><div class="text-[8px] md:text-[10px] text-gray-500 uppercase font-black tracking-widest mb-1">Over 0.5 ${pType}</div><div class="font-black text-lg md:text-xl text-green-400 drop-shadow-[0_0_5px_#4ADE80]">${p._ticketProb.toFixed(1)}% <span class="text-gray-400 text-sm ml-1 font-bold">(@${p._itemOdds.toFixed(2)})</span></div></div></div>`;
                    });
                    html += `</div></div>`;
                });
                html += `</div><div class="ticket-actions mt-4 bg-gray-900 border border-gray-800 rounded-xl p-4 flex flex-col md:flex-row justify-between items-center gap-4 shadow-[0_0_20px_rgba(0,0,0,0.5)]"><div class="flex flex-col items-center md:items-start w-full md:w-auto text-center md:text-left"><div class="text-[10px] text-gray-500 uppercase tracking-widest font-bold mb-1">Cote Totale</div><div class="text-3xl font-black text-yellow-500 drop-shadow-[0_0_10px_rgba(234,179,8,0.5)]">@${currentOdds.toFixed(2)}</div></div><div class="flex flex-col sm:flex-row items-center gap-3 w-full md:w-auto"><button onclick="window.exportSmartTicketImage()" class="w-full sm:w-auto bg-gray-800 hover:bg-gray-700 text-white px-5 py-3 rounded-lg font-black text-xs uppercase tracking-widest transition shadow-lg border border-gray-600 flex items-center justify-center gap-2"><i class="fas fa-camera text-lg"></i> Exporter</button><div class="flex items-center gap-2 bg-black border border-gray-700 p-1.5 rounded-lg w-full sm:w-auto"><input type="number" id="quick-stake-input" placeholder="Mise (€)" value="10" class="w-24 bg-gray-900 border border-gray-800 text-white text-xs font-bold text-center rounded px-2 py-2.5 outline-none focus:border-money shadow-inner"><button onclick="window.addBetToBankroll('MONTANTE', 'Palier @2.00', ${currentOdds.toFixed(2)}, document.getElementById('quick-stake-input').value || 10)" class="w-full sm:w-auto bg-money/20 hover:bg-money text-money hover:text-black border border-money px-5 py-2.5 rounded text-xs font-black uppercase tracking-widest transition flex items-center justify-center gap-2"><i class="fas fa-save text-lg"></i> Encaisser</button></div></div></div></div>`;
                container.innerHTML = html;
                window.hideAnalysis(); // 👈 Ajoute ça ici
                window.hideFullScreenLoader();

            }, 800);
        };

        window.generateSameGameParlay = function () {
            let container = document.getElementById('ticket-display');
            if (!window.globalPredictionsPool || window.globalPredictionsPool.length === 0) { alert("L'Oracle doit d'abord se connecter. Veuillez patienter."); return; }
            let btn = document.querySelector('button[onclick="generateSameGameParlay()"]'); let originalHtml = btn ? btn.innerHTML : "Duos Dynamiques";
            if (btn) btn.innerHTML = `<i class="fas fa-spinner fa-spin text-2xl text-purple-400 drop-shadow-[0_0_10px_#C084FC]"></i><span class="text-white">Recherche de corrélations...</span>`;

            setTimeout(() => {
                let teamsMap = {};
                window.globalPredictionsPool.forEach(p => {
                    if (p.position === 'G') return;
                    if (window.activePlayersToday && window.activePlayersToday.size > 0 && !window.activePlayersToday.has(p.id)) return;
                    if (window.selectedTicketMatches.size > 0) {
                        let isMatchOk = false;
                        window.selectedTicketMatches.forEach(mStr => { if (mStr.includes(p.team)) isMatchOk = true; });
                        if (!isMatchOk) return;
                    }
                    if (!teamsMap[p.team]) teamsMap[p.team] = [];
                    teamsMap[p.team].push(p);
                });

                let bestDuos = [];
                for (let team in teamsMap) {
                    let roster = teamsMap[team];
                    let topGoalscorer = roster.sort((a, b) => (b.prob_goal || 0) - (a.prob_goal || 0))[0];
                    let eligibleAssisters = roster.filter(p => p.id !== topGoalscorer.id);
                    let topAssister = eligibleAssisters.sort((a, b) => (b.prob_assist || 0) - (a.prob_assist || 0))[0];

                    if (topGoalscorer && topAssister && topGoalscorer.prob_goal >= 35 && topAssister.prob_assist >= 40) {
                        let score = topGoalscorer.prob_goal + topAssister.prob_assist;
                        let duoOdds = (topGoalscorer.odds || Math.max(1.10, 0.93 / (topGoalscorer.prob_goal / 100))) * (topAssister.odds || Math.max(1.10, 0.93 / (topAssister.prob_assist / 100)));
                        let correlationBoost = duoOdds * 0.85;

                        let gPlayer = { ...topGoalscorer, best_prop_type: 'prob_goal', best_prop_val: topGoalscorer.prob_goal, _ticketProb: topGoalscorer.prob_goal, _itemOdds: topGoalscorer.odds || 2.00, archetype_badge: '🎯 LA GÂCHETTE' };
                        let aPlayer = { ...topAssister, best_prop_type: 'prob_assist', best_prop_val: topAssister.prob_assist, _ticketProb: topAssister.prob_assist, _itemOdds: topAssister.odds || 2.00, archetype_badge: '🏒 LE CHEF D\'ORCHESTRE' };
                        let exactMatch = (window.fetchedMatchesPool || []).find(m => (m.home_team === team || m.away_team === team) && m.state !== 'FINAL' && m.state !== 'OFF');
                        let matchStr = exactMatch ? `${exactMatch.home_team} vs ${exactMatch.away_team}` : `Match de ${team}`;
                        gPlayer._matchStr = matchStr; aPlayer._matchStr = matchStr;

                        bestDuos.push({ duo: [gPlayer, aPlayer], score: score, odds: correlationBoost, team: team, matchStr: matchStr });
                    }
                }

                if (btn) btn.innerHTML = originalHtml;
                if (bestDuos.length === 0) { container.innerHTML = `<div class="bg-gray-900 border border-purple-500/50 text-purple-400 p-6 rounded-xl text-center font-black uppercase tracking-widest text-xs shadow-inner"><i class="fas fa-heart-broken text-2xl mb-2 block"></i>Aucune forte corrélation (SGP) détectée ce soir.</div>`; return; }

                bestDuos.sort((a, b) => b.score - a.score); let finalTicket = bestDuos[0].duo; let currentOdds = bestDuos[0].odds; let finalMatchStr = bestDuos[0].matchStr;
                let gradeObj = { letter: 'S', color: 'text-purple-400', border: 'border-purple-500', glow: 'shadow-[0_0_20px_rgba(168,85,247,0.6)]', text: "🔥 CORRÉLATION MAXIMALE : Duo SGP." };

                let html = `<div class="flex justify-between items-center bg-gray-950 border border-gray-800 p-3 rounded-xl mb-4 shadow-inner relative z-20" id="ticket-export-zone-header"><span class="text-purple-400 font-black uppercase tracking-widest text-xs md:text-sm flex items-center gap-2"><i class="fas fa-handshake"></i> SAME-GAME PARLAY (CORRÉLATION)</span><button onclick="generateSameGameParlay()" class="bg-gray-900 hover:bg-white hover:text-black text-[10px] md:text-xs px-4 py-2 rounded-lg font-black uppercase tracking-widest transition border border-gray-700 shadow-lg flex items-center gap-2"><i class="fas fa-sync-alt text-purple-400"></i> Relancer</button></div><div id="ticket-export-zone" class="bg-gray-950/80 p-4 rounded-xl border-2 ${gradeObj.border} ${gradeObj.glow} relative overflow-hidden transition-all"><div class="absolute top-0 right-0 bg-gray-900 border-l border-b ${gradeObj.border} rounded-bl-2xl p-2 md:p-3 flex items-center gap-3 z-10 shadow-inner"><div class="text-right hidden sm:block"><div class="text-[8px] md:text-[9px] text-gray-500 uppercase font-black tracking-widest">Score Qualité IA</div><div class="text-[9px] md:text-[10px] ${gradeObj.color} font-bold mt-0.5 max-w-[130px] leading-tight">${gradeObj.text}</div></div><div class="text-3xl md:text-4xl font-black ${gradeObj.color} drop-shadow-[0_0_10px_currentColor]">${gradeObj.letter}</div></div><div class="pt-10 md:pt-4 pr-16 md:pr-48"><div class="bg-gray-900/40 border border-gray-800 rounded-xl mb-4 shadow-[0_0_15px_rgba(0,0,0,0.5)] overflow-hidden relative"><div class="absolute left-0 top-0 w-1 h-full bg-purple-500"></div><div class="bg-black/50 p-2.5 border-b border-gray-800 text-[10px] md:text-xs font-black text-gray-400 uppercase tracking-widest flex items-center gap-2 px-4"><i class="fas fa-hockey-puck text-purple-400"></i> MATCH : <span class="text-white">${finalMatchStr}</span></div><div class="p-3 flex flex-col gap-2">`;
                finalTicket.forEach(p => {
                    let pType = p.best_prop_type === 'prob_goal' ? 'But' : (p.best_prop_type === 'prob_assist' ? 'Passe' : 'Point');
                    let safeJson = encodeURIComponent(JSON.stringify({ id: p.id, name: p.name, team: p.team, prob: p._ticketProb, type: pType })).replace(/'/g, "%27");
                    html += `<div onclick="openSmartTicketModal('${safeJson}')" class="flex items-center justify-between bg-gray-950/80 p-3 rounded-lg border border-gray-800/80 hover:border-purple-500 transition cursor-pointer group"><div class="flex items-center gap-3"><img src="${p.headshot || 'assets/logo_hockAI.png'}" class="w-10 h-10 md:w-12 md:h-12 rounded-full border border-gray-700 bg-gray-900 group-hover:scale-110 transition object-cover"><div><div class="font-black text-white text-sm md:text-base uppercase tracking-widest leading-none">${p.name}</div><div class="text-[9px] md:text-[10px] text-gray-500 font-bold tracking-widest mt-1"><span class="text-purple-400">${p.team}</span> • ${p.position}</div><div class="bg-purple-900/40 border border-purple-500 text-purple-300 px-1.5 py-0.5 rounded text-[8px] uppercase font-black tracking-widest text-center mt-1 w-max shadow-[0_0_8px_rgba(168,85,247,0.4)]">${p.archetype_badge}</div></div></div><div class="text-right"><div class="text-[8px] md:text-[10px] text-gray-500 uppercase font-black tracking-widest mb-1">Over 0.5 ${pType}</div><div class="font-black text-lg md:text-xl text-green-400 drop-shadow-[0_0_5px_#4ADE80]">${p._ticketProb.toFixed(1)}% <span class="text-gray-400 text-sm ml-1 font-bold">(@${p._itemOdds.toFixed(2)})</span></div></div></div>`;
                });
                html += `</div></div></div><div class="ticket-actions mt-4 bg-gray-900 border border-gray-800 rounded-xl p-4 flex flex-col md:flex-row justify-between items-center gap-4 shadow-[0_0_20px_rgba(0,0,0,0.5)]"><div class="flex flex-col items-center md:items-start w-full md:w-auto text-center md:text-left"><div class="text-[10px] text-gray-500 uppercase tracking-widest font-bold mb-1">Cote Duo Boostée</div><div class="text-3xl font-black text-purple-400 drop-shadow-[0_0_10px_rgba(168,85,247,0.5)]">@${currentOdds.toFixed(2)}</div></div><div class="flex flex-col sm:flex-row items-center gap-3 w-full md:w-auto"><button onclick="window.exportSmartTicketImage()" class="w-full sm:w-auto bg-gray-800 hover:bg-gray-700 text-white px-5 py-3 rounded-lg font-black text-xs uppercase tracking-widest transition shadow-lg border border-gray-600 flex items-center justify-center gap-2"><i class="fas fa-camera text-lg"></i> Exporter</button><div class="flex items-center gap-2 bg-black border border-gray-700 p-1.5 rounded-lg w-full sm:w-auto"><input type="number" id="quick-stake-input" placeholder="Mise (€)" value="10" class="w-24 bg-gray-900 border border-gray-800 text-white text-xs font-bold text-center rounded px-2 py-2.5 outline-none focus:border-money shadow-inner"><button onclick="window.addBetToBankroll('DUOS', 'SGP IA', ${currentOdds.toFixed(2)}, document.getElementById('quick-stake-input').value || 10)" class="w-full sm:w-auto bg-money/20 hover:bg-money text-money hover:text-black border border-money px-5 py-2.5 rounded text-xs font-black uppercase tracking-widest transition flex items-center justify-center gap-2"><i class="fas fa-save text-lg"></i> Encaisser</button></div></div></div></div>`;
                container.innerHTML = html;
            }, 800);
        };

        window.goToTicketStep = function (step) {
            // Si on veut aller à l'étape 2, on vérifie qu'un match est sélectionné
            if (step === 2 && window.selectedTicketMatches.size === 0) {
                alert("Veuillez sélectionner au moins un match pour continuer.");
                return;
            }

            // Gestion de l'affichage des sections
            document.getElementById('ticket-step-1').classList.add('hidden');
            document.getElementById('ticket-step-2').classList.add('hidden');
            document.getElementById('ticket-step-3').classList.add('hidden');

            document.getElementById(`ticket-step-${step}`).classList.remove('hidden');
            document.getElementById(`ticket-step-${step}`).classList.add('flex');

            // Mise à jour visuelle des points de progression
            const colors = { 1: 'bg-blood shadow-[0_0_8px_#ff3333]', 2: 'bg-gray-800 shadow-none' };
            document.getElementById('step-dot-1').className = `w-3 h-3 rounded-full transition-all ${step >= 1 ? colors[1] : colors[2]}`;
            document.getElementById('step-dot-2').className = `w-3 h-3 rounded-full transition-all ${step >= 2 ? colors[1] : colors[2]}`;
            document.getElementById('step-dot-3').className = `w-3 h-3 rounded-full transition-all ${step >= 3 ? colors[1] : colors[2]}`;

            // Remonter en haut de page en douceur sur mobile
            if (window.innerWidth < 768) {
                document.getElementById('tab-tickets').scrollTo({ top: 0, behavior: 'smooth' });
            }
        };

        window.generateCoverTicket = function () {
            let container = document.getElementById('ticket-display');
            window.scrollTo({ top: container.offsetTop - 100, behavior: 'smooth' });
            container.innerHTML = `<div class="text-center py-10 bg-gray-900 border border-gray-600 border-dashed rounded-xl shadow-inner"><i class="fas fa-shield-alt text-4xl text-gray-500 mb-4 animate-pulse"></i><div class="text-white font-black uppercase tracking-widest text-sm">Calcul de la Couverture...</div><div class="text-[10px] text-gray-400 uppercase mt-2 font-bold">L'IA cherche les 2 joueurs les plus sûrs de la ligue (@1.40).</div></div>`;

            setTimeout(() => {
                let pool = window.globalPredictionsPool.filter(p => p.position !== 'G' && (!window.activePlayersToday || window.activePlayersToday.has(p.id)));
                let candidates = [];
                pool.forEach(p => {
                    if (p.prob_point >= 65) candidates.push({ ...p, best_prop_type: 'prob_point', best_prop_val: p.prob_point, _ticketProb: p.prob_point, archetype_badge: '🛡️ PILIER DE COUVERTURE' });
                    else if (p.prob_assist >= 65) candidates.push({ ...p, best_prop_type: 'prob_assist', best_prop_val: p.prob_assist, _ticketProb: p.prob_assist, archetype_badge: '🛡️ VALEUR REFUGE' });
                });
                candidates.sort((a, b) => b.best_prop_val - a.best_prop_val);

                let coverTicket = []; let currentOdds = 1.0; let usedTeams = new Set();
                for (let p of candidates) {
                    if (usedTeams.has(p.team)) continue;
                    let itemOdds = p.odds ? parseFloat(p.odds) : Math.max(1.10, 0.93 / (p.best_prop_val / 100));
                    if (itemOdds < 1.12) continue;
                    p._itemOdds = itemOdds;
                    let exactMatch = (window.fetchedMatchesPool || []).find(m => (m.home_team === p.team || m.away_team === p.team) && m.state !== 'FINAL' && m.state !== 'OFF');
                    p._matchStr = exactMatch ? `${exactMatch.home_team} vs ${exactMatch.away_team}` : `Match de ${p.team}`;
                    coverTicket.push(p); currentOdds *= itemOdds; usedTeams.add(p.team);
                    if (currentOdds >= 1.45) break;
                }

                if (coverTicket.length < 2) { container.innerHTML = `<div class="bg-gray-900 border border-red-500/50 text-red-400 p-6 rounded-xl text-center font-black uppercase tracking-widest text-xs shadow-inner">Impossible de générer une couverture fiable. Carte trop dangereuse.</div>`; return; }

                let gradeObj = { letter: 'A', color: 'text-gray-300', border: 'border-gray-500', glow: 'shadow-[0_0_20px_rgba(156,163,175,0.6)]', text: "🛡️ COUVERTURE : Sécurité maximale." };
                let html = `<div class="flex justify-between items-center bg-gray-950 border border-gray-800 p-3 rounded-xl mb-4 shadow-inner relative z-20" id="ticket-export-zone-header"><span class="text-gray-300 font-black uppercase tracking-widest text-xs md:text-sm flex items-center gap-2"><i class="fas fa-shield-alt"></i> TICKET DE COUVERTURE (HEDGING)</span><button onclick="generateCoverTicket()" class="bg-gray-900 hover:bg-white hover:text-black text-[10px] md:text-xs px-4 py-2 rounded-lg font-black uppercase tracking-widest transition border border-gray-700 shadow-lg flex items-center gap-2"><i class="fas fa-sync-alt text-gray-400"></i> Relancer</button></div><div id="ticket-export-zone" class="bg-gray-950/80 p-4 rounded-xl border-2 ${gradeObj.border} ${gradeObj.glow} relative overflow-hidden transition-all"><div class="absolute top-0 right-0 bg-gray-900 border-l border-b ${gradeObj.border} rounded-bl-2xl p-2 md:p-3 flex items-center gap-3 z-10 shadow-inner"><div class="text-right hidden sm:block"><div class="text-[8px] md:text-[9px] text-gray-500 uppercase font-black tracking-widest">Score Qualité IA</div><div class="text-[9px] md:text-[10px] ${gradeObj.color} font-bold mt-0.5 max-w-[130px] leading-tight">${gradeObj.text}</div></div><div class="text-3xl md:text-4xl font-black ${gradeObj.color} drop-shadow-[0_0_10px_currentColor]">${gradeObj.letter}</div></div><div class="pt-10 md:pt-4 pr-16 md:pr-48">`;
                let grouped = {}; coverTicket.forEach(p => { if (!grouped[p._matchStr]) grouped[p._matchStr] = []; grouped[p._matchStr].push(p); });
                Object.keys(grouped).forEach(matchStr => {
                    html += `<div class="bg-gray-900/40 border border-gray-800 rounded-xl mb-4 shadow-[0_0_15px_rgba(0,0,0,0.5)] overflow-hidden relative"><div class="absolute left-0 top-0 w-1 h-full bg-gray-500"></div><div class="bg-black/50 p-2.5 border-b border-gray-800 text-[10px] md:text-xs font-black text-gray-400 uppercase tracking-widest flex items-center gap-2 px-4"><i class="fas fa-hockey-puck text-gray-400"></i> MATCH : <span class="text-white">${matchStr}</span></div><div class="p-3 flex flex-col gap-2">`;
                    grouped[matchStr].forEach(p => {
                        let pType = p.best_prop_type === 'prob_goal' ? 'But' : (p.best_prop_type === 'prob_assist' ? 'Passe' : 'Point');
                        let safeJson = encodeURIComponent(JSON.stringify({ id: p.id, name: p.name, team: p.team, prob: p._ticketProb, type: pType })).replace(/'/g, "%27");
                        html += `<div onclick="openSmartTicketModal('${safeJson}')" class="flex items-center justify-between bg-gray-950/80 p-3 rounded-lg border border-gray-800/80 hover:border-gray-500 transition cursor-pointer group"><div class="flex items-center gap-3"><img src="${p.headshot || 'assets/logo_hockAI.png'}" class="w-10 h-10 md:w-12 md:h-12 rounded-full border border-gray-700 bg-gray-900 group-hover:scale-110 transition object-cover"><div><div class="font-black text-white text-sm md:text-base uppercase tracking-widest leading-none">${p.name}</div><div class="text-[9px] md:text-[10px] text-gray-500 font-bold tracking-widest mt-1"><span class="text-gray-300">${p.team}</span> • ${p.position}</div><div class="bg-gray-800 border border-gray-600 text-gray-300 px-1.5 py-0.5 rounded text-[8px] uppercase font-black tracking-widest text-center mt-1 w-max shadow-[0_0_8px_rgba(156,163,175,0.4)]">${p.archetype_badge}</div></div></div><div class="text-right"><div class="text-[8px] md:text-[10px] text-gray-500 uppercase font-black tracking-widest mb-1">Over 0.5 ${pType}</div><div class="font-black text-lg md:text-xl text-green-400 drop-shadow-[0_0_5px_#4ADE80]">${p._ticketProb.toFixed(1)}% <span class="text-gray-400 text-sm ml-1 font-bold">(@${p._itemOdds.toFixed(2)})</span></div></div></div>`;
                    });
                    html += `</div></div>`;
                });
                html += `</div><div class="ticket-actions mt-4 bg-gray-900 border border-gray-800 rounded-xl p-4 flex flex-col md:flex-row justify-between items-center gap-4 shadow-[0_0_20px_rgba(0,0,0,0.5)]"><div class="flex flex-col items-center md:items-start w-full md:w-auto text-center md:text-left"><div class="text-[10px] text-gray-500 uppercase tracking-widest font-bold mb-1">Cote Couverture</div><div class="text-3xl font-black text-white drop-shadow-[0_0_10px_rgba(255,255,255,0.3)]">@${currentOdds.toFixed(2)}</div></div><div class="flex flex-col sm:flex-row items-center gap-3 w-full md:w-auto"><button onclick="window.exportSmartTicketImage()" class="w-full sm:w-auto bg-gray-800 hover:bg-gray-700 text-white px-5 py-3 rounded-lg font-black text-xs uppercase tracking-widest transition shadow-lg border border-gray-600 flex items-center justify-center gap-2"><i class="fas fa-camera text-lg"></i> Exporter</button><div class="flex items-center gap-2 bg-black border border-gray-700 p-1.5 rounded-lg w-full sm:w-auto"><input type="number" id="quick-stake-input" placeholder="Mise (€)" value="10" class="w-24 bg-gray-900 border border-gray-800 text-white text-xs font-bold text-center rounded px-2 py-2.5 outline-none focus:border-money shadow-inner"><button onclick="window.addBetToBankroll('HEDGING', 'Couverture IA', ${currentOdds.toFixed(2)}, document.getElementById('quick-stake-input').value || 10)" class="w-full sm:w-auto bg-money/20 hover:bg-money text-money hover:text-black border border-money px-5 py-2.5 rounded text-xs font-black uppercase tracking-widest transition flex items-center justify-center gap-2"><i class="fas fa-save text-lg"></i> Encaisser</button></div></div></div></div>`;
                container.innerHTML = html;
            }, 800);
        };


        // Initialisation au clic
let ticketTabBtn = document.querySelector('button[onclick*="tab-tickets"]');
if (ticketTabBtn) ticketTabBtn.addEventListener('click', () => { window.updateTicketMatchSelector(); });