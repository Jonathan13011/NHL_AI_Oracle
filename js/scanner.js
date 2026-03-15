        // ==========================================
        // MOTEUR SCANNER DE VALEUR (HUB TOTAL +EV)
        // ==========================================
        async function scanValueBets() {
            const container = document.getElementById('value-bets-container');
            if (!container) return;
            
            // On métamorphose la grille en colonne géante pour accueillir les 3 sections
            container.className = "max-w-7xl mx-auto flex flex-col gap-10 relative z-10 px-4 md:px-0 fade-in";
            container.innerHTML = '';
            
            showFullScreenLoader("Hub de Valeur Totale", "L'IA traque les erreurs de cotes sur 800 joueurs...", false);

            try {
                // 1. Récupération des données Équipes
                const res = await fetch(`${API_BASE}/scan_value_bets`);
                const data = await res.json();
                
                // 2. Vérification / Chargement du Pool de Joueurs (pour Props et Parlay)
                if (!window.globalPredictionsPool || window.globalPredictionsPool.length === 0) {
                    let pRes = await fetch(`${API_BASE}/predict_all`);
                    let pData = await pRes.json();
                    window.globalPredictionsPool = pData.global_predictions || [];
                }
                // Mise à jour des blessures en direct
                if (!window.activePlayersToday) await window.updateActivePlayersBackground();

                hideFullScreenLoader();

                let now = new Date();
                
                // =====================================
                // SECTION 1 : ANOMALIES ÉQUIPES
                // =====================================
                let validTeamBets = [];
                if (data.status === "success" && data.value_bets) {
                    validTeamBets = data.value_bets.filter(bet => {
                        let matchDate = new Date(bet.date);
                        let hoursDiff = (matchDate - now) / (1000 * 60 * 60);
                        return hoursDiff > 0 && hoursDiff <= 24; 
                    });
                }

                let teamsHtml = '';
                if (validTeamBets.length === 0) {
                    teamsHtml = '<div class="text-gray-500 italic text-xs md:text-sm bg-gray-950 p-6 rounded-xl border border-gray-800 text-center">Marché principal (Équipes) parfaitement ajusté ce soir. Aucune erreur détectée.</div>';
                } else {
                    teamsHtml = `<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">`;
                    validTeamBets.forEach(bet => {
                        let teamLogo = typeof getLogoUrl === 'function' ? getLogoUrl(bet.team_bet) : "assets/logo_hockAI.png";
                        teamsHtml += `
                            <div class="value-bet-card group bg-gray-900/90 p-4 md:p-6 flex flex-col relative border border-money rounded-xl cursor-pointer transition-all transform hover:-translate-y-1 shadow-[0_0_15px_rgba(74,222,128,0.15)]"
                                 onclick="openValueBetPlayers(${bet.game_id}, '${bet.home_team}', '${bet.away_team}', '${bet.date}')">
                                <div class="absolute top-3 right-3 bg-money text-deepblue font-black px-2 py-1 md:px-3 md:py-1 rounded text-[9px] md:text-xs animate-pulse">+ EV</div>
                                <div class="text-ice font-bold text-[10px] md:text-xs mb-4 border-b border-gray-800 pb-2 flex justify-between items-center pr-12">
                                    <span class="truncate"><i class="fas fa-search-dollar mr-1 text-money"></i> ${bet.match}</span>
                                </div>
                                <div class="text-center mb-6 bg-gray-950 p-4 rounded-lg border border-gray-800 shadow-inner">
                                    <span class="text-[9px] md:text-[10px] text-gray-400 uppercase tracking-widest block mb-2">Pari Moneyline (+EV)</span>
                                    <div class="text-xl md:text-3xl font-black text-white flex items-center justify-center gap-3">
                                        <img src="${teamLogo}" onerror="this.src='assets/logo_hockAI.png'" class="w-8 h-8 md:w-12 md:h-12 drop-shadow-[0_0_10px_rgba(255,255,255,0.2)] object-contain">
                                        <span class="truncate uppercase">${bet.team_bet}</span>
                                    </div>
                                </div>
                                <div class="flex justify-between items-center bg-gray-900 rounded-lg p-3 md:p-4 border border-gray-700 shadow-lg gap-2">
                                    <div class="text-center w-1/2 border-r border-gray-800 pr-2">
                                        <span class="text-[8px] md:text-[10px] text-gray-400 font-black uppercase tracking-widest block mb-1">Cote <span class="bg-gray-800 text-white px-1 py-0.5 rounded shadow-inner">${bet.bookie}</span></span>
                                        <div class="text-lg md:text-2xl font-black text-white">${bet.odds}</div>
                                        <div class="text-[9px] text-gray-500 mt-1">Implicite : ${bet.implied_prob}%</div>
                                    </div>
                                    <div class="text-center w-1/2 pl-2">
                                        <span class="text-[8px] md:text-[10px] text-ice uppercase tracking-widest block mb-1">Modèle IA</span>
                                        <div class="text-lg md:text-2xl font-black text-ice drop-shadow-[0_0_5px_#00e5ff]">${bet.ai_prob}%</div>
                                        <div class="text-[9px] text-gray-500 mt-1">Juste Valeur</div>
                                    </div>
                                </div>
                                <div class="mt-4 text-center bg-green-500/10 border border-money p-2 md:p-3 rounded-lg text-money font-black uppercase tracking-widest text-[10px] md:text-sm shadow-inner">
                                    Avantage Mathématique : +${bet.edge}%
                                </div>
                                <div class="mt-4 pt-3 border-t border-gray-800 text-center">
                                    <span class="text-[9px] md:text-xs text-gray-400 group-hover:text-money uppercase tracking-widest font-bold transition flex items-center justify-center gap-1">Voir les Props Joueurs <i class="fas fa-arrow-right ml-1"></i></span>
                                </div>
                            </div>
                        `;
                    });
                    teamsHtml += `</div>`;
                }

                // =====================================
                // SECTION 2 : PÉPITES PLAYER PROPS
                // =====================================
                let activeMatchStrings = new Set();
                (window.fetchedMatchesPool || []).forEach(m => {
                    let matchDate = new Date(m.date);
                    let hoursDiff = (matchDate - now) / (1000 * 60 * 60);
                    if (hoursDiff > -6 && hoursDiff <= 24 && !['FINAL', 'OFF'].includes(m.state)) {
                        activeMatchStrings.add(m.home_team);
                        activeMatchStrings.add(m.away_team);
                    }
                });

                // ⚡ SÉCURITÉ ANTI-BLESSURES MAXIMALE : On force la vérification API
                if (!window.activePlayersToday || window.activePlayersToday.size === 0) {
                    try {
                        let actRes = await fetch(`${API_BASE}/active_players_today`);
                        let actData = await actRes.json();
                        if (actData.status === 'success') {
                            window.activePlayersToday = new Set(actData.active_ids.map(Number));
                        }
                    } catch(e) { console.warn("Filtre scanner blessures hors ligne"); }
                }

                let safePool = window.globalPredictionsPool.filter(p => {
                    // 1. Le joueur doit jouer ce soir et ne pas être gardien
                    if (!activeMatchStrings.has(p.team) || p.position === 'G') return false;
                    
                    // 2. FILTRE ANTI-FANTÔMES : Il DOIT avoir joué récemment (Élimine Landeskog et les LTIR)
                    if (!p.last_5_games || p.last_5_games.length === 0) return false;

                    // 3. FILTRE ABSOLU API : Vérification numérique stricte
                    if (window.activePlayersToday && window.activePlayersToday.size > 0) {
                        if (!window.activePlayersToday.has(Number(p.id))) return false;
                    }
                    
                    return true;
                });
                
                let propBetsHtml = '';
                // On prend les 8 joueurs avec la plus grosse probabilité de faire un point
                let topProps = [...safePool].sort((a,b) => b.prob_point - a.prob_point).slice(0, 8); 
                
                if (topProps.length === 0) {
                    propBetsHtml = '<div class="text-gray-500 italic text-xs md:text-sm bg-gray-950 p-6 rounded-xl border border-gray-800 text-center">Aucun joueur pertinent détecté pour les prochaines 24h.</div>';
                } else {
                    propBetsHtml = `<div class="grid grid-cols-2 lg:grid-cols-4 gap-4">`;
                    topProps.forEach(p => {
                        let fairOdds = 100 / p.prob_point;
                        let targetOdds = fairOdds * 1.15; // L'IA recommande de parier si la cote du bookmaker est 15% supérieure (Value Bet pur)
                        propBetsHtml += `
                            <div class="bg-gray-950 border border-purple-500/30 hover:border-purple-500 rounded-xl p-3 md:p-4 shadow-inner group transition flex flex-col items-center text-center cursor-pointer relative" onclick="window.jumpToPlayerScouting('${p.name.replace(/'/g, "\\'")}')">
                                <img src="https://assets.nhle.com/mugs/nhl/latest/${p.id}.png" onerror="this.src='assets/logo_hockAI.png'" class="w-12 h-12 md:w-16 md:h-16 rounded-full border-2 border-purple-500 mb-2 object-cover bg-gray-900 group-hover:scale-110 transition relative z-10">
                                <h4 class="text-white font-black uppercase text-[10px] md:text-xs truncate w-full mb-1 relative z-10">${p.name}</h4>
                                <span class="text-[8px] md:text-[9px] text-gray-500 uppercase tracking-widest mb-3 relative z-10">${p.team} • Pointeur</span>
                                <div class="bg-black border border-gray-800 rounded-lg w-full p-2 mb-2 relative z-10">
                                    <div class="text-purple-400 font-black text-sm md:text-base drop-shadow-[0_0_5px_rgba(168,85,247,0.5)]">${p.prob_point.toFixed(1)}% <span class="text-[8px] text-gray-500">IA</span></div>
                                    <div class="text-[8px] md:text-[9px] text-gray-400 uppercase mt-1">Cote réelle : @${fairOdds.toFixed(2)}</div>
                                </div>
                                <div class="text-[8px] md:text-[9px] text-money font-black uppercase tracking-widest bg-money/10 px-2 py-1.5 rounded w-full border border-money/30 relative z-10">
                                    <i class="fas fa-eye mr-1"></i> Parier si > @${targetOdds.toFixed(2)}
                                </div>
                            </div>
                        `;
                    });
                    propBetsHtml += `</div>`;
                }

                // =====================================
                // SECTION 3 : PARLAY BUILDER (COMBINÉ)
                // =====================================
                let parlayHtml = '';
                // L'IA construit un ticket avec 3 joueurs ayant plus de 60% de chances de faire un point
                let safeParlayLegs = [...safePool].sort((a,b) => b.prob_point - a.prob_point).filter(p => p.prob_point > 60).slice(0, 3);
                
                if (safeParlayLegs.length < 2) {
                    parlayHtml = '<div class="text-gray-500 italic text-xs md:text-sm bg-gray-950 p-6 rounded-xl border border-gray-800 text-center">Pas assez de certitudes mathématiques absolues ce soir pour générer un combiné sécurisé.</div>';
                } else {
                    let totalProb = 1;
                    let legsHtml = '';
                    safeParlayLegs.forEach(p => {
                        totalProb *= (p.prob_point / 100);
                        legsHtml += `
                            <div class="flex items-center justify-between bg-black/60 p-3 rounded-lg border border-gray-800 w-full hover:border-orange-500 transition cursor-pointer" onclick="window.jumpToPlayerScouting('${p.name.replace(/'/g, "\\'")}')">
                                <div class="flex items-center gap-3">
                                    <img src="https://assets.nhle.com/mugs/nhl/latest/${p.id}.png" onerror="this.src='assets/logo_hockAI.png'" class="w-8 h-8 rounded-full border border-orange-500 object-cover bg-gray-900">
                                    <div class="flex flex-col text-left">
                                        <span class="text-white font-black text-[10px] md:text-xs uppercase">${p.name}</span>
                                        <span class="text-[8px] md:text-[9px] text-gray-400 uppercase tracking-widest">${p.team} • Plus de 0.5 Point</span>
                                    </div>
                                </div>
                                <div class="text-orange-400 font-black text-xs md:text-sm bg-orange-500/10 px-2 py-1 rounded border border-orange-500/30">
                                    ${p.prob_point.toFixed(0)}%
                                </div>
                            </div>
                        `;
                    });
                    
                    let combinedProbPct = totalProb * 100;
                    let fairCombinedOdds = 1 / totalProb;

                    parlayHtml = `
                        <div class="bg-gradient-to-br from-gray-900 to-black border border-orange-500 rounded-xl p-4 md:p-6 shadow-[0_0_20px_rgba(249,115,22,0.15)] w-full relative overflow-hidden">
                            <div class="absolute -right-4 -top-4 text-7xl text-orange-500 opacity-5"><i class="fas fa-layer-group"></i></div>
                            <div class="flex flex-col lg:flex-row gap-6 items-center relative z-10">
                                <div class="w-full lg:w-2/3 flex flex-col gap-2">
                                    ${legsHtml}
                                </div>
                                <div class="w-full lg:w-1/3 bg-black border border-gray-800 rounded-xl p-5 text-center flex flex-col justify-center shadow-inner">
                                    <span class="text-[10px] text-gray-400 uppercase tracking-widest font-black mb-2">Probabilité Globale</span>
                                    <span class="text-3xl md:text-4xl font-black text-orange-500 drop-shadow-[0_0_10px_#f97316] mb-2">${combinedProbPct.toFixed(1)}%</span>
                                    <span class="text-[9px] md:text-[10px] text-gray-500 uppercase font-bold">Cote réelle du ticket : <strong class="text-white">@${fairCombinedOdds.toFixed(2)}</strong></span>
                                    <button onclick="window.addBetToBankroll('PARLAY IA', 'Combiné Hub de Valeur (${safeParlayLegs.length} Joueurs)', ${fairCombinedOdds.toFixed(2)}, 10)" class="mt-4 bg-orange-500 hover:bg-orange-600 text-black font-black uppercase tracking-widest text-[10px] py-2 px-4 rounded transition shadow-lg flex items-center justify-center gap-2">
                                        <i class="fas fa-save text-sm"></i> Conserver le Ticket
                                    </button>
                                </div>
                            </div>
                        </div>
                    `;
                }

                // =====================================
                // ASSEMBLAGE DU HUB (AFFICHAGE FINAL)
                // =====================================
                container.innerHTML = `
                    <div class="w-full">
                        <h3 class="text-white font-black uppercase tracking-widest text-sm md:text-lg mb-4 flex items-center gap-2 border-b border-gray-800 pb-2">
                            <i class="fas fa-university text-money"></i> 1. Anomalies Moneyline (Équipes)
                        </h3>
                        ${teamsHtml}
                    </div>
                    
                    <div class="w-full">
                        <h3 class="text-white font-black uppercase tracking-widest text-sm md:text-lg mb-4 flex items-center gap-2 border-b border-gray-800 pb-2 mt-2">
                            <i class="fas fa-user-ninja text-purple-500"></i> 2. Pépites Player Props (Failles Bookmakers)
                        </h3>
                        <p class="text-gray-400 text-[10px] md:text-xs font-bold mb-4">L'IA a calculé la cote "juste". Si votre bookmaker propose une cote supérieure à la recommandation verte, pariez (c'est mathématiquement rentable à long terme).</p>
                        ${propBetsHtml}
                    </div>

                    <div class="w-full">
                        <h3 class="text-white font-black uppercase tracking-widest text-sm md:text-lg mb-4 flex items-center gap-2 border-b border-gray-800 pb-2 mt-2">
                            <i class="fas fa-layer-group text-orange-500"></i> 3. Le Combiné IA du Jour (Parlay Builder)
                        </h3>
                        <p class="text-gray-400 text-[10px] md:text-xs font-bold mb-4">L'algorithme a fusionné les événements les plus sécurisés de la nuit pour créer ce ticket prêt à l'emploi.</p>
                        ${parlayHtml}
                    </div>
                `;

            } catch (e) {
                console.error(e);
                hideFullScreenLoader();
                container.innerHTML = '<div class="text-red-500 text-center py-10 font-bold">Erreur de connexion avec le Hub de Valeur.</div>';
            }
        }

        async function openValueBetPlayers(game_id, home, away, date) {
            const modal = document.getElementById('vb-player-modal');
            const title = document.getElementById('vb-modal-title');

            document.getElementById('vb-col-goals').innerHTML = '<div class="text-center py-10"><i class="fas fa-circle-notch fa-spin text-blood text-2xl"></i></div>';
            document.getElementById('vb-col-assists').innerHTML = '<div class="text-center py-10"><i class="fas fa-circle-notch fa-spin text-white text-2xl"></i></div>';
            document.getElementById('vb-col-points').innerHTML = '<div class="text-center py-10"><i class="fas fa-circle-notch fa-spin text-ice text-2xl"></i></div>';

            title.innerHTML = `<span class="text-gray-400 text-sm md:text-xl block md:inline">${away}</span> <span class="text-money italic px-2">@</span> <span class="text-white text-sm md:text-xl block md:inline">${home}</span>`;

            modal.classList.remove('hidden');
            modal.classList.add('flex');

            try {
                let cleanDate = date.split('T')[0];
                const res = await fetch(`${API_BASE}/predict/${game_id}/${home}/${away}/${cleanDate}`);
                const data = await res.json();

                if (data.status === "error") throw new Error("Erreur IA");

                const players = data.predictions;
                const bookmakerMargin = 1.05; // 5% de marge simulée

                const createPlayerChip = (p, prob, colorClass, marketName) => {
                    let impliedOdds = (100 / prob) * bookmakerMargin;
                    if (impliedOdds < 1.01) impliedOdds = 1.01;
                    let edge = (((prob / 100) * impliedOdds) - 1) * 100;

                    return `
                        <div onclick="openPlayerInsight('${p.name.replace(/'/g, "\\'")}', ${prob}, ${impliedOdds}, ${edge}, '${marketName}', '${colorClass}')" class="bg-gray-950 border border-gray-800 p-3 rounded-lg flex justify-between items-center group hover:border-${colorClass} transition cursor-pointer shadow-inner relative overflow-hidden transform hover:-translate-y-0.5">
                            <div class="absolute left-0 top-0 w-1 h-full bg-${colorClass} opacity-50 group-hover:opacity-100 transition"></div>
                            <div class="flex flex-col w-2/3 pl-2">
                                <span class="text-white font-black text-[10px] md:text-xs truncate w-full group-hover:text-${colorClass} transition">${p.name}</span>
                                <span class="text-[8px] text-gray-500 font-bold tracking-widest uppercase mt-0.5 flex items-center"><i class="fas fa-chart-line mr-1"></i> Analyser le Joueur</span>
                            </div>
                            <div class="flex flex-col items-end w-1/3">
                                <span class="text-${colorClass} font-black text-xs md:text-sm drop-shadow-[0_0_5px_currentColor]">@${impliedOdds.toFixed(2)}</span>
                                <span class="text-[8px] text-gray-500 font-bold mt-0.5">${prob.toFixed(1)}% IA</span>
                            </div>
                        </div>
                    `;
                };

                let goalsHtml = '', assistsHtml = '', pointsHtml = '';

                let topGoals = [...players].sort((a, b) => b.prob_goal - a.prob_goal).slice(0, 5);
                let topAssists = [...players].sort((a, b) => b.prob_assist - a.prob_assist).slice(0, 5);
                let topPoints = [...players].sort((a, b) => b.prob_point - a.prob_point).slice(0, 5);

                topGoals.forEach(p => { if (p.prob_goal > 20) goalsHtml += createPlayerChip(p, p.prob_goal, 'blood', 'Buteur'); });
                topAssists.forEach(p => { if (p.prob_assist > 25) assistsHtml += createPlayerChip(p, p.prob_assist, 'white', 'Passeur'); });
                topPoints.forEach(p => { if (p.prob_point > 40) pointsHtml += createPlayerChip(p, p.prob_point, 'ice', 'Pointeur'); });

                document.getElementById('vb-col-goals').innerHTML = goalsHtml || '<div class="text-gray-500 text-[10px] md:text-xs text-center italic py-4 bg-gray-950 rounded-lg border border-gray-800">Aucune cote de valeur</div>';
                document.getElementById('vb-col-assists').innerHTML = assistsHtml || '<div class="text-gray-500 text-[10px] md:text-xs text-center italic py-4 bg-gray-950 rounded-lg border border-gray-800">Aucune cote de valeur</div>';
                document.getElementById('vb-col-points').innerHTML = pointsHtml || '<div class="text-gray-500 text-[10px] md:text-xs text-center italic py-4 bg-gray-950 rounded-lg border border-gray-800">Aucune cote de valeur</div>';

            } catch (e) {
                console.error(e);
                document.getElementById('vb-players-container').innerHTML = '<div class="col-span-full text-center text-red-500 font-bold py-10">Impossible de charger les joueurs.</div>';
            }
        }

        window.openPlayerInsight = async function (playerName, prob, odds, edge, market, colorClass) {
            const modal = document.getElementById('player-insight-modal');
            const sheet = document.getElementById('insight-sheet');
            const content = document.getElementById('player-insight-content');

            modal.classList.remove('hidden');
            modal.classList.add('flex');
            // Effet glissade (Bottom sheet)
            setTimeout(() => sheet.classList.remove('translate-y-full'), 10);

            content.innerHTML = `<div class="text-center py-20"><i class="fas fa-circle-notch fa-spin text-${colorClass} text-4xl mb-4"></i><p class="text-${colorClass} font-black uppercase tracking-widest text-[10px] animate-pulse">L'Oracle génère le rapport...</p></div>`;

            try {
                const res = await fetch(`${API_BASE}/player_insight/${playerName}`);
                const data = await res.json();

                let l5Html = '';
                let aiText = "Le modèle mathématique a identifié une inefficacité algorithmique chez les bookmakers pour ce joueur. Les conditions du match sont optimales.";

                if (data.status === "success") {
                    aiText = data.ai_analysis;
                    l5Html = data.l5.map(g => `
                        <div class="flex justify-between items-center bg-gray-900 p-3 rounded-lg border border-gray-800 mb-2 text-[10px] md:text-xs">
                            <span class="text-gray-400 w-1/3"><i class="far fa-calendar-alt mr-1 text-gray-500"></i> ${g.game_date}</span>
                            <span class="text-white font-bold w-1/3 text-center truncate">vs ${g.opponent_team}</span>
                            <span class="w-1/3 text-right font-black ${g.goals > 0 ? 'text-blood drop-shadow-[0_0_5px_#ff3333]' : (g.points > 0 ? 'text-ice' : 'text-gray-600')}">
                                ${g.goals}B, ${g.assists}A <span class="text-[8px] text-gray-500 font-normal ml-1">(${g.shots} Tirs)</span>
                            </span>
                        </div>
                    `).join('');
                } else {
                    l5Html = `<div class="text-center text-gray-500 italic text-[10px] py-4 bg-gray-900 rounded-lg">Historique LNH récent indisponible.</div>`;
                }

                content.innerHTML = `
                    <div class="text-center mb-6">
                        <h2 class="text-2xl md:text-3xl font-black text-white uppercase tracking-widest">${playerName}</h2>
                        <span class="text-[10px] md:text-xs text-${colorClass} font-bold uppercase tracking-widest border border-${colorClass} px-3 py-1 rounded-full mt-2 inline-block bg-${colorClass}/10 shadow-[0_0_10px_currentColor]">Marché : ${market}</span>
                    </div>

                    <div class="bg-gray-900/80 border-l-4 border-${colorClass} rounded-r-xl p-4 md:p-5 mb-5 shadow-lg relative overflow-hidden">
                        <div class="absolute -right-4 -bottom-4 opacity-5 text-7xl text-${colorClass}"><i class="fas fa-brain"></i></div>
                        <h4 class="text-white font-black uppercase text-[10px] md:text-xs tracking-widest mb-2"><i class="fas fa-microchip text-${colorClass} mr-2"></i>Le Diagnostic de l'IA (<span class="text-${colorClass}">${prob.toFixed(1)}%</span>)</h4>
                        <p class="text-gray-300 text-[10px] md:text-xs leading-relaxed italic border-t border-gray-800 pt-3 mt-1 relative z-10">
                            "${aiText}"
                        </p>
                    </div>

                    <div class="bg-gradient-to-br from-gray-900 to-black border border-money rounded-xl p-4 md:p-5 mb-5 shadow-[0_0_15px_rgba(74,222,128,0.15)] relative overflow-hidden">
                        <div class="absolute -right-4 -top-4 opacity-5 text-6xl text-money"><i class="fas fa-search-dollar"></i></div>
                        <h4 class="text-money font-black uppercase text-[10px] md:text-xs tracking-widest mb-4 border-b border-gray-800 pb-2"><i class="fas fa-coins mr-2"></i>Erreur du Bookmaker</h4>
                        
                        <div class="flex justify-between items-center gap-3 mb-4">
                            <div class="bg-gray-950 p-2 md:p-3 rounded-lg text-center flex-1 border border-gray-800 shadow-inner">
                                <div class="text-[8px] md:text-[9px] text-gray-500 uppercase mb-1 font-bold">Cote Marché</div>
                                <div class="text-lg md:text-2xl font-black text-white">@${odds.toFixed(2)}</div>
                            </div>
                            <div class="text-gray-600 font-black italic text-xs">VS</div>
                            <div class="bg-gray-950 p-2 md:p-3 rounded-lg text-center flex-1 border border-gray-800 shadow-inner">
                                <div class="text-[8px] md:text-[9px] text-gray-500 uppercase mb-1 font-bold">Cote Réelle (IA)</div>
                                <div class="text-lg md:text-2xl font-black text-${colorClass}">@${(100 / prob).toFixed(2)}</div>
                            </div>
                        </div>
                        
                        <p class="text-gray-400 text-[9px] md:text-[11px] leading-relaxed text-justify relative z-10">
                            Le bookmaker vous offre <b class="text-white">@${odds.toFixed(2)}</b> (estimant les chances à <b class="text-white">${(100 / odds).toFixed(1)}%</b>). 
                            Or, l'IA prouve mathématiquement que ce scénario a <b class="text-${colorClass}">${prob.toFixed(1)}%</b> de chances d'arriver. 
                            Profiter de cette inefficacité vous donne un avantage net de <b class="text-money bg-money/10 px-1 rounded inline-block">+${edge.toFixed(1)}% (+EV)</b>.
                        </p>
                    </div>

                    <div>
                        <h4 class="text-white font-black uppercase text-[10px] md:text-xs tracking-widest mb-3 flex items-center pl-1"><i class="fas fa-history text-gray-400 mr-2"></i>Forme Récente (L5)</h4>
                        <div class="bg-gray-950 border border-gray-800 rounded-xl p-2 md:p-3 shadow-inner">
                            ${l5Html}
                        </div>
                    </div>
                `;
            } catch (e) {
                content.innerHTML = `<div class="text-center text-blood font-bold py-10">Erreur de connexion.</div>`;
            }
        };

        window.closePlayerInsight = function () {
            const sheet = document.getElementById('insight-sheet');
            sheet.classList.add('translate-y-full'); // Animation de glisse vers le bas
            setTimeout(() => {
                document.getElementById('player-insight-modal').classList.add('hidden');
                document.getElementById('player-insight-modal').classList.remove('flex');
            }, 300);
        };