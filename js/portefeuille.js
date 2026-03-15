// ==========================================
        // MOTEUR PORTEFEUILLE TRADING (BET TRACKER)
        // ==========================================
        window.userPortfolio = JSON.parse(localStorage.getItem('hockai_portfolio')) || [];
        window.realBankrollChartInstance = null;

        // Appelée quand on charge la page
        document.addEventListener("DOMContentLoaded", () => {
            if (document.getElementById('pf-bets-list')) {
                renderPortfolio();
            }
        });

        window.currentBetMode = 'simple';
        window.combineLegs = [];

        window.setBetMode = function (mode) {
            window.currentBetMode = mode;
            const btnSimple = document.getElementById('btn-tab-simple');
            const btnCombine = document.getElementById('btn-tab-combine');
            const legsWrapper = document.getElementById('combine-legs-wrapper');
            const btnAddLeg = document.getElementById('btn-add-leg');
            const btnSubmit = document.getElementById('btn-submit-bet');

            if (mode === 'simple') {
                btnSimple.className = "w-1/2 text-[10px] md:text-xs uppercase font-black py-2.5 rounded bg-ice text-black transition-all shadow-[0_0_10px_rgba(0,229,255,0.4)]";
                btnCombine.className = "w-1/2 text-[10px] md:text-xs uppercase font-black py-2.5 rounded text-gray-500 hover:text-white transition-all";
                legsWrapper.classList.add('hidden');
                btnAddLeg.classList.add('hidden');
                btnSubmit.innerHTML = `<i class="fas fa-check"></i> Enregistrer le Pari`;
                btnSubmit.className = "w-full bg-ice hover:bg-cyan-400 text-black font-black py-3.5 rounded-xl text-xs uppercase tracking-widest transition-all shadow-[0_0_15px_rgba(0,229,255,0.3)] mt-2 flex justify-center items-center gap-2";
            } else {
                btnCombine.className = "w-1/2 text-[10px] md:text-xs uppercase font-black py-2.5 rounded bg-purple-500 text-white transition-all shadow-[0_0_10px_rgba(168,85,247,0.4)]";
                btnSimple.className = "w-1/2 text-[10px] md:text-xs uppercase font-black py-2.5 rounded text-gray-500 hover:text-white transition-all";
                legsWrapper.classList.remove('hidden');
                btnAddLeg.classList.remove('hidden');
                btnSubmit.innerHTML = `<i class="fas fa-receipt"></i> Valider le Ticket Combiné`;
                btnSubmit.className = "w-full bg-purple-500 hover:bg-purple-400 text-white font-black py-3.5 rounded-xl text-xs uppercase tracking-widest transition-all shadow-[0_0_15px_rgba(168,85,247,0.3)] mt-2 flex justify-center items-center gap-2";
                updateCombineUI();
            }
        };

        window.addLegToCombine = function () {
            const target = document.getElementById('pf-target').value.trim();
            const market = document.getElementById('pf-market').value;
            const odds = parseFloat(document.getElementById('pf-odds').value);

            if (!target || !odds) {
                alert("Veuillez remplir la cible et la cote pour ajouter cette sélection.");
                return;
            }

            window.combineLegs.push({ target, market, odds });
            document.getElementById('pf-target').value = '';
            document.getElementById('pf-odds').value = '';
            updateCombineUI();
        };

        window.removeLeg = function (index) {
            window.combineLegs.splice(index, 1);
            updateCombineUI();
        };

        window.updateCombineUI = function () {
            const list = document.getElementById('combine-legs-list');
            const totalOddsEl = document.getElementById('combine-total-odds');

            if (window.combineLegs.length === 0) {
                list.innerHTML = `<div class="text-center text-[9px] text-gray-600 italic py-3 bg-gray-950 rounded border border-gray-800 border-dashed">Aucune sélection ajoutée.</div>`;
                totalOddsEl.innerText = "@1.00";
            } else {
                let html = '';
                let totalOdds = 1.0;
                window.combineLegs.forEach((leg, i) => {
                    totalOdds *= leg.odds;
                    html += `
                        <div class="flex justify-between items-center bg-gray-900 border border-gray-700 p-2 rounded-lg">
                            <div class="flex flex-col w-2/3 overflow-hidden">
                                <span class="text-white text-[10px] font-black truncate">${leg.target}</span>
                                <span class="text-gray-500 text-[8px] uppercase font-bold">${leg.market}</span>
                            </div>
                            <div class="flex items-center gap-3">
                                <span class="text-purple-400 font-black text-[10px]">@${leg.odds.toFixed(2)}</span>
                                <button onclick="removeLeg(${i})" class="text-gray-600 hover:text-red-500 transition"><i class="fas fa-times-circle"></i></button>
                            </div>
                        </div>
                    `;
                });
                list.innerHTML = html;
                totalOddsEl.innerText = "@" + totalOdds.toFixed(2);
            }
        };

        window.savePortfolioLocally = function () {
            localStorage.setItem('hockai_portfolio', JSON.stringify(window.userPortfolio));
        };

        window.updateBetStatus = function (id, status) {
            const bet = window.userPortfolio.find(b => b.id === id);
            if (bet) {
                bet.status = status;
                window.savePortfolioLocally();
                window.renderPortfolio();
            }
        };

        window.deleteBet = function (id) {
            if (confirm("Êtes-vous sûr de vouloir supprimer ce pari de l'historique ?")) {
                window.userPortfolio = window.userPortfolio.filter(b => b.id !== id);
                window.savePortfolioLocally();
                window.renderPortfolio();
            }
        };

        window.submitPortfolioBet = function () {
            const stake = parseFloat(document.getElementById('pf-stake').value);
            if (!stake || stake <= 0) {
                alert("Veuillez saisir une mise valide.");
                return;
            }

            let newBet = {
                id: Date.now().toString(),
                date: new Date().toLocaleDateString('fr-FR'),
                stake: stake,
                status: 'pending'
            };

            if (window.currentBetMode === 'simple') {
                const target = document.getElementById('pf-target').value.trim();
                const market = document.getElementById('pf-market').value;
                const odds = parseFloat(document.getElementById('pf-odds').value);

                if (!target || !odds) {
                    alert("Veuillez remplir la cible et la cote.");
                    return;
                }

                newBet.type = 'simple';
                newBet.target = target;
                newBet.market = market;
                newBet.odds = odds;
            } else {
                if (window.combineLegs.length < 2) {
                    alert("Un pari combiné doit contenir au moins 2 sélections.");
                    return;
                }

                let totalOdds = 1.0;
                window.combineLegs.forEach(leg => totalOdds *= leg.odds);

                newBet.type = 'combine';
                newBet.selections = [...window.combineLegs];
                newBet.odds = totalOdds;

                newBet.target = `Ticket Combiné (${window.combineLegs.length} sélec.)`;
                let marketDesc = window.combineLegs.map(l => l.target).join(' + ');
                if (marketDesc.length > 35) marketDesc = marketDesc.substring(0, 32) + '...';
                newBet.market = marketDesc;
            }

            window.userPortfolio.push(newBet);
            savePortfolioLocally();
            renderPortfolio();

            document.getElementById('pf-target').value = '';
            document.getElementById('pf-odds').value = '';
            document.getElementById('pf-stake').value = '';
            window.combineLegs = [];
            if (window.currentBetMode === 'combine') updateCombineUI();
        };

        window.renderPortfolio = function () {
            const list = document.getElementById('pf-bets-list');
            if (!list) return;

            if (window.userPortfolio.length === 0) {
                list.innerHTML = `<div class="text-center text-gray-600 font-bold text-xs italic py-10">Aucun pari enregistré. Lancez-vous !</div>`;
                updatePortfolioStats();
                return;
            }

            let sortedBets = [...window.userPortfolio].sort((a, b) => b.id - a.id);
            let html = '';

            sortedBets.forEach(bet => {
                let statusBadge = '';
                let actionBtns = '';
                let borderCol = 'border-gray-800';

                let typeIcon = bet.type === 'combine' ? '<i class="fas fa-layer-group text-purple-400 mr-2"></i>' : '';
                let oddsColor = bet.type === 'combine' ? 'text-purple-400' : 'text-ice';

                if (bet.status === 'pending') {
                    statusBadge = `<span class="bg-yellow-500/20 text-yellow-500 px-2 py-0.5 rounded text-[8px] font-black uppercase border border-yellow-500/50 animate-pulse whitespace-nowrap">En Cours</span>`;
                    actionBtns = `
                        <button onclick="updateBetStatus('${bet.id}', 'won')" class="w-7 h-7 md:w-8 md:h-8 rounded-full bg-gray-900 border border-green-500 text-green-500 hover:bg-green-500 hover:text-white transition shadow-inner flex items-center justify-center"><i class="fas fa-check text-[10px] md:text-xs"></i></button>
                        <button onclick="updateBetStatus('${bet.id}', 'lost')" class="w-7 h-7 md:w-8 md:h-8 rounded-full bg-gray-900 border border-red-500 text-red-500 hover:bg-red-500 hover:text-white transition shadow-inner flex items-center justify-center"><i class="fas fa-times text-[10px] md:text-xs"></i></button>
                    `;
                } else if (bet.status === 'won') {
                    borderCol = 'border-green-500 shadow-[0_0_10px_rgba(74,222,128,0.1)]';
                    statusBadge = `<span class="bg-green-500/20 text-green-400 px-2 py-0.5 rounded text-[8px] font-black uppercase border border-green-500/50 whitespace-nowrap">Gagné</span>`;
                    actionBtns = `<span class="text-green-400 font-black text-xs md:text-sm drop-shadow-[0_0_5px_#4ADE80]">+${((bet.odds * bet.stake) - bet.stake).toFixed(2)}€</span>`;
                } else {
                    borderCol = 'border-red-500/50';
                    statusBadge = `<span class="bg-red-500/10 text-red-500 px-2 py-0.5 rounded text-[8px] font-black uppercase border border-red-500/30 whitespace-nowrap">Perdu</span>`;
                    actionBtns = `<span class="text-red-500 font-black text-xs md:text-sm">-${bet.stake.toFixed(2)}€</span>`;
                }

                html += `
                    <div class="bg-gray-950 p-3 md:p-4 rounded-lg border ${borderCol} flex flex-col md:flex-row justify-between md:items-center gap-3 md:gap-0 group relative overflow-hidden transition-all">
                        <div class="flex justify-between items-start md:w-1/2">
                            <div class="flex flex-col overflow-hidden pr-2">
                                <span class="text-white font-black text-[10px] md:text-sm uppercase tracking-widest truncate w-full" title="${bet.target}">${typeIcon}${bet.target}</span>
                                <span class="text-[8px] md:text-[10px] text-gray-500 uppercase font-bold tracking-widest mt-0.5 truncate">${bet.date} • ${bet.market}</span>
                            </div>
                            <div class="md:hidden">${statusBadge}</div>
                        </div>
                        
                        <div class="flex justify-between items-end md:items-center md:w-1/2 border-t border-gray-800 pt-2 md:border-t-0 md:pt-0">
                            <div class="hidden md:block w-1/4 text-center">${statusBadge}</div>
                            <div class="flex flex-col md:items-center w-1/2 md:w-1/4">
                                <span class="${oddsColor} font-black text-xs md:text-sm">@${bet.odds.toFixed(2)}</span>
                                <span class="text-[8px] text-gray-500 uppercase font-bold tracking-widest">Mise: ${bet.stake.toFixed(2)}€</span>
                            </div>
                            <div class="flex items-center justify-end gap-2 w-1/2 md:w-1/2">
                                ${actionBtns}
                                <button onclick="deleteBet('${bet.id}')" class="text-gray-600 hover:text-red-500 transition ml-2 md:ml-4 flex items-center justify-center p-1"><i class="fas fa-trash-alt text-[10px] md:text-xs"></i></button>
                            </div>
                        </div>
                    </div>
                `;
            });

            list.innerHTML = html;
            updatePortfolioStats();
        };

        window.updatePortfolioStats = function () {
            let totalProfit = 0;
            let totalInvested = 0;
            let wonBets = 0;
            let completedBets = 0;

            let chartLabels = ["Départ"];
            let chartData = [0]; // On commence à 0 de bénéfice
            let currentProfitTracker = 0;

            // On trie du plus ancien au plus récent pour le graphique
            let chronologicBets = [...window.userPortfolio].sort((a, b) => a.id - b.id);

            chronologicBets.forEach((bet, index) => {
                if (bet.status !== 'pending') {
                    completedBets++;
                    totalInvested += bet.stake;

                    if (bet.status === 'won') {
                        wonBets++;
                        let profit = (bet.odds * bet.stake) - bet.stake;
                        totalProfit += profit;
                        currentProfitTracker += profit;
                    } else {
                        totalProfit -= bet.stake;
                        currentProfitTracker -= bet.stake;
                    }

                    chartLabels.push("P" + (index + 1));
                    chartData.push(currentProfitTracker);
                }
            });

            // Mise à jour des textes
            let profitEl = document.getElementById('pf-profit');
            profitEl.innerText = totalProfit.toFixed(2) + ' €';
            profitEl.className = totalProfit >= 0 ? "text-xl md:text-2xl font-black text-green-400 drop-shadow-[0_0_5px_#4ADE80]" : "text-xl md:text-2xl font-black text-red-500";

            let roi = totalInvested > 0 ? (totalProfit / totalInvested) * 100 : 0;
            let roiEl = document.getElementById('pf-roi');
            roiEl.innerText = roi.toFixed(2) + '%';
            roiEl.className = roi >= 0 ? "text-xl md:text-2xl font-black text-green-400" : "text-xl md:text-2xl font-black text-red-500";

            let hitRate = completedBets > 0 ? (wonBets / completedBets) * 100 : 0;
            document.getElementById('pf-hitrate').innerText = hitRate.toFixed(1) + '%';

            // Mise à jour du Graphique
            drawRealBankrollChart(chartLabels, chartData, currentProfitTracker >= 0);
        };

        window.drawRealBankrollChart = function (labels, data, isPositive) {
            const ctx = document.getElementById('realBankrollChart').getContext('2d');

            if (window.realBankrollChartInstance) {
                window.realBankrollChartInstance.destroy();
            }

            let lineColor = isPositive ? '#4ADE80' : '#EF4444';
            let bgColor = isPositive ? 'rgba(74, 222, 128, 0.2)' : 'rgba(239, 68, 68, 0.2)';

            window.realBankrollChartInstance = new Chart(ctx, {
                type: 'line',
                data: {
                    labels: labels,
                    datasets: [{
                        label: 'Bénéfice Net (€)',
                        data: data,
                        borderColor: lineColor,
                        backgroundColor: bgColor,
                        borderWidth: 3,
                        fill: true,
                        tension: 0.3
                    }]
                },
                options: {
                    responsive: true, maintainAspectRatio: false,
                    // FIX MOBILE : L'info-bulle s'affiche uniquement au clic
                    interaction: { mode: 'nearest', intersect: true },
                    plugins: { legend: { display: false } },
                    scales: {
                        y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#9ca3af' } },
                        x: { grid: { display: false }, ticks: { display: false } }
                    },
                    elements: { point: { radius: 2, hoverRadius: 8, backgroundColor: lineColor } }
                }
            });
        };

        // --- EXPORT & IMPORT (JSON) ---
        window.exportPortfolio = function () {
            if (window.userPortfolio.length === 0) { alert("Votre portefeuille est vide."); return; }
            const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(window.userPortfolio));
            const downloadAnchorNode = document.createElement('a');
            downloadAnchorNode.setAttribute("href", dataStr);
            downloadAnchorNode.setAttribute("download", "hockai_portfolio_" + new Date().toISOString().split('T')[0] + ".json");
            document.body.appendChild(downloadAnchorNode);
            downloadAnchorNode.click();
            downloadAnchorNode.remove();
        };

        window.importPortfolio = function (event) {
            const file = event.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = function (e) {
                try {
                    const importedBets = JSON.parse(e.target.result);
                    if (Array.isArray(importedBets)) {
                        window.userPortfolio = importedBets;
                        savePortfolioLocally();
                        renderPortfolio();
                        alert("Portefeuille importé avec succès !");
                    } else { alert("Format de fichier invalide."); }
                } catch (err) { alert("Erreur lors de la lecture du fichier."); }
            };
            reader.readAsText(file);
        };