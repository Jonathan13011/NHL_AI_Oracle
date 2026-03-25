// ==========================================
// MOTEUR BANQUIER IA & GESTION DE PORTEFEUILLE
// ==========================================
window.bankrollChartInstance = null;
window.realBankrollChartInstance = null;

window.initBankrollChart = function () {
    if (!window.bankrollChartInstance) {
        const ctx = document.getElementById('bankrollChart').getContext('2d');
        window.bankrollChartInstance = new Chart(ctx, {
            type: 'line',
            data: { labels: [], datasets: [] },
            options: {
                responsive: true, maintainAspectRatio: false,
                interaction: { mode: 'nearest', intersect: true },
                plugins: { legend: { display: false }, tooltip: { enabled: true } },
                scales: {
                    y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#9ca3af', callback: value => value + ' €' } },
                    x: { grid: { display: false }, ticks: { color: '#9ca3af', maxTicksLimit: 10 } }
                },
                elements: { point: { radius: 0, hitRadius: 15, hoverRadius: 6 } }
            }
        });
    }
    window.calculateKelly();
};

window.calculateKelly = function () {
    if (typeof gtag === 'function') gtag('event', 'utilisation_banquier');
    
    // Le Banquier utilise le capital RÉEL dynamique
    let capital = window.currentCalculatedCapital !== undefined ? window.currentCalculatedCapital : (parseFloat(document.getElementById('bk-start-capital').value) || 100);
    let odds = parseFloat(document.getElementById('slider-bk-odds').value);
    let prob = parseFloat(document.getElementById('slider-bk-prob').value) / 100;
    let fraction = parseFloat(document.getElementById('bk-fraction').value);

    let card = document.getElementById('bk-result-card');
    let evBadge = document.getElementById('bk-ev-badge');
    let stakeAmt = document.getElementById('bk-stake-amount');
    let stakePct = document.getElementById('bk-stake-pct');
    let advice = document.getElementById('bk-advice-text');

    let ev = (prob * odds) - 1;
    let edgePct = ev * 100;

    let b = odds - 1;
    let q = 1 - prob;
    let kellyFraction = (b * prob - q) / b;

    if (ev <= 0 || kellyFraction <= 0) {
        card.className = "bg-gray-950 border-2 border-red-500 rounded-xl p-4 md:p-6 pt-12 md:pt-12 shadow-[0_0_30px_rgba(239,68,68,0.15)] relative overflow-hidden flex flex-col justify-center items-center text-center transition-all duration-300";
        evBadge.className = "absolute top-3 right-3 bg-red-500/20 text-red-500 border border-red-500 px-2 py-0.5 rounded-full text-[9px] md:text-[10px] font-black uppercase tracking-widest";
        evBadge.innerText = edgePct.toFixed(2) + "% EV";
        stakeAmt.innerText = "0.00 €";
        stakeAmt.className = "text-4xl md:text-5xl font-black text-gray-600 my-2";
        stakePct.innerText = "(Pari à perte mathématique)";
        advice.className = "text-[9px] md:text-xs text-red-500 mt-4 md:mt-6 font-bold bg-red-500/10 p-2 md:p-3 rounded-lg border border-red-500/30 w-full";
        advice.innerHTML = "<i class='fas fa-ban mr-1'></i> Ne pariez jamais sur ce match. Le bookmaker a l'avantage sur vous.";
        updateBankrollChart(capital, 0, 0, ev);
        return;
    }

    let recommendedFraction = kellyFraction * fraction;
    let recommendedStake = capital * recommendedFraction;

    card.className = "bg-gray-950 border-2 border-green-500 rounded-xl p-4 md:p-6 pt-12 md:pt-12 shadow-[0_0_30px_rgba(74,222,128,0.15)] relative overflow-hidden flex flex-col justify-center items-center text-center transition-all duration-300";
    evBadge.className = "absolute top-3 right-3 bg-green-500/20 text-green-400 border border-green-500 px-2 py-0.5 rounded-full text-[9px] md:text-[10px] font-black uppercase tracking-widest animate-pulse";
    evBadge.innerText = "+" + edgePct.toFixed(2) + "% EV";
    stakeAmt.innerText = recommendedStake.toFixed(2) + " €";
    stakeAmt.className = "text-4xl md:text-5xl font-black text-white drop-shadow-[0_0_15px_rgba(255,255,255,0.3)] my-2";
    stakePct.innerText = "(Soit " + (recommendedFraction * 100).toFixed(2) + "% de votre capital)";
    advice.className = "text-[9px] md:text-xs text-green-400 mt-4 md:mt-6 font-bold bg-green-500/10 p-2 md:p-3 rounded-lg border border-green-500/30 w-full";
    advice.innerHTML = "<i class='fas fa-check-circle mr-1'></i> Pari rentable. Mise optimisée pour faire grandir votre capital sans risquer la faillite.";

    updateBankrollChart(capital, odds, prob, recommendedFraction);
};

window.updateBankrollChart = function (startCapital, odds, prob, kellyFraction) {
    if (!window.bankrollChartInstance) return;

    let labels = [], dataExpected = [], dataPessimistic = [], dataOptimistic = [];
    let currentCap = startCapital, currentPess = startCapital, currentOpt = startCapital;
    let ev = (prob * odds) - 1;

    for (let i = 0; i <= 100; i++) {
        labels.push("Pari " + i);
        dataExpected.push(currentCap);
        dataPessimistic.push(currentPess);
        dataOptimistic.push(currentOpt);

        if (ev > 0 && kellyFraction > 0) {
            let b = odds - 1;
            let growthFactor = Math.pow(1 + b * kellyFraction, prob) * Math.pow(1 - kellyFraction, 1 - prob);
            currentCap = currentCap * growthFactor;
            currentPess = currentPess * (growthFactor * 0.98);
            currentOpt = currentOpt * (growthFactor * 1.02);
        }
    }

    window.bankrollChartInstance.data.labels = labels;
    window.bankrollChartInstance.data.datasets = [
        { label: 'Projection Optimiste', data: dataOptimistic, borderColor: 'rgba(0, 229, 255, 0.3)', borderDash: [5, 5], borderWidth: 1, fill: false },
        { label: 'Croissance Attendue (EV)', data: dataExpected, borderColor: '#4ADE80', backgroundColor: 'rgba(74, 222, 128, 0.1)', borderWidth: 3, fill: true, tension: 0.4 },
        { label: 'Projection Pessimiste', data: dataPessimistic, borderColor: 'rgba(239, 68, 68, 0.3)', borderDash: [5, 5], borderWidth: 1, fill: false }
    ];
    window.bankrollChartInstance.update();
};

// ==========================================
// ⚡ LE CERVEAU DU BANQUIER (MULTI-CAPITAL & SYNCHRONISATION) ⚡
// ==========================================
window.currentCalculatedCapital = 100;
window.currentCycleId = "1";
window.capitalCycles = { "1": { name: "Capital 1", start: 100, timestamp: 0 } };
window.monthlyBudget = 0;
window.currentChartFilter = 'ALL'; // Filtre de temps par défaut

window.loadBanquierSettings = function() {
    let userKey = window.currentUserEmail ? 'banquier_v2_' + window.currentUserEmail : 'banquier_v2_guest';
    let data = localStorage.getItem(userKey);
    
    if (data) {
        let parsed = JSON.parse(data);
        window.capitalCycles = parsed.cycles || window.capitalCycles;
        window.currentCycleId = parsed.current || "1";
        window.monthlyBudget = parsed.budget || 0;
    }
    
    // Remplir le menu déroulant avec les Capitaux
    let select = document.getElementById('bk-cycle-select');
    if (select) {
        select.innerHTML = '';
        for (let id in window.capitalCycles) {
            select.innerHTML += `<option value="${id}">${window.capitalCycles[id].name}</option>`;
        }
        select.value = window.currentCycleId;
    }
    
    if (document.getElementById('bk-start-capital')) document.getElementById('bk-start-capital').value = window.capitalCycles[window.currentCycleId].start;
    if (document.getElementById('bk-monthly-budget')) document.getElementById('bk-monthly-budget').value = window.monthlyBudget || '';

    window.syncBankrollToBanquier();
};

window.saveBanquierSettings = function() {
    let startCap = parseFloat(document.getElementById('bk-start-capital').value) || 0;
    window.monthlyBudget = parseFloat(document.getElementById('bk-monthly-budget').value) || 0;
    
    window.capitalCycles[window.currentCycleId].start = startCap;
    
    let userKey = window.currentUserEmail ? 'banquier_v2_' + window.currentUserEmail : 'banquier_v2_guest';
    localStorage.setItem(userKey, JSON.stringify({ 
        cycles: window.capitalCycles, 
        current: window.currentCycleId, 
        budget: window.monthlyBudget 
    }));
    
    window.syncBankrollToBanquier();
};

// C'est ici que l'utilisateur crée un nouveau profil de Capital
window.createNewCapitalCycle = function() {
    let newId = Date.now().toString();
    let cycleNum = Object.keys(window.capitalCycles).length + 1;
    window.capitalCycles[newId] = {
        name: "Capital " + cycleNum,
        start: 100,
        timestamp: Date.now() // TRÈS IMPORTANT : Ignore les paris passés !
    };
    window.currentCycleId = newId;
    window.saveBanquierSettings();
    window.loadBanquierSettings();
};

window.changeCapitalCycle = function() {
    window.currentCycleId = document.getElementById('bk-cycle-select').value;
    if (document.getElementById('bk-start-capital')) {
        document.getElementById('bk-start-capital').value = window.capitalCycles[window.currentCycleId].start;
    }
    window.syncBankrollToBanquier();
    window.saveBanquierSettings();
};

window.syncBankrollToBanquier = function() {
    let cycle = window.capitalCycles[window.currentCycleId] || { start: 100, timestamp: 0 };
    let startCap = cycle.start;

    let totalProfit = 0;
    let totalInvestedThisMonth = 0;
    let currentMonth = new Date().getMonth();
    let currentYear = new Date().getFullYear();

    if (window.globalBankroll && window.globalBankroll.length > 0) {
        window.globalBankroll.forEach(b => {
            if (b.status === "PENDING") return;
            
            let betDate = new Date(b.date);
            let betTimestamp = betDate.getTime();
            
            // On ignore totalement les paris faits avant la création de CE capital
            if (betTimestamp < cycle.timestamp) return;

            if (betDate.getMonth() === currentMonth && betDate.getFullYear() === currentYear) {
                totalInvestedThisMonth += b.stake;
            }

            if (b.status === "WON") {
                totalProfit += (b.stake * b.odds) - b.stake;
            } else if (b.status === "LOST") {
                totalProfit -= b.stake;
            }
        });
    }

    let currentCap = startCap + totalProfit;
    if (currentCap < 0) currentCap = 0;

    let curCapEl = document.getElementById('bk-current-capital');
    if (curCapEl) {
        curCapEl.innerText = currentCap.toFixed(2);
        if (totalProfit > 0) curCapEl.className = "text-xl md:text-3xl font-black text-money drop-shadow-[0_0_10px_rgba(74,222,128,0.4)] transition-all";
        else if (totalProfit < 0) curCapEl.className = "text-xl md:text-3xl font-black text-blood drop-shadow-[0_0_10px_rgba(255,51,51,0.4)] transition-all";
        else curCapEl.className = "text-xl md:text-3xl font-black text-white drop-shadow-[0_0_10px_rgba(255,255,255,0.2)] transition-all";
    }

    let warningEl = document.getElementById('bk-monthly-warning');
    if (warningEl) {
        if (window.monthlyBudget > 0 && totalInvestedThisMonth >= window.monthlyBudget) warningEl.classList.remove('hidden');
        else warningEl.classList.add('hidden');
    }

    window.currentCalculatedCapital = currentCap; 
    if (typeof window.calculateKelly === 'function') window.calculateKelly();
    if (typeof window.updatePortfolioUI === 'function') window.updatePortfolioUI();
};

// ==========================================
// 🔌 FILTRES ET GESTION DU PORTEFEUILLE
// ==========================================

window.setChartFilter = function(filterRange, btnElement) {
    window.currentChartFilter = filterRange;
    
    // Design des boutons au clic
    document.querySelectorAll('.chart-filter-btn').forEach(b => {
        b.classList.remove('active', 'text-black', 'bg-ice', 'shadow-[0_0_10px_rgba(0,229,255,0.4)]');
        b.classList.add('text-gray-400');
    });
    btnElement.classList.remove('text-gray-400');
    btnElement.classList.add('active', 'text-black', 'bg-ice', 'shadow-[0_0_10px_rgba(0,229,255,0.4)]');
    
    window.updatePortfolioUI();
};

window.updatePortfolioUI = function() {
    let cycle = window.capitalCycles[window.currentCycleId] || { start: 100, timestamp: 0 };
    let startCap = cycle.start;

    let totalInvested = 0, totalReturned = 0, wonBets = 0, finishedBets = 0;
    
    let chartLabels = ["Départ"];
    let chartData = [startCap];
    let currentCapForChart = startCap;

    let bets = window.globalBankroll || [];
    let sortedBets = [...bets].reverse(); // Graphique : du plus vieux au plus récent

    let now = new Date().getTime();
    let timeLimit = 0;
    
    // Activation des filtres temporels sur le graphique
    if (window.currentChartFilter === '7D') timeLimit = now - (7 * 24 * 60 * 60 * 1000);
    else if (window.currentChartFilter === '30D') timeLimit = now - (30 * 24 * 60 * 60 * 1000);
    else if (window.currentChartFilter === '1Y') timeLimit = now - (365 * 24 * 60 * 60 * 1000);

    sortedBets.forEach((b) => {
        let betTime = new Date(b.date).getTime();
        if (betTime < cycle.timestamp) return; // Exclu : pari fait sur un ancien capital

        if (b.status !== "PENDING") {
            totalInvested += b.stake;
            finishedBets++;
            
            if (b.status === "WON") {
                totalReturned += (b.stake * b.odds);
                wonBets++;
                currentCapForChart += (b.stake * b.odds) - b.stake;
            } else if (b.status === "LOST") {
                currentCapForChart -= b.stake;
            }
            
            // Si le pari est dans la fenêtre de temps (7J, 30J...), on l'affiche sur le graphique
            if (betTime >= timeLimit) {
                chartLabels.push("Pari " + finishedBets);
                chartData.push(currentCapForChart);
            }
        }
    });

    // 1. Mise à jour des KPI (Chiffres globaux du Capital sélectionné)
    let profit = totalReturned - totalInvested;
    let roi = totalInvested > 0 ? (profit / totalInvested) * 100 : 0;
    let hitrate = finishedBets > 0 ? (wonBets / finishedBets) * 100 : 0;

    let elProfit = document.getElementById('pf-profit');
    if(elProfit) {
        elProfit.innerText = profit.toFixed(2) + " €";
        elProfit.className = `text-sm md:text-2xl font-black truncate ${profit >= 0 ? 'text-money drop-shadow-[0_0_5px_#22c55e]' : 'text-blood drop-shadow-[0_0_5px_#ff3333]'}`;
    }
    if(document.getElementById('pf-roi')) document.getElementById('pf-roi').innerText = roi.toFixed(1) + "%";
    if(document.getElementById('pf-hitrate')) document.getElementById('pf-hitrate').innerText = hitrate.toFixed(1) + "%";

    // 2. Historique texte (Toujours visible, filtré par Capital)
    let validBetsForList = bets.filter(b => new Date(b.date).getTime() >= cycle.timestamp);
    let listContainer = document.getElementById('pf-bets-list');
    
    if (listContainer) {
        if (validBetsForList.length === 0) {
            listContainer.innerHTML = `<div class="text-center text-gray-600 font-bold text-xs italic py-10">Aucun pari enregistré dans ce Capital.</div>`;
        } else {
            let listHtml = "";
            validBetsForList.forEach(b => {
                let dateStr = new Date(b.date).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
                let statusColor = b.status === 'WON' ? 'text-money' : (b.status === 'LOST' ? 'text-blood' : 'text-yellow-500');
                let statusText = b.status === 'WON' ? 'GAGNÉ' : (b.status === 'LOST' ? 'PERDU' : 'EN COURS');
                
                listHtml += `
                    <div class="bg-black/50 p-3 rounded-lg border border-gray-800 flex justify-between items-center mb-2 hover:border-gray-600 transition">
                        <div>
                            <div class="text-[9px] text-gray-500 font-bold tracking-widest uppercase mb-0.5">${dateStr}</div>
                            <div class="text-white text-xs font-black truncate max-w-[150px] md:max-w-[250px]">${b.description}</div>
                        </div>
                        <div class="text-right flex flex-col items-end">
                            <div class="text-[10px] font-black ${statusColor} bg-gray-900 px-2 py-0.5 rounded shadow-inner mb-1">${statusText}</div>
                            <div class="text-[10px] text-gray-400 font-bold">@${b.odds.toFixed(2)} | ${b.stake.toFixed(2)}€</div>
                        </div>
                    </div>
                `;
            });
            listContainer.innerHTML = listHtml;
        }
    }

    // 3. Mise à jour du Graphique Linéaire filtré
    if (window.realBankrollChartInstance) {
        window.realBankrollChartInstance.data.labels = chartLabels;
        window.realBankrollChartInstance.data.datasets[0].data = chartData;
        window.realBankrollChartInstance.update();
    } else {
        const ctx = document.getElementById('realBankrollChart');
        if (ctx) {
            window.realBankrollChartInstance = new Chart(ctx.getContext('2d'), {
                type: 'line',
                data: {
                    labels: chartLabels,
                    datasets: [{
                        label: 'Capital Réel',
                        data: chartData,
                        borderColor: '#4ADE80',
                        backgroundColor: 'rgba(74, 222, 128, 0.1)',
                        borderWidth: 3,
                        pointRadius: 2,
                        pointBackgroundColor: '#fff',
                        fill: true,
                        tension: 0.3
                    }]
                },
                options: {
                    responsive: true, maintainAspectRatio: false,
                    plugins: { legend: { display: false } },
                    scales: {
                        x: { display: false },
                        y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#9ca3af', font: {family: 'Montserrat', weight: 'bold'} } }
                    }
                }
            });
        }
    }
};

window.submitPortfolioBet = function() {
    let target = document.getElementById('pf-target').value;
    let market = document.getElementById('pf-market').value;
    let odds = parseFloat(document.getElementById('pf-odds').value);
    let stake = parseFloat(document.getElementById('pf-stake').value);

    if (!target || !market || isNaN(odds) || isNaN(stake)) {
        alert("Action requise : Veuillez remplir tous les champs du pari.");
        return;
    }

    let desc = target + " - " + market + " (1 Sélection)";
    
    if (typeof window.addBetToBankroll === 'function') {
        window.addBetToBankroll('MANUEL', desc, odds, stake, [{target_name: target, market: market}]);
        document.getElementById('pf-target').value = '';
        document.getElementById('pf-odds').value = '';
        document.getElementById('pf-stake').value = '';
    } else {
        alert("Erreur de connexion avec le Coffre-Fort.");
    }
};