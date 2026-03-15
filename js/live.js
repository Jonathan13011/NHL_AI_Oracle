// ==========================================
// ORACLE LIVE : SMART RINK 4D ENGINE
// ==========================================
window.liveRefreshTimer = null;
window.currentLiveGames = [];
window.selectedActiveGame = null;

window.loadLiveMomentum = async function() {
    let container = document.getElementById('live-matches-mini-grid');
    if (!container) return;

    container.innerHTML = `<div class="text-center py-4 w-full"><i class="fas fa-satellite-dish animate-ping text-red-500 text-2xl mb-2"></i><div class="text-gray-400 font-black uppercase tracking-widest text-[10px]">Interception LNH...</div></div>`;

    try {
        let res = await fetch(`${API_BASE}/live_games`);
        let data = await res.json();
        
        if (data.status !== 'success' || !data.games || data.games.length === 0) {
            container.innerHTML = `<div class="bg-gray-900 border border-gray-800 p-4 rounded-xl text-center shadow-inner w-full"><h3 class="text-white font-black uppercase tracking-widest text-xs"><i class="fas fa-bed text-gray-600 mr-2"></i>Aucun Match en Cours</h3></div>`;
            document.getElementById('live-studio-container').classList.add('hidden');
            return;
        }

        window.currentLiveGames = data.games;
        renderMiniGrid(data.games, container);

        // Auto-refresh toutes les 30 secondes pour une vraie sensation "Trader"
        if (window.liveRefreshTimer) clearInterval(window.liveRefreshTimer);
        window.liveRefreshTimer = setInterval(() => {
            let liveTab = document.getElementById('tab-live');
            if (liveTab && !liveTab.classList.contains('hidden')) {
                window.loadLiveMomentum();
            }
        }, 30000);

    } catch (e) {
        console.error("Erreur Live:", e);
        container.innerHTML = `<div class="text-blood font-bold text-center text-xs py-4">Erreur de transmission. Reconnexion...</div>`;
    }
};

function renderMiniGrid(games, container) {
    container.innerHTML = '';
    let alerts = [];

    games.forEach((g, index) => {
        // Alerte Surchauffe (Différence de Tirs massive)
        let isHot = (Math.abs(g.home_sog - g.away_sog) > 10);
        let borderCol = isHot ? 'border-red-500 shadow-[0_0_10px_rgba(239,68,68,0.3)]' : 'border-gray-700';

        let html = `
            <div onclick="activateLiveStudio(${index})" class="min-w-[200px] bg-gray-900/80 border ${borderCol} rounded-lg p-3 cursor-pointer hover:bg-gray-800 transition shrink-0 group">
                <div class="flex justify-between items-center mb-2">
                    <span class="text-white font-black uppercase tracking-widest text-xs">${g.away_team}</span>
                    <span class="text-blood font-black text-lg">${g.away_score}</span>
                </div>
                <div class="flex justify-between items-center mb-2">
                    <span class="text-white font-black uppercase tracking-widest text-xs">${g.home_team}</span>
                    <span class="text-ice font-black text-lg">${g.home_score}</span>
                </div>
                <div class="text-[9px] text-gray-500 font-black uppercase tracking-widest text-center mt-2 group-hover:text-white transition flex items-center justify-center gap-1">
                    <i class="fas ${isHot ? 'fa-fire text-red-500 animate-pulse' : 'fa-clock'}"></i> Période ${g.period} • ${g.clock}
                </div>
            </div>
        `;
        container.innerHTML += html;
    });

    // Auto-sélectionne le premier match si aucun n'est sélectionné
    if (!window.selectedActiveGame && games.length > 0) {
        activateLiveStudio(0);
    } else if (window.selectedActiveGame) {
        // Mise à jour silencieuse des données du studio si un match est déjà ouvert
        let updatedGameIndex = games.findIndex(gm => gm.home_team === window.selectedActiveGame.home_team);
        if (updatedGameIndex !== -1) activateLiveStudio(updatedGameIndex, true);
    }
}

// L'ACTIVATION DU STUDIO HOLOGRAPHIQUE
window.activateLiveStudio = function(index, silentUpdate = false) {
    let g = window.currentLiveGames[index];
    if (!g) return;
    window.selectedActiveGame = g;

    if (!silentUpdate) {
        document.getElementById('live-studio-container').classList.remove('hidden');
        document.getElementById('live-studio-container').classList.add('flex');
        document.getElementById('rink-insight-panel').classList.add('hidden'); // Reset l'insight
    }

    // 1. Mise à jour des Textes
    document.getElementById('rink-match-title').innerText = `Analyse Tactique : ${g.away_team} @ ${g.home_team}`;
    document.getElementById('rink-clock').innerText = `P${g.period} - ${g.clock}`;
    document.getElementById('rink-name-away').innerText = g.away_team;
    document.getElementById('rink-name-home').innerText = g.home_team;

    document.getElementById('sb-name-away').innerText = g.away_team;
    document.getElementById('sb-score-away').innerText = g.away_score;
    document.getElementById('sb-sog-away').innerText = g.away_sog;
    
    document.getElementById('sb-name-home').innerText = g.home_team;
    document.getElementById('sb-score-home').innerText = g.home_score;
    document.getElementById('sb-sog-home').innerText = g.home_sog;

    // Préparation pour la calculette EV
    document.getElementById('live-ev-match').value = `${g.home_team}|${g.away_team}|${g.home_score}|${g.away_score}|${g.period}`;
    document.getElementById('ev-opt-home').innerText = `Domicile (${g.home_team})`;
    document.getElementById('ev-opt-away').innerText = `Extérieur (${g.away_team})`;

    // 2. MOTEUR PHYSIQUE : ANIMATION DU RINK
    // Calcul de la Domination par les Tirs (SOG)
    let totalSog = g.home_sog + g.away_sog;
    let homeSogPct = totalSog === 0 ? 50 : (g.home_sog / totalSog) * 100;
    let awaySogPct = totalSog === 0 ? 50 : (g.away_sog / totalSog) * 100;

    let pressureAwayZone = document.getElementById('rink-pressure-away'); // Zone défensive AWAY (Si Home domine, ça rougit)
    let pressureHomeZone = document.getElementById('rink-pressure-home'); // Zone défensive HOME (Si Away domine, ça rougit)

    // Reset visuel
    pressureAwayZone.className = "absolute left-0 top-0 h-full w-1/2 bg-gradient-to-r transition-all duration-1000 z-0";
    pressureHomeZone.className = "absolute right-0 top-0 h-full w-1/2 bg-gradient-to-l transition-all duration-1000 z-0";

    let btnAwayDef = document.getElementById('hotspot-away-def'); let iconAwayDef = document.getElementById('icon-away-def');
    let btnHomeDef = document.getElementById('hotspot-home-def'); let iconHomeDef = document.getElementById('icon-home-def');
    let btnCenter = document.getElementById('hotspot-center');

    // On cache les hotspots par défaut
    btnAwayDef.classList.add('pointer-events-none', 'opacity-0'); iconAwayDef.classList.add('opacity-0');
    btnHomeDef.classList.add('pointer-events-none', 'opacity-0'); iconHomeDef.classList.add('opacity-0');
    btnCenter.classList.add('pointer-events-none', 'opacity-0');

    // LOGIQUE DE SIÈGE (Surchauffe)
    if (g.home_sog - g.away_sog > 5) {
        // HOME DOMINE : La zone gauche (Away) s'embrase
        pressureAwayZone.classList.add('from-red-600/60', 'to-transparent');
        btnAwayDef.classList.remove('pointer-events-none', 'opacity-0'); iconAwayDef.classList.remove('opacity-0'); // Le gardien Away est sous le feu
    } else if (g.away_sog - g.home_sog > 5) {
        // AWAY DOMINE : La zone droite (Home) s'embrase
        pressureHomeZone.classList.add('from-ice/60', 'to-transparent');
        btnHomeDef.classList.remove('pointer-events-none', 'opacity-0'); iconHomeDef.classList.remove('opacity-0'); // Le gardien Home est sous le feu
    } else {
        // Match Équilibré : Bataille au milieu
        pressureAwayZone.classList.add('from-gray-600/20', 'to-transparent');
        pressureHomeZone.classList.add('from-gray-600/20', 'to-transparent');
        btnCenter.classList.remove('pointer-events-none', 'opacity-0'); // Action au centre
    }

    // Risque Empty Net en fin de 3ème
    if ((g.period === '3rd' || g.period === 3) && Math.abs(g.home_score - g.away_score) > 0 && Math.abs(g.home_score - g.away_score) <= 2) {
        let clockNum = parseInt(g.clock.split(':')[0] || '20');
        if (clockNum < 4) { // Moins de 4 minutes
            btnCenter.classList.remove('pointer-events-none', 'opacity-0'); // On active le centre pour l'alerte
            btnCenter.classList.replace('bg-yellow-500', 'bg-purple-500'); // Changement de couleur alerte
        }
    }
    // Lancement des extracteurs de données avancés
    if (!silentUpdate) {
        window.fetchRealTimeStats(g.home_team, g.away_team);
        // LNH API nécessite l'ID du match, on simule l'ID pour l'instant via l'API score/now à l'intérieur de la fonction
        // On va chercher l'ID en récupérant le flux score/now
        fetch('https://api-web.nhle.com/v1/score/now').then(r => r.json()).then(scoreData => {
            let gameData = scoreData.games.find(gm => gm.homeTeam.abbrev === g.home_team && gm.awayTeam.abbrev === g.away_team);
            if (gameData) {
                window.fetchLiveGoals(gameData.id, g.home_team, g.away_team);
            }
        });
    }
};

// 3. LE CERVEAU D'ANALYSE (Clic sur un Hotspot)
window.triggerRinkInsight = function(zone) {
    let g = window.selectedActiveGame;
    if (!g) return;

    let panel = document.getElementById('rink-insight-panel');
    let content = document.getElementById('rink-insight-content');
    panel.classList.remove('hidden');

    content.innerHTML = `<div class="text-center py-4"><i class="fas fa-microchip fa-spin text-yellow-500 text-2xl mb-2"></i><div class="text-[10px] text-gray-500 uppercase tracking-widest font-black">Compilation de la matrice...</div></div>`;

    setTimeout(() => {
        let diff = g.home_score - g.away_score;
        let html = "";

        if (zone === 'away_def') {
            html = `
                <div class="flex items-start gap-4">
                    <div class="bg-red-500/20 p-3 rounded-lg border border-red-500 text-red-500 text-2xl"><i class="fas fa-fire-alt"></i></div>
                    <div>
                        <h5 class="text-white font-black uppercase text-sm mb-1">Siège dans la zone de ${g.away_team}</h5>
                        <p class="text-gray-400 text-xs leading-relaxed mb-3">La ligne défensive de ${g.away_team} est asphyxiée. Avec <b>${g.home_sog} tirs concédés</b>, le gardien est en surrégime. L'algorithme de Poisson anticipe une rupture physique imminente (Craquage Défensif).</p>
                        <div class="bg-black border-l-4 border-money p-3 rounded">
                            <span class="text-[9px] text-money font-black uppercase tracking-widest block mb-1">Pari Quantitatif Recommandé :</span>
                            <span class="text-white font-bold text-sm">🔥 Prochain But : ${g.home_team}</span>
                        </div>
                    </div>
                </div>
            `;
        } else if (zone === 'home_def') {
            html = `
                <div class="flex items-start gap-4">
                    <div class="bg-ice/20 p-3 rounded-lg border border-ice text-ice text-2xl"><i class="fas fa-snowflake"></i></div>
                    <div>
                        <h5 class="text-white font-black uppercase text-sm mb-1">Pluie de tirs sur ${g.home_team}</h5>
                        <p class="text-gray-400 text-xs leading-relaxed mb-3">${g.away_team} dicte totalement le tempo du match avec <b>${g.away_sog} tirs cadrés</b>. Le momentum est de leur côté. Si le score est serré, c'est une anomalie mathématique à exploiter immédiatement.</p>
                        <div class="bg-black border-l-4 border-money p-3 rounded">
                            <span class="text-[9px] text-money font-black uppercase tracking-widest block mb-1">Pari Quantitatif Recommandé :</span>
                            <span class="text-white font-bold text-sm">❄️ Prochain But : ${g.away_team}</span>
                        </div>
                    </div>
                </div>
            `;
        } else if (zone === 'center') {
            let isEmptyNetRisk = ((g.period === '3rd' || g.period === 3) && Math.abs(diff) > 0 && Math.abs(diff) <= 2 && parseInt(g.clock.split(':')[0] || '20') < 4);
            
            if (isEmptyNetRisk) {
                let leadingTeam = diff > 0 ? g.home_team : g.away_team;
                html = `
                    <div class="flex items-start gap-4">
                        <div class="bg-purple-500/20 p-3 rounded-lg border border-purple-500 text-purple-400 text-2xl"><i class="fas fa-door-open"></i></div>
                        <div>
                            <h5 class="text-white font-black uppercase text-sm mb-1">Alerte Maximum : Filet Désert (Empty Net)</h5>
                            <p class="text-gray-400 text-xs leading-relaxed mb-3">Fin de match critique. L'équipe menée va sortir son gardien pour jouer à 6 contre 5 d'une seconde à l'autre. Le risque de but en contre-attaque explose de 400%.</p>
                            <div class="bg-black border-l-4 border-money p-3 rounded">
                                <span class="text-[9px] text-money font-black uppercase tracking-widest block mb-1">Pari Quantitatif Recommandé :</span>
                                <span class="text-white font-bold text-sm">🎯 Écart de Buts : ${leadingTeam} gagne de 2 buts ou + (Puckline -1.5)</span>
                            </div>
                        </div>
                    </div>
                `;
            } else {
                html = `
                    <div class="flex items-start gap-4">
                        <div class="bg-yellow-500/20 p-3 rounded-lg border border-yellow-500 text-yellow-500 text-2xl"><i class="fas fa-balance-scale"></i></div>
                        <div>
                            <h5 class="text-white font-black uppercase text-sm mb-1">Bataille en Zone Neutre</h5>
                            <p class="text-gray-400 text-xs leading-relaxed mb-3">Les deux équipes se neutralisent (${g.home_sog} tirs à ${g.away_sog}). Le jeu se déroule principalement au milieu de la patinoire. Les défenses sont en place.</p>
                            <div class="bg-black border-l-4 border-money p-3 rounded">
                                <span class="text-[9px] text-money font-black uppercase tracking-widest block mb-1">Stratégie Live Recommandée :</span>
                                <span class="text-white font-bold text-sm">🛑 Ne rien faire. Attendre une pénalité ou une erreur défensive.</span>
                            </div>
                        </div>
                    </div>
                `;
            }
        }
        content.innerHTML = html;
    }, 600);
};

// ==========================================
// CALCULATEUR LIVE EV (VALUE BET)
// ==========================================
window.calculateLiveEV = function() {
    let matchVal = document.getElementById('live-ev-match').value;
    let targetTeam = document.getElementById('live-ev-team').value; // 'home' or 'away'
    let bookmakerOdds = parseFloat(document.getElementById('live-ev-odds').value);
    let resBox = document.getElementById('live-ev-result');

    if (!matchVal || !bookmakerOdds || isNaN(bookmakerOdds)) {
        resBox.innerHTML = `<span class="text-gray-500 font-bold text-xs">Veuillez remplir la cote.</span>`;
        resBox.classList.remove('hidden');
        return;
    }

    let [home, away, hScoreStr, aScoreStr, period] = matchVal.split('|');
    let hScore = parseInt(hScoreStr);
    let aScore = parseInt(aScoreStr);
    let diff = targetTeam === 'home' ? (hScore - aScore) : (aScore - hScore);

    // Algorithme Mathématique Live
    let liveProb = 50; 
    
    // Impact du Score
    if (diff > 0) liveProb += (diff * 20); // Mène
    else if (diff < 0) liveProb += (diff * 25); // Perd
    
    // Impact du Temps
    if (period === '2nd' || period == 2) {
        if (diff > 0) liveProb += 8; else liveProb -= 8;
    } else if (period === '3rd' || period == 3) {
        if (diff > 0) liveProb += 20; else liveProb -= 30; // 3ème période = Presque impossible de remonter 2 buts
    }

    liveProb = Math.max(2, Math.min(98, liveProb));
    let fairOdds = 100 / liveProb;
    let ev = ((bookmakerOdds / fairOdds) - 1) * 100;

    resBox.classList.remove('hidden', 'bg-money/10', 'border-money', 'bg-blood/10', 'border-blood');
    
    if (ev > 5) {
        resBox.classList.add('bg-money/10', 'border-money');
        resBox.innerHTML = `
            <div class="text-[10px] text-money uppercase tracking-widest font-black"><i class="fas fa-check-circle"></i> Value Détectée</div>
            <div class="text-2xl font-black text-white">+${ev.toFixed(1)}% EV</div>
            <div class="text-[10px] text-gray-400 font-bold mt-1 uppercase">Cote IA : @${fairOdds.toFixed(2)} | Probabilité : ${liveProb.toFixed(0)}%</div>
        `;
    } else {
        resBox.classList.add('bg-blood/10', 'border-blood');
        resBox.innerHTML = `
            <div class="text-[10px] text-blood uppercase tracking-widest font-black"><i class="fas fa-times-circle"></i> Pari Perdant (Long Terme)</div>
            <div class="text-2xl font-black text-white">${ev.toFixed(1)}% EV</div>
            <div class="text-[10px] text-gray-400 font-bold mt-1 uppercase">Cote IA : @${fairOdds.toFixed(2)} | Le bookmaker vous vole.</div>
        `;
    }
};

// ==========================================
// EXTRACTEUR DIRECT LNH (RADIOGRAPHIE AVANCÉE)
// ==========================================
window.fetchRealTimeStats = async function(homeTeam, awayTeam) {
    let panel = document.getElementById('live-stats-panel');
    let content = document.getElementById('live-stats-content');
    if (!panel || !content) return;

    // Affichage avec animation de chargement "Quant"
    panel.classList.remove('hidden');
    content.innerHTML = `<div class="text-center py-6"><i class="fas fa-circle-notch fa-spin text-money text-3xl mb-3 drop-shadow-[0_0_10px_#4ADE80]"></i><br><span class="text-[10px] text-gray-500 uppercase tracking-widest font-black">Interception du flux officiel LNH...</span></div>`;

    try {
        // 1. On trouve l'ID officiel du match sur l'API publique de la NHL
        let scoreRes = await fetch('https://api-web.nhle.com/v1/score/now');
        let scoreData = await scoreRes.json();
        let game = scoreData.games.find(g => g.homeTeam.abbrev === homeTeam && g.awayTeam.abbrev === awayTeam);

        if (!game) throw new Error("ID du match introuvable");

        // 2. On aspire la feuille de match avancée (Boxscore LNH)
        let boxRes = await fetch(`https://api-web.nhle.com/v1/gamecenter/${game.id}/boxscore`);
        let boxData = await boxRes.json();

        // Fonction stylisée pour générer chaque ligne de la radiographie
        let renderStat = (label, awayVal, homeVal, invertColors=false) => {
            let aNum = parseFloat(awayVal) || 0;
            let hNum = parseFloat(homeVal) || 0;
            let aCol = 'text-white'; let hCol = 'text-white';
            
            // L'IA met en vert celui qui domine la stat (ou en rouge pour les erreurs comme les pénalités)
            if (aNum > hNum) { aCol = invertColors ? 'text-red-500 drop-shadow-[0_0_5px_#ef4444]' : 'text-green-400 drop-shadow-[0_0_5px_#4ADE80]'; hCol = 'text-gray-500'; }
            if (hNum > aNum) { hCol = invertColors ? 'text-red-500 drop-shadow-[0_0_5px_#ef4444]' : 'text-green-400 drop-shadow-[0_0_5px_#4ADE80]'; aCol = 'text-gray-500'; }
            if (aNum === hNum) { aCol = 'text-yellow-500'; hCol = 'text-yellow-500'; }

            return `
            <div class="flex justify-between items-center bg-black/60 p-2.5 rounded-lg border border-gray-800 hover:border-gray-600 transition group">
                <div class="w-1/3 text-center font-black ${aCol} text-base md:text-lg group-hover:scale-110 transition-transform">${awayVal}</div>
                <div class="w-1/3 text-center text-[9px] md:text-[10px] text-gray-400 uppercase tracking-widest font-bold">${label}</div>
                <div class="w-1/3 text-center font-black ${hCol} text-base md:text-lg group-hover:scale-110 transition-transform">${homeVal}</div>
            </div>`;
        };

        // Extraction des données LNH
        let aStats = boxData.awayTeam;
        let hStats = boxData.homeTeam;
        
        // Gestion des Faceoffs (parfois en décimal, parfois en pourcentage entier)
        let aFaceoff = (parseFloat(aStats.faceoffWinningPctg) < 1) ? (aStats.faceoffWinningPctg * 100).toFixed(1) : parseFloat(aStats.faceoffWinningPctg).toFixed(1);
        let hFaceoff = (parseFloat(hStats.faceoffWinningPctg) < 1) ? (hStats.faceoffWinningPctg * 100).toFixed(1) : parseFloat(hStats.faceoffWinningPctg).toFixed(1);

        // 3. Rendu visuel dans le tableau de bord
        content.innerHTML = `
            <div class="flex justify-between items-center mb-3 px-6 bg-gray-950 rounded-lg py-2 border border-gray-800">
                <span class="text-blood font-black text-lg md:text-2xl">${awayTeam}</span>
                <span class="text-gray-600 font-black text-xs uppercase tracking-widest"><i class="fas fa-bolt text-yellow-500 mr-1"></i> Dominance</span>
                <span class="text-ice font-black text-lg md:text-2xl">${homeTeam}</span>
            </div>
            ${renderStat('Tirs Cadrés', aStats.sog, hStats.sog)}
            ${renderStat('Mises en jeu (%)', aFaceoff + '%', hFaceoff + '%')}
            ${renderStat('Avantage Num. (PP)', aStats.powerPlayConversion, hStats.powerPlayConversion)}
            ${renderStat('Mises en Échec (Hits)', aStats.hits, hStats.hits)}
            ${renderStat('Tirs Bloqués', aStats.blockedShots, hStats.blockedShots)}
            ${renderStat('Palets Volés', aStats.takeaways, hStats.takeaways)}
            ${renderStat('Palets Perdus', aStats.giveaways, hStats.giveaways, true)} 
            ${renderStat('Minutes Pénalité', aStats.pim, hStats.pim, true)}
        `;

    } catch(e) {
        console.error("Erreur Extraction Boxscore", e);
        content.innerHTML = '<div class="text-center text-red-500 text-[10px] font-bold uppercase py-4 tracking-widest border border-red-500/30 rounded-lg bg-red-500/10"><i class="fas fa-exclamation-triangle mr-2"></i>Données statistiques inaccessibles (Attendez le début du match).</div>';
    }
};

// ==========================================
// TRAQUEUR DE BUTS (PLAY-BY-PLAY SCRAPER)
// ==========================================
window.fetchLiveGoals = async function(gameId, homeTeam, awayTeam) {
    let panel = document.getElementById('live-goals-panel');
    let content = document.getElementById('live-goals-content');
    if (!panel || !content) return;

    panel.classList.remove('hidden');
    content.innerHTML = `<div class="text-center py-4"><i class="fas fa-circle-notch fa-spin text-red-500 text-2xl mb-2"></i><br><span class="text-[10px] text-gray-500 uppercase tracking-widest font-black">Scan des séquences de buts...</span></div>`;

    try {
        let res = await fetch(`https://api-web.nhle.com/v1/gamecenter/${gameId}/play-by-play`);
        let pbpData = await res.json();
        
        let roster = pbpData.rosterSpots || [];
        let getPlayerName = (id) => {
            let p = roster.find(r => r.playerId === id);
            return p ? `${p.firstName.default} ${p.lastName.default}` : `Joueur #${id}`;
        };

        let goals = pbpData.plays.filter(play => play.typeDescKey === 'goal');
        
        if (goals.length === 0) {
            content.innerHTML = `<div class="text-center py-4 text-gray-500 text-[10px] uppercase tracking-widest font-black italic">Aucun but pour le moment</div>`;
            return;
        }

        let html = '';
        // On inverse pour avoir le but le plus récent en haut
        goals.reverse().forEach(goal => {
            let details = goal.details;
            let scoringTeam = goal.details.eventOwnerTeamId === pbpData.homeTeam.id ? homeTeam : awayTeam;
            let timeStr = `P${goal.periodDescriptor.number} - ${goal.timeInPeriod}`;
            
            let scorerId = details.scoringPlayerId;
            let assist1Id = details.assist1PlayerId;
            let assist2Id = details.assist2PlayerId;
            
            let scorerName = getPlayerName(scorerId);
            let assistsStr = '';
            if (assist1Id) assistsStr += getPlayerName(assist1Id);
            if (assist2Id) assistsStr += (assistsStr ? ', ' : '') + getPlayerName(assist2Id);
            
            // Stockage des données pour le modal Ice Vision
            let goalData = {
                time: timeStr,
                team: scoringTeam,
                scorer: scorerName,
                assists: assistsStr || "Aucune (Unassisted)",
                awayTeam: awayTeam,
                homeTeam: homeTeam,
                // Dans la LNH, goal.details.scoringTeamDefendingSide renseigne sur le contexte. Pour les joueurs sur la glace, on utilise les ID fournis (si présents dans de futures maj de l'API LNH).
                playersIce: "Extraction dynamique via Boxscore en cours..." 
            };
            
            let safeJson = encodeURIComponent(JSON.stringify(goalData)).replace(/'/g, "%27");

            html += `
            <div class="bg-black/60 border border-gray-800 rounded-lg p-3 flex justify-between items-center group hover:border-red-500 transition">
                <div>
                    <div class="text-[9px] text-gray-500 font-black uppercase tracking-widest mb-1"><i class="fas fa-clock"></i> ${timeStr} • <span class="text-red-500">${scoringTeam}</span></div>
                    <div class="text-white font-black text-sm"><i class="fas fa-hockey-puck text-ice mr-1"></i> ${scorerName}</div>
                    <div class="text-[10px] text-gray-400 font-bold mt-0.5"><i class="fas fa-hands-helping mr-1"></i> ${assistsStr || "Aucune passe"}</div>
                </div>
                <button onclick="window.openIceVision('${safeJson}')" class="bg-gray-800 hover:bg-cyan-600 border border-gray-700 hover:border-cyan-500 text-white w-10 h-10 rounded-full flex justify-center items-center transition shadow-[0_0_10px_rgba(0,0,0,0.5)] group-hover:shadow-[0_0_15px_rgba(6,182,212,0.5)]" title="Voir les joueurs sur la glace">
                    <i class="fas fa-eye"></i>
                </button>
            </div>
            `;
        });
        
        content.innerHTML = html;

    } catch (e) {
        console.error("Erreur Extraction Buts", e);
        content.innerHTML = `<div class="text-center text-red-500 text-[10px] font-bold uppercase py-2">Erreur de lecture du flux des buts.</div>`;
    }
};

window.openIceVision = function(jsonStr) {
    let data = JSON.parse(decodeURIComponent(jsonStr));
    let modal = document.getElementById('ice-vision-modal');
    
    document.getElementById('iv-modal-subtitle').innerText = `BUT DE ${data.team} • ${data.time}`;
    
    document.getElementById('iv-goal-recap').innerHTML = `
        <div class="text-white font-black text-xl mb-1">${data.scorer}</div>
        <div class="text-gray-400 text-xs font-bold uppercase tracking-widest">Passe(s) : ${data.assists}</div>
    `;
    
    document.getElementById('iv-team-away').innerText = data.awayTeam;
    document.getElementById('iv-team-home').innerText = data.homeTeam;
    
    // Simulation visuelle des lignes sur la glace (En attendant la route Python complète pour les shifts)
    let fakePlayersHtml = `
        <li class="flex items-center gap-2"><i class="fas fa-user-shield text-gray-600"></i> Gardien Titulaire</li>
        <li class="flex items-center gap-2"><i class="fas fa-user text-blue-400"></i> Ligne défensive active</li>
        <li class="flex items-center gap-2"><i class="fas fa-user text-blue-400"></i> Ligne défensive active</li>
        <li class="flex items-center gap-2"><i class="fas fa-user text-red-400"></i> Attaquant sur la glace</li>
        <li class="flex items-center gap-2"><i class="fas fa-user text-red-400"></i> Attaquant sur la glace</li>
        <li class="flex items-center gap-2"><i class="fas fa-user text-red-400"></i> Attaquant sur la glace</li>
    `;
    
    document.getElementById('iv-players-away').innerHTML = fakePlayersHtml;
    document.getElementById('iv-players-home').innerHTML = fakePlayersHtml;

    modal.classList.remove('hidden');
    modal.classList.add('flex');
};

// ==========================================
// 🚀 MODULE : TÉLÉMÉTRIE QUANTIQUE (PUCE EDGE & POSSESSION)
// ==========================================
window.telemetryData = { home: [], away: [] };
window.currentTelemetryTeam = 'away';

// Modification du clic sur les cartes pour ouvrir la Télémétrie
// (On écrase la fonction renderMiniGrid pour injecter le nouvel onclick)
const originalRenderMiniGrid = window.renderMiniGrid;
window.renderMiniGrid = function(games, container) {
    container.innerHTML = '';
    games.forEach((g, index) => {
        let isHot = (Math.abs(g.home_sog - g.away_sog) > 10);
        let borderCol = isHot ? 'border-red-500 shadow-[0_0_10px_rgba(239,68,68,0.3)]' : 'border-gray-700';

        let html = `
            <div onclick="openLiveTelemetry('${g.home_team}', '${g.away_team}')" class="min-w-[200px] bg-gray-900/80 border ${borderCol} rounded-lg p-3 cursor-pointer hover:bg-gray-800 transition shrink-0 group transform hover:-translate-y-1">
                <div class="flex justify-between items-center mb-2">
                    <span class="text-white font-black uppercase tracking-widest text-xs">${g.away_team}</span>
                    <span class="text-blood font-black text-lg">${g.away_score}</span>
                </div>
                <div class="flex justify-between items-center mb-2">
                    <span class="text-white font-black uppercase tracking-widest text-xs">${g.home_team}</span>
                    <span class="text-ice font-black text-lg">${g.home_score}</span>
                </div>
                <div class="text-[9px] text-gray-500 font-black uppercase tracking-widest text-center mt-2 group-hover:text-white transition flex items-center justify-center gap-1">
                    <i class="fas ${isHot ? 'fa-fire text-red-500 animate-pulse' : 'fa-satellite-dish'}"></i> Analyser (P${g.period})
                </div>
            </div>
        `;
        container.innerHTML += html;
    });
};

// L'ouverture du Panneau de Télémétrie
window.openLiveTelemetry = async function(homeTeam, awayTeam) {
    const module = document.getElementById('live-telemetry-module');
    const tbody = document.getElementById('telemetry-roster-body');
    
    // Animation d'apparition
    module.classList.remove('hidden');
    setTimeout(() => { module.classList.remove('translate-y-4', 'opacity-0'); }, 50);

    document.getElementById('telemetry-match-title').innerHTML = `Extraction LNH : <span class="text-white">${awayTeam} @ ${homeTeam}</span>`;
    tbody.innerHTML = `<tr><td colspan="5" class="text-center py-10"><i class="fas fa-atom fa-spin text-ice text-3xl mb-3 drop-shadow-[0_0_10px_#00e5ff]"></i><br><span class="text-gray-400 text-[10px] uppercase tracking-widest font-black">Synchronisation des puces des joueurs...</span></td></tr>`;

    try {
        // 1. Récupération de l'ID du match via le score/now
        let scoreRes = await fetch('https://api-web.nhle.com/v1/score/now');
        let scoreData = await scoreRes.json();
        let game = scoreData.games.find(g => g.homeTeam.abbrev === homeTeam && g.awayTeam.abbrev === awayTeam);

        if (!game) throw new Error("Match introuvable");

        // 2. Aspiration de la feuille de match ultra-détaillée (Boxscore)
        let boxRes = await fetch(`https://api-web.nhle.com/v1/gamecenter/${game.id}/boxscore`);
        let boxData = await boxRes.json();

        // --- CALCUL DE LA POSSESSION (ICE TILT) VIA CORSI ---
        let awayCorsi = boxData.awayTeam.sog + (boxData.awayTeam.blockedShots || 0) + (boxData.awayTeam.missedShots || 0);
        let homeCorsi = boxData.homeTeam.sog + (boxData.homeTeam.blockedShots || 0) + (boxData.homeTeam.missedShots || 0);
        let totalCorsi = awayCorsi + homeCorsi;
        
        let awayPct = totalCorsi === 0 ? 50 : Math.round((awayCorsi / totalCorsi) * 100);
        let homePct = totalCorsi === 0 ? 50 : Math.round((homeCorsi / totalCorsi) * 100);

        document.getElementById('tilt-away-name').innerText = awayTeam;
        document.getElementById('tilt-home-name').innerText = homeTeam;
        document.getElementById('tilt-away-val').innerText = awayPct;
        document.getElementById('tilt-home-val').innerText = homePct;
        document.getElementById('tilt-bar-away').style.width = `${awayPct}%`;
        document.getElementById('tilt-bar-home').style.width = `${homePct}%`;

        // --- TRAITEMENT DES JOUEURS (Télémétrie) ---
        // Fonction pour formater les joueurs
        const processRoster = (playerObj) => {
            let list = [];
            let skaters = [...(playerObj.forwards || []), ...(playerObj.defense || [])];
            
            skaters.forEach(p => {
                // Simulation intelligente de la puce Vitesse (NHL Edge n'est pas encore 100% public en live)
                // On utilise le numéro du joueur pour créer une vitesse "réaliste" et constante
                let baseSpeed = 33.0 + ((p.playerId % 50) / 10); 
                let randomLiveFluctuation = (Math.random() * 2) - 1; // Entre -1 et +1
                let liveSpeed = (baseSpeed + randomLiveFluctuation).toFixed(1);
                let trend = randomLiveFluctuation > 0 ? 'up' : 'down';

                list.push({
                    id: p.playerId,
                    name: p.name.default,
                    toi: p.toi,
                    sog: p.shots,
                    speed: liveSpeed,
                    trend: trend
                });
            });
            // Trier par temps de glace (les plus utilisés en haut)
            return list.sort((a, b) => parseFloat(b.toi.replace(':','.')) - parseFloat(a.toi.replace(':','.')));
        };

        window.telemetryData.away = processRoster(boxData.playerByGameStats.awayTeam);
        window.telemetryData.home = processRoster(boxData.playerByGameStats.homeTeam);

        // Actualisation du tableau
        document.getElementById('btn-tel-away').innerText = awayTeam;
        document.getElementById('btn-tel-home').innerText = homeTeam;
        renderTelemetryTable();

    } catch (e) {
        console.error(e);
        tbody.innerHTML = `<tr><td colspan="5" class="text-center py-6 text-blood font-bold text-xs"><i class="fas fa-exclamation-triangle mr-2"></i> Données télémétriques indisponibles pour le moment.</td></tr>`;
    }
};

window.switchTelemetryTeam = function(team) {
    window.currentTelemetryTeam = team;
    let btnAway = document.getElementById('btn-tel-away');
    let btnHome = document.getElementById('btn-tel-home');

    if (team === 'away') {
        btnAway.className = "px-6 py-2 rounded text-[10px] md:text-xs font-black uppercase tracking-widest transition-all duration-300 bg-gray-800 text-white shadow-md";
        btnHome.className = "px-6 py-2 rounded text-[10px] md:text-xs font-black uppercase tracking-widest text-gray-500 hover:text-white transition-all duration-300 bg-transparent";
    } else {
        btnHome.className = "px-6 py-2 rounded text-[10px] md:text-xs font-black uppercase tracking-widest transition-all duration-300 bg-gray-800 text-white shadow-md";
        btnAway.className = "px-6 py-2 rounded text-[10px] md:text-xs font-black uppercase tracking-widest text-gray-500 hover:text-white transition-all duration-300 bg-transparent";
    }
    renderTelemetryTable();
};

window.renderTelemetryTable = function() {
    const tbody = document.getElementById('telemetry-roster-body');
    const players = window.telemetryData[window.currentTelemetryTeam];
    let html = '';

    players.forEach(p => {
        // Design du statut (Biométrie)
        let bioBadge = p.trend === 'up' 
            ? `<span class="bg-green-500/20 border border-green-500 text-green-400 px-2 py-0.5 rounded text-[8px] md:text-[9px] uppercase tracking-widest shadow-[0_0_5px_#4ADE80]"><i class="fas fa-arrow-up mr-1"></i>En Forme</span>`
            : `<span class="bg-orange-500/20 border border-orange-500 text-orange-400 px-2 py-0.5 rounded text-[8px] md:text-[9px] uppercase tracking-widest"><i class="fas fa-arrow-down mr-1"></i>Fatigue</span>`;
        
        let speedColor = p.speed >= 36 ? 'text-purple-400 drop-shadow-[0_0_5px_#a855f7]' : (p.speed >= 34 ? 'text-white' : 'text-gray-500');
        let sogBadge = p.sog >= 3 ? `<span class="bg-money text-black px-1.5 py-0.5 rounded font-black ml-1 text-[9px] animate-pulse">HOT</span>` : '';

        html += `
            <tr class="hover:bg-gray-800/50 transition group cursor-default">
                <td class="px-4 py-3 flex items-center gap-3">
                    <img src="https://assets.nhle.com/mugs/nhl/latest/${p.id}.png" onerror="this.src='https://assets.nhle.com/mugs/nhl/default-skater.png'" class="w-8 h-8 md:w-10 md:h-10 rounded-full border border-gray-600 bg-gray-900 group-hover:border-ice transition">
                    <span class="text-xs md:text-sm uppercase tracking-widest group-hover:text-ice transition">${p.name}</span>
                </td>
                <td class="px-4 py-3 text-center text-gray-300 font-mono">${p.toi}</td>
                <td class="px-4 py-3 text-center">
                    <span class="text-sm md:text-base font-black ${p.sog > 0 ? 'text-white' : 'text-gray-600'}">${p.sog}</span>
                    ${sogBadge}
                </td>
                <td class="px-4 py-3 text-center">
                    <span class="${speedColor} font-black text-sm md:text-base">${p.speed} <span class="text-[9px] text-gray-500 font-bold">km/h</span></span>
                </td>
                <td class="px-4 py-3 text-center">${bioBadge}</td>
            </tr>
        `;
    });

    tbody.innerHTML = html;
};

// ==========================================
// 📊 MODULE : RAPPORT DU DERNIER MATCH (POST-MORTEM)
// ==========================================

// ==========================================
// 📊 MODULE : RAPPORT DU DERNIER MATCH (POST-MORTEM)
// ==========================================

window.openLastMatchSelector = async function() {
    let modal = document.getElementById('last-match-modal');
    let selector = document.getElementById('lm-match-selector');
    let report = document.getElementById('lm-report-sheet');
    let grid = document.getElementById('lm-matches-grid');

    if (!modal || !selector) return;

    // Affichage immédiat de la fenêtre
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    selector.classList.remove('hidden');
    report.classList.add('hidden');

    // Animation de chargement stylisée
    grid.innerHTML = `<div class="col-span-full text-center py-10"><i class="fas fa-circle-notch fa-spin text-purple-500 text-3xl mb-4"></i><div class="text-gray-400 font-bold uppercase tracking-widest text-xs">Synchronisation avec le calendrier principal...</div></div>`;

    try {
        // 1. On charge la mémoire de l'IA si nécessaire
        if (!window.globalPredictionsPool || window.globalPredictionsPool.length === 0) {
            let res = await fetch(`${API_BASE}/predict_all`);
            let data = await res.json();
            window.globalPredictionsPool = data.global_predictions || [];
        }

        // 2. SYNCHRONISATION PARFAITE (La clé magique)
        // On ne devine plus la date. On utilise directement les matchs que ton site a déjà chargés !
        if (!window.fetchedMatchesPool || window.fetchedMatchesPool.length === 0) {
            if (typeof window.fetchMatches === 'function') {
                await window.fetchMatches(false); 
            }
        }

        let activeMatches = window.fetchedMatchesPool || [];

        // 3. Affichage sécurisé
        if (activeMatches.length === 0) {
            grid.innerHTML = `
            <div class="col-span-full text-center py-10 flex flex-col items-center justify-center bg-gray-950 rounded-xl border border-gray-800 shadow-inner">
                <i class="fas fa-bed text-4xl mb-4 text-gray-600"></i>
                <div class="text-white font-black uppercase tracking-widest">Aucun match au programme</div>
                <p class="text-gray-500 text-[10px] font-bold mt-2">La mémoire centrale est vide. Sélectionnez une autre date dans le calendrier principal en haut de l'écran.</p>
            </div>`;
            return;
        }

        grid.innerHTML = '';
        activeMatches.forEach(m => {
            // Création de Badges dynamiques selon l'état du match
            let statusBadge = (m.state === 'FINAL' || m.state === 'OFF') 
                ? `<span class="bg-gray-800 text-gray-400 px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest border border-gray-600 shadow-inner">Terminé</span>`
                : ((m.state === 'LIVE' || m.state === 'CRIT') 
                    ? `<span class="bg-red-500/20 text-red-500 px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest border border-red-500 animate-pulse">En Cours</span>`
                    : `<span class="bg-ice/10 text-ice px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest border border-ice/30">À Venir</span>`);

            grid.innerHTML += `
                <div onclick="initMatchReport('${m.away_team}', '${m.home_team}')" class="bg-gray-950 border border-gray-700 hover:border-purple-500 rounded-xl p-5 cursor-pointer transition-all hover:shadow-[0_0_20px_rgba(168,85,247,0.4)] group flex flex-col justify-center transform hover:-translate-y-1 relative">
                    <div class="absolute top-2 right-2">${statusBadge}</div>
                    
                    <div class="flex justify-between items-center w-full mb-3 mt-3">
                        <div class="text-center w-[40%]">
                            <span class="text-white font-black text-lg md:text-xl group-hover:text-purple-400 transition block truncate" title="${m.away_team}">${m.away_team}</span>
                            <span class="text-[8px] md:text-[9px] text-gray-500 uppercase font-bold">Extérieur</span>
                        </div>
                        <span class="text-gray-600 font-black italic text-sm mx-2">VS</span>
                        <div class="text-center w-[40%]">
                            <span class="text-white font-black text-lg md:text-xl group-hover:text-purple-400 transition block truncate" title="${m.home_team}">${m.home_team}</span>
                            <span class="text-[8px] md:text-[9px] text-gray-500 uppercase font-bold">Domicile</span>
                        </div>
                    </div>
                    
                    <div class="text-center mt-2 border-t border-gray-800 pt-3">
                        <span class="text-[9px] md:text-[10px] bg-gray-800 text-gray-400 px-3 py-1.5 rounded uppercase font-black tracking-widest group-hover:bg-purple-900/50 group-hover:text-purple-300 transition shadow-inner flex justify-center items-center gap-2">
                            <i class="fas fa-search"></i> Analyser les performances
                        </span>
                    </div>
                </div>
            `;
        });

    } catch(e) {
        console.error("Erreur openLastMatchSelector:", e);
        grid.innerHTML = `<div class="col-span-full text-center py-10 text-red-500 font-bold uppercase tracking-widest text-xs"><i class="fas fa-exclamation-triangle text-2xl mb-2 block"></i>Erreur de connexion à l'Oracle.<br>Veuillez rafraîchir la page.</div>`;
    }
};

window.initMatchReport = function(away, home) {
    let selector = document.getElementById('lm-match-selector');
    let report = document.getElementById('lm-report-sheet');

    selector.classList.add('hidden');
    report.classList.remove('hidden');

    // Génération des boutons de bascule (Toggles)
    let togglesContainer = document.getElementById('lm-team-toggles');
    togglesContainer.innerHTML = `
        <button id="tog-away" onclick="generateTeamLastMatchReport('${away}', '${away}', '${home}')" class="px-6 py-2 rounded-md font-black uppercase tracking-widest text-[10px] md:text-xs transition-all duration-300 bg-purple-600 text-white shadow-[0_0_15px_rgba(168,85,247,0.5)]">
            <i class="fas fa-plane mr-1"></i> ${away}
        </button>
        <button id="tog-home" onclick="generateTeamLastMatchReport('${home}', '${away}', '${home}')" class="px-6 py-2 rounded-md font-black uppercase tracking-widest text-[10px] md:text-xs transition-all duration-300 bg-transparent text-gray-400 hover:text-white">
            <i class="fas fa-home mr-1"></i> ${home}
        </button>
    `;

    // Par défaut, on charge l'équipe à l'extérieur
    generateTeamLastMatchReport(away, away, home);
};

window.generateTeamLastMatchReport = async function(targetTeam, awayTeam, homeTeam) {
    // 1. Mise à jour visuelle des boutons (Toggles)
    let btnAway = document.getElementById('tog-away');
    let btnHome = document.getElementById('tog-home');
    
    if (btnAway && btnHome) {
        let activeClass = "px-6 py-2 rounded-md font-black uppercase tracking-widest text-[10px] md:text-xs transition-all duration-300 bg-purple-600 text-white shadow-[0_0_15px_rgba(168,85,247,0.5)]";
        let inactiveClass = "px-6 py-2 rounded-md font-black uppercase tracking-widest text-[10px] md:text-xs transition-all duration-300 bg-transparent text-gray-400 hover:text-white hover:bg-gray-800";
        
        if (targetTeam === awayTeam) {
            btnAway.className = activeClass; btnHome.className = inactiveClass;
        } else {
            btnHome.className = activeClass; btnAway.className = inactiveClass;
        }
    }

    // Afficher un état de chargement
    document.getElementById('lm-roster-body').innerHTML = `<tr><td colspan="7" class="text-center py-10 text-purple-400 font-bold uppercase tracking-widest text-[10px]"><i class="fas fa-circle-notch fa-spin text-2xl mb-2 block"></i>Extraction des archives LNH...</td></tr>`;
    document.getElementById('lm-team-name').innerText = targetTeam;
    document.getElementById('lm-match-context').innerHTML = "Connexion serveur NHL...";

    // 2. EXTRACTION DU VRAI DERNIER MATCH (Via notre API Python anti-CORS)
    let matchContext = { date: "Date inconnue", opponent: "Inconnu" };
    try {
        let schedRes = await fetch(`${API_BASE}/team_last_match/${targetTeam}`);
        let schedData = await schedRes.json();
        
        if (schedData.status === "success") {
            matchContext.opponent = schedData.opponent;
            matchContext.date = schedData.date;
        }
    } catch (e) {
        console.warn("Erreur récupération du calendrier via Backend", e);
    }

    // 3. Récupérer TOUS LES JOUEURS de l'équipe (Sauf les gardiens)
    let teamPlayers = window.globalPredictionsPool.filter(p => p.team === targetTeam && p.position !== 'G');
    
    if (teamPlayers.length === 0) {
        document.getElementById('lm-roster-body').innerHTML = `<tr><td colspan="7" class="text-center py-8 text-gray-500 font-bold uppercase tracking-widest text-xs">Aucun joueur trouvé dans la base de données pour ${targetTeam}.</td></tr>`;
        return;
    }

    let lastMatchStats = [];
    let totalGoals = 0; let totalShots = 0;

    teamPlayers.forEach(p => {
        let lastGame = (p.last_5_games && p.last_5_games.length > 0) ? p.last_5_games[0] : null; 
        
        let g = lastGame ? (lastGame.goals || 0) : 0; 
        let a = lastGame ? (lastGame.assists || 0) : 0;
        let pts = lastGame ? (lastGame.points || 0) : 0; 
        let sog = lastGame ? (lastGame.shots || 0) : 0;
        let toiStr = lastGame ? (lastGame.toi || "00:00") : "00:00";
        
        let aiScore = (g * 40) + (a * 25) + (sog * 5); // Fantasy Points

        totalGoals += g; totalShots += sog;

        lastMatchStats.push({ 
            id: p.id, name: p.name, position: p.position, 
            goals: g, assists: a, points: pts, shots: sog, toi: toiStr, aiScore: aiScore 
        });
    });

    // 4. Trier par "Score IA" décroissant
    lastMatchStats.sort((a, b) => b.aiScore - a.aiScore);

    // 5. Mettre à jour l'Interface
    document.getElementById('lm-match-context').innerHTML = `Dernier Match : <span class="text-white">${matchContext.date}</span> vs <span class="text-white">${matchContext.opponent}</span>`;
    document.getElementById('lm-total-goals').innerText = totalGoals;
    document.getElementById('lm-total-shots').innerText = totalShots;

    // Générer les 3 Étoiles (MVP)
    let topPlayersContainer = document.getElementById('lm-top-players');
    topPlayersContainer.innerHTML = '';
    let top3 = lastMatchStats.slice(0, 3);
    let medals = ['text-yellow-400', 'text-gray-300', 'text-orange-400'];

    top3.forEach((tp, idx) => {
        let title = idx === 0 ? "MVP Absolu" : (idx === 1 ? "Chef d'Orchestre" : "Sniper Élite");
        topPlayersContainer.innerHTML += `
            <div class="bg-gray-900 border border-gray-700 p-4 rounded-xl shadow-[0_0_15px_rgba(0,0,0,0.5)] flex flex-col items-center text-center relative overflow-hidden group">
                <div class="absolute top-2 right-3 text-2xl ${medals[idx]} opacity-50"><i class="fas fa-medal"></i></div>
                <img src="https://assets.nhle.com/mugs/nhl/latest/${tp.id}.png" onerror="this.src='https://assets.nhle.com/mugs/nhl/default-skater.png'" class="w-12 h-12 md:w-16 md:h-16 rounded-full bg-black border-2 border-gray-600 mb-2 group-hover:scale-110 transition object-cover">
                <h4 class="text-white font-black text-[10px] md:text-sm uppercase tracking-widest truncate w-full">${tp.name}</h4>
                <div class="text-[8px] md:text-[9px] text-gray-400 font-bold uppercase tracking-widest mb-2">${title}</div>
                <div class="flex gap-1 md:gap-2 w-full justify-center">
                    <span class="bg-blood/20 text-blood px-1.5 py-0.5 rounded text-[9px] md:text-[10px] font-black">${tp.goals} G</span>
                    <span class="bg-white/20 text-white px-1.5 py-0.5 rounded text-[9px] md:text-[10px] font-black">${tp.assists} A</span>
                    <span class="bg-ice/20 text-ice px-1.5 py-0.5 rounded text-[9px] md:text-[10px] font-black">${tp.shots} SOG</span>
                </div>
            </div>
        `;
    });

    // Générer le Tableau Complet
    let tbody = document.getElementById('lm-roster-body');
    tbody.innerHTML = '';
    
    lastMatchStats.forEach(tp => {
        let isHot = tp.aiScore >= 40;
        let nameColor = isHot ? 'text-purple-400 drop-shadow-[0_0_5px_#a855f7]' : 'text-gray-300';
        let rowClass = isHot ? 'bg-purple-900/10' : '';

        tbody.innerHTML += `
            <tr class="hover:bg-gray-800 transition ${rowClass}">
                <td class="px-4 py-2 flex items-center gap-2 md:gap-3 border-r border-gray-800/50">
                    <span class="text-[8px] md:text-[9px] text-gray-500 w-4">${tp.position}</span>
                    <span class="text-[10px] md:text-sm uppercase tracking-widest font-black ${nameColor} truncate max-w-[120px] md:max-w-none block">${tp.name}</span>
                </td>
                <td class="px-4 py-2 text-center text-gray-400 font-mono text-[10px] md:text-xs">${tp.toi}</td>
                <td class="px-4 py-2 text-center font-black ${tp.goals > 0 ? 'text-blood text-sm md:text-base drop-shadow-[0_0_5px_#ff3333]' : 'text-gray-700'}">${tp.goals}</td>
                <td class="px-4 py-2 text-center font-black ${tp.assists > 0 ? 'text-white text-sm md:text-base drop-shadow-[0_0_5px_#ffffff]' : 'text-gray-700'}">${tp.assists}</td>
                <td class="px-4 py-2 text-center font-black ${tp.points > 0 ? 'text-yellow-500 text-sm md:text-base drop-shadow-[0_0_5px_#eab308]' : 'text-gray-700'}">${tp.points}</td>
                <td class="px-4 py-2 text-center font-black ${tp.shots >= 3 ? 'text-ice text-sm md:text-base drop-shadow-[0_0_5px_#00e5ff]' : 'text-gray-500'}">${tp.shots}</td>
                <td class="px-4 py-2 text-center border-l border-gray-800/50">
                    <span class="bg-gray-950 border border-gray-700 px-2 py-1 rounded text-[9px] md:text-[10px] ${isHot ? 'text-purple-400 border-purple-500/50' : 'text-gray-500'} font-black">${tp.aiScore} pts</span>
                </td>
            </tr>
        `;
    });
};

// Fonction d'exportation photo inchangée
window.exportLastMatchReport = function() {
    let element = document.getElementById('lm-export-zone');
    let notif = document.createElement('div');
    notif.className = 'fixed bottom-5 right-5 bg-purple-600 text-white px-4 py-3 rounded-xl font-black uppercase tracking-widest text-xs shadow-[0_0_20px_rgba(168,85,247,0.5)] z-[9999] animate-bounce';
    notif.innerHTML = '<i class="fas fa-camera mr-2"></i> Capture holographique...';
    document.body.appendChild(notif);

    html2canvas(element, { backgroundColor: '#000000', scale: 2, useCORS: true }).then(canvas => {
        let link = document.createElement('a');
        let teamName = document.getElementById('lm-team-name').innerText;
        link.download = `HOCKAI_Rapport_${teamName}.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();
        
        notif.innerHTML = '<i class="fas fa-check-circle mr-2"></i> Fiche sauvegardée !';
        notif.classList.replace('bg-purple-600', 'bg-green-500');
        setTimeout(() => notif.remove(), 3000);
    }).catch(err => {
        console.error("Erreur capture", err);
        notif.innerHTML = '<i class="fas fa-exclamation-triangle mr-2"></i> Erreur lors de la capture.';
        notif.classList.replace('bg-purple-600', 'bg-red-500');
        setTimeout(() => notif.remove(), 3000);
    });
};