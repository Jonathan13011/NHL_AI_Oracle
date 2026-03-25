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
