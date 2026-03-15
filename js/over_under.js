// =========================================================================
// ⚖️ HOCKAI - MODULE OVER/UNDER 5.5 BUTS (Analyse Globale de Match)
// =========================================================================

window.openOverUnderModule = async function() {
    let modal = document.getElementById('ou-modal');
    if (!modal) {
        console.error("Modal OU introuvable.");
        return;
    }
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    
    let content = document.getElementById('ou-modal-content');
    document.getElementById('ou-modal-title').innerHTML = '<i class="fas fa-list text-gray-400"></i> Sélection du Match (Over/Under)';
    
    content.innerHTML = `<div class="text-center py-12"><i class="fas fa-circle-notch fa-spin text-4xl text-gray-500 mb-4"></i><div class="text-white font-black tracking-widest uppercase text-xs">Recherche des matchs de la nuit...</div></div>`;
    
    // S'assurer que les matchs sont chargés
    if (typeof window.fetchedMatchesPool === 'undefined' || window.fetchedMatchesPool.length === 0) {
        try {
            let res = await fetch(`${API_BASE}/upcoming_matches`);
            let data = await res.json();
            window.fetchedMatchesPool = data.matches || [];
        } catch (e) {
            content.innerHTML = `<div class="text-blood font-bold text-center">Erreur de connexion au serveur.</div>`;
            return;
        }
    }
    
    let now = new Date();
    let activeMatches = window.fetchedMatchesPool.filter(m => {
        if (m.state === 'FINAL' || m.state === 'OFF') return false;
        let matchDate = new Date(m.date);
        let hoursDiff = (matchDate - now) / (1000 * 60 * 60);
        return hoursDiff >= -6 && hoursDiff <= 24;
    });

    if (activeMatches.length === 0) {
        content.innerHTML = `<div class="text-gray-500 font-bold text-center py-10 uppercase tracking-widest text-xs"><i class="fas fa-bed text-4xl mb-4 block opacity-50"></i>Aucun match prévu dans les prochaines 24h.</div>`;
        return;
    }

    let html = `<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">`;
    activeMatches.forEach(m => {
        let d = new Date(m.date);
        let timeStr = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
        let dateStr = d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
        let hLogo = typeof getLogoUrl === 'function' ? getLogoUrl(m.home_team) : "assets/logo_hockAI.png";
        let aLogo = typeof getLogoUrl === 'function' ? getLogoUrl(m.away_team) : "assets/logo_hockAI.png";

        html += `
            <div onclick="window.analyzeOverUnder('${m.home_team}', '${m.away_team}', '${m.date}')" class="bg-gray-900/50 hover:bg-gray-800 border border-gray-700 hover:border-gray-400 p-4 rounded-xl cursor-pointer transition-all group shadow-lg flex items-center justify-between">
                <div class="flex flex-col items-center w-1/3">
                    <img src="${hLogo}" onerror="this.src='assets/logo_hockAI.png'" class="w-10 h-10 object-contain drop-shadow-[0_0_8px_rgba(255,255,255,0.2)] group-hover:scale-110 transition">
                    <span class="text-white font-black text-[10px] mt-2 tracking-widest">${m.home_team}</span>
                </div>
                <div class="flex flex-col items-center w-1/3 text-center">
                    <span class="text-[8px] text-gray-500 uppercase font-black tracking-widest mb-1">${dateStr}<br>${timeStr}</span>
                    <span class="text-gray-600 font-black italic text-xs">VS</span>
                </div>
                <div class="flex flex-col items-center w-1/3">
                    <img src="${aLogo}" onerror="this.src='assets/logo_hockAI.png'" class="w-10 h-10 object-contain drop-shadow-[0_0_8px_rgba(255,255,255,0.2)] group-hover:scale-110 transition">
                    <span class="text-white font-black text-[10px] mt-2 tracking-widest">${m.away_team}</span>
                </div>
            </div>
        `;
    });
    html += `</div>`;
    content.innerHTML = html;
};

window.closeOverUnderModule = function() {
    document.getElementById('ou-modal').classList.add('hidden');
    document.getElementById('ou-modal').classList.remove('flex');
};

window.analyzeOverUnder = async function(homeTeam, awayTeam, fullDate) {
    let content = document.getElementById('ou-modal-content');
    
    // Header avec bouton retour
    document.getElementById('ou-modal-title').innerHTML = `
        <div class="flex items-center gap-3">
            <button onclick="window.openOverUnderModule()" class="text-gray-500 hover:text-white transition w-8 h-8 rounded-full bg-gray-900 border border-gray-700 flex items-center justify-center"><i class="fas fa-arrow-left text-sm"></i></button>
            <span><i class="fas fa-chart-bar text-gray-400 mr-2"></i> ${homeTeam} vs ${awayTeam}</span>
        </div>
    `;

    content.innerHTML = `
        <div class="flex flex-col items-center justify-center py-16">
            <i class="fas fa-microchip text-5xl text-gray-600 mb-6 animate-pulse"></i>
            <div class="text-white font-black uppercase tracking-widest text-xs mb-2">Quantification des effectifs...</div>
            <div class="text-[9px] text-gray-500 font-bold uppercase w-3/4 text-center">L'IA compile les expected goals (xG), les GSAx des gardiens, et la fatigue (B2B).</div>
        </div>
    `;

    try {
        let dOnly = fullDate.split('T')[0];
        let [gRes, tRes] = await Promise.all([
            fetch(`${API_BASE}/goalie_matchup/${homeTeam}/${awayTeam}`).catch(() => null),
            fetch(`${API_BASE}/team_comparison/${homeTeam}/${awayTeam}/${dOnly}`).catch(() => null)
        ]);

        let goalies = gRes ? await gRes.json() : null;
        let teams = tRes ? await tRes.json() : null;

        // Variables de base du modèle mathématique
        let scoreOver = 50.0;
        let scoreUnder = 50.0;
        let totalGoalsExpected = 5.8; // Base moyenne NHL
        let reasons = [];

        // 1. Analyse des Gardiens (GSAx)
        if (goalies && goalies.home_goalie && goalies.away_goalie) {
            let hG = goalies.home_goalie; let aG = goalies.away_goalie;
            let hGSAx = hG.l5 ? hG.l5.gsax : (hG.gsax || 0);
            let aGSAx = aG.l5 ? aG.l5.gsax : (aG.gsax || 0);
            let combinedGSAx = hGSAx + aGSAx;
            
            if (combinedGSAx < -1.5) {
                scoreOver += 18; scoreUnder -= 18; totalGoalsExpected += 0.7;
                reasons.push({ icon: 'fas fa-door-open', color: 'text-blood', title: 'Gardiens Vulnérables', desc: `Les gardiens partants affichent des statistiques négatives (GSAx combiné: ${combinedGSAx.toFixed(1)}). Ils encaissent plus de buts que la moyenne de la ligue.` });
            } else if (combinedGSAx > 2.0) {
                scoreUnder += 18; scoreOver -= 18; totalGoalsExpected -= 0.6;
                reasons.push({ icon: 'fas fa-shield-alt', color: 'text-ice', title: 'Excellence devant le filet', desc: `Matchup de gardiens très solides (GSAx combiné: +${combinedGSAx.toFixed(1)}). Les occasions franches seront souvent arrêtées.` });
            } else {
                reasons.push({ icon: 'fas fa-equals', color: 'text-gray-500', title: 'Gardiens dans la moyenne', desc: `Performances standards attendues dans les filets ce soir. Pas d'avantage net.` });
            }
        } else {
            reasons.push({ icon: 'fas fa-question-circle', color: 'text-yellow-500', title: 'Gardiens Incertains', desc: `Les gardiens ne sont pas encore confirmés. L'IA se base sur les forces offensives et défensives des équipes.` });
        }

        // 2. Analyse de la Fatigue (B2B)
        if (teams && teams.home && teams.away) {
            if (teams.home.b2b && teams.away.b2b) {
                scoreOver -= 6; scoreUnder += 6; totalGoalsExpected -= 0.4;
                reasons.push({ icon: 'fas fa-battery-empty', color: 'text-gray-400', title: 'Double Fatigue', desc: `Les deux équipes jouent en Back-to-Back. Le rythme du match devrait être ralenti et haché.` });
            } else if (teams.home.b2b || teams.away.b2b) {
                scoreOver += 10; scoreUnder -= 10; totalGoalsExpected += 0.5;
                reasons.push({ icon: 'fas fa-ambulance', color: 'text-orange-500', title: 'Déséquilibre de Repos', desc: `Une équipe joue en B2B. Ce déséquilibre provoque souvent des erreurs défensives majeures en 3ème période.` });
            }
        }

        // 3. Puissance de Feu vs Défense (Data XGBoost Globale)
        if (window.globalPredictionsPool && window.globalPredictionsPool.length > 0) {
            let hPlayers = window.globalPredictionsPool.filter(p => p.team === homeTeam && p.position !== 'G');
            let aPlayers = window.globalPredictionsPool.filter(p => p.team === awayTeam && p.position !== 'G');
            
            let hOffense = hPlayers.reduce((s, p) => s + (p.prob_goal || 0), 0);
            let aOffense = aPlayers.reduce((s, p) => s + (p.prob_goal || 0), 0);
            
            let totalOffense = hOffense + aOffense;
            
            if (totalOffense > 500) {
                scoreOver += 14; scoreUnder -= 14; totalGoalsExpected += 0.8;
                reasons.push({ icon: 'fas fa-fire', color: 'text-red-500', title: 'Puissance de Frappe Élite', desc: `Les modèles XGBoost détectent un immense potentiel offensif cumulé. Les stars sont alignées et en forme.` });
            } else if (totalOffense < 320) {
                scoreUnder += 14; scoreOver -= 14; totalGoalsExpected -= 0.8;
                reasons.push({ icon: 'fas fa-snowflake', color: 'text-blue-400', title: 'Attaques Muselées', desc: `L'espérance de buts individuels est particulièrement basse. Les joueurs clés manquent de réussite ou sont absents.` });
            } else {
                reasons.push({ icon: 'fas fa-hockey-puck', color: 'text-gray-400', title: 'Équilibre Offensif', desc: `La production offensive attendue des deux rosters est dans la moyenne habituelle de la LNH.` });
            }
        }

        // 4. Lissage et Verdict
        scoreOver = Math.max(15, Math.min(85, scoreOver));
        scoreUnder = Math.max(15, Math.min(85, scoreUnder));
        
        let finalVerdict = scoreOver > scoreUnder ? 'OVER 5.5' : 'UNDER 5.5';
        let verdictColor = scoreOver > scoreUnder ? 'text-blood' : 'text-ice';
        let verdictBorder = scoreOver > scoreUnder ? 'border-blood/50' : 'border-ice/50';
        let verdictBg = scoreOver > scoreUnder ? 'bg-blood/10' : 'bg-ice/10';
        let verdictGlow = scoreOver > scoreUnder ? 'shadow-[0_0_30px_rgba(255,51,51,0.3)]' : 'shadow-[0_0_30px_rgba(0,229,255,0.3)]';
        
        let finalProb = Math.max(scoreOver, scoreUnder);
        let oddsEst = (0.93 / (finalProb / 100)).toFixed(2);
        let confidenceStr = finalProb >= 70 ? 'MAXIMALE 🔥' : (finalProb >= 60 ? 'ÉLEVÉE ⚡' : 'MODÉRÉE ⚖️');

        // --- GÉNÉRATION DU HTML ---
        let html = `
            <div class="flex flex-col gap-6 fade-in">
                <div class="${verdictBg} border-2 ${verdictBorder} p-6 rounded-2xl text-center relative overflow-hidden ${verdictGlow}">
                    <div class="text-[10px] text-gray-300 uppercase font-black tracking-widest mb-2">Verdict Officiel IA</div>
                    <div class="text-5xl md:text-6xl font-black ${verdictColor} drop-shadow-[0_0_10px_currentColor] mb-3 tracking-tighter">${finalVerdict}</div>
                    
                    <div class="flex flex-col sm:flex-row justify-center items-center gap-3 text-[10px] font-black uppercase tracking-widest">
                        <span class="bg-gray-950/80 px-4 py-2 rounded-lg border border-gray-700/50 text-gray-300 shadow-inner">
                            Confiance: <span class="text-white ml-1">${confidenceStr} (${finalProb.toFixed(1)}%)</span>
                        </span>
                        <span class="bg-gray-950/80 px-4 py-2 rounded-lg border border-gray-700/50 text-gray-300 shadow-inner">
                            Cote Équitable: <span class="text-yellow-500 ml-1">@${oddsEst}</span>
                        </span>
                    </div>
                </div>

                <div class="bg-gray-900 border border-gray-800 rounded-xl p-5 shadow-lg">
                    <div class="flex justify-between text-[9px] md:text-[10px] font-black uppercase tracking-widest mb-3">
                        <span class="text-ice">UNDER (${scoreUnder.toFixed(1)}%)</span>
                        <span class="text-gray-400 bg-gray-950 px-3 py-1 rounded-full border border-gray-700">Projection : <span class="text-white">${totalGoalsExpected.toFixed(2)} Buts</span></span>
                        <span class="text-blood">OVER (${scoreOver.toFixed(1)}%)</span>
                    </div>
                    <div class="w-full h-5 bg-black rounded-full overflow-hidden flex relative border border-gray-700 shadow-inner">
                        <div class="absolute left-1/2 top-0 bottom-0 w-1 bg-yellow-500 z-10 shadow-[0_0_5px_#EAB308]"></div>
                        <div class="bg-gradient-to-r from-blue-900 to-ice h-full transition-all duration-1000" style="width: ${scoreUnder}%"></div>
                        <div class="bg-gradient-to-l from-red-900 to-blood h-full transition-all duration-1000" style="width: ${scoreOver}%"></div>
                    </div>
                </div>

                <div class="bg-gray-950 border border-gray-800 rounded-xl p-5 shadow-inner">
                    <h4 class="text-white font-black uppercase tracking-widest text-[10px] md:text-xs mb-4 flex items-center gap-2"><i class="fas fa-microchip text-purple-500"></i> Facteurs Clés du Match</h4>
                    <div class="flex flex-col gap-3">
        `;

        reasons.forEach(r => {
            html += `
                <div class="flex items-start gap-4 bg-gray-900/50 p-3.5 rounded-xl border border-gray-800/80 hover:border-gray-600 transition">
                    <div class="w-10 h-10 rounded-full bg-black border border-gray-700 flex items-center justify-center shrink-0 shadow-inner">
                        <i class="${r.icon} text-lg ${r.color}"></i>
                    </div>
                    <div>
                        <div class="text-white font-black text-[10px] md:text-xs uppercase tracking-widest mb-1.5">${r.title}</div>
                        <div class="text-gray-400 text-[10px] md:text-xs leading-relaxed font-bold">${r.desc}</div>
                    </div>
                </div>
            `;
        });

        html += `
                    </div>
                </div>
            </div>
        `;
        
        content.innerHTML = html;

    } catch (e) {
        console.error(e);
        content.innerHTML = `<div class="text-blood font-bold text-center py-10 uppercase tracking-widest text-xs"><i class="fas fa-exclamation-triangle mb-2 text-3xl block"></i>Données insuffisantes pour analyser ce match.</div>`;
    }
};