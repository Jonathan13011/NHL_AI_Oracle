// =========================================================================
// 🏆 HOCKAI - TEAM PREDICTIONS ENGINE (Résultats Équipes - V2 Premium)
// =========================================================================

window.currentModalMode = '2way';

window.loadTeamPredictions = async function (mode) {
    window.currentModalMode = mode;
    
    // 1. Mise à jour du style des boutons (Toggle)
    const activeClass = "px-4 md:px-6 py-2.5 rounded-lg text-[10px] md:text-sm font-black uppercase tracking-widest transition-all duration-300 bg-purple-500 text-white shadow-[0_0_15px_rgba(168,85,247,0.5)]";
    const inactiveClass = "px-4 md:px-6 py-2.5 rounded-lg text-[10px] md:text-sm font-black uppercase tracking-widest text-gray-400 hover:text-white transition-all duration-300 bg-gray-900 border border-gray-700";
    
    document.getElementById('btn-2way').className = mode === '2way' ? activeClass : inactiveClass;
    document.getElementById('btn-3way').className = mode === '3way' ? activeClass : inactiveClass;

    const container = document.getElementById('team-predictions-container');
    if (typeof showFullScreenLoader === 'function') showFullScreenLoader("L'Oracle analyse", "Recherche des avantages (Key Edges)...", false);

    try {
        // Chargement du calendrier si vide
        if (!window.fetchedMatchesPool || window.fetchedMatchesPool.length === 0) {
            const res = await fetch(`${API_BASE}/upcoming_matches`);
            const data = await res.json();
            window.fetchedMatchesPool = data.matches || [];
        }
        if (window.fetchedMatchesPool.length === 0) {
            container.innerHTML = '<div class="col-span-full text-center text-gray-500 font-bold italic py-10">Aucun match programmé aujourd\'hui.</div>';
            if (typeof hideFullScreenLoader === 'function') hideFullScreenLoader();
            return;
        }
        
        container.innerHTML = '';

        // ⚡ NOUVEAU : Double requête en parallèle (Probabilités + Contexte Tactique)
        const fetchPromises = window.fetchedMatchesPool.map(async (match) => {
            const d = new Date(match.date);
            const dateStr = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
            const matchDateOnly = d.toISOString().split('T')[0];
            let endpoint = mode === '2way' ? 'predict_team' : 'predict_team_regulation';

            try {
                // Requête 1: Prédictions
                const predRes = await fetch(`${API_BASE}/${endpoint}/${match.home_team}/${match.away_team}/${matchDateOnly}`);
                const predData = await predRes.json();
                
                // Requête 2: Contexte (pour le Key Edge)
                const ctxRes = await fetch(`${API_BASE}/team_comparison/${match.home_team}/${match.away_team}/${matchDateOnly}`).catch(() => null);
                const ctxData = ctxRes ? await ctxRes.json() : null;

                return { match, predData, ctxData, matchDateOnly, dateStr, status: 'success' };
            } catch (e) { return { status: 'error' }; }
        });

        const results = await Promise.all(fetchPromises);

        results.forEach(res => {
            if (res.status === 'success' && res.predData && res.predData.status === "success") {
                const { match, matchDateOnly, dateStr, predData, ctxData } = res;
                const card = document.createElement('div');

                // NOUVEAU DESIGN DE CARTE (Ultra-Premium & Mobile First)
                card.className = "bg-gray-950 border border-gray-800 rounded-2xl p-4 md:p-5 cursor-pointer hover:border-purple-500 transition-all transform hover:-translate-y-1 shadow-[0_0_20px_rgba(0,0,0,0.4)] hover:shadow-[0_0_20px_rgba(168,85,247,0.2)] group flex flex-col relative overflow-hidden";
                card.onclick = () => window.openTeamModal(match.home_team, match.away_team, matchDateOnly, predData, ctxData);

                // Effet de lueur au survol
                card.innerHTML += `<div class="absolute -top-10 -right-10 w-32 h-32 bg-purple-500 opacity-0 group-hover:opacity-10 rounded-full blur-3xl transition-opacity duration-500"></div>`;
                
                // En-tête
                card.innerHTML += `
                    <div class="flex justify-between items-center mb-4 border-b border-gray-800/60 pb-3 relative z-10">
                        <div class="text-[9px] text-purple-400 font-black uppercase tracking-widest bg-purple-500/10 px-2 py-1 rounded border border-purple-500/20">
                            <i class="fas fa-robot mr-1"></i> ${mode === '2way' ? 'Vainqueur' : 'Tps Règl.'}
                        </div>
                        <span class="text-[10px] font-bold text-gray-500 flex items-center gap-1"><i class="far fa-clock"></i> ${dateStr}</span>
                    </div>`;

                let hLogo = typeof window.getLogoUrl === 'function' ? window.getLogoUrl(match.home_team) : `https://assets.nhle.com/logos/nhl/svg/${match.home_team}_light.svg`;
                let aLogo = typeof window.getLogoUrl === 'function' ? window.getLogoUrl(match.away_team) : `https://assets.nhle.com/logos/nhl/svg/${match.away_team}_light.svg`;

                // ⚡ LOGIQUE DU "KEY EDGE" (Avantage Clé)
                let edgeHtml = `<div class="bg-gray-900 text-gray-500 text-[9px] px-2 py-1.5 rounded font-bold uppercase tracking-widest border border-gray-800 flex items-center justify-center gap-2 mt-2 shadow-inner"><i class="fas fa-balance-scale"></i> Matchup Équilibré</div>`;
                
                if (ctxData && ctxData.status === 'success') {
                    if (ctxData.away.b2b) {
                        edgeHtml = `<div class="bg-orange-500/10 text-orange-500 text-[9px] px-2 py-1.5 rounded font-black uppercase tracking-widest border border-orange-500/30 flex items-center justify-center gap-2 mt-2 shadow-inner"><i class="fas fa-battery-empty animate-pulse"></i> Alerte Fatigue : ${match.away_team} (B2B)</div>`;
                    } else if (ctxData.home.b2b) {
                        edgeHtml = `<div class="bg-orange-500/10 text-orange-500 text-[9px] px-2 py-1.5 rounded font-black uppercase tracking-widest border border-orange-500/30 flex items-center justify-center gap-2 mt-2 shadow-inner"><i class="fas fa-battery-empty animate-pulse"></i> Alerte Fatigue : ${match.home_team} (B2B)</div>`;
                    } else if (ctxData.home.pp > 22 && ctxData.away.pk < 78) {
                        edgeHtml = `<div class="bg-ice/10 text-ice text-[9px] px-2 py-1.5 rounded font-black uppercase tracking-widest border border-ice/30 flex items-center justify-center gap-2 mt-2 shadow-inner"><i class="fas fa-bolt"></i> Mismatch Spécial (${match.home_team} PP)</div>`;
                    } else if (ctxData.away.pp > 22 && ctxData.home.pk < 78) {
                        edgeHtml = `<div class="bg-ice/10 text-ice text-[9px] px-2 py-1.5 rounded font-black uppercase tracking-widest border border-ice/30 flex items-center justify-center gap-2 mt-2 shadow-inner"><i class="fas fa-bolt"></i> Mismatch Spécial (${match.away_team} PP)</div>`;
                    }
                }

                // CORPS DE LA CARTE (2way ou 3way)
                if (mode === '2way') {
                    const hp = predData.prob_home_win; 
                    const ap = predData.prob_away_win;
                    const isHomeFav = hp >= 50;
                    
                    card.innerHTML += `
                        <div class="flex justify-between items-center relative mb-3 z-10">
                            <div class="flex flex-col items-center w-[40%] ${!isHomeFav ? 'scale-110 drop-shadow-[0_0_15px_rgba(192,132,252,0.4)]' : 'opacity-60'} transition-all">
                                <img src="${aLogo}" onerror="this.src='assets/logo_hockAI.png'" class="w-12 h-12 md:w-14 md:h-14 object-contain mb-2">
                                <span class="text-[11px] md:text-xs font-black text-white uppercase">${match.away_team}</span>
                                <span class="text-sm md:text-base font-black ${!isHomeFav ? 'text-purple-400' : 'text-gray-500'} mt-1">${ap.toFixed(1)}%</span>
                            </div>
                            <div class="text-xs font-black text-gray-700 italic">VS</div>
                            <div class="flex flex-col items-center w-[40%] ${isHomeFav ? 'scale-110 drop-shadow-[0_0_15px_rgba(192,132,252,0.4)]' : 'opacity-60'} transition-all">
                                <img src="${hLogo}" onerror="this.src='assets/logo_hockAI.png'" class="w-12 h-12 md:w-14 md:h-14 object-contain mb-2">
                                <span class="text-[11px] md:text-xs font-black text-white uppercase">${match.home_team}</span>
                                <span class="text-sm md:text-base font-black ${isHomeFav ? 'text-purple-400' : 'text-gray-500'} mt-1">${hp.toFixed(1)}%</span>
                            </div>
                        </div>
                        <div class="w-full h-1.5 bg-gray-900 rounded-full flex overflow-hidden border border-gray-800 mb-2 relative z-10 shadow-inner">
                            <div class="h-full transition-all duration-1000 ${!isHomeFav ? 'bg-purple-500 shadow-[0_0_8px_#a855f7]' : 'bg-gray-600'}" style="width: ${ap}%"></div>
                            <div class="h-full transition-all duration-1000 ${isHomeFav ? 'bg-purple-500 shadow-[0_0_8px_#a855f7]' : 'bg-gray-600'}" style="width: ${hp}%"></div>
                        </div>
                        ${edgeHtml}
                    `;
                } else {
                    const hp = predData.prob_home_reg; const tp = predData.prob_tie; const ap = predData.prob_away_reg;
                    card.innerHTML += `
                        <div class="flex justify-between items-end mb-3 z-10 relative">
                            <div class="flex flex-col items-center w-1/3">
                                <img src="${aLogo}" onerror="this.src='assets/logo_hockAI.png'" class="w-8 h-8 md:w-10 md:h-10 mb-2 drop-shadow-md">
                                <span class="text-[10px] md:text-xs font-black text-white">${match.away_team}</span>
                                <span class="text-xs md:text-sm font-black text-blood mt-1">${ap.toFixed(1)}%</span>
                            </div>
                            <div class="flex flex-col items-center w-1/3 pb-1 border-x border-gray-800/50">
                                <span class="text-[8px] md:text-[9px] font-black text-gray-500 uppercase mb-1">Nul</span>
                                <span class="text-sm md:text-base font-black text-tie">${tp.toFixed(1)}%</span>
                            </div>
                            <div class="flex flex-col items-center w-1/3">
                                <img src="${hLogo}" onerror="this.src='assets/logo_hockAI.png'" class="w-8 h-8 md:w-10 md:h-10 mb-2 drop-shadow-md">
                                <span class="text-[10px] md:text-xs font-black text-white">${match.home_team}</span>
                                <span class="text-xs md:text-sm font-black text-ice mt-1">${hp.toFixed(1)}%</span>
                            </div>
                        </div>
                        <div class="w-full h-1.5 bg-gray-900 rounded-full flex overflow-hidden border border-gray-800 mb-2 relative z-10 shadow-inner">
                            <div class="bg-blood h-full" style="width: ${ap}%"></div>
                            <div class="bg-tie h-full" style="width: ${tp}%"></div>
                            <div class="bg-ice h-full" style="width: ${hp}%"></div>
                        </div>
                        ${edgeHtml}
                    `;
                }

                // Pied de carte
                card.innerHTML += `<div class="mt-4 pt-3 border-t border-gray-800/60 text-center relative z-10"><span class="text-[9px] text-gray-400 group-hover:text-purple-400 uppercase tracking-widest font-bold transition flex items-center justify-center gap-2">Deep Dive Analyst <i class="fas fa-chevron-right text-[8px]"></i></span></div>`;
                
                container.appendChild(card);
            }
        });
    } catch (e) { 
        console.error("Erreur chargement des équipes:", e); 
        container.innerHTML = '<div class="col-span-full text-center text-red-500 py-10 font-bold">Erreur de connexion.</div>';
    } finally { 
        if (typeof hideFullScreenLoader === 'function') hideFullScreenLoader(); 
    }
};

window.openTeamModal = async function (home, away, date, predData, ctxDataLoaded) {
    const modal = document.getElementById('team-modal');
    const content = document.getElementById('team-modal-content');

    modal.classList.remove('hidden');
    modal.classList.add('flex');
    content.innerHTML = `<div class="text-center py-32"><i class="fas fa-circle-notch fa-spin text-5xl text-purple-500 mb-6 drop-shadow-[0_0_15px_#C084FC]"></i><p class="text-purple-400 font-black uppercase tracking-widest text-[10px] animate-pulse">L'Oracle rédige le rapport d'équipe...</p></div>`;

    try {
        // On réutilise les données de contexte si elles ont déjà été chargées, sinon on fetch
        let tData = ctxDataLoaded;
        if (!tData) {
            const res = await fetch(`${API_BASE}/team_comparison/${home}/${away}/${date}`);
            tData = await res.json();
        }

        let hLogo = typeof window.getLogoUrl === 'function' ? window.getLogoUrl(home) : `https://assets.nhle.com/logos/nhl/svg/${home}_light.svg`;
        let aLogo = typeof window.getLogoUrl === 'function' ? window.getLogoUrl(away) : `https://assets.nhle.com/logos/nhl/svg/${away}_light.svg`;

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

        // EN-TÊTE MODALE
        let html = `
            <div class="flex justify-center items-center gap-6 bg-gray-900/80 p-6 rounded-xl border border-gray-800 shadow-lg relative overflow-hidden mb-6 mt-4 md:mt-0">
                <div class="absolute inset-0 bg-gradient-to-b from-purple-500/5 to-transparent pointer-events-none"></div>
                <div class="flex flex-col items-center w-1/3 z-10">
                    <img src="${aLogo}" onerror="this.src='assets/logo_hockAI.png'" class="w-16 h-16 md:w-20 md:h-20 object-contain mb-2 drop-shadow-md">
                    <span class="text-[10px] md:text-xs font-black text-white uppercase tracking-widest">${away}</span>
                </div>
                <div class="text-purple-500 font-black italic text-2xl md:text-3xl z-10 opacity-50">VS</div>
                <div class="flex flex-col items-center w-1/3 z-10">
                    <img src="${hLogo}" onerror="this.src='assets/logo_hockAI.png'" class="w-16 h-16 md:w-20 md:h-20 object-contain mb-2 drop-shadow-md">
                    <span class="text-[10px] md:text-xs font-black text-white uppercase tracking-widest">${home}</span>
                </div>
            </div>
        `;

        // RAPPORT NARRATIF IA (Si dispo)
        if (tData && tData.status === "success" && tData.ai_st) {
            html += `
                <div class="bg-purple-900/20 border-l-4 border-purple-500 p-4 rounded-r-xl shadow-inner mb-6 relative">
                    <i class="fas fa-brain absolute right-4 top-4 text-3xl text-purple-500/20"></i>
                    <h4 class="text-[9px] text-purple-400 uppercase font-black tracking-widest mb-1">Synthèse Neuronale</h4>
                    <p class="text-xs md:text-sm text-gray-300 font-bold leading-relaxed pr-8">${tData.ai_st}</p>
                </div>
            `;
        }

        // PROBABILITÉS
        html += `
            <div class="bg-gray-950 p-5 rounded-xl border border-gray-800 mb-6 shadow-lg">
                <h4 class="text-white font-black text-[10px] uppercase tracking-widest mb-4 flex justify-between items-center border-b border-gray-800 pb-2">
                    <span><i class="fas fa-balance-scale text-purple-400 mr-2"></i> Verdict de l'Algorithme</span>
                    <span class="bg-gray-900 text-gray-500 px-2 py-0.5 rounded text-[8px]">${mode === '2way' ? 'PROLONG. INCLUSES' : 'TEMPS RÈGL. (60M)'}</span>
                </h4>
                ${window.currentModalMode === '2way' ? `
                    <div class="flex justify-between items-end mb-2">
                        <div class="text-2xl md:text-4xl font-black ${!isHomeFav ? 'text-purple-400 drop-shadow-[0_0_10px_rgba(168,85,247,0.5)]' : 'text-gray-600'}">${awayProb.toFixed(1)}%</div>
                        <div class="text-2xl md:text-4xl font-black ${isHomeFav ? 'text-purple-400 drop-shadow-[0_0_10px_rgba(168,85,247,0.5)]' : 'text-gray-600'}">${homeProb.toFixed(1)}%</div>
                    </div>
                    <div class="w-full h-3 md:h-4 bg-gray-900 rounded-full flex overflow-hidden border border-gray-700 shadow-inner">
                        <div class="h-full transition-all duration-1000 ${!isHomeFav ? 'bg-gradient-to-r from-purple-700 to-purple-500' : 'bg-gray-700'}" style="width: ${awayProb}%"></div>
                        <div class="h-full transition-all duration-1000 ${isHomeFav ? 'bg-gradient-to-l from-purple-700 to-purple-500' : 'bg-gray-700'}" style="width: ${homeProb}%"></div>
                    </div>
                ` : `
                    <div class="flex justify-between items-center mb-2">
                        <div class="flex flex-col items-start"><span class="text-[8px] md:text-[10px] text-gray-500 uppercase font-bold tracking-widest">Extérieur</span><span class="text-xl md:text-3xl font-black text-blood">${awayProb.toFixed(1)}%</span></div>
                        <div class="flex flex-col items-center"><span class="text-[8px] md:text-[10px] text-gray-500 uppercase font-bold tracking-widest">Nul</span><span class="text-xl md:text-3xl font-black text-tie">${tieProb.toFixed(1)}%</span></div>
                        <div class="flex flex-col items-end"><span class="text-[8px] md:text-[10px] text-gray-500 uppercase font-bold tracking-widest">Domicile</span><span class="text-xl md:text-3xl font-black text-ice">${homeProb.toFixed(1)}%</span></div>
                    </div>
                    <div class="w-full h-3 md:h-4 bg-gray-900 rounded-full flex overflow-hidden border border-gray-700 shadow-inner">
                        <div class="bg-blood h-full" style="width: ${awayProb}%"></div><div class="bg-tie h-full" style="width: ${tieProb}%"></div><div class="bg-ice h-full" style="width: ${homeProb}%"></div>
                    </div>
                `}
            </div>

            <div class="bg-gradient-to-br from-gray-900 to-black border border-green-500/50 p-4 rounded-xl shadow-[0_0_20px_rgba(74,222,128,0.1)] relative overflow-hidden mb-6 flex flex-row justify-between items-center gap-4">
                <div class="flex flex-col z-10">
                    <h6 class="text-[10px] md:text-xs text-green-500 uppercase font-black tracking-widest mb-1"><i class="fas fa-search-dollar mr-1"></i> Calculateur de Valeur (EV+)</h6>
                    <span class="text-[8px] md:text-[10px] text-gray-400 font-bold uppercase truncate tracking-widest">Cote de votre bookmaker pour : <strong class="text-white">${favTeam}</strong></span>
                </div>
                <div class="flex items-center gap-2 z-10 shrink-0">
                    <input type="number" id="pred-ev-odds" oninput="window.calcPredEV()" step="0.01" placeholder="Ex: 1.85" class="bg-black border border-gray-600 text-white font-black rounded-lg w-20 md:w-24 p-3 text-center text-xs md:text-sm focus:border-green-500 outline-none shadow-inner transition">
                    <div id="pred-ev-res" class="bg-gray-950 border border-gray-800 p-3 rounded-lg text-center min-w-[70px] md:min-w-[90px] shadow-inner flex items-center justify-center">
                        <span class="text-gray-500 text-[8px] md:text-[10px] uppercase font-bold tracking-widest">Résultat</span>
                    </div>
                </div>
            </div>
        `;

        if (tData && tData.status === "success") {
            const getFatigue = (b2b, in4) => {
                if (b2b) return `<span class="text-red-500 bg-red-500/10 px-2 py-1 rounded text-[8px] font-black border border-red-500/30 flex items-center justify-center gap-1 w-full"><i class="fas fa-battery-empty animate-pulse"></i> Back-to-Back</span>`;
                if (in4) return `<span class="text-orange-500 bg-orange-500/10 px-2 py-1 rounded text-[8px] font-black border border-orange-500/30 flex items-center justify-center gap-1 w-full"><i class="fas fa-battery-quarter"></i> 3ème en 4 Nuits</span>`;
                return `<span class="text-green-400 bg-green-400/10 px-2 py-1 rounded text-[8px] font-black border border-green-400/30 flex items-center justify-center gap-1 w-full"><i class="fas fa-battery-full"></i> Repos Optimisé</span>`;
            };

            html += `
                <div class="bg-gray-900/80 border border-gray-800 rounded-xl p-5 shadow-lg mb-4">
                    <h4 class="text-white font-black text-[10px] md:text-xs uppercase tracking-widest mb-4 border-b border-gray-800 pb-2"><i class="fas fa-chart-pie text-ice mr-2"></i> Confrontation des Fondamentaux</h4>
                    
                    <div class="grid grid-cols-2 gap-4 md:gap-6 mb-2">
                        <div class="bg-gray-950 p-4 rounded-xl border border-gray-800 flex flex-col items-center gap-3 shadow-inner">
                            <span class="text-xs md:text-sm font-black text-white uppercase tracking-widest border-b border-gray-800 w-full text-center pb-2">${away}</span>
                            ${getFatigue(tData.away.b2b, tData.away.in4)}
                            <div class="w-full flex justify-between text-[10px] md:text-xs mt-2">
                                <span class="text-gray-500 uppercase tracking-widest font-bold">Avantage Num. (PP)</span>
                                <span class="text-white font-black">${tData.away.pp.toFixed(1)}%</span>
                            </div>
                            <div class="w-full bg-gray-800 h-1.5 rounded-full overflow-hidden mt-1"><div class="bg-ice h-full" style="width: ${tData.away.pp}%"></div></div>
                            
                            <div class="w-full flex justify-between text-[10px] md:text-xs mt-2">
                                <span class="text-gray-500 uppercase tracking-widest font-bold">Désavantage (PK)</span>
                                <span class="text-white font-black">${tData.away.pk.toFixed(1)}%</span>
                            </div>
                            <div class="w-full bg-gray-800 h-1.5 rounded-full overflow-hidden mt-1"><div class="bg-blood h-full" style="width: ${tData.away.pk}%"></div></div>
                        </div>

                        <div class="bg-gray-950 p-4 rounded-xl border border-gray-800 flex flex-col items-center gap-3 shadow-inner">
                            <span class="text-xs md:text-sm font-black text-white uppercase tracking-widest border-b border-gray-800 w-full text-center pb-2">${home}</span>
                            ${getFatigue(tData.home.b2b, tData.home.in4)}
                            <div class="w-full flex justify-between text-[10px] md:text-xs mt-2">
                                <span class="text-gray-500 uppercase tracking-widest font-bold">Avantage Num. (PP)</span>
                                <span class="text-white font-black">${tData.home.pp.toFixed(1)}%</span>
                            </div>
                            <div class="w-full bg-gray-800 h-1.5 rounded-full overflow-hidden mt-1"><div class="bg-ice h-full" style="width: ${tData.home.pp}%"></div></div>
                            
                            <div class="w-full flex justify-between text-[10px] md:text-xs mt-2">
                                <span class="text-gray-500 uppercase tracking-widest font-bold">Désavantage (PK)</span>
                                <span class="text-white font-black">${tData.home.pk.toFixed(1)}%</span>
                            </div>
                            <div class="w-full bg-gray-800 h-1.5 rounded-full overflow-hidden mt-1"><div class="bg-blood h-full" style="width: ${tData.home.pk}%"></div></div>
                        </div>
                    </div>
                </div>
            `;
        }

        content.innerHTML = html;
    } catch (e) {
        console.error(e);
        content.innerHTML = `<div class="text-red-500 font-bold text-center py-10"><i class="fas fa-wifi text-3xl mb-4 block"></i>Erreur de connexion avec l'Oracle.</div>`;
    }
};

window.closeTeamModal = function () {
    document.getElementById('team-modal').classList.add('hidden');
    document.getElementById('team-modal').classList.remove('flex');
};