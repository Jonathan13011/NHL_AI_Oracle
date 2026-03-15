// ==========================================
// MOTEUR GARDIENS ULTIME (La Forteresse)
// ==========================================
window.currentGoalieData = null;
window.currentGoalieSplit = 'season';
window.currentTeamData = null;

window.updateGoalieMatchSelector = async function () {
    let container = document.getElementById('goalies-match-selector');
    if (!container) return;

    if (typeof window.fetchedMatchesPool === 'undefined' || window.fetchedMatchesPool.length === 0) {
        if (typeof window.fetchMatches === 'function') await window.fetchMatches(true);
    }

    let unfinishedMatches = (window.fetchedMatchesPool || []).filter(m => m.state !== 'FINAL' && m.state !== 'OFF' && m.state !== 'LIVE' && m.state !== 'CRIT');
    let activeDates = window.selectedFilterDates || [];
    let validMatches = [];

    if (activeDates.length > 0) {
        validMatches = unfinishedMatches.filter(m => {
            let d = new Date(m.date); d.setHours(d.getHours() - 10);
            let localDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
            return activeDates.includes(m.date.split('T')[0]) || activeDates.includes(localDate);
        });
    } else if (unfinishedMatches.length > 0) {
        unfinishedMatches.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
        let firstDate = new Date(unfinishedMatches[0].date); firstDate.setHours(firstDate.getHours() - 10);
        let targetDateStr = `${firstDate.getFullYear()}-${String(firstDate.getMonth() + 1).padStart(2, '0')}-${String(firstDate.getDate()).padStart(2, '0')}`;
        validMatches = unfinishedMatches.filter(m => {
            let d = new Date(m.date); d.setHours(d.getHours() - 10);
            return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` === targetDateStr;
        });
    }

    if (validMatches.length === 0) {
        container.innerHTML = '<div class="text-center p-6 bg-gray-900/50 rounded-xl border border-gray-800 text-gray-500 font-bold text-xs"><i class="fas fa-bed text-2xl mb-2 block"></i>Aucun match prévu.</div>';
        return;
    }

    container.innerHTML = '';
    validMatches.forEach(m => {
        let hLogo = typeof getLogoUrl === 'function' ? getLogoUrl(m.home_team) : "assets/logo_hockAI.png";
        let aLogo = typeof getLogoUrl === 'function' ? getLogoUrl(m.away_team) : "assets/logo_hockAI.png";
        
        let dateObj = new Date(m.date);
        let timeStr = dateObj.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

        container.innerHTML += `
            <div onclick="window.selectGoalieMatch('${m.home_team}', '${m.away_team}')" class="relative overflow-hidden flex flex-col p-4 rounded-xl border-l-4 border-r-4 border-l-gray-700 border-r-gray-700 bg-gradient-to-b from-gray-900 to-black hover:border-l-blood hover:border-r-ice cursor-pointer transition-all transform hover:-translate-y-1 shadow-lg group">
                <div class="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-10 pointer-events-none"></div>
                <div class="text-center text-[10px] text-gray-500 font-black tracking-widest uppercase mb-3"><i class="far fa-clock text-orange-500 mr-1"></i> ${timeStr}</div>
                <div class="flex items-center justify-between w-full relative z-10">
                    <div class="flex flex-col items-center w-[40%] gap-2">
                        <img src="${aLogo}" onerror="this.src='assets/logo_hockAI.png'" class="w-12 h-12 object-contain drop-shadow-[0_0_8px_rgba(255,255,255,0.2)] group-hover:scale-110 transition">
                        <span class="text-xs md:text-sm font-black text-white uppercase">${m.away_team}</span>
                    </div>
                    <div class="flex flex-col items-center w-[20%]">
                        <i class="fas fa-bolt text-gray-700 text-xl group-hover:text-yellow-400 transition animate-pulse"></i>
                    </div>
                    <div class="flex flex-col items-center w-[40%] gap-2">
                        <img src="${hLogo}" onerror="this.src='assets/logo_hockAI.png'" class="w-12 h-12 object-contain drop-shadow-[0_0_8px_rgba(255,255,255,0.2)] group-hover:scale-110 transition">
                        <span class="text-xs md:text-sm font-black text-white uppercase">${m.home_team}</span>
                    </div>
                </div>
            </div>
        `;
    });
};

window.selectGoalieMatch = async function (home, away) {
    let step1 = document.getElementById('goalie-step-1');
    let step2 = document.getElementById('goalie-step-2');
    if (typeof showFullScreenLoader === 'function') showFullScreenLoader("Scouting des Gardiens", "Connexion Rapide NHL...", false);

    try {
        let match = (window.fetchedMatchesPool || []).find(m => m.home_team === home && m.away_team === away);
        let date = match ? match.date.split('T')[0] : new Date().toISOString().split('T')[0];

        const [gRes, tRes] = await Promise.all([
            fetch(`${API_BASE}/goalie_matchup/${home}/${away}`),
            fetch(`${API_BASE}/team_comparison/${home}/${away}/${date}`).catch(() => null)
        ]);

        const gData = await gRes.json();
        let tData = tRes ? await tRes.json() : null;
        window.currentTeamData = tData;

        if (typeof hideFullScreenLoader === 'function') hideFullScreenLoader();

        if (gData.status === "error" || !gData.home_goalie || !gData.away_goalie) {
            alert("Les gardiens partants ne sont pas encore annoncés ou les données sont indisponibles.");
            return;
        }
        
        window.currentGoalieData = gData;

        if (step1) step1.classList.add('hidden');
        if (step2) step2.classList.remove('hidden');

        const getBatteryHtml = (isB2b, in4) => {
            if (isB2b) return `<div class="bg-blood/20 border border-blood text-blood px-2 py-1 rounded text-[9px] font-black uppercase flex items-center justify-center gap-1 w-full"><i class="fas fa-battery-empty animate-pulse"></i> Back-to-Back (Fatigue)</div>`;
            if (in4) return `<div class="bg-orange-500/20 border border-orange-500 text-orange-500 px-2 py-1 rounded text-[9px] font-black uppercase flex items-center justify-center gap-1 w-full"><i class="fas fa-battery-quarter"></i> 3ème match en 4 jours</div>`;
            return `<div class="bg-green-500/20 border border-green-500 text-green-400 px-2 py-1 rounded text-[9px] font-black uppercase flex items-center justify-center gap-1 w-full"><i class="fas fa-battery-full"></i> Équipe Reposée</div>`;
        };

        let hBattery = tData && tData.status === "success" ? getBatteryHtml(tData.home.b2b, tData.home.in4) : getBatteryHtml(false, false);
        let aBattery = tData && tData.status === "success" ? getBatteryHtml(tData.away.b2b, tData.away.in4) : getBatteryHtml(false, false);
        document.getElementById('g-home-battery').innerHTML = hBattery; document.getElementById('g-away-battery').innerHTML = aBattery;

        const h = gData.home_goalie; const a = gData.away_goalie;
        document.getElementById('g-home-name').innerText = h.name; document.getElementById('g-home-img').src = h.headshot; document.getElementById('g-home-team').innerText = home;
        document.getElementById('g-away-name').innerText = a.name; document.getElementById('g-away-img').src = a.headshot; document.getElementById('g-away-team').innerText = away;

        let saH = gData.team_sa ? gData.team_sa.home : 30.0;
        let saA = gData.team_sa ? gData.team_sa.away : 30.0;
        let elHomeSa = document.getElementById('val-home-sa');
        let elAwaySa = document.getElementById('val-away-sa');
        let barSa = document.getElementById('bar-sa');
        if(elHomeSa) elHomeSa.innerText = saH.toFixed(1);
        if(elAwaySa) elAwaySa.innerText = saA.toFixed(1);
        if(barSa) {
             let pctSa = saA + saH > 0 ? (saA / (saA + saH)) * 100 : 50;
             barSa.style.width = `${100 - pctSa}%`;
        }

        let advantageScore = (h.sv_pct - a.sv_pct) * 100 + (a.gaa - h.gaa) * 0.5; 
        advantageScore += (saA - saH) * 0.1; 
        
        if (tData && tData.status === "success") {
            if (tData.home.b2b) advantageScore -= 3;
            if (tData.away.b2b) advantageScore += 3;
        }

        let verdictBox = document.getElementById('goalie-ai-verdict');
        let pressureText = "";
        if (saA > 32.5) pressureText += `La défense de ${away} est une passoire (${saA.toFixed(1)} tirs/m). `;
        if (saH > 32.5) pressureText += `La défense de ${home} est une passoire (${saH.toFixed(1)} tirs/m). `;

        if (advantageScore > 2) {
            verdictBox.innerHTML = `<i class="fas fa-robot text-3xl mb-2 text-ice animate-pulse drop-shadow-[0_0_10px_#00e5ff]"></i><h4 class="font-black text-white uppercase tracking-widest text-sm mb-1">Avantage Net : ${home}</h4><p class="text-xs text-gray-300 font-bold leading-relaxed">Le mur défensif de ${home} est supérieur. ${pressureText} L'IA recommande <b>Victoire de ${home}</b> ou <b>Team Total Over</b> sur ${away}.</p>`;
            verdictBox.className = "bg-gradient-to-r from-gray-900 to-gray-800 border-l-4 border-ice p-4 md:p-6 rounded-xl shadow-[0_0_15px_rgba(0,229,255,0.2)] text-center w-full mt-6";
        } else if (advantageScore < -2) {
            verdictBox.innerHTML = `<i class="fas fa-robot text-3xl mb-2 text-blood animate-pulse drop-shadow-[0_0_10px_#ff3333]"></i><h4 class="font-black text-white uppercase tracking-widest text-sm mb-1">Avantage Net : ${away}</h4><p class="text-xs text-gray-300 font-bold leading-relaxed">La supériorité de ${a.name} est flagrante. ${pressureText} L'IA recommande <b>Victoire de ${away}</b> ou <b>Under Buts</b> pour ${home}.</p>`;
            verdictBox.className = "bg-gradient-to-r from-gray-900 to-gray-800 border-l-4 border-blood p-4 md:p-6 rounded-xl shadow-[0_0_15px_rgba(255,51,51,0.2)] text-center w-full mt-6";
        } else {
            verdictBox.innerHTML = `<i class="fas fa-balance-scale text-3xl mb-2 text-yellow-500 drop-shadow-[0_0_10px_#eab308]"></i><h4 class="font-black text-white uppercase tracking-widest text-sm mb-1">Duel Équilibré</h4><p class="text-xs text-gray-300 font-bold leading-relaxed">Les gardiens se neutralisent. ${pressureText} Évitez le résultat sec, orientez-vous vers les Player Props offensifs.</p>`;
            verdictBox.className = "bg-gray-900 border border-yellow-500/50 p-4 md:p-6 rounded-xl shadow-[0_0_15px_rgba(234,179,8,0.1)] text-center w-full mt-6";
        }

        window.toggleGoalieSplit('season');

    } catch (e) {
        console.error(e);
        if (typeof hideFullScreenLoader === 'function') hideFullScreenLoader();
        alert("Erreur réseau avec l'Oracle.");
    }
};

window.goaliesGoToStep1 = function () {
    let step1 = document.getElementById('goalie-step-1');
    let step2 = document.getElementById('goalie-step-2');
    if (step2) step2.classList.add('hidden');
    if (step1) step1.classList.remove('hidden');
};

window.toggleGoalieSplit = function (splitType) {
    window.currentGoalieSplit = splitType;
    let data = window.currentGoalieData;
    let tData = window.currentTeamData;
    
    // Si la data est absente, on bloque pour ne pas faire planter l'interface
    if (!data || !data.home_goalie || !data.away_goalie) return;

    // Mise en surbrillance du bouton cliqué
    ['season', 'L5', 'split'].forEach(id => {
        let btn = document.getElementById(`btn-goalie-${id}`);
        if (!btn) return;
        if (id === splitType) {
            btn.className = "px-4 md:px-6 py-2.5 rounded-full text-[10px] md:text-xs font-black uppercase tracking-widest transition-all duration-300 text-black shadow-[0_0_10px_rgba(255,255,255,0.8)]";
            if (id === 'season') btn.classList.add('bg-white');
            if (id === 'L5') btn.classList.add('bg-yellow-500', 'shadow-[0_0_10px_#eab308]');
            if (id === 'split') btn.classList.add('bg-purple-400', 'shadow-[0_0_10px_#c084fc]');
        } else {
            btn.className = "px-4 md:px-6 py-2.5 rounded-full text-[10px] md:text-xs font-black uppercase tracking-widest text-gray-500 hover:text-white transition-all duration-300 bg-transparent flex items-center gap-2";
        }
    });

    let h = data.home_goalie; 
    let a = data.away_goalie;
    
    // Le Cerveau : On change la source de données selon le bouton cliqué !
    if (splitType === 'L5') { 
        h = data.home_goalie.l5 || data.home_goalie; 
        a = data.away_goalie.l5 || data.away_goalie; 
    }
    if (splitType === 'split') { 
        h = data.home_goalie.split || data.home_goalie; 
        a = data.away_goalie.split || data.away_goalie; 
    }

    // Calcul de l'impact de fatigue
    let hFatigueSV = 0, hFatigueGAA = 0, hFatigueGSAx = 0;
    let aFatigueSV = 0, aFatigueGAA = 0, aFatigueGSAx = 0;
    
    if (tData && tData.status === "success") {
        if (tData.home && tData.home.b2b) { hFatigueSV = -0.015; hFatigueGAA = 0.35; hFatigueGSAx = -1.2; }
        if (tData.away && tData.away.b2b) { aFatigueSV = -0.015; aFatigueGAA = 0.35; aFatigueGSAx = -1.2; }
    }

    // Fonction de sécurité absolue pour forcer un nombre
    let getSafeStat = (val) => (val !== undefined && val !== null && !isNaN(val)) ? Number(val) : 0;

    let h_sv = getSafeStat(h.sv_pct) + hFatigueSV;
    let h_gaa = getSafeStat(h.gaa) + hFatigueGAA;
    let h_gsax = getSafeStat(h.gsax) + hFatigueGSAx;
    
    let a_sv = getSafeStat(a.sv_pct) + aFatigueSV;
    let a_gaa = getSafeStat(a.gaa) + aFatigueGAA;
    let a_gsax = getSafeStat(a.gsax) + aFatigueGSAx;

    const updateTugOfWar = (idAway, idHome, valAway, valHome, isInverted = false, fatA = 0, fatH = 0) => {
        let elA = document.getElementById(`val-away-${idAway}`);
        let elH = document.getElementById(`val-home-${idHome}`);
        if(!elA || !elH) return;
        
        let textA = valAway.toFixed(idAway === 'sv' ? 3 : 2);
        let textH = valHome.toFixed(idHome === 'sv' ? 3 : 2);

        if (fatA !== 0) textA += `<br><span class="text-[9px] text-red-500 block -mt-1 font-bold animate-pulse">(${fatA > 0 ? '+' : ''}${fatA} Fatigue)</span>`;
        if (fatH !== 0) textH += `<br><span class="text-[9px] text-red-500 block -mt-1 font-bold animate-pulse">(${fatH > 0 ? '+' : ''}${fatH} Fatigue)</span>`;

        elA.innerHTML = textA;
        elH.innerHTML = textH;
        
        // Animation Flash
        elA.classList.add('scale-125'); elH.classList.add('scale-125');
        setTimeout(() => { elA.classList.remove('scale-125'); elH.classList.remove('scale-125'); }, 300);
        
        let total = valAway + valHome;
        let pctAway = total > 0 ? (valAway / total) * 100 : 50;
        if (isInverted) pctAway = 100 - pctAway; 
        
        let bar = document.getElementById(`bar-${idAway}`);
        if(bar) bar.style.width = `${pctAway}%`;
    };

    updateTugOfWar('sv', 'sv', a_sv, h_sv, false, aFatigueSV, hFatigueSV);
    updateTugOfWar('gaa', 'gaa', a_gaa, h_gaa, true, aFatigueGAA, hFatigueGAA);
    
    // GSAx
    let elGsaxA = document.getElementById('val-away-gsax');
    let elGsaxH = document.getElementById('val-home-gsax');
    
    if (elGsaxA && elGsaxH) {
        let gsaxTextA = (a_gsax > 0 ? '+' : '') + a_gsax.toFixed(1);
        let gsaxTextH = (h_gsax > 0 ? '+' : '') + h_gsax.toFixed(1);

        if (aFatigueGSAx !== 0) gsaxTextA += `<br><span class="text-[9px] text-red-500 block -mt-1 font-bold animate-pulse">(${aFatigueGSAx} Fatigue)</span>`;
        if (hFatigueGSAx !== 0) gsaxTextH += `<br><span class="text-[9px] text-red-500 block -mt-1 font-bold animate-pulse">(${hFatigueGSAx} Fatigue)</span>`;

        elGsaxA.innerHTML = gsaxTextA; 
        elGsaxH.innerHTML = gsaxTextH;
        
        elGsaxA.classList.add('scale-125'); elGsaxH.classList.add('scale-125');
        setTimeout(() => { elGsaxA.classList.remove('scale-125'); elGsaxH.classList.remove('scale-125'); }, 300);
        
        elGsaxA.className = `text-xl md:text-3xl font-black ${a_gsax > 0 ? 'text-green-400' : 'text-red-500'} w-24 text-left drop-shadow-md transition-transform`;
        elGsaxH.className = `text-xl md:text-3xl font-black ${h_gsax > 0 ? 'text-green-400' : 'text-red-500'} w-24 text-right drop-shadow-md transition-transform`;
    }
};

window.openGsaxExplanation = function() {
    document.getElementById('gsax-modal').classList.remove('hidden');
    document.getElementById('gsax-modal').classList.add('flex');
};
window.closeGsaxExplanation = function() {
    document.getElementById('gsax-modal').classList.add('hidden');
    document.getElementById('gsax-modal').classList.remove('flex');
};

// Initialisation au clic sur l'onglet
let goaliesTabBtn = document.querySelector('button[onclick*="tab-formes"]');
if (goaliesTabBtn) goaliesTabBtn.addEventListener('click', () => { window.updateGoalieMatchSelector(); });