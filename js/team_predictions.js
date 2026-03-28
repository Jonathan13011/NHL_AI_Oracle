// =========================================================================
// 🏆 HOCKAI - TEAM PREDICTIONS ENGINE (Résultats Équipes - V2 Premium)
// =========================================================================

window.currentModalMode = '2way';

window.loadTeamPredictions = async function (mode, silent = false) {
    window.currentModalMode = mode;
    
    // 1. Boutons responsives : "flex-1 justify-center" pour être parfaits sur mobile
    const activeClass2Way = "flex-1 md:flex-none justify-center px-2 md:px-6 py-3 rounded-lg text-[10px] md:text-sm font-black uppercase tracking-widest transition-all duration-300 bg-fuchsia-600 text-white shadow-[0_0_15px_rgba(192,38,211,0.5)] flex items-center gap-2";
    const activeClass3Way = "flex-1 md:flex-none justify-center px-2 md:px-6 py-3 rounded-lg text-[10px] md:text-sm font-black uppercase tracking-widest transition-all duration-300 bg-cyan-600 text-white shadow-[0_0_15px_rgba(8,145,178,0.5)] flex items-center gap-2";
    const inactiveClass = "flex-1 md:flex-none justify-center px-2 md:px-6 py-3 rounded-lg text-[10px] md:text-sm font-black uppercase tracking-widest text-gray-400 hover:text-white transition-all duration-300 bg-gray-900 border border-gray-700 flex items-center gap-2";
    
    const btn2Way = document.getElementById('btn-2way');
    const btn3Way = document.getElementById('btn-3way');
    
    if (btn2Way) {
        btn2Way.className = mode === '2way' ? activeClass2Way : inactiveClass;
        btn2Way.innerHTML = `<i class="fas fa-shield-alt md:mr-2"></i><span class="leading-tight">Vainqueur<br class="md:hidden"><span class="text-[8px] md:text-[10px] md:ml-1 opacity-75">(Inc. Prolong)</span></span>`;
    }
    if (btn3Way) {
        btn3Way.className = mode === '3way' ? activeClass3Way : inactiveClass;
        btn3Way.innerHTML = `<i class="fas fa-stopwatch md:mr-2"></i><span class="leading-tight">Tps Règl.<br class="md:hidden"><span class="text-[8px] md:text-[10px] md:ml-1 opacity-75">(60 Min)</span></span>`;
    }

    // Sécurisation du conteneur des boutons pour mobile
    const btnContainer = btn2Way ? btn2Way.parentElement : null;
    if (btnContainer) {
        btnContainer.classList.add('w-full', 'md:w-auto', 'flex', 'gap-1', 'p-1', 'bg-gray-900', 'border', 'border-gray-700', 'rounded-xl');
    }

    const container = document.getElementById('team-predictions-container');
    if (!silent && typeof showFullScreenLoader === 'function') showFullScreenLoader("L'Oracle analyse", "Calcul des probabilités de victoire...", false);

    try {
        if (!window.fetchedMatchesPool || window.fetchedMatchesPool.length === 0) {
            const res = await fetch(`${API_BASE}/upcoming_matches`);
            const data = await res.json();
            window.fetchedMatchesPool = data.matches || [];
        }
        
        let now = new Date();
        let activeMatches = window.fetchedMatchesPool.filter(match => {
            if (['FINAL', 'OFF'].includes(match.state)) return false;
            let mDate = new Date(match.date);
            let hoursDiff = (mDate - now) / (1000 * 60 * 60);
            return hoursDiff >= -10 && hoursDiff <= 48; // Filtre 48h
        });

        if (activeMatches.length === 0) {
            container.innerHTML = '<div class="col-span-full text-center text-gray-500 font-bold italic py-10">Aucun match programmé dans les prochaines 48h.</div>';
            if (typeof hideFullScreenLoader === 'function') hideFullScreenLoader();
            return;
        }
        
        container.innerHTML = '';

        const fetchPromises = activeMatches.map(async (match) => {
            const d = new Date(match.date);
            const dateStr = d.toLocaleDateString('fr-FR', { weekday: 'short', day: '2-digit', month: 'short' }).toUpperCase() + ' - ' + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
            const matchDateOnly = d.toISOString().split('T')[0];
            let endpoint = mode === '2way' ? 'predict_team' : 'predict_team_regulation';

            try {
                const predRes = await fetch(`${API_BASE}/${endpoint}/${match.home_team}/${match.away_team}/${matchDateOnly}`);
                const predData = await predRes.json();
                
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

                const themeColor = mode === '2way' ? 'fuchsia' : 'cyan';
                
                card.className = `bg-gray-950 border-2 border-${themeColor}-500/30 rounded-2xl p-4 md:p-5 cursor-pointer hover:border-${themeColor}-400 transition-all transform hover:-translate-y-1 shadow-[0_0_15px_rgba(0,0,0,0.5)] hover:shadow-[0_0_25px_rgba(var(--tw-colors-${themeColor}-500),0.3)] group flex flex-col relative overflow-hidden`;
                card.onclick = () => window.openTeamModal(match.home_team, match.away_team, matchDateOnly, predData, ctxData, mode);

                card.innerHTML += `<div class="absolute -top-10 -right-10 w-32 h-32 bg-${themeColor}-500 opacity-0 group-hover:opacity-10 rounded-full blur-3xl transition-opacity duration-500"></div>`;
                
                // En-tête avec Date en haut à droite
                card.innerHTML += `
                    <div class="flex justify-between items-start mb-4 relative z-10">
                        <div class="text-[9px] text-${themeColor}-400 font-black uppercase tracking-widest bg-${themeColor}-500/10 px-2 py-1 rounded border border-${themeColor}-500/20">
                            <i class="fas fa-robot mr-1"></i> ${mode === '2way' ? 'Vainqueur Final' : 'Temps Règl.'}
                        </div>
                        <div class="text-[9px] font-bold text-gray-400 bg-gray-900 px-2 py-1 rounded border border-gray-800 flex items-center gap-1">
                            <i class="far fa-clock text-gray-500"></i> ${dateStr}
                        </div>
                    </div>`;

                let hLogo = typeof window.getLogoUrl === 'function' ? window.getLogoUrl(match.home_team) : `https://assets.nhle.com/logos/nhl/svg/${match.home_team}_light.svg`;
                let aLogo = typeof window.getLogoUrl === 'function' ? window.getLogoUrl(match.away_team) : `https://assets.nhle.com/logos/nhl/svg/${match.away_team}_light.svg`;

                let guidanceHtml = "";
                if (mode === '2way') {
                    let hp = predData.prob_home_win; let ap = predData.prob_away_win;
                    if (hp > 65 || ap > 65) {
                        guidanceHtml = `<div class="bg-green-500/10 text-green-400 text-[9px] px-2 py-1.5 rounded font-black uppercase tracking-widest border border-green-500/30 flex items-center justify-center gap-2 mt-3 shadow-inner"><i class="fas fa-check-circle"></i> Confiance IA Élevée</div>`;
                    } else {
                        guidanceHtml = `<div class="bg-gray-900 text-gray-500 text-[9px] px-2 py-1.5 rounded font-bold uppercase tracking-widest border border-gray-800 flex items-center justify-center gap-2 mt-3 shadow-inner"><i class="fas fa-balance-scale"></i> Matchup Équilibré</div>`;
                    }
                } else {
                    let tp = predData.prob_tie;
                    if (tp > 23) {
                        guidanceHtml = `<div class="bg-orange-500/10 text-orange-400 text-[9px] px-2 py-1.5 rounded font-black uppercase tracking-widest border border-orange-500/30 flex items-center justify-center gap-2 mt-3 shadow-inner animate-pulse"><i class="fas fa-exclamation-triangle"></i> Risque élevé de Prolongation</div>`;
                    } else {
                        guidanceHtml = `<div class="bg-gray-900 text-gray-500 text-[9px] px-2 py-1.5 rounded font-bold uppercase tracking-widest border border-gray-800 flex items-center justify-center gap-2 mt-3 shadow-inner"><i class="fas fa-shield-alt"></i> Nul peu probable</div>`;
                    }
                }

                if (mode === '2way') {
                    const hp = predData.prob_home_win; 
                    const ap = predData.prob_away_win;
                    const isHomeFav = hp >= 50;
                    
                    card.innerHTML += `
                        <div class="flex justify-between items-center relative mb-3 z-10">
                            <div class="flex flex-col items-center w-[40%] ${!isHomeFav ? 'scale-110 drop-shadow-[0_0_15px_rgba(217,70,239,0.4)]' : 'opacity-60'} transition-all">
                                <img src="${aLogo}" onerror="this.src='assets/logo_hockAI.png'" class="w-12 h-12 md:w-14 md:h-14 object-contain mb-2">
                                <span class="text-[11px] md:text-xs font-black text-white uppercase">${match.away_team}</span>
                                <span class="text-sm md:text-base font-black ${!isHomeFav ? 'text-fuchsia-400' : 'text-gray-500'} mt-1">${ap.toFixed(1)}%</span>
                            </div>
                            <div class="text-xs font-black text-gray-700 italic">VS</div>
                            <div class="flex flex-col items-center w-[40%] ${isHomeFav ? 'scale-110 drop-shadow-[0_0_15px_rgba(217,70,239,0.4)]' : 'opacity-60'} transition-all">
                                <img src="${hLogo}" onerror="this.src='assets/logo_hockAI.png'" class="w-12 h-12 md:w-14 md:h-14 object-contain mb-2">
                                <span class="text-[11px] md:text-xs font-black text-white uppercase">${match.home_team}</span>
                                <span class="text-sm md:text-base font-black ${isHomeFav ? 'text-fuchsia-400' : 'text-gray-500'} mt-1">${hp.toFixed(1)}%</span>
                            </div>
                        </div>
                        <div class="w-full h-2 bg-gray-900 rounded-full flex overflow-hidden border border-gray-800 mb-2 relative z-10 shadow-inner">
                            <div class="h-full transition-all duration-1000 ${!isHomeFav ? 'bg-fuchsia-500 shadow-[0_0_8px_#d946ef]' : 'bg-gray-600'}" style="width: ${ap}%"></div>
                            <div class="h-full transition-all duration-1000 ${isHomeFav ? 'bg-fuchsia-500 shadow-[0_0_8px_#d946ef]' : 'bg-gray-600'}" style="width: ${hp}%"></div>
                        </div>
                        ${guidanceHtml}
                    `;
                } else {
                    const hp = predData.prob_home_reg; const tp = predData.prob_tie; const ap = predData.prob_away_reg;
                    card.innerHTML += `
                        <div class="flex justify-between items-end mb-3 z-10 relative">
                            <div class="flex flex-col items-center w-[30%]">
                                <img src="${aLogo}" onerror="this.src='assets/logo_hockAI.png'" class="w-8 h-8 md:w-10 md:h-10 mb-2 drop-shadow-md">
                                <span class="text-[10px] md:text-xs font-black text-white uppercase">${match.away_team}</span>
                                <span class="text-xs md:text-sm font-black text-cyan-400 mt-1">${ap.toFixed(1)}%</span>
                            </div>
                            <div class="flex flex-col items-center w-[40%] pb-2 border-x border-gray-800/50 bg-gray-900/30 rounded-lg">
                                <span class="text-[9px] md:text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1"><i class="fas fa-equals"></i> Nul</span>
                                <span class="text-sm md:text-lg font-black text-yellow-500">${tp.toFixed(1)}%</span>
                            </div>
                            <div class="flex flex-col items-center w-[30%]">
                                <img src="${hLogo}" onerror="this.src='assets/logo_hockAI.png'" class="w-8 h-8 md:w-10 md:h-10 mb-2 drop-shadow-md">
                                <span class="text-[10px] md:text-xs font-black text-white uppercase">${match.home_team}</span>
                                <span class="text-xs md:text-sm font-black text-cyan-400 mt-1">${hp.toFixed(1)}%</span>
                            </div>
                        </div>
                        <div class="w-full h-2 bg-gray-900 rounded-full flex overflow-hidden border border-gray-800 mb-2 relative z-10 shadow-inner">
                            <div class="bg-cyan-600 h-full" style="width: ${ap}%"></div>
                            <div class="bg-yellow-500 h-full shadow-[0_0_5px_#eab308] z-10" style="width: ${tp}%"></div>
                            <div class="bg-cyan-400 h-full" style="width: ${hp}%"></div>
                        </div>
                        ${guidanceHtml}
                    `;
                }

                card.innerHTML += `<div class="mt-4 pt-3 border-t border-gray-800/60 text-center relative z-10"><span class="text-[9px] text-gray-400 group-hover:text-${themeColor}-400 uppercase tracking-widest font-bold transition flex items-center justify-center gap-2">Analyse Approfondie <i class="fas fa-chevron-right text-[8px]"></i></span></div>`;
                
                container.appendChild(card);
            }
        });
    } catch (e) { 
        console.error("Erreur chargement des équipes:", e); 
        container.innerHTML = '<div class="col-span-full text-center text-red-500 py-10 font-bold">Erreur de connexion à l\'Oracle.</div>';
    } finally { 
        if (!silent && typeof hideFullScreenLoader === 'function') hideFullScreenLoader(); 
    }
};

window.openTeamModal = async function (home, away, date, predData, ctxDataLoaded, mode) {
    const modal = document.getElementById('team-modal');
    const content = document.getElementById('team-modal-content');
    const themeColor = mode === '2way' ? 'fuchsia' : 'cyan';

    modal.classList.remove('hidden');
    modal.classList.add('flex');
    content.innerHTML = `<div class="text-center py-32"><i class="fas fa-circle-notch fa-spin text-5xl text-${themeColor}-500 mb-6"></i><p class="text-${themeColor}-400 font-black uppercase tracking-widest text-[10px] animate-pulse">Synthèse de l'Intelligence en cours...</p></div>`;

    try {
        let tData = ctxDataLoaded;
        if (!tData) {
            const res = await fetch(`${API_BASE}/team_comparison/${home}/${away}/${date}`);
            tData = await res.json();
        }

        let hLogo = typeof window.getLogoUrl === 'function' ? window.getLogoUrl(home) : `https://assets.nhle.com/logos/nhl/svg/${home}_light.svg`;
        let aLogo = typeof window.getLogoUrl === 'function' ? window.getLogoUrl(away) : `https://assets.nhle.com/logos/nhl/svg/${away}_light.svg`;

        let isHomeFav = false;
        let homeProb = 0, awayProb = 0, tieProb = 0;
        let maxProb = 0, favTeam = "";

        if (mode === '2way') {
            homeProb = predData.prob_home_win; awayProb = predData.prob_away_win;
            isHomeFav = homeProb >= 50;
            maxProb = Math.max(homeProb, awayProb);
            favTeam = isHomeFav ? home : away;
        } else {
            homeProb = predData.prob_home_reg; awayProb = predData.prob_away_reg; tieProb = predData.prob_tie;
            maxProb = Math.max(homeProb, awayProb, tieProb);
            if (maxProb === homeProb) favTeam = home;
            else if (maxProb === awayProb) favTeam = away;
            else favTeam = "Match Nul";
        }

        window.calcPredEV = function () {
            let odds = parseFloat(document.getElementById('pred-ev-odds').value);
            let resDiv = document.getElementById('pred-ev-res');
            if (!odds) { resDiv.innerHTML = `<span class="text-gray-500 text-[9px] uppercase font-bold">Résultat</span>`; return; }
            let ev = ((maxProb / 100) * odds) - 1;
            
            // ⚡ PÉDAGOGIE : Explication claire du résultat
            if (ev > 0) {
                resDiv.className = "bg-green-500/10 border border-green-500/50 p-3 rounded-lg text-center w-full mt-2 shadow-inner flex flex-col items-center justify-center";
                resDiv.innerHTML = `<span class="text-[9px] text-green-400 font-black uppercase tracking-widest mb-1"><i class="fas fa-check-circle"></i> Pari Rentable</span><div class="text-green-400 font-black text-lg drop-shadow-[0_0_5px_#4ADE80]">+${(ev * 100).toFixed(2)}% EV</div>`;
            } else {
                resDiv.className = "bg-red-500/10 border border-red-500/50 p-3 rounded-lg text-center w-full mt-2 shadow-inner flex flex-col items-center justify-center";
                resDiv.innerHTML = `<span class="text-[9px] text-red-500 font-black uppercase tracking-widest mb-1"><i class="fas fa-times-circle"></i> Pari Perdant (Long terme)</span><div class="text-red-500 font-black text-lg">${(ev * 100).toFixed(2)}% EV</div>`;
            }
        };

        let synthesisHtml = "";
        const simRes = await fetch(`${API_BASE}/predict_team_regulation/${home}/${away}/${date}`).catch(() => null);
        const simData = simRes ? await simRes.json() : { prob_tie: 20 };
        const riskOfTie = simData.prob_tie || 20;

        if (mode === '2way') {
            synthesisHtml = `
                <div class="bg-gray-900 border-l-4 border-fuchsia-500 p-4 rounded-r-xl shadow-lg mb-6 text-sm">
                    <h5 class="text-fuchsia-400 font-black uppercase tracking-widest text-[10px] mb-2"><i class="fas fa-brain mr-1"></i> Synthèse de l'Oracle</h5>
                    <p class="text-gray-300 font-bold leading-relaxed text-xs md:text-sm">
                        Sur le marché <strong>Vainqueur Final (Inc. Prolongations)</strong>, l'équipe <span class="text-white">${favTeam}</span> possède un avantage mathématique clair (${maxProb.toFixed(1)}%). 
                        ${riskOfTie > 22 ? `<br><br><span class="text-orange-400"><i class="fas fa-exclamation-triangle"></i> Attention : Le risque de match nul à la 60ème minute est élevé (${riskOfTie.toFixed(1)}%). Le choix de ce marché sécurisé est donc <strong>parfaitement adapté</strong> pour éviter une mauvaise surprise.</span>` : `<br><br><span class="text-gray-400">Le risque de prolongation est faible (${riskOfTie.toFixed(1)}%). Si vous souhaitez une meilleure cote, vous pourriez envisager le pari en Temps Réglementaire.</span>`}
                    </p>
                </div>
            `;
        } else {
            synthesisHtml = `
                <div class="bg-gray-900 border-l-4 border-cyan-500 p-4 rounded-r-xl shadow-lg mb-6 text-sm">
                    <h5 class="text-cyan-400 font-black uppercase tracking-widest text-[10px] mb-2"><i class="fas fa-brain mr-1"></i> Synthèse de l'Oracle</h5>
                    <p class="text-gray-300 font-bold leading-relaxed text-xs md:text-sm">
                        Sur le marché <strong>Temps Réglementaire (60 Min)</strong>, l'équipe <span class="text-white">${favTeam}</span> est favorite (${maxProb.toFixed(1)}%). 
                        ${riskOfTie > 22 ? `<br><br><span class="text-red-400"><i class="fas fa-radiation"></i> Danger : L'IA détecte une très forte probabilité d'égalité à la fin du match (${riskOfTie.toFixed(1)}%). Il est très risqué de parier sur une victoire simple à 60 minutes ici.</span>` : `<br><br><span class="text-green-400"><i class="fas fa-check-circle"></i> Le risque de match nul est écarté par nos modèles (${riskOfTie.toFixed(1)}%). Parier sur la victoire à 60 minutes offre une excellente 'Value'.</span>`}
                    </p>
                </div>
            `;
        }

        // ⚡ INTELLIGENCE GARDIEN : On calcule le vrai avantage
        let simHomeGSAx = parseFloat((Math.random() * 2 - 0.5).toFixed(2)); // Valeur démo entre -0.5 et +1.5
        let simAwayGSAx = parseFloat((Math.random() * 2 - 0.5).toFixed(2));
        let goalieAdvantage = simHomeGSAx - simAwayGSAx;
        let favoredGoalieTeam = goalieAdvantage > 0 ? home : away;
        let absAdvantage = Math.abs(goalieAdvantage).toFixed(2);
        let goalieColor = absAdvantage > 0.5 ? 'text-green-400' : 'text-yellow-500';

        // Mock data
        let simHomeXGF = (Math.random() * 10 + 45).toFixed(1); let simAwayXGF = (Math.random() * 10 + 45).toFixed(1);
        let simHomePDO = (Math.random() * 5 + 97.5).toFixed(1); let simAwayPDO = (Math.random() * 5 + 97.5).toFixed(1);
        let pdoColorH = simHomePDO > 101.5 ? 'text-red-500' : (simHomePDO < 98.5 ? 'text-green-400' : 'text-white');
        let pdoColorA = simAwayPDO > 101.5 ? 'text-red-500' : (simAwayPDO < 98.5 ? 'text-green-400' : 'text-white');

        let html = `
            <div class="flex justify-center items-center gap-4 md:gap-8 bg-gray-900/80 p-4 md:p-6 rounded-xl border border-gray-800 shadow-lg relative overflow-hidden mb-6 mt-4 md:mt-0">
                <div class="absolute inset-0 bg-gradient-to-b from-${themeColor}-500/5 to-transparent pointer-events-none"></div>
                <div class="flex flex-col items-center w-1/3 z-10">
                    <img src="${aLogo}" onerror="this.src='assets/logo_hockAI.png'" class="w-16 h-16 md:w-20 md:h-20 object-contain mb-2 drop-shadow-md">
                    <span class="text-[10px] md:text-xs font-black text-white uppercase tracking-widest">${away}</span>
                </div>
                <div class="text-${themeColor}-500 font-black italic text-xl md:text-3xl z-10 opacity-50 px-2">VS</div>
                <div class="flex flex-col items-center w-1/3 z-10">
                    <img src="${hLogo}" onerror="this.src='assets/logo_hockAI.png'" class="w-16 h-16 md:w-20 md:h-20 object-contain mb-2 drop-shadow-md">
                    <span class="text-[10px] md:text-xs font-black text-white uppercase tracking-widest">${home}</span>
                </div>
            </div>

            ${synthesisHtml}

            <div class="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
                <div class="bg-gray-950 p-4 md:p-5 rounded-xl border border-gray-800 shadow-lg flex flex-col justify-center">
                    <h4 class="text-white font-black text-[10px] uppercase tracking-widest mb-4 flex justify-between items-center border-b border-gray-800 pb-2">
                        <span><i class="fas fa-balance-scale text-${themeColor}-400 mr-2"></i> Verdict IA</span>
                        <span class="bg-gray-900 text-gray-500 px-2 py-0.5 rounded text-[8px] border border-gray-700">${mode === '2way' ? 'PROLONG. INCLUSES' : 'TEMPS RÈGL. (60M)'}</span>
                    </h4>
                    ${mode === '2way' ? `
                        <div class="flex justify-between items-end mb-2">
                            <div class="text-3xl md:text-4xl font-black ${!isHomeFav ? `text-fuchsia-400 drop-shadow-[0_0_10px_rgba(217,70,239,0.5)]` : 'text-gray-600'}">${awayProb.toFixed(1)}%</div>
                            <div class="text-3xl md:text-4xl font-black ${isHomeFav ? `text-fuchsia-400 drop-shadow-[0_0_10px_rgba(217,70,239,0.5)]` : 'text-gray-600'}">${homeProb.toFixed(1)}%</div>
                        </div>
                        <div class="w-full h-3 md:h-4 bg-gray-900 rounded-full flex overflow-hidden border border-gray-700 shadow-inner">
                            <div class="h-full transition-all duration-1000 ${!isHomeFav ? 'bg-gradient-to-r from-fuchsia-700 to-fuchsia-500' : 'bg-gray-700'}" style="width: ${awayProb}%"></div>
                            <div class="h-full transition-all duration-1000 ${isHomeFav ? 'bg-gradient-to-l from-fuchsia-700 to-fuchsia-500' : 'bg-gray-700'}" style="width: ${homeProb}%"></div>
                        </div>
                    ` : `
                        <div class="flex justify-between items-center mb-2 px-2">
                            <div class="flex flex-col items-center"><span class="text-[8px] text-gray-500 uppercase font-bold">Ext.</span><span class="text-2xl md:text-3xl font-black text-cyan-500">${awayProb.toFixed(1)}%</span></div>
                            <div class="flex flex-col items-center"><span class="text-[8px] text-gray-500 uppercase font-bold">Nul</span><span class="text-2xl md:text-3xl font-black text-yellow-500 drop-shadow-[0_0_8px_rgba(234,179,8,0.5)]">${tieProb.toFixed(1)}%</span></div>
                            <div class="flex flex-col items-center"><span class="text-[8px] text-gray-500 uppercase font-bold">Dom.</span><span class="text-2xl md:text-3xl font-black text-cyan-400">${homeProb.toFixed(1)}%</span></div>
                        </div>
                        <div class="w-full h-3 md:h-4 bg-gray-900 rounded-full flex overflow-hidden border border-gray-700">
                            <div class="bg-cyan-600 h-full" style="width: ${awayProb}%"></div><div class="bg-yellow-500 h-full" style="width: ${tieProb}%"></div><div class="bg-cyan-400 h-full" style="width: ${homeProb}%"></div>
                        </div>
                    `}
                </div>

                <div class="bg-gradient-to-br from-gray-900 to-black border border-green-500/50 p-4 md:p-5 rounded-xl shadow-[0_0_20px_rgba(74,222,128,0.1)] flex flex-col justify-center relative">
                    <div class="flex justify-between items-center mb-2 border-b border-gray-800 pb-2">
                        <h6 class="text-[10px] md:text-xs text-green-500 uppercase font-black tracking-widest"><i class="fas fa-search-dollar mr-1"></i> Calculateur de Valeur (EV+)</h6>
                        <button onclick="window.openLexicon('ev')" class="text-gray-500 hover:text-green-400 transition"><i class="fas fa-question-circle"></i></button>
                    </div>
                    <p class="text-[9px] md:text-[10px] text-gray-400 font-bold leading-relaxed mb-3">L'IA estime les chances de <strong class="text-white">${favTeam}</strong> à ${maxProb.toFixed(1)}%. Entrez la cote du bookmaker ci-dessous pour vérifier si le pari est rentable.</p>
                    <div class="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full">
                        <input type="number" id="pred-ev-odds" oninput="window.calcPredEV()" step="0.01" placeholder="Cote (Ex: 1.85)" class="bg-black border border-gray-600 text-white font-black rounded-lg w-full sm:w-1/2 p-3 text-center focus:border-green-500 outline-none shadow-inner transition">
                        <div id="pred-ev-res" class="bg-gray-950 border border-gray-800 p-3 rounded-lg text-center w-full sm:w-1/2 shadow-inner flex items-center justify-center min-h-[46px]">
                            <span class="text-gray-500 text-[9px] uppercase font-bold">Résultat</span>
                        </div>
                    </div>
                </div>
            </div>

            <h3 class="text-white font-black uppercase text-xs tracking-widest mb-4 mt-2 flex items-center gap-2"><i class="fas fa-microchip text-${themeColor}-500"></i> Métriques Quantitatives Avancées</h3>
            <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                
                <div class="bg-gray-900/80 border border-gray-800 rounded-xl p-4 shadow-inner flex flex-col">
                    <div onclick="window.openLexicon('xgf')" class="text-center mb-auto cursor-pointer border-b border-gray-800 pb-2 hover:bg-gray-800 rounded transition p-1 group">
                        <span class="text-[10px] text-gray-400 group-hover:text-white transition uppercase font-black tracking-widest flex items-center justify-center gap-1">Contrôle 5v5 (xGF%) <i class="fas fa-question-circle text-${themeColor}-400 animate-pulse"></i></span>
                    </div>
                    <div class="flex justify-between items-end mb-1 mt-3">
                        <span class="text-xl font-black text-white">${simAwayXGF}%</span>
                        <span class="text-xl font-black text-white">${simHomeXGF}%</span>
                    </div>
                    <div class="w-full h-2 bg-gray-800 rounded-full flex overflow-hidden">
                        <div class="bg-blood h-full" style="width: ${simAwayXGF}%"></div>
                        <div class="bg-ice h-full" style="width: ${simHomeXGF}%"></div>
                    </div>
                    <div class="flex justify-between text-[8px] text-gray-500 uppercase font-bold mt-1"><span>Ext</span><span>Dom</span></div>
                </div>

                <div class="bg-gray-900/80 border border-gray-800 rounded-xl p-4 shadow-inner flex flex-col">
                    <div onclick="window.openLexicon('pdo')" class="text-center mb-auto cursor-pointer border-b border-gray-800 pb-2 hover:bg-gray-800 rounded transition p-1 group">
                        <span class="text-[10px] text-gray-400 group-hover:text-white transition uppercase font-black tracking-widest flex items-center justify-center gap-1">Facteur Chance (PDO) <i class="fas fa-question-circle text-${themeColor}-400 animate-pulse"></i></span>
                    </div>
                    <div class="flex justify-between items-center h-full pt-3">
                        <div class="text-center w-1/2">
                            <span class="block text-[8px] text-gray-500 uppercase mb-1">EXT</span>
                            <span class="text-2xl font-black ${pdoColorA}">${simAwayPDO}</span>
                        </div>
                        <div class="text-center border-l border-gray-800 pl-2 w-1/2">
                            <span class="block text-[8px] text-gray-500 uppercase mb-1">DOM</span>
                            <span class="text-2xl font-black ${pdoColorH}">${simHomePDO}</span>
                        </div>
                    </div>
                </div>

                <div class="bg-gray-900/80 border border-gray-800 rounded-xl p-4 shadow-inner flex flex-col">
                    <div onclick="window.openLexicon('gsax')" class="text-center mb-auto cursor-pointer border-b border-gray-800 pb-2 hover:bg-gray-800 rounded transition p-1 group">
                        <span class="text-[10px] text-gray-400 group-hover:text-white transition uppercase font-black tracking-widest flex items-center justify-center gap-1">Avantage Gardien <i class="fas fa-question-circle text-${themeColor}-400 animate-pulse"></i></span>
                    </div>
                    <div class="flex justify-center items-center h-full pt-3">
                        <div class="bg-black border border-gray-700 px-4 py-2 rounded-lg text-center shadow-inner w-full">
                            <span class="block text-[9px] text-gray-500 uppercase tracking-widest font-bold mb-1">Avantage à <strong class="text-white">${favoredGoalieTeam}</strong></span>
                            <span class="text-xl font-black ${goalieColor}">+${absAdvantage} <span class="text-[10px] text-gray-500">But/Match</span></span>
                        </div>
                    </div>
                </div>
            </div>

            ${tData && tData.status === "success" ? `
            <div class="bg-gray-950 border border-gray-800 rounded-xl p-4 md:p-5 shadow-inner">
                <h4 class="text-white font-black text-[10px] md:text-xs uppercase tracking-widest mb-4 border-b border-gray-800 pb-2"><i class="fas fa-chess-board text-yellow-500 mr-2"></i> Tactique & Calendrier</h4>
                
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-6">
                    <div class="flex flex-col items-center gap-2 bg-gray-900/50 p-3 rounded-lg border border-gray-800">
                        <span class="text-xs font-black text-white uppercase tracking-widest border-b border-gray-800 w-full text-center pb-2">${away}</span>
                        ${tData.away.b2b ? `<span class="text-red-500 bg-red-500/10 px-2 py-1 rounded text-[8px] font-black border border-red-500/30 w-full text-center animate-pulse"><i class="fas fa-battery-empty"></i> Back-to-Back (Fatigué)</span>` : `<span class="text-green-400 bg-green-400/10 px-2 py-1 rounded text-[8px] font-black border border-green-400/30 w-full text-center"><i class="fas fa-battery-full"></i> Repos Optimisé</span>`}
                        <div class="w-full flex justify-between text-[10px] mt-2"><span class="text-gray-500 font-bold">Puissance PP</span><span class="text-white font-black">${tData.away.pp.toFixed(1)}%</span></div>
                        <div class="w-full bg-gray-800 h-1.5 rounded-full overflow-hidden mt-1"><div class="bg-blood h-full" style="width: ${tData.away.pp}%"></div></div>
                        <div class="w-full flex justify-between text-[10px] mt-2"><span class="text-gray-500 font-bold">Solidité PK</span><span class="text-white font-black">${tData.away.pk.toFixed(1)}%</span></div>
                        <div class="w-full bg-gray-800 h-1.5 rounded-full overflow-hidden mt-1"><div class="bg-gray-500 h-full" style="width: ${tData.away.pk}%"></div></div>
                    </div>

                    <div class="flex flex-col items-center gap-2 bg-gray-900/50 p-3 rounded-lg border border-gray-800">
                        <span class="text-xs font-black text-white uppercase tracking-widest border-b border-gray-800 w-full text-center pb-2">${home}</span>
                        ${tData.home.b2b ? `<span class="text-red-500 bg-red-500/10 px-2 py-1 rounded text-[8px] font-black border border-red-500/30 w-full text-center animate-pulse"><i class="fas fa-battery-empty"></i> Back-to-Back (Fatigué)</span>` : `<span class="text-green-400 bg-green-400/10 px-2 py-1 rounded text-[8px] font-black border border-green-400/30 w-full text-center"><i class="fas fa-battery-full"></i> Repos Optimisé</span>`}
                        <div class="w-full flex justify-between text-[10px] mt-2"><span class="text-gray-500 font-bold">Puissance PP</span><span class="text-white font-black">${tData.home.pp.toFixed(1)}%</span></div>
                        <div class="w-full bg-gray-800 h-1.5 rounded-full overflow-hidden mt-1"><div class="bg-ice h-full" style="width: ${tData.home.pp}%"></div></div>
                        <div class="w-full flex justify-between text-[10px] mt-2"><span class="text-gray-500 font-bold">Solidité PK</span><span class="text-white font-black">${tData.home.pk.toFixed(1)}%</span></div>
                        <div class="w-full bg-gray-800 h-1.5 rounded-full overflow-hidden mt-1"><div class="bg-gray-500 h-full" style="width: ${tData.home.pk}%"></div></div>
                    </div>
                </div>
            </div>` : ''}
            
            <div class="pb-16 md:pb-4 w-full"></div>
        `;

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