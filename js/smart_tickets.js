// =========================================================================
// 🧠 HOCKAI - SMART TICKETS ENGINE (Tickets Fiables, Montante, Couverture)
// =========================================================================
window.activePlayersToday = null;
window.selectedTicketMatches = new Set();
window.ticketCacheMemory = "";
window.globalMatchContexts = {};
window.currentTicketPlayers = [];
window.bannedZappingPlayers = new Set();
window.lockedTicketPlayers = new Set(); // ⚡ NOUVEAU : Mémoire des Cadenas
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
// ⚡ NOUVEAU : Ajout du paramètre zapStrategy
window.generateSmartTicket = async function (type, title, isZapping = false, zapStrategy = 'standard') {
    window.goToTicketStep(3);
    window.showFullScreenLoader();
    window.showAnalysis();
    // 📡 RADAR GOOGLE ANALYTICS : Traquer la génération de ticket
    if (typeof gtag === 'function') {
        gtag('event', 'generation_ticket', {
            'type_ticket': type
        });
    }
    let container = document.getElementById('ticket-display');
    if (!container) return;

    if (!window.selectedTicketMatches || window.selectedTicketMatches.size === 0) {
        container.innerHTML = `<div class="text-gray-500 font-bold text-center py-10 bg-gray-900 border border-gray-700 rounded-xl shadow-inner mt-4"><i class="fas fa-hand-pointer text-3xl mb-4 text-yellow-500 animate-bounce"></i><br>Retournez à l'étape 1 et sélectionnez au moins un match pour lancer l'IA.</div>`;
        window.hideFullScreenLoader();
        window.hideAnalysis();
        return;
    }

    let currentSelectionStr = Array.from(window.selectedTicketMatches).sort().join('|');
    let risk = document.getElementById('ticket-risk-profile').value;
    let total = parseInt(document.getElementById('slider-st-total').value);
    let maxPerMatch = parseInt(document.getElementById('slider-st-max').value);

    // ⚡ RESET DES MÉMOIRES SI NOUVEAU TICKET
    if (!isZapping || window.lastTicketConfig.type !== type || window.lastTicketConfig.total !== total || window.lastTicketConfig.matchStr !== currentSelectionStr || window.lastTicketConfig.risk !== risk) {
        window.currentTicketPlayers = [];
        window.bannedZappingPlayers = new Set();
        window.lockedTicketPlayers.clear(); // On vide les cadenas !
        window.lastTicketConfig = { type, title, total, matchStr: currentSelectionStr, risk, strategy: zapStrategy };
        isZapping = false;
    } else {
        // ⚡ NOUVEAU : Si on zappe, on met à jour la mémoire avec la stratégie en cours
        window.lastTicketConfig.strategy = zapStrategy;
    }

    container.innerHTML = `
        <div class="flex flex-col items-center justify-center py-20 animate-fade-in">
            <div class="w-32 h-1 bg-gray-800 rounded-full overflow-hidden mb-8">
                <div class="w-full h-full bg-blood animate-pulse"></div>
            </div>
            <div class="text-blood font-black text-[10px] md:text-xs uppercase tracking-[0.3em] mb-4">Moteur Quantique en Action</div>
            <div class="text-gray-500 text-[9px] md:text-[10px] font-bold uppercase tracking-widest" id="loader-step text-center">Initialisation de la stratégie ${zapStrategy.toUpperCase()}...</div>
        </div>
    `;

    const steps = ["Calcul des probabilités de Poisson...", "Application de la Stratégie Tactique...", "Analyse des duels PP vs PK...", "Optimisation du combiné..."];
    let stepIdx = 0;
    const stepInterval = setInterval(() => {
        const el = document.getElementById('loader-step');
        if (el && steps[stepIdx]) el.innerText = steps[stepIdx++];
        else clearInterval(stepInterval);
    }, 400);

    try {
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

        let pool = window.globalPredictionsPool.filter(p => {
            if (p.position === 'G') return false;
            if (window.activePlayersToday && window.activePlayersToday.size > 0 && !window.activePlayersToday.has(Number(p.id))) return false;
            if (window.bannedZappingPlayers.has(p.id)) return false; // Exclut les zappés
            if (window.userBannedPlayers.has(String(p.id))) return false; // Exclut l'infirmerie

            if (window.selectedTicketMatches.size > 0) {
                let isTeamInSelectedMatch = false;
                window.selectedTicketMatches.forEach(mStr => {
                    if (mStr.includes(p.team)) isTeamInSelectedMatch = true;
                });
                if (!isTeamInSelectedMatch) return false;
            }
            return true;
        });

        // ⚡ NOUVEAU : Récupération des équipes déjà verrouillées pour la stratégie Hedge
        let lockedTeams = new Set();
        if (isZapping && zapStrategy === 'hedge') {
            window.currentTicketPlayers.forEach(p => {
                if (window.lockedTicketPlayers.has(String(p.id))) lockedTeams.add(p.team);
            });
        }

        pool.forEach(p => {
            let prob = 0; let assignedRole = "Pronostic"; let mixteSortScore = 0;
            if (type === 'goal') { prob = p.prob_goal; assignedRole = 'Buteur'; }
            else if (type === 'assist') { prob = p.prob_assist; assignedRole = 'Passeur'; }
            else if (type === 'point') { prob = p.prob_point; assignedRole = 'Pointeur'; }
            else if (type === 'mixte') {
                let scoreButeur = (p.prob_goal || 0) / 30.0;
                let scorePasseur = (p.prob_assist || 0) / 48.0;
                if (scoreButeur >= scorePasseur && (p.prob_goal || 0) >= 20) { prob = p.prob_goal; assignedRole = 'Buteur'; mixteSortScore = scoreButeur * 100; } 
                else { prob = p.prob_assist; assignedRole = 'Passeur'; mixteSortScore = scorePasseur * 100; }
            } else { prob = Math.max(p.prob_goal || 0, p.prob_assist || 0, p.prob_point || 0); }

            p._ticketProb = prob || 0; p._ticketRole = assignedRole;
            let exactMatch = (window.fetchedMatchesPool || []).find(m => (m.home_team === p.team || m.away_team === p.team) && m.state !== 'FINAL' && m.state !== 'OFF');
            p._matchStr = exactMatch ? `${exactMatch.home_team} vs ${exactMatch.away_team}` : `Match de ${p.team}`;
            p.ctx_boost = 0; p.ctx_reasons = []; p.has_target_badge = false;

            // ⚡ 1. INTELLIGENCE IA : Analyse de la forme du joueur (L5)
            let statName = assignedRole === 'Buteur' ? 'Buts' : (assignedRole === 'Passeur' ? 'Passes' : 'Points');
            if (p.last_5_games && p.last_5_games.length > 0) {
                let l5 = p.last_5_games.slice(0, 5);
                let targetL5 = l5.reduce((sum, g) => sum + (assignedRole === 'Buteur' ? g.goals : (assignedRole === 'Passeur' ? g.assists : g.points)), 0);
                let sL5 = l5.reduce((sum, g) => sum + g.shots, 0);

                if (targetL5 >= 3) {
                    p.ctx_reasons.push(`<li class="flex items-start gap-2"><span class="text-[#ff3333]">🔥</span> <span><b>Dynamique Explosive :</b> Forme exceptionnelle avec ${targetL5} ${statName} (L5).</span></li>`);
                } else if (sL5 >= 15 && assignedRole === 'Buteur' && targetL5 <= 1) {
                    p.ctx_reasons.push(`<li class="flex items-start gap-2"><span class="text-[#00e5ff]">❄️</span> <span><b>Régression Positive :</b> ${sL5} tirs récents sans réussite. Rupture imminente.</span></li>`);
                } else if (p.avg_toi > 18) {
                     p.ctx_reasons.push(`<li class="flex items-start gap-2"><span class="text-[#4ADE80]">⏱️</span> <span><b>Gros Temps de Jeu :</b> Joueur clé sur-utilisé (>18 min/m).</span></li>`);
                } else {
                     p.ctx_reasons.push(`<li class="flex items-start gap-2"><span class="text-[#C084FC]">🧠</span> <span><b>Value Mathématique :</b> Avantage algorithmique (+EV) identifié.</span></li>`);
                }
            } else {
                p.ctx_reasons.push(`<li class="flex items-start gap-2"><span class="text-[#C084FC]">🤖</span> <span><b>Projection IA :</b> Avantage mathématique historique repéré.</span></li>`);
            }

            // ⚡ 2. INTELLIGENCE IA : Analyse du contexte de match (Adversaire)
            if (exactMatch && window.globalMatchContexts[p._matchStr]) {
                let ctx = window.globalMatchContexts[p._matchStr];
                let isHome = exactMatch.home_team === p.team;
                
                // Gardien
                let oppGoalie = isHome ? (ctx.goalies?.away_goalie) : (ctx.goalies?.home_goalie);
                if (oppGoalie && oppGoalie.gsax !== undefined) {
                    if (oppGoalie.gsax < -1.0) { 
                        p.ctx_boost += 4; p.has_target_badge = true; 
                        p.ctx_reasons.push(`<li class="flex items-start gap-2"><span class="text-[#ff3333]">🎯</span> <span><b>Cible Facile :</b> Gardien adverse vulnérable (GSAx négatif).</span></li>`); 
                    } else if (oppGoalie.gsax > 3.0) { 
                        p.ctx_boost -= 3; 
                        // On remplace le premier argument si c'est un danger majeur
                        p.ctx_reasons[0] = `<li class="flex items-start gap-2"><span class="text-orange-500">🛡️</span> <span><b>Mur Défensif :</b> Gardien adverse en feu. Risque élevé.</span></li>`; 
                    }
                }
                
                // Fatigue (Back-to-Back)
                if (ctx.teams) {
                    let oppTeamStats = isHome ? ctx.teams.away : ctx.teams.home;
                    if (oppTeamStats && oppTeamStats.b2b && p.ctx_reasons.length < 2) {
                        p.ctx_reasons.push(`<li class="flex items-start gap-2"><span class="text-orange-500">🔋</span> <span><b>Adversaire Épuisé :</b> L'équipe adverse joue en Back-to-Back.</span></li>`);
                    }
                }
            }

            // ⚡ SÉCURITÉ DESIGN : On ne garde que les 2 arguments les plus pertinents maximum pour ne pas déborder sur l'image
            p.ctx_reasons = p.ctx_reasons.slice(0, 2);

            p._ticketProb = Math.min(99.0, p._ticketProb + p.ctx_boost);
            let itemOdds = p.odds ? parseFloat(p.odds) : Math.max(1.10, 0.93 / (p._ticketProb / 100));

            // ⚡⚡ LE COEUR DE L'INTELLIGENCE (ZAPPING STRATÉGIQUE) ⚡⚡
            let baseScore = type === 'mixte' ? (mixteSortScore + p.ctx_boost * 3) : p._ticketProb + p.ctx_boost;
            
            if (isZapping && zapStrategy === 'ev') {
                // Stratégie VALUE : On favorise ceux qui ont une cote disproportionnée
                p._ticketScore = (p._ticketProb / 100) * itemOdds * 100; 
            } else {
                p._ticketScore = baseScore;
                if (risk === 'safe') p._ticketScore += (p.avg_toi || 15);
                if (risk === 'poker') {
                    let rShots = p.last_5_games ? p.last_5_games.reduce((s, g) => s + g.shots, 0) : 0;
                    let rGoals = p.last_5_games ? p.last_5_games.reduce((s, g) => s + g.goals, 0) : 0;
                    p._ticketScore = (rShots - (rGoals * 5)) * 2 + p.ctx_boost;
                }
            }

            // Stratégie COUVERTURE : On pénalise lourdement les joueurs des équipes déjà ciblées
            if (isZapping && zapStrategy === 'hedge' && lockedTeams.has(p.team)) {
                p._ticketScore -= 50; 
            }
        });

        pool.sort((a, b) => b._ticketScore - a._ticketScore);

        let selected = [];
        let matchCounts = {};
        let matchRoles = {}; 

        // ⚡ NOUVEAU : LA LOGIQUE DES CADENAS
        if (isZapping && window.currentTicketPlayers.length > 0) {
            window.currentTicketPlayers.forEach(p => {
                if (window.lockedTicketPlayers.has(String(p.id))) {
                    // C'est un PILIER choisi par l'utilisateur, on le garde !
                    selected.push(p);
                    let m = p._matchStr;
                    if (!matchCounts[m]) matchCounts[m] = 0;
                    if (!matchRoles[m]) matchRoles[m] = new Set();
                    matchCounts[m]++;
                    matchRoles[m].add(p._ticketRole);
                } else {
                    // Il n'est pas verrouillé, on le banni pour qu'un NOUVEAU joueur prenne sa place
                    window.bannedZappingPlayers.add(p.id);
                }
            });
        }
        
        // On complète le reste du ticket avec les nouveaux cerveaux
        if (selected.length < total) {
            for (let p of pool) {
                if (selected.length >= total) break;
                if (selected.some(k => k.id === p.id)) continue;
                if (window.bannedZappingPlayers.has(p.id)) continue;
                let m = p._matchStr;
                if (!matchCounts[m]) matchCounts[m] = 0;
                if (!matchRoles[m]) matchRoles[m] = new Set();

                if (type === 'mixte' && matchRoles[m].has(p._ticketRole)) continue;

                if (matchCounts[m] < maxPerMatch) {
                    selected.push(p);
                    matchCounts[m]++;
                    matchRoles[m].add(p._ticketRole);
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

        // DESIGN DU HEADER DU TICKET
        let riskColor = risk === 'safe' ? 'text-green-400' : (risk === 'poker' ? 'text-purple-400' : 'text-blood');
        let html = `
            <div class="flex justify-between items-center bg-gray-950 border border-gray-800 p-3 md:p-4 rounded-2xl mb-4 md:mb-5 shadow-inner" id="ticket-export-zone-header">
                <span class="${riskColor} font-black uppercase tracking-[0.2em] text-[10px] md:text-sm flex items-center gap-2">
                    <i class="fas fa-ticket-alt"></i> <span class="truncate">${title}</span>
                </span>
                <button onclick="window.openZappingMenu('${type}', '${title}')" class="bg-gray-900 hover:bg-white hover:text-black text-[9px] md:text-xs px-3 md:px-5 py-2 md:py-3 rounded-lg font-black uppercase tracking-widest transition border border-purple-500/50 shadow-[0_0_10px_rgba(168,85,247,0.3)] flex items-center gap-2 group active:scale-95 shrink-0">
                    <i class="fas fa-random text-purple-400 group-hover:text-black"></i> Menu Tactique
                </button>
            </div>

            <div id="ticket-export-zone" class="bg-gray-950/80 p-3 md:p-5 rounded-2xl md:rounded-3xl border-2 ${gradeObj.border} ${gradeObj.glow} flex flex-col gap-4 md:gap-5 transition-all shadow-xl">
                
                <div class="flex justify-between items-center bg-gray-900 border border-gray-800 ${gradeObj.border} rounded-xl p-3 md:p-4 shadow-inner">
                    <div class="flex flex-col">
                        <span class="text-[9px] md:text-[10px] text-gray-500 uppercase font-black tracking-widest">Score Qualité IA</span>
                        <span class="text-[9px] md:text-xs ${gradeObj.color} font-bold mt-0.5 leading-tight">${gradeObj.text}</span>
                    </div>
                    <div class="text-3xl md:text-4xl font-black ${gradeObj.color} drop-shadow-[0_0_10px_currentColor] ml-2">${gradeObj.letter}</div>
                </div>
                
                <div class="flex flex-col gap-4 md:gap-6">
        `;

        Object.keys(grouped).forEach(matchStr => {
            html += `
                <div class="bg-black/40 border border-gray-800 rounded-2xl shadow-inner overflow-hidden">
                    <div class="bg-gray-900/60 p-3 border-b border-gray-800 text-[10px] md:text-xs font-black text-gray-400 uppercase tracking-widest flex items-center gap-3 px-4 md:px-5">
                        <i class="fas fa-hockey-puck text-ice"></i> <span class="text-white truncate flex-1">${matchStr}</span>
                    </div>
                    <div class="p-3 flex flex-col gap-3">
            `;

            grouped[matchStr].forEach(p => {
                let pType = p._ticketRole;
                let probTextCol = p._ticketProb >= 50 ? 'text-green-400' : (p._ticketProb >= 40 ? 'text-ice' : 'text-gray-400');
                let itemOdds = p.odds ? parseFloat(p.odds) : Math.max(1.10, 0.93 / (p._ticketProb / 100));
                let targetBadgeHtml = p.has_target_badge ? `<i class="fas fa-crosshairs text-blood animate-ping drop-shadow-[0_0_5px_#ff3333] ml-2 text-[10px]" title="Cible IA"></i>` : '';
                
                let imgUrl = p.id ? `https://assets.nhle.com/mugs/nhl/latest/${p.id}.png` : 'assets/logo_hockAI.png';
                let posCheck = String(p.position).toLowerCase().trim();
                let positionStr = (!p.position || posCheck === 'undefined' || posCheck === 'null' || posCheck === '') ? '' : ` • ${p.position}`;
                
                let nameParts = p.name.split(' ');
                let firstName = nameParts[0];
                let lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : firstName;
                let displayFirst = nameParts.length > 1 ? firstName : '';

                let safeJson = encodeURIComponent(JSON.stringify({ id: p.id, name: p.name, team: p.team, prob: p._ticketProb, type: pType, ctx_reasons: p.ctx_reasons })).replace(/'/g, "%27");

                // ⚡ NOUVEAU : Logique d'affichage du cadenas (Garde l'état visuel lors des rechargements)
                let isLocked = window.lockedTicketPlayers.has(String(p.id));
                let lockClass = isLocked ? 'text-yellow-500 border-yellow-500/50 bg-yellow-500/10' : 'text-gray-500 border-gray-700 bg-gray-900 hover:text-yellow-400 hover:border-yellow-400';
                let lockIcon = isLocked ? 'fa-lock' : 'fa-unlock';

                html += `
                    <div class="flex flex-col bg-gray-950 p-3 md:p-4 rounded-xl border ${isLocked ? 'border-yellow-500/50' : 'border-gray-800 hover:border-ice/50'} transition cursor-pointer group gap-3" onclick="openSmartTicketModal('${safeJson}')">
                        
                        <div class="grid grid-cols-[1fr,auto] items-start gap-2 md:gap-3 w-full">
                            
                            <div class="flex flex-col min-w-0 justify-center flex-1 pt-0.5 pr-2 border-r border-gray-800/60">
                                ${displayFirst ? `<div class="font-bold text-gray-400 text-[10px] md:text-xs capitalize tracking-wider truncate mb-1">${displayFirst}</div>` : ''}
                                <div class="font-black text-white text-sm md:text-base uppercase tracking-widest leading-tight break-words group-hover:text-ice transition">${lastName}</div>
                                <div class="text-[9px] text-gray-500 font-bold tracking-widest truncate mt-1 flex items-center">
                                    ${p.team}${positionStr} ${targetBadgeHtml}
                                </div>
                            </div>
                            
                            <div class="flex flex-col items-center gap-1 shrink-0 pl-1">
                                <div class="relative shrink-0">
                                    <div class="absolute inset-0 ${isLocked ? 'bg-yellow-500/20' : 'bg-ice/20'} rounded-full blur group-hover:bg-ice/40 transition"></div>
                                    <img src="${imgUrl}" onerror="this.src='assets/logo_hockAI.png'" class="relative w-12 h-12 md:w-14 md:h-14 rounded-full border-2 ${isLocked ? 'border-yellow-500' : 'border-gray-700 group-hover:border-ice'} bg-gray-900 object-cover z-10 transition">
                                </div>
                                <div class="flex flex-col items-center mt-1 pt-1.5 border-t border-gray-800 w-full">
                                    <div class="text-[8px] md:text-[9px] text-gray-400 uppercase font-black tracking-widest mb-1 bg-gray-900 px-1.5 py-0.5 rounded border border-gray-700">${pType}</div>
                                    <div class="font-black text-lg md:text-xl ${probTextCol} drop-shadow-[0_0_8px_currentColor] my-0.5 leading-none">${p._ticketProb.toFixed(1)}%</div>
                                    <div class="text-[9px] text-gray-400 font-bold mt-0.5">@${itemOdds.toFixed(2)}</div>
                                </div>
                            </div>
                        </div>

                        <div class="flex justify-between items-center w-full pt-2.5 border-t border-gray-800/60 gap-2 shrink-0">
                            <button id="lock-btn-${p.id}" onclick="event.stopPropagation(); window.togglePlayerLock('${p.id}')" class="${lockClass} px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition shadow-md flex items-center gap-1 shrink-0" title="Verrouiller ce joueur pour le prochain Zapping">
                                <i class="fas ${lockIcon}"></i> Lock
                            </button>
                            
                            <div class="flex items-center gap-2 w-full sm:w-auto justify-end">
                                <button onclick="event.stopPropagation(); window.jumpToPlayerScouting('${p.name.replace(/'/g, "\\'")}')" class="flex-1 sm:flex-none justify-center bg-gray-900 hover:bg-green-500 hover:text-black border border-gray-700 hover:border-green-500 text-gray-400 px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition shadow-md flex items-center gap-1">
                                    <i class="fas fa-search text-green-500 group-hover:text-current"></i> Scout
                                </button>
                                <button onclick="event.stopPropagation(); window.banPlayerFromTickets('${p.id}', '${p.name.replace(/'/g, "\\'")}', '${p.team}')" class="flex-1 sm:flex-none justify-center bg-gray-900 hover:bg-blood hover:text-white border border-gray-700 hover:border-blood text-gray-400 px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition shadow-md flex items-center gap-1">
                                    <i class="fas fa-ban text-blood group-hover:text-current"></i> Bannir
                                </button>
                            </div>
                        </div>

                    </div>
                `;
            });

            html += `</div></div>`;
        });

        // ACTIONS DU TICKET (Boutons Encaisser, Exporter...)
        html += `
                </div> 
                <div class="ticket-actions mt-5 bg-gray-900 border border-gray-800 rounded-2xl p-4 md:p-5 flex flex-col gap-4 shadow-inner relative z-10">
                    <div class="flex flex-col lg:flex-row justify-between items-center gap-5 w-full">
                        <div class="flex flex-col items-center lg:items-start w-full lg:w-auto text-center lg:text-left">
                            <div class="text-[10px] text-gray-500 uppercase tracking-widest font-bold mb-1.5">Cote Totale (Équitable)</div>
                            <div class="text-3xl md:text-4xl font-black text-yellow-500 drop-shadow-[0_0_12px_rgba(234,179,8,0.5)]">@${totalTicketOdds.toFixed(2)}</div>
                        </div>
                        <div class="flex flex-col sm:flex-row items-center gap-3 w-full lg:w-auto">
                            <button onclick="window.exportSmartTicketImage()" class="w-full sm:w-auto bg-gray-800 hover:bg-white hover:text-black text-white px-5 py-3.5 rounded-xl font-black text-[10px] md:text-xs uppercase tracking-widest transition shadow-lg border border-gray-600 flex items-center justify-center gap-3 active:scale-95 shrink-0">
                                <i class="fas fa-camera text-base text-ice group-hover:text-black"></i> Exporter
                            </button>
                            <div class="flex items-center gap-2 bg-black/50 border border-gray-700 p-2 rounded-xl w-full sm:w-auto shrink-0">
                                <input type="number" id="quick-stake-input" placeholder="€" value="10" class="w-16 md:w-20 bg-gray-900 border border-gray-800 text-white text-[10px] md:text-xs font-bold text-center rounded-lg p-3 outline-none focus:border-money shadow-inner">
                                <button onclick="window.addBetToBankroll('TICKET IA', '${title} (${selected.length} Sélections)', ${totalTicketOdds.toFixed(2)}, document.getElementById('quick-stake-input').value || 10)" class="w-full sm:w-auto bg-money/10 hover:bg-money text-money hover:text-black border border-money px-5 py-3 rounded-lg text-[10px] md:text-xs font-black uppercase tracking-widest transition flex items-center justify-center gap-2 active:scale-95">
                                    <i class="fas fa-save text-base"></i> Encaisser
                                </button>
                            </div>
                        </div>
                    </div>
                    
                    <button onclick="window.executeShieldFractionation()" class="w-full bg-cyan-900/30 hover:bg-cyan-900/60 border border-dashed border-cyan-500/50 hover:border-cyan-400 py-3.5 rounded-xl font-black uppercase tracking-widest text-[10px] md:text-xs transition flex flex-col md:flex-row items-center justify-center gap-2 md:gap-3 group shadow-inner text-cyan-400 mt-2">
                        <div class="flex items-center gap-2">
                            <i class="fas fa-shield-virus text-lg group-hover:scale-110 transition"></i> 
                            Activer le Bouclier IA (Anti-Variance)
                        </div>
                        <span class="text-[8px] md:text-[9px] text-cyan-200/50 hidden md:inline">• Découpe ce ticket en duos/trios sécurisés</span>
                    </button>

                </div>
            </div> `;

        setTimeout(() => {
            if (typeof stepInterval !== 'undefined') clearInterval(stepInterval); // On arrête l'animation de texte
            container.innerHTML = html;
            window.hideAnalysis();
            window.hideFullScreenLoader();
            window.renderBlacklistZone();
        }, 3000);

    } catch (err) {
        console.error("Erreur IA:", err);
        container.innerHTML = `<div class="text-blood font-bold text-center py-10">Erreur de génération.</div>`;
        window.hideFullScreenLoader();
    }
}; // <-- C'EST ICI QUE LA FONCTION SE FERME PROPREMENT

// ==========================================
// 4. MOTEUR D'INFIRMERIE & BANNISSEMENT (CONNECTÉ À SUPABASE)
// ==========================================

window.userBannedPlayers = new Set();
window.bannedPlayersDetails = {};

// 1. Charger l'infirmerie depuis Supabase au démarrage
window.loadBannedPlayers = async function () {
    if (!window.isUserLoggedIn || typeof supabaseClient === 'undefined') {
        window.userBannedPlayers.clear();
        window.bannedPlayersDetails = {};
        if (typeof renderBlacklistZone === 'function') renderBlacklistZone();
        return;
    }

    try {
        const { data, error } = await supabaseClient
            .from('banned_players')
            .select('*');

        if (error) throw error;

        window.userBannedPlayers.clear();
        window.bannedPlayersDetails = {};

        data.forEach(player => {
            window.userBannedPlayers.add(String(player.player_id));
            window.bannedPlayersDetails[String(player.player_id)] = { name: player.player_name, team: player.team };
        });

        if (typeof renderBlacklistZone === 'function') renderBlacklistZone();
    } catch (e) {
        console.error("Erreur chargement infirmerie :", e);
    }
};

// 2. Ajouter un joueur à l'infirmerie
window.banPlayerFromTickets = async function (id, name, team) {
    if (!window.isUserLoggedIn || typeof supabaseClient === 'undefined') {
        alert("🛡️ Vous devez être connecté pour utiliser l'infirmerie manuelle.");
        window.openAuthModal();
        return;
    }

    // Ajout visuel instantané pour plus de fluidité
    window.userBannedPlayers.add(String(id));
    window.bannedPlayersDetails[String(id)] = { name, team };
    window.renderBlacklistZone();

    // ⚡ ASTUCE CHIRURGICALE : On verrouille automatiquement tous les AUTRES joueurs du ticket !
    if (window.currentTicketPlayers && window.currentTicketPlayers.length > 0) {
        window.currentTicketPlayers.forEach(p => {
            if (String(p.id) !== String(id)) {
                window.lockedTicketPlayers.add(String(p.id));
            }
        });
    }

    // On relance l'IA en mode "Zapping" (true) pour conserver les joueurs verrouillés
    let currentStrategy = window.lastTicketConfig.strategy || 'standard';
    window.generateSmartTicket(window.lastTicketConfig.type, window.lastTicketConfig.title || 'Ticket IA', true, currentStrategy);

    // Sauvegarde en base de données Supabase
    try {
        const { data: { user } } = await supabaseClient.auth.getUser();
        const { error } = await supabaseClient
            .from('banned_players')
            .insert([{ user_id: user.id, player_id: String(id), player_name: name, team: team }]);

        if (error) throw error;
    } catch (e) {
        console.error("Erreur ajout infirmerie :", e);
    }
};

// 3. Retirer un joueur de l'infirmerie
window.unbanPlayerFromTickets = async function (id) {
    if (!window.isUserLoggedIn || typeof supabaseClient === 'undefined') return;

    // Retrait visuel instantané
    window.userBannedPlayers.delete(String(id));
    delete window.bannedPlayersDetails[String(id)];
    window.renderBlacklistZone();

    // Suppression en base de données Supabase
    try {
        const { error } = await supabaseClient
            .from('banned_players')
            .delete()
            .eq('player_id', String(id));

        if (error) throw error;
    } catch (e) {
        console.error("Erreur suppression infirmerie :", e);
    }
};

// 4. Rendu Visuel de la liste noire
window.renderBlacklistZone = function () {
    let container = document.getElementById('blacklist-zone');
    if (!container) {
        let td = document.getElementById('ticket-display');
        if (!td) return;
        container = document.createElement('div'); 
        container.id = 'blacklist-zone'; 
        container.className = 'mt-6 max-w-7xl mx-auto px-2 fade-in';
        td.parentNode.insertBefore(container, td.nextSibling);
    }
    
    if (!window.userBannedPlayers || window.userBannedPlayers.size === 0) { 
        container.innerHTML = ''; 
        return; 
    }
    
    let html = `
        <div class="bg-gray-900 border border-blood/50 p-4 rounded-xl shadow-lg">
            <div class="flex justify-between items-center mb-3 border-b border-gray-800 pb-2">
                <h4 class="text-blood font-black uppercase tracking-widest text-xs flex items-center">
                    <i class="fas fa-ambulance mr-2"></i> Infirmerie Manuelle
                </h4>
                <button onclick="window.clearAllBannedPlayers()" class="text-gray-500 hover:text-blood text-[9px] uppercase font-black tracking-widest transition flex items-center gap-1">
                    <i class="fas fa-trash-alt"></i> Vider
                </button>
            </div>
            <div class="flex flex-wrap gap-2">
    `;
    
    window.userBannedPlayers.forEach(id => {
        let info = window.bannedPlayersDetails[id] || { name: "Inconnu", team: "---" };
        html += `
            <div class="bg-black border border-gray-700 px-3 py-1.5 rounded-lg flex items-center gap-3 text-xs shadow-inner">
                <div>
                    <span class="text-white font-bold">${info.name}</span>
                    <span class="text-gray-500 text-[9px] uppercase ml-1">${info.team}</span>
                </div>
                <button onclick="window.unbanPlayerFromTickets('${id}')" class="text-green-500 hover:text-green-400 bg-gray-800 rounded-full w-5 h-5 flex items-center justify-center transition shadow-lg" title="Réintégrer le joueur">
                    <i class="fas fa-undo text-[10px]"></i>
                </button>
            </div>`;
    });
    container.innerHTML = html + `</div></div>`;
};

// 5. Vider toute l'infirmerie d'un coup
window.clearAllBannedPlayers = async function() {
    if (!window.isUserLoggedIn || typeof supabaseClient === 'undefined') return;

    if(confirm("Voulez-vous vraiment vider toute l'infirmerie ?")) {
        // Retrait visuel
        window.userBannedPlayers.clear();
        window.bannedPlayersDetails = {};
        window.renderBlacklistZone();

        // Suppression totale en base de données Supabase pour cet utilisateur
        try {
            const { data: { user } } = await supabaseClient.auth.getUser();
            const { error } = await supabaseClient
                .from('banned_players')
                .delete()
                .eq('user_id', user.id);

            if (error) throw error;
        } catch (e) {
            console.error("Erreur suppression totale infirmerie :", e);
        }
    }
};

// ==========================================
// 5. MOTEUR D'EXPORTATION PHOTO (QUANTUM-DATA CARD)
// ==========================================

window.downloadFromIOSModal = async function() {
    if (!window.currentExportImgData) return;
    try {
        const res = await fetch(window.currentExportImgData);
        const blob = await res.blob();
        const file = new File([blob], "HOCKAI_Quantum_Ticket.png", { type: "image/png" });

        if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
            await navigator.share({ files: [file], title: 'Ticket IA HOCKAI' });
        } else {
            let link = document.createElement('a'); link.download = 'HOCKAI_Quantum_Ticket.png'; link.href = window.currentExportImgData; document.body.appendChild(link); link.click(); document.body.removeChild(link);
        }
    } catch (e) { console.error("Erreur de sauvegarde :", e); }
};

window.exportSmartTicketImage = async function () {
    // 📡 RADAR GOOGLE : Exportation d'une image
    if (typeof gtag === 'function') {
        gtag('event', 'export_image', {
            'type_image': 'Ticket IA'
        });
    }
    if (typeof html2canvas === 'undefined') { alert("Module en chargement..."); return; }
    let ticketContainer = document.getElementById('ticket-export-zone'); if (!ticketContainer) return;
    
    if (typeof showFullScreenLoader === 'function') showFullScreenLoader("Génération de l'image", "Création de la carte Premium...", false);

    try {
        // 1. Extraction des données
        let playersData = [];
        let ticketCards = ticketContainer.querySelectorAll('[onclick^="openSmartTicketModal"]');
        
        ticketCards.forEach(card => {
            let onclickAttr = card.getAttribute('onclick');
            let match = onclickAttr.match(/openSmartTicketModal\('([^']+)'\)/);
            if (match && match[1]) {
                try {
                    let p = JSON.parse(decodeURIComponent(match[1]));
                    playersData.push(p);
                } catch (e) {}
            }
        });

        if (playersData.length === 0) throw new Error("Aucun joueur détecté.");

        // 2. Conversion Base64 des portraits
        for (let i = 0; i < playersData.length; i++) {
            let p = playersData[i];
            let imgUrl = p.id ? `https://assets.nhle.com/mugs/nhl/latest/${p.id}.png` : 'assets/logo_hockAI.png';
            try {
                let res = await fetch(API_BASE + '/proxy-image-base64?url=' + encodeURIComponent(imgUrl));
                let data = await res.json();
                p.base64Img = data.base64 ? data.base64 : 'assets/logo_hockAI.png';
            } catch (e) { p.base64Img = 'assets/logo_hockAI.png'; }
        }

        // 3. Construction du MASTERPIECE (Off-Screen)
        let exportHtml = `
        <div id="quantum-export-container" class="bg-[#05080f] flex flex-col relative overflow-hidden" style="width: 650px; position: fixed; top: -9999px; left: 0; z-index: -100; font-family: 'Montserrat', sans-serif;">
            
            <div class="absolute inset-0 flex items-center justify-center pointer-events-none z-0 overflow-hidden">
                <div class="text-[#00e5ff] opacity-[0.03] font-black text-[140px] transform -rotate-45 tracking-[0.2em] whitespace-nowrap select-none">HOCKAI.FR HOCKAI.FR</div>
            </div>

            <div class="relative w-full pt-10 pb-8 px-6 bg-gradient-to-b from-[#00e5ff]/10 to-transparent border-b-2 border-[#00e5ff]/40 z-10 flex flex-col items-center">
                <div class="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_rgba(0,229,255,0.3)_0%,_transparent_60%)] blur-2xl"></div>
                <img src="assets/logo_hockAI.png" style="height: 110px; filter: drop-shadow(0 0 25px rgba(0,229,255,1));" class="relative z-20 mb-4">
                <h1 class="text-white font-black text-4xl tracking-[0.25em] uppercase drop-shadow-[0_0_10px_rgba(255,255,255,0.8)] relative z-20 text-center">TICKET INTELLIGENT</h1>
                
                <div class="mt-5 px-8 py-2 bg-[#0a0f1a] border-2 border-[#00e5ff] rounded-full shadow-[0_0_20px_rgba(0,229,255,0.6)] relative z-20">
                    <span class="text-[#00e5ff] font-black tracking-[0.4em] text-xl drop-shadow-[0_0_8px_#00e5ff]">WWW.HOCKAI.FR</span>
                </div>
            </div>

            <div class="flex flex-col gap-6 px-8 py-8 relative z-10">
        `;

        playersData.forEach(p => {
            let nameParts = p.name.split(' ');
            let firstName = nameParts[0];
            let lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : firstName;
            let displayFirst = nameParts.length > 1 ? firstName : '';
            
            let ctxHtml = '';
            if (p.ctx_reasons && p.ctx_reasons.length > 0) {
                ctxHtml = `
                <div class="px-6 pb-4 relative z-20 border-t border-[#475569]/30 pt-4 bg-black/40">
                    <div class="text-[11px] text-[#00e5ff] font-black uppercase tracking-[0.2em] mb-2 flex items-center gap-2">
                        <i class="fas fa-microchip"></i> Analyse IA
                    </div>
                    <ul class="text-[13px] text-gray-300 space-y-1.5 font-bold leading-snug list-none m-0 p-0 text-left">
                        ${p.ctx_reasons.join('')}
                    </ul>
                </div>`;
            }

            exportHtml += `
            <div class="relative bg-gradient-to-r from-[#0f172a] to-[#05080f] border-2 border-[#475569] rounded-2xl overflow-hidden shadow-[0_0_30px_rgba(0,0,0,0.8)]">
                
                <div class="absolute top-0 left-0 w-1.5 h-full bg-gradient-to-b from-[#00e5ff] via-[#3b82f6] to-[#00e5ff] shadow-[0_0_15px_#00e5ff]"></div>
                
                <div class="relative p-5 flex items-center gap-6 z-20">
                    
                    <div class="relative z-30 shrink-0 ml-2">
                        <img src="${p.base64Img}" crossorigin="anonymous" class="w-28 h-28 rounded-full border-[3px] border-[#00e5ff] bg-[#0a0f1a] object-cover shadow-[0_0_20px_rgba(0,229,255,0.5)]">
                        <div class="absolute -bottom-1 -right-1 w-8 h-8 bg-gradient-to-br from-yellow-300 to-yellow-600 rounded-full border-2 border-black shadow-[0_0_10px_#eab308] flex items-center justify-center">
                            <span class="text-black font-black text-[10px] tracking-widest">IA</span>
                        </div>
                    </div>

                    <div class="relative z-30 flex flex-col text-left w-full justify-center">
                        <div class="text-lg font-bold text-gray-300 uppercase tracking-widest leading-none">${displayFirst}</div>
                        <div class="text-3xl font-black text-white uppercase tracking-widest mt-1 drop-shadow-md leading-none">${lastName}</div>
                        <div class="text-xs text-gray-500 font-black uppercase tracking-[0.3em] mt-2 mb-3">${p.team}</div>

                        <div class="inline-block bg-[#00e5ff]/10 border border-[#00e5ff]/50 rounded-lg py-2 px-4 w-max shadow-inner">
                            <span class="text-[#00e5ff] font-black text-xl uppercase tracking-[0.1em] drop-shadow-[0_0_5px_rgba(0,229,255,0.8)]">${p.type} : ${p.prob.toFixed(1)}%</span>
                        </div>
                    </div>
                </div>
                ${ctxHtml}
            </div>
            `;
        });

        exportHtml += `
            </div>
            
            <div class="relative w-full mt-2 pt-8 pb-10 bg-gradient-to-t from-[#00e5ff]/15 to-transparent border-t-2 border-[#00e5ff]/30 z-10 text-center">
                <p class="text-gray-300 text-base font-bold uppercase tracking-[0.2em] mb-2">Générez vos propres pronostics sur</p>
                <p class="text-[#00e5ff] text-4xl font-black uppercase tracking-[0.3em] drop-shadow-[0_0_20px_#00e5ff]">HOCKAI.FR</p>
            </div>
        </div>`;

        // 4. Injection, Capture et Nettoyage
        let wrapper = document.createElement('div');
        wrapper.innerHTML = exportHtml;
        document.body.appendChild(wrapper.firstElementChild);
        let exportContainer = document.getElementById('quantum-export-container');

        await new Promise(r => setTimeout(r, 800));

        const canvas = await html2canvas(exportContainer, {
            backgroundColor: '#05080f',
            scale: 2, 
            useCORS: true,
            logging: false
        });

        const imgData = canvas.toDataURL('image/png');
        window.currentExportImgData = imgData;
        exportContainer.remove();

        const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
        const isMacSafari = /Macintosh/.test(navigator.userAgent) && /Safari/.test(navigator.userAgent) && !/Chrome/.test(navigator.userAgent);

        if (isIOS || (isMacSafari && navigator.maxTouchPoints > 1)) {
            let modal = document.getElementById('ios-export-modal');
            if (!modal) {
                modal = document.createElement('div'); modal.id = 'ios-export-modal';
                modal.className = 'fixed inset-0 bg-black/95 z-[9999] hidden flex-col items-center justify-center p-4 backdrop-blur-md';
                document.body.appendChild(modal);
            }
            modal.innerHTML = `
                <div class="w-full max-w-md flex flex-col items-center max-h-screen py-4 overflow-y-auto no-scrollbar">
                    <div class="bg-gray-900 border border-gray-700 rounded-xl p-5 w-full text-center shadow-lg mb-4 shrink-0 mt-8">
                        <h3 class="text-white font-black uppercase tracking-widest text-sm mb-3"><i class="fas fa-mobile-alt text-ice mr-2"></i> Exporter le Ticket Premium</h3>
                        <button onclick="window.downloadFromIOSModal()" class="w-full bg-ice hover:bg-cyan-400 text-black font-black uppercase tracking-widest text-xs px-4 py-3.5 rounded-lg transition-all shadow-[0_0_15px_rgba(0,229,255,0.4)] flex items-center justify-center gap-2 mb-3 active:scale-95">
                            <i class="fas fa-download text-lg"></i> Enregistrer l'image
                        </button>
                        <p class="text-[9px] text-gray-500 font-bold uppercase tracking-widest leading-relaxed border-t border-gray-800 pt-3">Ou maintenez votre doigt appuyé sur l'image ci-dessous.</p>
                    </div>
                    <div class="relative w-full rounded-xl overflow-hidden border-2 border-[#00e5ff] shadow-[0_0_30px_rgba(0,229,255,0.3)] shrink-0 bg-[#0a0f1a]">
                        <img src="${imgData}" class="w-full h-auto object-contain block" style="-webkit-touch-callout: default; -webkit-user-select: none; user-select: none; pointer-events: auto;">
                    </div>
                    <button onclick="document.getElementById('ios-export-modal').classList.add('hidden');" class="mt-6 mb-8 bg-gray-800 hover:bg-red-500 text-white font-black uppercase tracking-widest text-xs px-8 py-4 rounded-full transition-all shadow-lg flex items-center gap-2 shrink-0">
                        <i class="fas fa-times"></i> Fermer
                    </button>
                </div>
            `;
            modal.classList.remove('hidden');
            modal.classList.add('flex');
        } else {
            let link = document.createElement('a'); link.download = 'HOCKAI_Quantum_Ticket.png'; link.href = imgData; document.body.appendChild(link); link.click(); document.body.removeChild(link);
        }
    } catch (e) {
        console.error("Erreur Capture:", e);
        alert("L'analyse visuelle a échoué. Veuillez réessayer.");
    } finally {
        if (typeof hideFullScreenLoader === 'function') hideFullScreenLoader();
    }
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
window.generatePalier200 = async function () {
    window.showFullScreenLoader();
    window.showAnalysis();

    // --- NOUVEAU : Navigation ---
    window.goToTicketStep(3);
    // ----------------------------
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
        let html = `
            <div class="flex justify-between items-center bg-gray-950 border border-gray-800 p-3 md:p-4 rounded-2xl mb-4 md:mb-5 shadow-inner" id="ticket-export-zone-header">
                <span class="text-yellow-500 font-black uppercase tracking-widest text-[10px] md:text-sm flex items-center gap-2">
                    <i class="fas fa-stairs"></i> <span class="truncate">MONTANTE : LE PALIER @2.00</span>
                </span>
                <button onclick="generatePalier200()" class="bg-gray-900 hover:bg-white hover:text-black text-[9px] md:text-xs px-3 md:px-5 py-2 md:py-3 rounded-lg font-black uppercase tracking-widest transition border border-gray-700 shadow-lg flex items-center gap-2 shrink-0">
                    <i class="fas fa-sync-alt text-yellow-500"></i> Relancer
                </button>
            </div>
            
            <div id="ticket-export-zone" class="bg-gray-950/80 p-3 md:p-5 rounded-2xl md:rounded-3xl border-2 ${gradeObj.border} ${gradeObj.glow} flex flex-col gap-4 md:gap-5 transition-all shadow-xl">
                
                <div class="flex justify-between items-center bg-gray-900 border border-gray-800 ${gradeObj.border} rounded-xl p-3 md:p-4 shadow-inner">
                    <div class="flex flex-col">
                        <span class="text-[9px] md:text-[10px] text-gray-500 uppercase font-black tracking-widest">Score Qualité IA</span>
                        <span class="text-[9px] md:text-xs ${gradeObj.color} font-bold mt-0.5 leading-tight">${gradeObj.text}</span>
                    </div>
                    <div class="text-3xl md:text-4xl font-black ${gradeObj.color} drop-shadow-[0_0_10px_currentColor] ml-2">${gradeObj.letter}</div>
                </div>
                
                <div class="flex flex-col gap-4 md:gap-6">
        `;
        let grouped = {}; finalTicket.forEach(p => { if (!grouped[p._matchStr]) grouped[p._matchStr] = []; grouped[p._matchStr].push(p); });
        Object.keys(grouped).forEach(matchStr => {
            html += `
                <div class="bg-black/40 border border-gray-800 rounded-2xl shadow-inner overflow-hidden">
                    <div class="bg-gray-900/60 p-3 border-b border-gray-800 text-[10px] md:text-xs font-black text-gray-400 uppercase tracking-widest flex items-center gap-3 px-4 md:px-5">
                        <i class="fas fa-hockey-puck text-ice"></i> MATCH : <span class="text-white truncate flex-1">${matchStr}</span>
                    </div>
                    <div class="p-3 flex flex-col gap-3">
            `;
            grouped[matchStr].forEach(p => {
                let pType = p._ticketRole || (p.best_prop_type === 'prob_goal' ? 'But' : (p.best_prop_type === 'prob_assist' ? 'Passe' : 'Point'));
                let imgUrl = p.id ? `https://assets.nhle.com/mugs/nhl/latest/${p.id}.png` : 'assets/logo_hockAI.png';
                let posCheck = String(p.position).toLowerCase().trim();
                let positionStr = (!p.position || posCheck === 'undefined' || posCheck === 'null' || posCheck === '') ? '' : ` • ${p.position}`;
                
                // SÉPARATION NOM / PRÉNOM
                let nameParts = p.name.split(' ');
                let firstName = nameParts[0];
                let lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : firstName;
                let displayFirst = nameParts.length > 1 ? firstName : '';

                let safeJson = encodeURIComponent(JSON.stringify({ id: p.id, name: p.name, team: p.team, prob: p._ticketProb, type: pType, ctx_reasons: p.ctx_reasons })).replace(/'/g, "%27");

                // Logique d'affichage du cadenas
                let isLocked = window.lockedTicketPlayers.has(String(p.id));
                let lockClass = isLocked ? 'text-black border-yellow-500 bg-yellow-500 shadow-[0_0_10px_#eab308]' : 'text-gray-400 border-gray-600 bg-gray-900 hover:text-yellow-400 hover:border-yellow-400';
                let lockIcon = isLocked ? 'fa-lock' : 'fa-unlock';
                
                // Couleur de la jauge circulaire
                let strokeColor = p._ticketProb >= 50 ? '#4ADE80' : (p._ticketProb >= 40 ? '#00e5ff' : '#ff3333');

                html += `
                    <div class="relative bg-gray-900 border ${isLocked ? 'border-yellow-500' : 'border-gray-800 hover:border-ice/50'} rounded-2xl p-4 md:p-5 mt-6 md:mt-8 mb-3 mx-1 md:mx-2 shadow-[0_10px_20px_rgba(0,0,0,0.4)] flex flex-col transition-all duration-300 group cursor-pointer" onclick="openSmartTicketModal('${safeJson}')">
                        
                        <div class="absolute -top-8 right-3 md:right-5 z-20 flex flex-col items-end">
                            <div class="relative">
                                <div class="absolute inset-0 ${isLocked ? 'bg-yellow-500/20' : 'bg-ice/20'} rounded-full blur group-hover:bg-ice/40 transition"></div>
                                <img src="${imgUrl}" onerror="this.src='assets/logo_hockAI.png'" class="relative w-16 h-16 md:w-[72px] md:h-[72px] object-cover rounded-full border-[3px] ${isLocked ? 'border-yellow-500' : 'border-gray-800 group-hover:border-ice'} shadow-[0_5px_15px_rgba(0,0,0,0.8)] transition duration-300 bg-gray-950">
                                
                                <button id="lock-btn-${p.id}" onclick="event.stopPropagation(); window.togglePlayerLock('${p.id}')" class="absolute -bottom-2 -right-2 ${lockClass} rounded-full w-8 h-8 flex items-center justify-center border transition z-30" title="Verrouiller ce joueur">
                                    <i class="fas ${lockIcon} text-[10px]"></i>
                                </button>
                            </div>
                        </div>

                        <div class="absolute -bottom-2 -left-2 text-6xl md:text-7xl text-white opacity-[0.03] font-black uppercase overflow-hidden pointer-events-none z-0">
                            ${p.team}
                        </div>

                        <div class="relative z-10 w-[70%]">
                            ${displayFirst ? `<div class="font-bold text-gray-400 text-[10px] md:text-xs capitalize tracking-wider mb-0.5">${displayFirst}</div>` : ''}
                            <h4 class="text-white font-black text-sm md:text-lg uppercase tracking-widest leading-tight truncate group-hover:text-ice transition">${lastName}</h4>
                            <div class="text-[9px] md:text-[10px] text-gray-500 font-bold uppercase tracking-widest mb-3 flex items-center gap-2">
                                ${p.team}${positionStr} ${targetBadgeHtml}
                            </div>

                            <div class="inline-flex items-center bg-black/60 border border-gray-700 px-2 md:px-3 py-1 md:py-1.5 rounded-lg gap-2 shadow-inner w-max">
                                 <span class="text-[9px] md:text-xs font-black text-gray-300 uppercase">${pType}</span>
                                 <span class="text-[9px] text-gray-500">@${itemOdds.toFixed(2)}</span>
                            </div>
                        </div>

                        <div class="absolute bottom-4 right-4 flex flex-col items-center z-10" title="Score IA">
                            <div class="relative w-12 h-12 md:w-14 md:h-14">
                                <svg class="w-full h-full transform -rotate-90 drop-shadow-[0_0_5px_currentColor]" style="color: ${strokeColor}" viewBox="0 0 36 36">
                                    <path stroke-dasharray="100, 100" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="#1f2937" stroke-width="3"></path>
                                    <path stroke-dasharray="${p._ticketProb}, 100" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" class="transition-all duration-1000 ease-out"></path>
                                </svg>
                                <div class="absolute inset-0 flex items-center justify-center">
                                    <span class="text-white font-black text-[10px] md:text-xs">${p._ticketProb.toFixed(0)}%</span>
                                </div>
                            </div>
                        </div>

                        <div class="flex justify-start items-center w-full pt-3 mt-3 border-t border-gray-800/60 gap-2 shrink-0 relative z-10">
                            <button onclick="event.stopPropagation(); window.jumpToPlayerScouting('${p.name.replace(/'/g, "\\'")}')" class="flex-1 sm:flex-none justify-center bg-gray-950 hover:bg-green-500 hover:text-black border border-gray-700 hover:border-green-500 text-gray-400 px-3 py-1.5 md:py-2 rounded-lg text-[9px] md:text-[10px] font-black uppercase tracking-widest transition shadow-md flex items-center gap-1">
                                <i class="fas fa-search text-green-500 group-hover:text-current"></i> Scout
                            </button>
                            <button onclick="event.stopPropagation(); window.banPlayerFromTickets('${p.id}', '${p.name.replace(/'/g, "\\'")}', '${p.team}')" class="flex-1 sm:flex-none justify-center bg-gray-950 hover:bg-blood hover:text-white border border-gray-700 hover:border-blood text-gray-400 px-3 py-1.5 md:py-2 rounded-lg text-[9px] md:text-[10px] font-black uppercase tracking-widest transition shadow-md flex items-center gap-1">
                                <i class="fas fa-ban text-blood group-hover:text-current"></i> Bannir
                            </button>
                        </div>
                    </div>
                `;
            });
            html += `</div></div>`;
        });
        html += `</div><div class="ticket-actions mt-4 bg-gray-900 border border-gray-800 rounded-xl p-4 flex flex-col md:flex-row justify-between items-center gap-4 shadow-[0_0_20px_rgba(0,0,0,0.5)]"><div class="flex flex-col items-center md:items-start w-full md:w-auto text-center md:text-left"><div class="text-[10px] text-gray-500 uppercase tracking-widest font-bold mb-1">Cote Totale</div><div class="text-3xl font-black text-yellow-500 drop-shadow-[0_0_10px_rgba(234,179,8,0.5)]">@${currentOdds.toFixed(2)}</div></div><div class="flex flex-col sm:flex-row items-center gap-3 w-full md:w-auto"><button onclick="window.exportSmartTicketImage()" class="w-full sm:w-auto bg-gray-800 hover:bg-gray-700 text-white px-5 py-3 rounded-lg font-black text-xs uppercase tracking-widest transition shadow-lg border border-gray-600 flex items-center justify-center gap-2"><i class="fas fa-camera text-lg"></i> Exporter</button><div class="flex items-center gap-2 bg-black border border-gray-700 p-1.5 rounded-lg w-full sm:w-auto"><input type="number" id="quick-stake-input" placeholder="Mise (€)" value="10" class="w-24 bg-gray-900 border border-gray-800 text-white text-xs font-bold text-center rounded px-2 py-2.5 outline-none focus:border-money shadow-inner"><button onclick="window.addBetToBankroll('MONTANTE', 'Palier @2.00', ${currentOdds.toFixed(2)}, document.getElementById('quick-stake-input').value || 10)" class="w-full sm:w-auto bg-money/20 hover:bg-money text-money hover:text-black border border-money px-5 py-2.5 rounded text-xs font-black uppercase tracking-widest transition flex items-center justify-center gap-2"><i class="fas fa-save text-lg"></i> Encaisser</button></div></div></div></div>`;
        container.innerHTML = html;
        window.hideAnalysis(); // 👈 Ajoute ça ici
        window.hideFullScreenLoader();

    }, 800);
};

window.generateSameGameParlay = async function () {
    window.showFullScreenLoader();
    window.showAnalysis();

    // --- NOUVEAU : Navigation ---
    window.goToTicketStep(3);
    // ----------------------------
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

        let html = `
            <div class="flex justify-between items-center bg-gray-950 border border-gray-800 p-3 md:p-4 rounded-2xl mb-4 md:mb-5 shadow-inner" id="ticket-export-zone-header">
                <span class="text-purple-400 font-black uppercase tracking-widest text-[10px] md:text-sm flex items-center gap-2">
                    <i class="fas fa-handshake"></i> <span class="truncate">SAME-GAME PARLAY (CORRÉLATION)</span>
                </span>
                <button onclick="generateSameGameParlay()" class="bg-gray-900 hover:bg-white hover:text-black text-[9px] md:text-xs px-3 md:px-5 py-2 md:py-3 rounded-lg font-black uppercase tracking-widest transition border border-gray-700 shadow-lg flex items-center gap-2 shrink-0">
                    <i class="fas fa-sync-alt text-purple-400"></i> Relancer
                </button>
            </div>
            
            <div id="ticket-export-zone" class="bg-gray-950/80 p-3 md:p-5 rounded-2xl md:rounded-3xl border-2 ${gradeObj.border} ${gradeObj.glow} flex flex-col gap-4 md:gap-5 transition-all shadow-xl">
                
                <div class="flex justify-between items-center bg-gray-900 border border-gray-800 ${gradeObj.border} rounded-xl p-3 md:p-4 shadow-inner">
                    <div class="flex flex-col">
                        <span class="text-[9px] md:text-[10px] text-gray-500 uppercase font-black tracking-widest">Score Qualité IA</span>
                        <span class="text-[9px] md:text-xs ${gradeObj.color} font-bold mt-0.5 leading-tight">${gradeObj.text}</span>
                    </div>
                    <div class="text-3xl md:text-4xl font-black ${gradeObj.color} drop-shadow-[0_0_10px_currentColor] ml-2">${gradeObj.letter}</div>
                </div>
                
                <div class="flex flex-col gap-4 md:gap-6">
                    <div class="bg-black/40 border border-gray-800 rounded-2xl shadow-inner overflow-hidden">
                        <div class="bg-gray-900/60 p-3 border-b border-gray-800 text-[10px] md:text-xs font-black text-gray-400 uppercase tracking-widest flex items-center gap-3 px-4 md:px-5">
                            <i class="fas fa-hockey-puck text-purple-400"></i> MATCH : <span class="text-white truncate flex-1">${finalMatchStr}</span>
                        </div>
                        <div class="p-3 flex flex-col gap-3">
        `;

        finalTicket.forEach(p => {
            let pType = p.best_prop_type === 'prob_goal' ? 'But' : (p.best_prop_type === 'prob_assist' ? 'Passe' : 'Point');
            
            // SÉCURITÉ ABSOLUE DE L'IMAGE
            let imgUrl = p.headshot || (p.id ? `https://assets.nhle.com/mugs/nhl/latest/${p.id}.png` : 'assets/logo_hockAI.png');
            
            // SÉCURITÉ DE LA POSITION
            let posCheck = String(p.position).toLowerCase().trim();
            let positionStr = (!p.position || posCheck === 'undefined' || posCheck === 'null' || posCheck === '') ? '' : ` • ${p.position}`;
            
            // SÉPARATION NOM / PRÉNOM
            let nameParts = p.name.split(' ');
            let firstName = nameParts[0];
            let lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : firstName;
            let displayFirst = nameParts.length > 1 ? firstName : '';

            // CIBLE MINIMALISTE (Uniquement le viseur qui clignote)
            let targetBadgeHtml = p.has_target_badge ? `<i class="fas fa-crosshairs text-blood animate-ping drop-shadow-[0_0_5px_#ff3333] ml-2 text-[12px]" title="Cible IA"></i>` : '';

            let safeJson = encodeURIComponent(JSON.stringify({ id: p.id, name: p.name, team: p.team, prob: p._ticketProb, type: pType })).replace(/'/g, "%27");
            
            // NOUVEAU DESIGN SGP ULRA-RESPONSIVE (Grille)
            html += `
                <div class="flex flex-col bg-gray-950 p-3 md:p-4 rounded-xl border border-gray-800 hover:border-purple-500 transition cursor-pointer group gap-3" onclick="openSmartTicketModal('${safeJson}')">
                    
                    <div class="grid grid-cols-[1fr,auto] items-start gap-2 md:gap-3 w-full">
                        
                        <div class="flex flex-col min-w-0 justify-center flex-1 pt-0.5 pr-2 border-r border-gray-800/60">
                            ${displayFirst ? `<div class="font-bold text-gray-400 text-[10px] md:text-xs capitalize tracking-wider mb-1">${displayFirst}</div>` : ''}
                            <div class="font-black text-white text-sm md:text-base uppercase tracking-widest leading-tight break-words group-hover:text-purple-400 transition">${lastName}</div>
                            <div class="text-[9px] text-gray-500 font-bold tracking-widest mt-1 flex items-center flex-wrap gap-1">
                                ${p.team}${positionStr} ${targetBadgeHtml}
                            </div>
                        </div>
                        
                        <div class="flex flex-col items-center gap-1 shrink-0 pl-1">
                            <div class="relative shrink-0">
                                <div class="absolute inset-0 bg-purple-500/20 rounded-full blur group-hover:bg-purple-500/40 transition"></div>
                                <img src="${imgUrl}" onerror="this.src='assets/logo_hockAI.png'" class="relative w-12 h-12 md:w-14 md:h-14 rounded-full border-2 border-gray-700 group-hover:border-purple-500 bg-gray-900 object-cover z-10 transition">
                            </div>
                            <div class="flex flex-col items-center mt-1 pt-1.5 border-t border-gray-800 w-full">
                                <div class="text-[8px] md:text-[9px] text-gray-400 uppercase font-black tracking-widest mb-1 bg-gray-900 px-1.5 py-0.5 rounded border border-gray-700">Over 0.5 ${pType}</div>
                                <div class="font-black text-lg md:text-xl text-green-400 drop-shadow-[0_0_8px_#4ADE80] my-0.5 leading-none">${p._ticketProb.toFixed(1)}%</div>
                                <div class="text-[9px] text-gray-400 font-bold mt-0.5">@${p._itemOdds.toFixed(2)}</div>
                            </div>
                        </div>
                    </div>

                    <div class="flex justify-between items-center w-full pt-2.5 border-t border-gray-800/60 gap-2 shrink-0">
                        <div class="bg-purple-900/40 border border-purple-500 text-purple-300 px-2 py-1 rounded text-[8px] uppercase font-black tracking-widest text-center shadow-[0_0_8px_rgba(168,85,247,0.4)] truncate max-w-[50%]">${p.archetype_badge}</div>
                        
                        <div class="flex items-center gap-2 w-full sm:w-auto justify-end">
                            <button onclick="event.stopPropagation(); window.jumpToPlayerScouting('${p.name.replace(/'/g, "\\'")}')" class="flex-1 sm:flex-none justify-center bg-gray-900 hover:bg-green-500 hover:text-black border border-gray-700 hover:border-green-500 text-gray-400 px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition shadow-md flex items-center gap-1">
                                <i class="fas fa-search text-green-500 group-hover:text-current"></i> Scout
                            </button>
                            <button onclick="event.stopPropagation(); window.banPlayerFromTickets('${p.id}', '${p.name.replace(/'/g, "\\'")}', '${p.team}')" class="flex-1 sm:flex-none justify-center bg-gray-900 hover:bg-blood hover:text-white border border-gray-700 hover:border-blood text-gray-400 px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition shadow-md flex items-center gap-1">
                                <i class="fas fa-ban text-blood group-hover:text-current"></i> Bannir
                            </button>
                        </div>
                    </div>

                </div>
            `;
        });
        html += `</div></div></div>`;
        container.innerHTML = html;
    }, 3000);
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
    }, 3000);
};


// Initialisation au clic
let ticketTabBtn = document.querySelector('button[onclick*="tab-tickets"]');
if (ticketTabBtn) ticketTabBtn.addEventListener('click', () => { window.updateTicketMatchSelector(); });

// ==========================================
// 🎛️ MOTEUR ZAPPING TACTIQUE (LOCK & PIVOT)
// ==========================================

window.togglePlayerLock = function(id) {
    let btn = document.getElementById('lock-btn-' + id);
    let icon = btn.querySelector('i');
    if (window.lockedTicketPlayers.has(String(id))) {
        window.lockedTicketPlayers.delete(String(id));
        btn.classList.remove('text-yellow-500', 'border-yellow-500/50', 'bg-yellow-500/10');
        btn.classList.add('text-gray-500', 'border-gray-700', 'bg-gray-900');
        icon.classList.remove('fa-lock');
        icon.classList.add('fa-unlock');
    } else {
        window.lockedTicketPlayers.add(String(id));
        btn.classList.remove('text-gray-500', 'border-gray-700', 'bg-gray-900');
        btn.classList.add('text-yellow-500', 'border-yellow-500/50', 'bg-yellow-500/10');
        icon.classList.remove('fa-unlock');
        icon.classList.add('fa-lock');
    }
};

window.openZappingMenu = function(type, title) {
    let modal = document.getElementById('zapping-tactical-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'zapping-tactical-modal';
        modal.className = 'fixed inset-0 bg-black/90 z-[2000] hidden flex-col items-center justify-end md:justify-center p-4 backdrop-blur-sm transition-all fade-in';
        document.body.appendChild(modal);
    }

    modal.innerHTML = `
        <div class="bg-gray-950 border border-purple-500/50 rounded-2xl w-full max-w-md shadow-[0_0_40px_rgba(168,85,247,0.3)] overflow-hidden transform transition-all translate-y-0 relative pb-6">
            <div class="p-4 border-b border-gray-800 flex justify-between items-center bg-gray-900">
                <h3 class="text-white font-black uppercase tracking-widest text-sm flex items-center gap-2"><i class="fas fa-random text-purple-400"></i> Zapping Tactique</h3>
                <button onclick="document.getElementById('zapping-tactical-modal').classList.add('hidden')" class="text-gray-500 hover:text-white text-xl transition"><i class="fas fa-times"></i></button>
            </div>
            <div class="p-4 flex flex-col gap-3">
                <p class="text-[10px] text-gray-400 font-bold uppercase tracking-widest text-center mb-4">Les joueurs "cadenassés" seront conservés. Choisissez la stratégie pour les autres :</p>
                
                <button onclick="executeZapping('${type}', '${title}', 'standard')" class="bg-gray-900 hover:bg-gray-800 border border-gray-700 p-4 rounded-xl flex items-center gap-4 transition group text-left">
                    <div class="bg-ice/20 p-3 rounded-full text-ice group-hover:scale-110 transition"><i class="fas fa-sync-alt text-xl"></i></div>
                    <div>
                        <div class="text-white font-black uppercase tracking-widest text-xs">Standard (Continuité)</div>
                        <div class="text-gray-500 text-[10px] font-bold mt-1">Remplace par les meilleurs suivants.</div>
                    </div>
                </button>

                <button onclick="executeZapping('${type}', '${title}', 'ev')" class="bg-gray-900 hover:bg-gray-800 border border-gray-700 p-4 rounded-xl flex items-center gap-4 transition group text-left">
                    <div class="bg-money/20 p-3 rounded-full text-money group-hover:scale-110 transition"><i class="fas fa-search-dollar text-xl"></i></div>
                    <div>
                        <div class="text-white font-black uppercase tracking-widest text-xs">+EV (Chasseur de Value)</div>
                        <div class="text-gray-500 text-[10px] font-bold mt-1">Ignore la sécurité, cherche les cotes mathématiquement aberrantes.</div>
                    </div>
                </button>

                <button onclick="executeZapping('${type}', '${title}', 'hedge')" class="bg-gray-900 hover:bg-gray-800 border border-gray-700 p-4 rounded-xl flex items-center gap-4 transition group text-left">
                    <div class="bg-blood/20 p-3 rounded-full text-blood group-hover:scale-110 transition"><i class="fas fa-shield-alt text-xl"></i></div>
                    <div>
                        <div class="text-white font-black uppercase tracking-widest text-xs">Couverture (Hedge)</div>
                        <div class="text-gray-500 text-[10px] font-bold mt-1">Force l'IA à choisir des équipes différentes pour limiter le risque global.</div>
                    </div>
                </button>
            </div>
        </div>
    `;
    modal.classList.remove('hidden');
    modal.classList.add('flex');
};

window.executeZapping = function(type, title, strategy) {
    document.getElementById('zapping-tactical-modal').classList.add('hidden');
    window.generateSmartTicket(type, title, true, strategy);
};

// ==========================================
// 🛡️ MOTEUR DE FRACTIONNEMENT (LE BOUCLIER)
// ==========================================
window.executeShieldFractionation = function() {
    let container = document.getElementById('ticket-display');
    if (!window.currentTicketPlayers || window.currentTicketPlayers.length < 3) {
        alert("Action impossible : Vous devez avoir au moins 3 sélections sur votre ticket pour le fractionner.");
        return;
    }

    // On remonte légèrement la page pour l'animation
    window.scrollTo({ top: container.offsetTop - 50, behavior: 'smooth' });

    // 📡 RADAR GOOGLE ANALYTICS : Traquer l'utilisation du bouclier
    if (typeof gtag === 'function') {
        gtag('event', 'utilisation_bouclier');
    }
    
    // Animation de chargement spéciale
    container.innerHTML = `
        <div class="text-center py-16 bg-gray-900 border border-cyan-500/50 border-dashed rounded-2xl shadow-[0_0_30px_rgba(6,182,212,0.2)]">
            <i class="fas fa-shield-virus text-5xl text-cyan-400 mb-6 animate-pulse drop-shadow-[0_0_15px_#22d3ee]"></i>
            <div class="text-white font-black uppercase tracking-widest text-sm md:text-base">Analyse de Variance...</div>
            <div class="text-[10px] text-gray-400 uppercase mt-3 font-bold tracking-widest">L'IA découpe votre ticket pour sécuriser vos gains.</div>
        </div>
    `;

    setTimeout(() => {
        // 1. On trie les joueurs actuels du plus fiable au moins fiable
        let sortedPlayers = [...window.currentTicketPlayers].sort((a, b) => b._ticketProb - a._ticketProb);
        
        // 2. Découpage intelligent (Système Round Robin allégé)
        let chunks = [];
        if (sortedPlayers.length === 3) {
            // Si 3 joueurs, on fait un duo fort et un solo
            chunks.push(sortedPlayers.slice(0, 2));
            chunks.push([sortedPlayers[2]]);
        } else if (sortedPlayers.length >= 4) {
            // Si 4 joueurs ou plus, on groupe par paires (Duos)
            for (let i = 0; i < sortedPlayers.length; i += 2) {
                chunks.push(sortedPlayers.slice(i, i + 2));
            }
        }

        let html = `
            <div class="flex justify-between items-center bg-gray-950 border border-gray-800 p-3 md:p-4 rounded-2xl mb-6 shadow-inner">
                <span class="text-cyan-400 font-black uppercase tracking-[0.2em] text-[10px] md:text-sm flex items-center gap-2">
                    <i class="fas fa-shield-virus text-lg"></i> <span class="truncate">MODE BOUCLIER ACTIVÉ</span>
                </span>
                <button onclick="window.goToTicketStep(1)" class="bg-gray-900 hover:bg-white hover:text-black text-[9px] md:text-xs px-3 md:px-5 py-2 md:py-3 rounded-lg font-black uppercase tracking-widest transition border border-gray-700 shadow-lg flex items-center gap-2">
                    <i class="fas fa-undo"></i> Réinitialiser
                </button>
            </div>
            
            <div class="text-[10px] md:text-xs text-gray-300 font-bold mb-6 bg-cyan-900/20 border-l-4 border-cyan-500 p-4 rounded-r-xl leading-relaxed shadow-inner">
                <i class="fas fa-info-circle text-cyan-400 mr-2"></i> L'IA a fractionné vos ${sortedPlayers.length} sélections en <strong class="text-white">sous-tickets indépendants</strong>. 
                Encaisser ces tickets séparément. Si une anomalie survient sur la glace, seule une fraction de votre investissement sera perdue.
            </div>
            
            <div class="flex flex-col gap-6">
        `;

        let chunkNames = ["A. DUO SÉCURISÉ (Base Fiable)", "B. DUO STANDARD", "C. DUO OUTSIDER", "D. SÉLECTION BONUS"];

        chunks.forEach((chunk, index) => {
            let currentOdds = 1.0;
            let chunkName = chunkNames[index] || `SOUS-TICKET ${index + 1}`;
            
            // ⚡ CORRECTION DU CRASH ICI : On calcule et on SAUVEGARDE la cote pour chaque joueur
            chunk.forEach(p => { 
                p._itemOdds = p.odds ? parseFloat(p.odds) : Math.max(1.10, 0.93 / (p._ticketProb / 100));
                currentOdds *= p._itemOdds; 
            });

            html += `
            <div class="bg-gray-950/80 p-3 md:p-5 rounded-2xl md:rounded-3xl border border-cyan-500/30 flex flex-col transition-all shadow-xl">
                <div class="flex justify-between items-center bg-gray-900 border border-gray-800 rounded-xl p-3 shadow-inner mb-4">
                    <span class="text-cyan-400 font-black text-[10px] md:text-xs uppercase tracking-widest"><i class="fas fa-ticket-alt mr-2"></i> ${chunkName}</span>
                    <span class="text-white font-black text-sm md:text-lg bg-black px-3 py-1 rounded-lg border border-gray-700">@${currentOdds.toFixed(2)}</span>
                </div>
                <div class="flex flex-col gap-2">
            `;
            
            chunk.forEach(p => {
                let imgUrl = p.id ? `https://assets.nhle.com/mugs/nhl/latest/${p.id}.png` : 'assets/logo_hockAI.png';
                let lastName = p.name.split(' ').slice(1).join(' ') || p.name.split(' ')[0];
                let pType = p._ticketRole;
                
                // Mini-Card simplifiée et élégante
                html += `
                    <div class="flex items-center justify-between bg-black/60 p-3 rounded-xl border border-gray-800 transition">
                        <div class="flex items-center gap-3">
                            <img src="${imgUrl}" onerror="this.src='assets/logo_hockAI.png'" class="w-12 h-12 rounded-full border-2 border-gray-700 object-cover bg-gray-900">
                            <div>
                                <div class="text-white font-black text-sm md:text-base uppercase tracking-widest leading-none mb-1">${lastName}</div>
                                <div class="text-[9px] text-gray-500 font-bold uppercase tracking-widest flex items-center gap-2">
                                    <span class="text-gray-400">${p.team}</span> • ${pType}
                                </div>
                            </div>
                        </div>
                        <div class="text-right">
                            <div class="text-cyan-400 font-black text-sm md:text-lg drop-shadow-[0_0_5px_rgba(6,182,212,0.5)]">${p._ticketProb.toFixed(1)}%</div>
                            <div class="text-[9px] text-gray-500 font-bold mt-0.5">@${p._itemOdds.toFixed(2)}</div>
                        </div>
                    </div>
                `;
            });

            html += `
                </div>
                <div class="mt-4 flex flex-col sm:flex-row justify-end gap-3 w-full">
                    <div class="flex items-center gap-2 bg-black border border-gray-700 p-1.5 rounded-lg w-full sm:w-auto">
                        <input type="number" id="stake-shield-${index}" placeholder="€" value="10" class="w-16 md:w-20 bg-gray-900 border border-gray-800 text-white text-[10px] md:text-xs font-bold text-center rounded-lg p-3 outline-none focus:border-cyan-500 shadow-inner">
                        <button onclick="window.addBetToBankroll('BOUCLIER IA', '${chunkName}', ${currentOdds.toFixed(2)}, document.getElementById('stake-shield-${index}').value || 10)" class="w-full sm:w-auto bg-cyan-900/30 hover:bg-cyan-600 text-cyan-400 hover:text-black border border-cyan-500 px-4 py-2.5 rounded-lg text-[10px] md:text-xs font-black uppercase tracking-widest transition flex items-center justify-center gap-2 active:scale-95">
                            <i class="fas fa-save text-sm"></i> Encaisser
                        </button>
                    </div>
                </div>
            </div>`;
        });

        html += `</div>`;
        container.innerHTML = html;

    }, 2000); // 2 secondes d'animation
};