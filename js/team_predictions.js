// =========================================================================
// 🏆 HOCKAI - TEAM PREDICTIONS ENGINE (Résultats Équipes)
// =========================================================================

window.currentModalMode = '2way';

window.loadTeamPredictions = async function (mode) {
    window.currentModalMode = mode;
    
    // 1. Mise à jour du style des boutons
    if (mode === '2way') {
        document.getElementById('btn-2way').className = "px-4 md:px-6 py-2 rounded text-[10px] md:text-sm font-black uppercase tracking-widest transition-all duration-300 bg-ice text-deepblue shadow-[0_0_15px_rgba(0,229,255,0.5)]";
        document.getElementById('btn-3way').className = "px-4 md:px-6 py-2 rounded text-[10px] md:text-sm font-black uppercase tracking-widest text-gray-300 hover:text-white transition-all duration-300 bg-gray-800";
    } else {
        document.getElementById('btn-3way').className = "px-4 md:px-6 py-2 rounded text-[10px] md:text-sm font-black uppercase tracking-widest transition-all duration-300 bg-ice text-deepblue shadow-[0_0_15px_rgba(0,229,255,0.5)]";
        document.getElementById('btn-2way').className = "px-4 md:px-6 py-2 rounded text-[10px] md:text-sm font-black uppercase tracking-widest text-gray-300 hover:text-white transition-all duration-300 bg-gray-800";
    }

    const container = document.getElementById('team-predictions-container');
    if (typeof showFullScreenLoader === 'function') showFullScreenLoader("L'Oracle analyse", "Traitement des algorithmes de victoire...", false);

    try {
        if (!window.fetchedMatchesPool || window.fetchedMatchesPool.length === 0) {
            const res = await fetch(`${API_BASE}/upcoming_matches`);
            const data = await res.json();
            window.fetchedMatchesPool = data.matches || [];
        }
        if (window.fetchedMatchesPool.length === 0) {
            container.innerHTML = '<div class="col-span-full text-center text-gray-400 py-10">Aucun match programmé.</div>';
            if (typeof hideFullScreenLoader === 'function') hideFullScreenLoader();
            return;
        }
        
        container.innerHTML = '';

        const fetchPromises = window.fetchedMatchesPool.map(async (match) => {
            const d = new Date(match.date);
            const dateStr = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
            const localYear = d.getFullYear(); 
            const localMonth = String(d.getMonth() + 1).padStart(2, '0'); 
            const localDay = String(d.getDate()).padStart(2, '0');
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
                const isVisible = 'flex';
                const card = document.createElement('div');

                // CARTE DESIGN iOS
                card.className = "team-card-dom bg-gray-900/80 border border-gray-800 rounded-xl p-4 md:p-5 cursor-pointer hover:border-purple-400 transition-all transform hover:-translate-y-1 shadow-lg group overflow-hidden relative flex-col gap-2";
                card.style.display = isVisible;
                card.onclick = () => window.openTeamModal(match.home_team, match.away_team, matchDateOnly, predData);

                card.innerHTML += `<div class="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-purple-500 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>`;
                card.innerHTML += `<div class="flex justify-between items-center mb-3 border-b border-gray-800 pb-2"><div class="text-[9px] text-purple-400 font-black uppercase tracking-widest"><i class="fas fa-robot"></i> ${mode === '2way' ? 'Vainqueur' : 'Tps Règl.'}</div><span class="text-[10px] font-bold text-gray-500"><i class="far fa-clock"></i> ${dateStr}</span></div>`;

                let hLogo = typeof window.getLogoUrl === 'function' ? window.getLogoUrl(match.home_team) : `https://assets.nhle.com/logos/nhl/svg/${match.home_team}_light.svg`;
                let aLogo = typeof window.getLogoUrl === 'function' ? window.getLogoUrl(match.away_team) : `https://assets.nhle.com/logos/nhl/svg/${match.away_team}_light.svg`;

                if (mode === '2way') {
                    const hp = predData.prob_home_win; 
                    const ap = predData.prob_away_win;
                    const isHomeFav = hp >= 50;
                    card.innerHTML += `
                        <div class="flex justify-between items-center relative mb-2">
                            <div class="flex flex-col items-center w-[40%] ${!isHomeFav ? 'scale-110 drop-shadow-[0_0_10px_rgba(192,132,252,0.4)]' : 'opacity-50'} transition-all"><img src="${aLogo}" onerror="this.src='assets/logo_hockAI.png'" class="w-10 h-10 object-contain mb-1"><span class="text-[10px] font-black text-white uppercase">${match.away_team}</span><span class="text-[10px] font-black ${!isHomeFav ? 'text-purple-400' : 'text-gray-500'}">${ap.toFixed(1)}%</span></div>
                            <div class="text-xs font-black text-gray-600 italic">@</div>
                            <div class="flex flex-col items-center w-[40%] ${isHomeFav ? 'scale-110 drop-shadow-[0_0_10px_rgba(192,132,252,0.4)]' : 'opacity-50'} transition-all"><img src="${hLogo}" onerror="this.src='assets/logo_hockAI.png'" class="w-10 h-10 object-contain mb-1"><span class="text-[10px] font-black text-white uppercase">${match.home_team}</span><span class="text-[10px] font-black ${isHomeFav ? 'text-purple-400' : 'text-gray-500'}">${hp.toFixed(1)}%</span></div>
                        </div>
                    `;
                } else {
                    const hp = predData.prob_home_reg; const tp = predData.prob_tie; const ap = predData.prob_away_reg;
                    card.innerHTML += `
                        <div class="flex justify-between items-center mb-2">
                            <div class="flex flex-col items-center w-1/3"><img src="${aLogo}" onerror="this.src='assets/logo_hockAI.png'" class="w-8 h-8 mb-1"><span class="text-[9px] font-black text-white">${match.away_team}</span><span class="text-[10px] font-black text-blood">${ap.toFixed(1)}%</span></div>
                            <div class="flex flex-col items-center w-1/3 border-l border-r border-gray-800"><span class="text-[8px] font-black text-gray-500 uppercase mb-1">Nul</span><span class="text-sm font-black text-tie">${tp.toFixed(1)}%</span></div>
                            <div class="flex flex-col items-center w-1/3"><img src="${hLogo}" onerror="this.src='assets/logo_hockAI.png'" class="w-8 h-8 mb-1"><span class="text-[9px] font-black text-white">${match.home_team}</span><span class="text-[10px] font-black text-ice">${hp.toFixed(1)}%</span></div>
                        </div>
                    `;
                }

                card.innerHTML += `<div class="mt-3 pt-2 border-t border-gray-800 text-center"><span class="text-[9px] text-gray-400 group-hover:text-purple-400 uppercase tracking-widest font-bold transition flex items-center justify-center gap-1">Voir l'analyse <i class="fas fa-arrow-right ml-1"></i></span></div>`;
                container.appendChild(card);
            }
            if (typeof updatePerformanceLists === 'function') updatePerformanceLists();
        });
    } catch (e) { 
        console.error(e); 
    } finally { 
        if (typeof hideFullScreenLoader === 'function') hideFullScreenLoader(); 
    }
};

window.openTeamModal = async function (home, away, date, predData) {
    const modal = document.getElementById('team-modal');
    const content = document.getElementById('team-modal-content');

    modal.classList.remove('hidden');
    modal.classList.add('flex');
    content.innerHTML = `<div class="text-center py-32"><i class="fas fa-circle-notch fa-spin text-5xl text-purple-500 mb-6 drop-shadow-[0_0_15px_#C084FC]"></i><p class="text-purple-400 font-black uppercase tracking-widest text-[10px] animate-pulse">L'Oracle compile le rapport d'équipe...</p></div>`;

    try {
        const res = await fetch(`${API_BASE}/team_comparison/${home}/${away}/${date}`);
        const tData = await res.json();

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
                    <input type="number" id="pred-ev-odds" oninput="window.calcPredEV()" step="0.01" placeholder="Ex: 1.85" class="bg-gray-800 border border-gray-600 text-white font-black rounded-lg w-16 p-2 text-center text-xs focus:border-green-500 outline-none shadow-inner">
                    <div id="pred-ev-res" class="bg-gray-950 border border-gray-800 p-2 rounded-lg text-center min-w-[70px] shadow-inner flex items-center justify-center">
                        <span class="text-gray-500 text-[8px] uppercase font-bold">---</span>
                    </div>
                </div>
            </div>
        `;

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
};

window.closeTeamModal = function () {
    document.getElementById('team-modal').classList.add('hidden');
    document.getElementById('team-modal').classList.remove('flex');
};