// ==========================================
        // MOTEUR MONTE CARLO (100% Dynamique & Explicatif)
        // ==========================================

        window.animateValue = function (id, start, end, duration) {
            if (start === end) return;
            var range = end - start;
            var current = start;
            var increment = end > start ? 100 : -100;
            var stepTime = Math.abs(Math.floor(duration / (range / 100)));
            var obj = document.getElementById(id);
            if (!obj) return;
            var timer = setInterval(function () {
                current += increment;
                if (obj) obj.innerHTML = current.toLocaleString('fr-FR');
                if (current >= end) {
                    clearInterval(timer);
                    if (obj) obj.innerHTML = end.toLocaleString('fr-FR');
                }
            }, stepTime);
        };

        window.openMonteCarlo = async function (home, away, date) {
            try {
                let mcCont = document.getElementById('mc-matches-container');
                let dashCont = document.getElementById('mc-dashboard-container');

                if (mcCont) mcCont.classList.add('hidden');
                if (dashCont) {
                    dashCont.classList.remove('hidden');
                    dashCont.style.display = 'block';
                }

                // 1. L'ANIMATION DU COMPTEUR
                dashCont.innerHTML = `
                    <div class="flex justify-between items-center mb-6">
                        <button onclick="closeMonteCarlo()" class="bg-gray-900 hover:bg-gray-800 text-white px-4 py-2 rounded-lg text-[10px] md:text-xs font-black uppercase tracking-widest transition border border-gray-700 flex items-center gap-2 shadow-lg">
                            <i class="fas fa-arrow-left text-pink-500"></i> Retour
                        </button>
                    </div>
                    <div id="mc-dynamic-header" class="mb-6 md:mb-8 w-full">
                        <div class="glass-panel p-8 text-center border-t-4 border-pink-500 relative overflow-hidden flex flex-col items-center justify-center shadow-[0_0_20px_rgba(236,72,153,0.2)] rounded-xl w-full">
                            <div class="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-10"></div>
                            <h3 class="text-2xl md:text-4xl font-black text-white mb-2 uppercase tracking-widest z-10">${away} @ ${home}</h3>
                            <div class="text-pink-500 text-5xl md:text-7xl font-black font-mono my-4 z-10 drop-shadow-[0_0_15px_#EC4899]" id="mc-counter">0</div>
                            <div class="text-gray-400 tracking-widest uppercase font-bold text-[10px] md:text-sm bg-gray-900 px-6 py-2 rounded-full border border-gray-700 z-10 shadow-lg">
                                <i class="fas fa-microchip mr-2 text-pink-500 animate-pulse"></i>Mondes Parallèles Explorés
                            </div>
                        </div>
                    </div>
                    <div id="mc-stats-grid" class="hidden grid-cols-1 lg:grid-cols-3 gap-6 w-full"></div>
                    <div id="mc-info-modal" class="fixed inset-0 bg-black/90 z-[150] hidden items-center justify-center p-4 backdrop-blur-sm"><div class="bg-gray-900 border border-gray-700 rounded-xl shadow-[0_0_30px_rgba(236,72,153,0.3)] max-w-sm w-full overflow-hidden"><div class="p-4 border-b border-gray-800 flex justify-between items-center bg-gray-950"><h3 class="text-white font-black uppercase tracking-widest text-[10px] md:text-sm flex items-center" id="mc-info-title">Information</h3><button onclick="closeMCInfo()" class="text-gray-500 hover:text-pink-500 text-2xl transition hover:rotate-90 leading-none">&times;</button></div><div class="p-5 md:p-6" id="mc-info-content"></div></div></div>
                `;

                window.animateValue("mc-counter", 0, 10000, 1000);

                let cleanDate = date.split('T')[0];
                const res = await fetch(`${API_BASE}/monte_carlo/${home}/${away}/${cleanDate}`);
                const data = await res.json();

                setTimeout(() => {
                    let header = document.getElementById('mc-dynamic-header');
                    let statsGrid = document.getElementById('mc-stats-grid');

                    if (data.status === "error") {
                        if (header) header.innerHTML = `<div class="text-red-500 font-bold text-center py-6 glass-panel p-6 border-red-500 shadow-[0_0_20px_#ef4444]">${data.message}</div>`;
                        return;
                    }

                    let hLogo = typeof getLogoUrl === 'function' ? getLogoUrl(home) : `https://assets.nhle.com/logos/nhl/svg/${home}_light.svg`;
                    let aLogo = typeof getLogoUrl === 'function' ? getLogoUrl(away) : `https://assets.nhle.com/logos/nhl/svg/${away}_light.svg`;

                    if (header) {
                        header.innerHTML = `
                            <div class="flex justify-center items-center gap-6 md:gap-12 bg-gray-900/50 p-4 md:p-6 rounded-xl border border-gray-800 shadow-inner relative overflow-hidden w-full">
                                <div class="absolute inset-0 bg-gradient-to-r from-pink-500/5 via-transparent to-pink-500/5"></div>
                                <div class="text-center flex flex-col items-center z-10 w-1/3">
                                    <img src="${aLogo}" onerror="this.src='assets/logo_hockAI.png'" class="w-12 h-12 md:w-24 md:h-24 object-contain mb-2 md:mb-3 drop-shadow-[0_0_10px_rgba(255,255,255,0.2)] transform hover:scale-110 transition">
                                    <span class="text-[10px] md:text-xl font-black text-white uppercase tracking-widest">${away}</span>
                                </div>
                                <div class="text-pink-500 italic font-black text-xl md:text-4xl drop-shadow-[0_0_10px_#EC4899] z-10">VS</div>
                                <div class="text-center flex flex-col items-center z-10 w-1/3">
                                    <img src="${hLogo}" onerror="this.src='assets/logo_hockAI.png'" class="w-12 h-12 md:w-24 md:h-24 object-contain mb-2 md:mb-3 drop-shadow-[0_0_10px_rgba(255,255,255,0.2)] transform hover:scale-110 transition">
                                    <span class="text-[10px] md:text-xl font-black text-white uppercase tracking-widest">${home}</span>
                                </div>
                            </div>
                        `;
                    }

                    let hProb = (data.win_prob && data.win_prob.home) ? data.win_prob.home : 50;
                    let aProb = (data.win_prob && data.win_prob.away) ? data.win_prob.away : 50;
                    let maxProb = Math.max(hProb, aProb);
                    let favTeam = hProb > aProb ? home : away;

                    let ouLine = data.over_under ? data.over_under.line : 5.5;
                    let overProb = data.over_under ? data.over_under.over_prob : 50;
                    let underProb = data.over_under ? data.over_under.under_prob : 50;

                    let hColor = hProb >= 55 ? 'bg-pink-500 shadow-[0_0_10px_#EC4899]' : 'bg-yellow-500';
                    let aColor = aProb >= 55 ? 'bg-pink-500 shadow-[0_0_10px_#EC4899]' : 'bg-gray-600';

                    if (statsGrid) {
                        statsGrid.classList.remove('hidden');
                        statsGrid.style.display = 'grid';
                        // ON A RAJOUTÉ LES ICÔNES D'INFORMATION DANS LES TITRES
                        statsGrid.innerHTML = `
                            <div class="glass-panel p-5 md:p-6 border-t-4 border-pink-500 shadow-[0_0_20px_rgba(236,72,153,0.15)] flex flex-col gap-6 rounded-xl w-full">
                                <h3 class="text-white font-black uppercase tracking-widest text-[10px] md:text-sm border-b border-gray-800 pb-2 flex justify-between items-center">
                                    <span class="flex items-center"><i class="fas fa-balance-scale text-pink-500 mr-2"></i>Probabilités</span>
                                    <i class="fas fa-info-circle text-gray-500 hover:text-pink-500 cursor-pointer text-lg transition" onclick="openMCInfo('probs')"></i>
                                </h3>
                                <div class="flex flex-col gap-4">
                                    <div class="relative bg-gray-950 p-4 rounded-lg border border-gray-800 shadow-inner group">
                                        ${aProb >= 60 ? '<span class="absolute -top-3 -right-2 bg-red-600 text-white text-[7px] md:text-[9px] font-black px-2 py-0.5 rounded border border-red-400 shadow-[0_0_10px_#ff3333] z-20 animate-bounce"><i class="fas fa-fire"></i> STRONG PICK</span>' : ''}
                                        <div class="flex justify-between items-center mb-3">
                                            <div class="flex items-center gap-2"><img src="${aLogo}" onerror="this.src='assets/logo_hockAI.png'" class="w-6 h-6 object-contain"><span class="text-white font-black text-[11px] uppercase">${away}</span></div>
                                            <span class="text-xl font-black ${aProb >= 55 ? 'text-pink-500' : 'text-gray-400'}">${aProb.toFixed(1)}%</span>
                                        </div>
                                        <div class="w-full h-2 bg-gray-900 rounded-full flex overflow-hidden border border-gray-700"><div class="${aColor} h-full transition-all duration-1000 ease-out" style="width: ${aProb}%"></div></div>
                                    </div>
                                    <div class="relative bg-gray-950 p-4 rounded-lg border border-gray-800 shadow-inner group">
                                        ${hProb >= 60 ? '<span class="absolute -top-3 -right-2 bg-red-600 text-white text-[7px] md:text-[9px] font-black px-2 py-0.5 rounded border border-red-400 shadow-[0_0_10px_#ff3333] z-20 animate-bounce"><i class="fas fa-fire"></i> STRONG PICK</span>' : ''}
                                        <div class="flex justify-between items-center mb-3">
                                            <div class="flex items-center gap-2"><img src="${hLogo}" onerror="this.src='assets/logo_hockAI.png'" class="w-6 h-6 object-contain"><span class="text-white font-black text-[11px] uppercase">${home}</span></div>
                                            <span class="text-xl font-black ${hProb >= 55 ? 'text-pink-500' : 'text-gray-400'}">${hProb.toFixed(1)}%</span>
                                        </div>
                                        <div class="w-full h-2 bg-gray-900 rounded-full flex overflow-hidden border border-gray-700"><div class="${hColor} h-full transition-all duration-1000 ease-out" style="width: ${hProb}%"></div></div>
                                    </div>
                                </div>
                            </div>
                            
                            <div class="flex flex-col gap-6 w-full">
                                <div class="glass-panel p-5 md:p-6 border-t-4 border-blue-500 shadow-[0_0_20px_rgba(59,130,246,0.15)] rounded-xl flex-1">
                                    <h3 class="text-white font-black uppercase tracking-widest text-[10px] md:text-sm border-b border-gray-800 pb-2 mb-4 flex justify-between items-center">
                                        <span class="flex items-center"><i class="fas fa-arrows-alt-v text-blue-500 mr-2"></i>Total Buts (O/U)</span>
                                        <i class="fas fa-info-circle text-gray-500 hover:text-blue-500 cursor-pointer text-lg transition" onclick="openMCInfo('ou')"></i>
                                    </h3>
                                    <div class="text-center mb-5"><span class="text-2xl md:text-4xl font-black text-white bg-gray-900 px-6 py-2 md:py-3 rounded-xl border border-gray-700 shadow-inner inline-block">${ouLine} Buts</span></div>
                                    <div class="flex justify-between items-center bg-gray-950 p-3 md:p-4 rounded-xl border border-gray-800 shadow-inner">
                                        <div class="text-center w-1/2 border-r border-gray-800 pr-2"><div class="text-[9px] text-gray-400 uppercase font-black mb-1">OVER</div><div class="text-xl font-black ${overProb > 50 ? 'text-blue-400' : 'text-gray-500'}">${overProb.toFixed(1)}%</div></div>
                                        <div class="text-center w-1/2 pl-2"><div class="text-[9px] text-gray-400 uppercase font-black mb-1">UNDER</div><div class="text-xl font-black ${underProb > 50 ? 'text-red-400' : 'text-gray-500'}">${underProb.toFixed(1)}%</div></div>
                                    </div>
                                </div>
                                <div class="bg-gradient-to-br from-gray-900 to-black border border-green-500/50 p-5 md:p-6 rounded-xl shadow-lg relative overflow-hidden">
                                    <div class="absolute -right-4 -top-4 opacity-10 text-6xl text-green-500"><i class="fas fa-calculator"></i></div>
                                    <h6 class="text-[10px] text-green-500 uppercase font-black tracking-widest mb-4 flex justify-between items-center">
                                        <span class="flex items-center"><i class="fas fa-search-dollar mr-1"></i> Radar Value Bet</span>
                                        <i class="fas fa-info-circle text-green-700 hover:text-green-400 cursor-pointer text-sm transition" onclick="openMCInfo('ev')"></i>
                                    </h6>
                                    <div class="flex items-center justify-between gap-3 mb-4 relative z-10">
                                        <span class="text-[9px] text-gray-300 font-bold uppercase tracking-widest">Cote :</span>
                                        <input type="number" id="mc-ev-odds-input" oninput="calculateMCRealTimeEV()" step="0.01" placeholder="ex: 1.85" class="bg-gray-800 border border-gray-600 text-white font-black rounded-lg w-20 p-2 text-center focus:outline-none focus:border-green-500">
                                        <input type="hidden" id="mc-ev-prob-input" value="${maxProb}">
                                    </div>
                                    <div id="mc-ev-result-display" class="text-center p-3 bg-gray-950 rounded border border-gray-800 relative z-10"><span class="text-gray-500 text-[9px] uppercase font-bold tracking-widest"><i class="fas fa-keyboard animate-pulse text-green-500 mr-1"></i> Cote pour ${favTeam} ?</span></div>
                                </div>
                            </div>

                            <div class="glass-panel p-5 md:p-6 border-t-4 border-purple-500 shadow-[0_0_20px_rgba(168,85,247,0.15)] rounded-xl w-full">
                                <h3 class="text-white font-black uppercase tracking-widest text-[10px] md:text-sm border-b border-gray-800 pb-2 mb-4 flex justify-between items-center">
                                    <span class="flex items-center"><i class="fas fa-bullseye text-purple-500 mr-2"></i>Scores Exacts</span>
                                    <i class="fas fa-info-circle text-gray-500 hover:text-purple-500 cursor-pointer text-lg transition" onclick="openMCInfo('scores')"></i>
                                </h3>
                                <div id="mc-scores" class="space-y-3"></div>
                            </div>

                            <div class="glass-panel p-4 md:p-6 border border-gray-800 lg:col-span-3 rounded-xl shadow-lg mt-2 w-full">
                                <h3 class="text-white font-black uppercase tracking-widest text-[10px] md:text-sm mb-4 flex justify-between items-center">
                                    <span class="flex items-center"><i class="fas fa-chart-area text-pink-500 mr-2"></i>Courbe de Gauss</span>
                                    <i class="fas fa-info-circle text-gray-500 hover:text-pink-500 cursor-pointer text-lg transition" onclick="openMCInfo('gauss')"></i>
                                </h3>
                                <div class="relative w-full h-[200px] md:h-[300px]" id="mc-chart-container"><canvas id="mcChart"></canvas></div>
                            </div>
                        `;

                        if (data.exact_scores) {
                            let scoresHtml = '';
                            data.exact_scores.forEach((sc, i) => {
                                let isTop = i === 0;
                                scoresHtml += `
                                    <div class="relative flex justify-between items-center p-2 md:p-4 rounded-xl border ${isTop ? 'bg-purple-900/30 border-purple-500 shadow-[0_0_15px_rgba(168,85,247,0.3)] transform scale-[1.02]' : 'bg-gray-950 border-gray-800 hover:border-gray-600'} mb-2">
                                        ${isTop ? '<i class="fas fa-crown text-yellow-500 absolute -top-2 -left-2 text-lg drop-shadow-[0_0_5px_#eab308] rotate-[-15deg]"></i>' : `<span class="text-gray-600 font-black text-[9px] mr-2">#${i + 1}</span>`}
                                        <div class="flex items-center gap-2 w-full justify-center ${isTop ? 'ml-2' : ''}"><span class="font-black text-white text-lg w-6 text-right">${sc.away}</span><span class="text-[10px] text-gray-600 italic font-black">-</span><span class="font-black text-white text-lg w-6 text-left">${sc.home}</span></div>
                                        <div class="bg-black/80 px-2 py-1 rounded-lg border border-gray-700 shadow-inner"><span class="text-xs font-black ${isTop ? 'text-purple-400' : 'text-gray-400'}">${sc.prob.toFixed(1)}%</span></div>
                                    </div>`;
                            });
                            document.getElementById('mc-scores').innerHTML = scoresHtml;
                        }

                        let chartContainer = document.getElementById('mc-chart-container');
                        if (chartContainer && data.goal_distribution) {
                            chartContainer.innerHTML = '<canvas id="mcChart"></canvas>';
                            const ctx = document.getElementById('mcChart').getContext('2d');
                            let gradient = ctx.createLinearGradient(0, 0, 0, 300);
                            gradient.addColorStop(0, 'rgba(236, 72, 153, 0.4)');
                            gradient.addColorStop(1, 'rgba(236, 72, 153, 0)');

                            window.myMonteCarloChart = new Chart(ctx, {
                                type: 'line',
                                data: { labels: Object.keys(data.goal_distribution), datasets: [{ label: 'Probabilité (%)', data: Object.values(data.goal_distribution), borderColor: '#EC4899', backgroundColor: gradient, borderWidth: 2, fill: true, tension: 0.4, pointBackgroundColor: '#EC4899', pointBorderColor: '#fff', pointRadius: 3 }] },
                                options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { display: false, beginAtZero: true }, x: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#9CA3AF', font: { weight: 'bold', size: 10 } } } } }
                            });
                        }
                    }

                }, 1200);

            } catch (e) {
                console.error(e);
            }
        };

        window.closeMonteCarlo = function () {
            let dc = document.getElementById('mc-dashboard-container');
            let mc = document.getElementById('mc-matches-container');
            if (dc) dc.classList.add('hidden');
            if (mc) mc.classList.remove('hidden');
        };

        window.calculateMCRealTimeEV = function () {
            const probStr = document.getElementById('mc-ev-prob-input').value;
            const oddsStr = document.getElementById('mc-ev-odds-input').value;
            const display = document.getElementById('mc-ev-result-display');
            if (!probStr || !oddsStr) {
                display.innerHTML = `<span class="text-gray-500 text-[9px] uppercase font-bold tracking-widest"><i class="fas fa-keyboard animate-pulse text-green-500 mr-1"></i> Saisissez la cote</span>`;
                return;
            }
            const ev = ((parseFloat(probStr) / 100) * parseFloat(oddsStr)) - 1;
            if (ev > 0) display.innerHTML = `<div class="text-green-500 font-black text-lg drop-shadow-[0_0_5px_#4ADE80]">+${(ev * 100).toFixed(2)}% EV</div><div class="text-[7px] text-green-400 uppercase font-bold mt-1">Value Bet <i class="fas fa-check-circle"></i></div>`;
            else display.innerHTML = `<div class="text-red-500 font-black text-lg">${(ev * 100).toFixed(2)}% EV</div><div class="text-[7px] text-red-400 uppercase font-bold mt-1">Pari à éviter <i class="fas fa-times-circle"></i></div>`;
        };

        // GESTION DES EXPLICATIONS (MODAL INFO)
        window.openMCInfo = function (type) {
            const modal = document.getElementById('mc-info-modal');
            const title = document.getElementById('mc-info-title');
            const content = document.getElementById('mc-info-content');

            if (!modal) return;

            let data = {
                'probs': {
                    icon: '<i class="fas fa-balance-scale text-pink-500 mr-2"></i>',
                    title: 'Probabilités de Victoire',
                    text: "L'intelligence artificielle a simulé ce match <b>10 000 fois</b> de manière mathématique.<br><br>Le pourcentage indique le nombre de victoires obtenues dans ces mondes parallèles. Un badge <b class='text-red-500'>🔥 STRONG PICK</b> apparaît si l'IA est mathématiquement certaine de son choix (domination de plus de 60%)."
                },
                'ou': {
                    icon: '<i class="fas fa-arrows-alt-v text-blue-500 mr-2"></i>',
                    title: 'Total de Buts (O/U)',
                    text: "L'IA additionne les buts des deux équipes à la fin de chaque simulation.<br><br>Si le <b>OVER (Plus)</b> est à 60%, cela signifie que dans 6 000 scénarios virtuels sur 10 000, le match s'est terminé avec plus de buts que la ligne habituelle des bookmakers (5.5 buts en NHL)."
                },
                'ev': {
                    icon: '<i class="fas fa-search-dollar text-green-500 mr-2"></i>',
                    title: 'Radar à Value Bet (+EV)',
                    text: "L'Expected Value (Espérance de gain) est l'arme secrète des parieurs professionnels.<br><br>Saisissez la cote proposée par votre bookmaker. Si le pourcentage de l'IA combiné à la cote de votre bookmaker donne un résultat <b class='text-green-500'>positif (+EV)</b>, le bookmaker a fait une erreur de calcul : c'est un pari extrêmement rentable sur le long terme."
                },
                'scores': {
                    icon: '<i class="fas fa-bullseye text-purple-500 mr-2"></i>',
                    title: 'Scores Exacts',
                    text: "Voici les 5 scores finaux qui se sont produits le plus souvent lors des 10 000 simulations.<br><br>Bien que deviner un score exact au hockey soit extrêmement complexe, le top de ce classement vous donne une excellente indication sur la physionomie du match (match serré, festival offensif, domination absolue...)."
                },
                'gauss': {
                    icon: '<i class="fas fa-chart-area text-pink-500 mr-2"></i>',
                    title: 'Courbe de Gauss (Poisson)',
                    text: "La Distribution de Poisson.<br><br>L'axe du bas indique le nombre total de buts dans le match, et l'axe vertical la probabilité que cela arrive. Le <b>sommet du graphique (le pic)</b> vous montre le scénario de buts le plus probable.<br><br>Plus la courbe est haute et pointue, plus l'IA est convaincue que le match se terminera exactement sur ce chiffre !"
                }
            };

            if (data[type]) {
                title.innerHTML = data[type].icon + data[type].title;
                content.innerHTML = `<p class='text-gray-300 text-sm md:text-base leading-relaxed text-justify'>${data[type].text}</p>`;
                modal.classList.remove('hidden');
                modal.classList.add('flex');
            }
        };

        window.closeMCInfo = function () {
            const modal = document.getElementById('mc-info-modal');
            if (modal) {
                modal.classList.add('hidden');
                modal.classList.remove('flex');
            }
        };