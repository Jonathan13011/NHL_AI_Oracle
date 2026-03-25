// ==========================================
        // MOTEUR BANQUIER IA (KELLY CRITERION & CHART)
        // ==========================================
        window.bankrollChartInstance = null;

        // --- ⚡ LE CERVEAU DU BANQUIER ⚡ ---
window.currentCalculatedCapital = 100; // Variable globale pour le capital dynamique

// Sauvegarde les paramètres dans le navigateur de l'utilisateur
window.saveBanquierSettings = function() {
    let startCap = parseFloat(document.getElementById('bk-start-capital').value) || 0;
    let monthly = parseFloat(document.getElementById('bk-monthly-budget').value) || 0;
    let userKey = window.currentUserEmail ? 'banquier_' + window.currentUserEmail : 'banquier_guest';
    localStorage.setItem(userKey, JSON.stringify({ startCapital: startCap, monthlyBudget: monthly }));
    window.syncBankrollToBanquier(); // Recalcul instantané
};

// Charge les paramètres à la connexion
window.loadBanquierSettings = function() {
    let userKey = window.currentUserEmail ? 'banquier_' + window.currentUserEmail : 'banquier_guest';
    let data = localStorage.getItem(userKey);
    if (data) {
        let parsed = JSON.parse(data);
        if (document.getElementById('bk-start-capital')) document.getElementById('bk-start-capital').value = parsed.startCapital || 100;
        if (document.getElementById('bk-monthly-budget')) document.getElementById('bk-monthly-budget').value = parsed.monthlyBudget || '';
    }
    window.syncBankrollToBanquier();
};

// Calcule le Capital Actuel en lisant le Coffre-Fort
window.syncBankrollToBanquier = function() {
    let startCap = parseFloat(document.getElementById('bk-start-capital')?.value) || 100;
    let monthlyBudget = parseFloat(document.getElementById('bk-monthly-budget')?.value) || 0;

    let totalProfit = 0;
    let totalInvestedThisMonth = 0;
    let currentMonth = new Date().getMonth();
    let currentYear = new Date().getFullYear();

    // LECTURE DU COFFRE-FORT (Pertes et Gains RÉELS)
    if (window.globalBankroll && window.globalBankroll.length > 0) {
        window.globalBankroll.forEach(b => {
            if (b.status === "PENDING") return; // On ignore ce qui n'est pas fini

            let betDate = new Date(b.date);
            if (betDate.getMonth() === currentMonth && betDate.getFullYear() === currentYear) {
                totalInvestedThisMonth += b.stake;
            }

            if (b.status === "WON") {
                totalProfit += (b.stake * b.odds) - b.stake; // Bénéfice net
            } else if (b.status === "LOST") {
                totalProfit -= b.stake; // Perte nette
            }
        });
    }

    let currentCap = startCap + totalProfit;
    if (currentCap < 0) currentCap = 0; // Sécurité anti-négatif

    // MISE A JOUR VISUELLE
    let curCapEl = document.getElementById('bk-current-capital');
    if (curCapEl) {
        curCapEl.innerText = currentCap.toFixed(2);
        if (totalProfit > 0) curCapEl.className = "text-xl md:text-3xl font-black text-money drop-shadow-[0_0_10px_rgba(74,222,128,0.4)] transition-all";
        else if (totalProfit < 0) curCapEl.className = "text-xl md:text-3xl font-black text-blood drop-shadow-[0_0_10px_rgba(255,51,51,0.4)] transition-all";
        else curCapEl.className = "text-xl md:text-3xl font-black text-white drop-shadow-[0_0_10px_rgba(255,255,255,0.2)] transition-all";
    }

    // ALERTE BUDGET MENSUEL
    let warningEl = document.getElementById('bk-monthly-warning');
    if (warningEl) {
        if (monthlyBudget > 0 && totalInvestedThisMonth >= monthlyBudget) {
            warningEl.classList.remove('hidden');
        } else {
            warningEl.classList.add('hidden');
        }
    }

    window.currentCalculatedCapital = currentCap; 
    if (typeof window.calculateKelly === 'function') window.calculateKelly();
};

        window.initBankrollChart = function () {
            if (!window.bankrollChartInstance) {
                const ctx = document.getElementById('bankrollChart').getContext('2d');
                window.bankrollChartInstance = new Chart(ctx, {
                    type: 'line',
                    data: { labels: [], datasets: [] },
                    options: {
                        responsive: true, maintainAspectRatio: false,
                        // FIX MOBILE : L'info-bulle s'affiche uniquement au clic exact sur un point
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
            // 📡 RADAR GOOGLE : Utilisation du Banquier
            if (typeof gtag === 'function') {
                gtag('event', 'utilisation_banquier');
            }
            // Le Banquier utilise maintenant le capital RÉEL connecté au coffre-fort
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
                // FIX MOBILE : Ajout de "pt-12" pour éviter que le badge n'écrase le texte
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

            // FIX MOBILE : Ajout de "pt-12" pour donner de l'espace au badge vert
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

            let labels = [];
            let dataExpected = [];
            let dataPessimistic = [];
            let dataOptimistic = [];

            let currentCap = startCapital;
            let currentPess = startCapital;
            let currentOpt = startCapital;

            let ev = (prob * odds) - 1;

            // On simule 100 paris identiques
            for (let i = 0; i <= 100; i++) {
                labels.push("Pari " + i);
                dataExpected.push(currentCap);
                dataPessimistic.push(currentPess);
                dataOptimistic.push(currentOpt);

                if (ev > 0 && kellyFraction > 0) {
                    // Croissance théorique avec Kelly : Croissance = (1 + b*f)^p * (1 - f)^q
                    let b = odds - 1;
                    let growthFactor = Math.pow(1 + b * kellyFraction, prob) * Math.pow(1 - kellyFraction, 1 - prob);
                    currentCap = currentCap * growthFactor;

                    // Variante Pessimiste (On subit un peu de malchance par rapport à la théorie)
                    currentPess = currentPess * (growthFactor * 0.98);
                    // Variante Optimiste (La variance tourne en notre faveur)
                    currentOpt = currentOpt * (growthFactor * 1.02);
                }
            }

            window.bankrollChartInstance.data.labels = labels;
            window.bankrollChartInstance.data.datasets = [
                {
                    label: 'Projection Optimiste', data: dataOptimistic,
                    borderColor: 'rgba(0, 229, 255, 0.3)', borderDash: [5, 5], borderWidth: 1, fill: false
                },
                {
                    label: 'Croissance Attendue (EV)', data: dataExpected,
                    borderColor: '#4ADE80', backgroundColor: 'rgba(74, 222, 128, 0.1)', borderWidth: 3, fill: true, tension: 0.4
                },
                {
                    label: 'Projection Pessimiste', data: dataPessimistic,
                    borderColor: 'rgba(239, 68, 68, 0.3)', borderDash: [5, 5], borderWidth: 1, fill: false
                }
            ];
            window.bankrollChartInstance.update();
        };

        // ==========================================
// 🔌 CONNEXION DU PORTEFEUILLE AU COFFRE-FORT (SUPABASE)
// ==========================================

// On demande à la fonction de synchronisation de mettre aussi à jour le Portefeuille
const originalSyncBankroll = window.syncBankrollToBanquier;
window.syncBankrollToBanquier = function() {
    if (originalSyncBankroll) originalSyncBankroll(); // Calcule le capital en haut
    if (typeof window.updatePortfolioUI === 'function') window.updatePortfolioUI(); // Met à jour les graphiques en bas
};

window.updatePortfolioUI = function() {
    let totalInvested = 0;
    let totalReturned = 0;
    let wonBets = 0;
    let finishedBets = 0;
    
    // Initialisation du graphique
    let chartLabels = ["Départ"];
    let startCap = parseFloat(document.getElementById('bk-start-capital')?.value) || 100;
    let chartData = [startCap];
    let currentCap = startCap;

    let bets = window.globalBankroll || [];
    let sortedBets = [...bets].reverse(); // On inverse pour le graphique (du plus vieux au plus récent)

    // Calcul des statistiques
    sortedBets.forEach((b) => {
        if (b.status !== "PENDING") {
            totalInvested += b.stake;
            finishedBets++;
            
            if (b.status === "WON") {
                totalReturned += (b.stake * b.odds);
                wonBets++;
                currentCap += (b.stake * b.odds) - b.stake; // Ajout du bénéfice net
            } else if (b.status === "LOST") {
                currentCap -= b.stake; // Retrait de la mise
            }
            
            chartLabels.push("Pari " + finishedBets);
            chartData.push(currentCap);
        }
    });

    // 1. Mise à jour des KPI (Bénéfice, ROI, Réussite)
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

    // 2. Mise à jour de la liste historique
    let listContainer = document.getElementById('pf-bets-list');
    if (listContainer) {
        if (bets.length === 0) {
            listContainer.innerHTML = `<div class="text-center text-gray-600 font-bold text-xs italic py-10">Aucun pari enregistré dans le Coffre-Fort.</div>`;
        } else {
            let listHtml = "";
            bets.forEach(b => {
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

    // 3. Mise à jour du Graphique Linéaire
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

// 4. On modifie le bouton "Nouveau Pari" pour qu'il envoie la donnée dans le Coffre-Fort Supabase
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
        
        // Nettoyage des champs après envoi
        document.getElementById('pf-target').value = '';
        document.getElementById('pf-odds').value = '';
        document.getElementById('pf-stake').value = '';
    } else {
        alert("Erreur de connexion avec le Coffre-Fort.");
    }
};