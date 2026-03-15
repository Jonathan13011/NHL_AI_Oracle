// ==========================================
        // 1. ARÈNE DES DUELS (PREMIUM V7: MOTEUR PHOTOS PERFORMANCES)
        // ==========================================
        window.duelSearchTimeouts = { 1: null, 2: null };
        window.selectedDuelPlayers = { 1: null, 2: null };
        window.duelTrueHeadshots = { 1: null, 2: null }; // Cache pour les vraies photos
        window.duelRadarChart = null;

        window.searchDuel = function (query, playerNum) {
            clearTimeout(window.duelSearchTimeouts[playerNum]);
            let resultsContainer = document.getElementById(`duel-res-${playerNum}`);

            if (!query || query.length < 2) {
                if (resultsContainer) resultsContainer.classList.add('hidden');
                return;
            }

            window.duelSearchTimeouts[playerNum] = setTimeout(async () => {
                try {
                    if (resultsContainer) {
                        resultsContainer.innerHTML = '<div class="p-3 text-gray-400 italic text-center text-sm font-bold">Recherche dans la base...</div>';
                        resultsContainer.classList.remove('hidden');
                    }

                    const res = await fetch(`${API_BASE}/autocomplete?q=${encodeURIComponent(query)}`);
                    const data = await res.json();

                    if (resultsContainer) {
                        if (data.status === 'success' && data.data && data.data.length > 0) {
                            resultsContainer.innerHTML = '';
                            data.data.forEach(p => {
                                let div = document.createElement('div');
                                div.className = "p-3 hover:bg-gray-700 cursor-pointer border-b border-gray-600 flex justify-between items-center transition";
                                div.innerHTML = `<span class="font-bold text-white text-sm">${p.name}</span><span class="text-[10px] bg-gray-900 px-2 py-1 rounded text-gray-400 uppercase tracking-widest">${p.team} - ${p.position}</span>`;
                                div.onclick = () => window.selectDuelPlayer(p, playerNum);
                                resultsContainer.appendChild(div);
                            });
                        } else {
                            resultsContainer.innerHTML = '<div class="p-3 text-gray-500 italic text-center text-sm">Joueur introuvable</div>';
                        }
                    }
                } catch (e) { console.error(e); }
            }, 300);
        };

        window.selectDuelPlayer = async function (player, playerNum) {
            document.getElementById(`duel-search-${playerNum}`).value = player.name;
            let resultsContainer = document.getElementById(`duel-res-${playerNum}`);
            if (resultsContainer) resultsContainer.classList.add('hidden');

            window.selectedDuelPlayers[playerNum] = player.id;
            window.duelTrueHeadshots[playerNum] = null; // Réinitialise le cache photo

            let card = document.getElementById(`duel-card-${playerNum}`);
            let img = document.getElementById(`duel-img-${playerNum}`);
            let nameEl = document.getElementById(`duel-name-${playerNum}`);
            let teamEl = document.getElementById(`duel-team-${playerNum}`);

            if (card && img && nameEl && teamEl) {
                // 1. Affichage immédiat avec le logo par défaut pour masquer la silhouette
                img.src = "assets/logo_hockAI.png";
                nameEl.innerText = player.name;
                teamEl.innerText = `${player.team} • ${player.position}`;
                card.classList.remove('hidden');
                card.classList.add('flex');

                // 2. MÉTHODE "PERFORMANCES" : On interroge le dashboard pour la vraie photo HD !
                try {
                    const res = await fetch(`${API_BASE}/player_dashboard/${player.id}`);
                    const data = await res.json();
                    if (data.status === 'success' && data.player && data.player.headshot) {
                        img.src = data.player.headshot;
                        window.duelTrueHeadshots[playerNum] = data.player.headshot;
                    }
                } catch (e) { console.error("Erreur photo duel", e); }
            }
        };

        document.addEventListener('click', function (e) {
            for (let i = 1; i <= 2; i++) {
                let input = document.getElementById(`duel-search-${i}`);
                let res = document.getElementById(`duel-res-${i}`);
                if (input && res && !input.contains(e.target) && !res.contains(e.target)) {
                    res.classList.add('hidden');
                }
            }
        });

        window.generateRandomDuel = async function () {
            let btn = document.querySelector('button[onclick="generateRandomDuel()"] i');
            if (btn) btn.classList.add('fa-spin');

            if (typeof window.globalPredictionsPool === 'undefined' || window.globalPredictionsPool.length === 0) {
                try {
                    const res = await fetch(`${API_BASE}/predict_all`);
                    const data = await res.json();
                    window.globalPredictionsPool = data.global_predictions || [];
                } catch (e) { }
            }

            let validPlayers = window.globalPredictionsPool.filter(p => p.position !== 'G' && isDateMatch(p.match_date) && p.prob_point > 20);

            if (validPlayers.length < 2) {
                if (btn) btn.classList.remove('fa-spin');
                alert("Pas assez de joueurs actifs pour un choc aléatoire. Vérifiez le filtre Temporel.");
                return;
            }

            validPlayers.sort(() => 0.5 - Math.random());
            let p1 = validPlayers[0];
            let p2 = validPlayers.find(p => p.team !== p1.team) || validPlayers[1];

            document.getElementById('duel-search-1').value = "Chargement...";
            document.getElementById('duel-search-2').value = "Chargement...";

            setTimeout(async () => {
                await window.selectDuelPlayer(p1, 1);
                await window.selectDuelPlayer(p2, 2);

                const weapons = ['prob_point', 'prob_goal', 'prob_assist'];
                document.getElementById('duel-weapon').value = weapons[Math.floor(Math.random() * weapons.length)];

                if (btn) btn.classList.remove('fa-spin');
                window.launchDuel();
            }, 600);
        };

        window.launchDuel = async function () {
            let name1 = document.getElementById('duel-search-1').value.trim();
            let name2 = document.getElementById('duel-search-2').value.trim();
            let weapon = document.getElementById('duel-weapon').value;

            if (!name1 || !name2) { alert("Veuillez sélectionner les noms des deux joueurs."); return; }

            if (typeof showFullScreenLoader === 'function') {
                let weaponName = weapon === 'prob_goal' ? 'Buteur' : (weapon === 'prob_assist' ? 'Passeur' : 'Pointeur');
                showFullScreenLoader("Arène des Duels", `Calcul de la domination ${weaponName} : ${name1} VS ${name2}...`, false);
            }

            let arenaResult = document.getElementById('duel-results');
            if (arenaResult) arenaResult.classList.add('hidden');

            let id1 = window.selectedDuelPlayers[1];
            let id2 = window.selectedDuelPlayers[2];

            const fetchId = async (playerName) => {
                try {
                    const res = await fetch(`${API_BASE}/autocomplete?q=${encodeURIComponent(playerName)}`);
                    const data = await res.json();
                    if (data.data && data.data.length > 0) return data.data[0].id;
                } catch (e) { } return null;
            };

            if (!id1) id1 = await fetchId(name1);
            if (!id2) id2 = await fetchId(name2);

            if (!id1 || !id2) {
                if (typeof hideFullScreenLoader === 'function') hideFullScreenLoader();
                alert(`Impossible de trouver un des joueurs.`); return;
            }
            if (id1 === id2) {
                if (typeof hideFullScreenLoader === 'function') hideFullScreenLoader();
                alert("Un joueur ne peut pas s'affronter lui-même !"); return;
            }

            try {
                const res = await fetch(`${API_BASE}/duel/${id1}/${id2}`);
                const data = await res.json();

                if (typeof window.globalPredictionsPool === 'undefined' || window.globalPredictionsPool.length === 0) {
                    const poolRes = await fetch(`${API_BASE}/predict_all`);
                    const poolData = await poolRes.json();
                    window.globalPredictionsPool = poolData.global_predictions || [];
                }

                let p1Full = window.globalPredictionsPool.find(p => String(p.id) === String(id1) || p.name === name1) || data.fighter1;
                let p2Full = window.globalPredictionsPool.find(p => String(p.id) === String(id2) || p.name === name2) || data.fighter2;

                // ASSURANCE PHOTO FINALE (Même méthode que la section Performances)
                let trueHeadshot1 = window.duelTrueHeadshots[1];
                if (!trueHeadshot1) {
                    try {
                        let r1 = await fetch(`${API_BASE}/player_dashboard/${id1}`);
                        let d1 = await r1.json();
                        if (d1.status === 'success' && d1.player) trueHeadshot1 = d1.player.headshot;
                    } catch (e) { }
                }

                let trueHeadshot2 = window.duelTrueHeadshots[2];
                if (!trueHeadshot2) {
                    try {
                        let r2 = await fetch(`${API_BASE}/player_dashboard/${id2}`);
                        let d2 = await r2.json();
                        if (d2.status === 'success' && d2.player) trueHeadshot2 = d2.player.headshot;
                    } catch (e) { }
                }

                if (typeof hideFullScreenLoader === 'function') hideFullScreenLoader();

                let prob1 = p1Full[weapon] || 0.1;
                let prob2 = p2Full[weapon] || 0.1;
                let totalProb = prob1 + prob2;

                let winPct1 = ((prob1 / totalProb) * 100).toFixed(1);
                let winPct2 = ((prob2 / totalProb) * 100).toFixed(1);

                let winText = "";
                let winReason = "";
                let weaponLabel = weapon === 'prob_goal' ? 'Marquer un But' : (weapon === 'prob_assist' ? 'Faire une Passe' : 'Faire un Point');

                if (parseFloat(winPct1) > parseFloat(winPct2)) {
                    winText = `VAINQUEUR : <span class="text-ice drop-shadow-[0_0_15px_#00e5ff]">${p1Full.name}</span>`;
                    winReason = `<i class="fas fa-crosshairs text-ice mr-2"></i> Sur le marché "<strong>${weaponLabel}</strong>", l'algorithme donne un avantage mathématique à ${p1Full.name} face à ${p2Full.name}.`;
                } else if (parseFloat(winPct2) > parseFloat(winPct1)) {
                    winText = `VAINQUEUR : <span class="text-blood drop-shadow-[0_0_15px_#ff3333]">${p2Full.name}</span>`;
                    winReason = `<i class="fas fa-crosshairs text-blood mr-2"></i> Sur le marché "<strong>${weaponLabel}</strong>", l'algorithme donne un avantage mathématique à ${p2Full.name} face à ${p1Full.name}.`;
                } else {
                    winText = `<span class="text-gray-400">ÉGALITÉ PARFAITE</span>`;
                    winReason = "Les deux joueurs ont des probabilités mathématiquement identiques sur cette condition de victoire.";
                }

                let img1 = trueHeadshot1 || p1Full.headshot || data.fighter1.headshot || "assets/logo_hockAI.png";
                let img2 = trueHeadshot2 || p2Full.headshot || data.fighter2.headshot || "assets/logo_hockAI.png";

                let opp1 = p1Full.match ? p1Full.match.replace(p1Full.team, '').replace('vs', '').replace('@', '').trim() : (data.fighter1.opp || "Adversaire");
                let opp2 = p2Full.match ? p2Full.match.replace(p2Full.team, '').replace('vs', '').replace('@', '').trim() : (data.fighter2.opp || "Adversaire");

                if (arenaResult) {
                    arenaResult.innerHTML = `
                        <div class="absolute inset-0 bg-black/50 z-0"></div>
                        <div class="w-full flex flex-col items-center relative z-10 p-2">
                            
                            <div class="w-full max-w-4xl bg-gray-900 h-6 rounded-full mb-12 flex overflow-hidden border-2 border-gray-700 shadow-[0_0_20px_rgba(0,0,0,0.8)] relative mt-4">
                                <div class="absolute inset-0 bg-black/40 z-10 pointer-events-none" style="background-image: repeating-linear-gradient(45deg, transparent, transparent 10px, rgba(255,255,255,0.05) 10px, rgba(255,255,255,0.05) 20px);"></div>
                                <div class="h-full bg-ice transition-all duration-1500 ease-out z-0 shadow-[0_0_15px_#00e5ff]" style="width: ${winPct1}%;"></div>
                                <div class="h-full bg-blood transition-all duration-1500 ease-out z-0 shadow-[0_0_15px_#ff3333]" style="width: ${winPct2}%;"></div>
                                <div class="absolute top-0 bottom-0 left-1/2 w-1 bg-white z-20 transform -translate-x-1/2"></div>
                            </div>

                            <div class="flex flex-col md:flex-row justify-between w-full max-w-4xl relative mb-10 gap-4">
                                <div class="text-center w-full md:w-5/12 bg-gradient-to-t from-ice/20 to-transparent p-6 rounded-xl border-b-4 border-ice transform transition hover:scale-105 shadow-lg">
                                    <img src="${img1}" onerror="this.src='assets/logo_hockAI.png'" class="w-32 h-32 mx-auto rounded-full border-4 border-ice shadow-[0_0_20px_#00e5ff] object-cover mb-4 bg-gray-900">
                                    <h3 class="text-2xl font-black text-white uppercase tracking-widest mb-1">${p1Full.name}</h3>
                                    <div class="text-xs text-ice font-bold uppercase mb-4">Affronte : <span class="text-white">${opp1}</span></div>
                                    <div class="text-5xl font-black text-ice drop-shadow-[0_0_10px_#00e5ff]">${winPct1}%</div>
                                </div>

                                <div class="w-full md:w-2/12 flex items-center justify-center relative py-4">
                                    <i class="fas fa-bolt text-6xl text-yellow-400 animate-pulse drop-shadow-[0_0_20px_#FACC15] absolute z-10"></i>
                                </div>

                                <div class="text-center w-full md:w-5/12 bg-gradient-to-t from-blood/20 to-transparent p-6 rounded-xl border-b-4 border-blood transform transition hover:scale-105 shadow-lg">
                                    <img src="${img2}" onerror="this.src='assets/logo_hockAI.png'" class="w-32 h-32 mx-auto rounded-full border-4 border-blood shadow-[0_0_20px_#ff3333] object-cover mb-4 bg-gray-900">
                                    <h3 class="text-2xl font-black text-white uppercase tracking-widest mb-1">${p2Full.name}</h3>
                                    <div class="text-xs text-blood font-bold uppercase mb-4">Affronte : <span class="text-white">${opp2}</span></div>
                                    <div class="text-5xl font-black text-blood drop-shadow-[0_0_10px_#ff3333]">${winPct2}%</div>
                                </div>
                            </div>

                            <div class="w-full max-w-4xl bg-gray-900 p-8 rounded-xl border border-gray-700 shadow-2xl relative overflow-hidden mb-8 text-center">
                                <div class="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-ice via-purple-500 to-blood"></div>
                                <h4 class="text-xs text-gray-500 font-black uppercase tracking-widest mb-3"><i class="fas fa-brain text-purple-400 mr-2"></i>Verdict de l'Oracle</h4>
                                <h3 class="text-3xl font-black text-white uppercase mb-4">${winText}</h3>
                                <p class="text-lg leading-relaxed font-bold text-gray-300 mb-2">${winReason}</p>
                                <p class="text-sm italic text-gray-500">${data.verdict || data.reason || ""}</p>
                            </div>

                            <div class="w-full max-w-4xl bg-gray-900/80 p-6 rounded-xl border border-gray-700 shadow-inner mb-6 relative">
                                <h4 class="text-white font-black mb-4 uppercase tracking-widest border-b border-gray-700 pb-2 text-center">
                                    <i class="fas fa-spider text-gray-400 mr-2"></i>Radar de Combat (Moteur d'Intelligence)
                                </h4>
                                <div class="relative w-full h-80">
                                    <canvas id="duel-radar-chart"></canvas>
                                </div>
                            </div>

                            <button id="btn-export-duel" onclick="exportDuelImage()" class="mt-4 bg-gray-800 hover:bg-white hover:text-black border border-gray-600 text-white px-6 py-3 rounded-lg text-sm font-black uppercase tracking-widest shadow-[0_0_15px_rgba(255,255,255,0.1)] transition hover:scale-105 flex items-center gap-2 z-20 relative">
                                <i class="fas fa-camera text-ice drop-shadow-[0_0_5px_#00e5ff]"></i> Exporter l'Affiche
                            </button>
                        </div>
                    `;

                    arenaResult.classList.remove('hidden');
                    arenaResult.classList.add('flex');

                    setTimeout(() => {
                        const getRecent = (p, key) => p.last_5_games ? p.last_5_games.reduce((s, g) => s + g[key], 0) : 0;
                        const getToi = (p) => p.toi_avg ? parseFloat(p.toi_avg) : 10;

                        let p1Gls = getRecent(p1Full, 'goals') * 20;
                        let p1Sht = getRecent(p1Full, 'shots') * 5;
                        let p1Toi = getToi(p1Full) * 4;
                        let p1Adv = p1Full.is_home ? 100 : 40;
                        let p1Pwr = prob1 * 1.5;

                        let p2Gls = getRecent(p2Full, 'goals') * 20;
                        let p2Sht = getRecent(p2Full, 'shots') * 5;
                        let p2Toi = getToi(p2Full) * 4;
                        let p2Adv = p2Full.is_home ? 100 : 40;
                        let p2Pwr = prob2 * 1.5;

                        if (window.duelRadarChart) window.duelRadarChart.destroy();
                        let ctx = document.getElementById('duel-radar-chart').getContext('2d');

                        Chart.defaults.color = '#9CA3AF';
                        Chart.defaults.font.family = 'Montserrat';

                        window.duelRadarChart = new Chart(ctx, {
                            type: 'radar',
                            data: {
                                labels: ['Forme Buteur (L5)', 'Volume Tirs (L5)', 'Temps de Glace', 'Condition Arme (IA)', 'Avantage Domicile'],
                                datasets: [
                                    {
                                        label: p1Full.name,
                                        data: [p1Gls, p1Sht, p1Toi, p1Pwr, p1Adv],
                                        backgroundColor: 'rgba(0, 229, 255, 0.3)',
                                        borderColor: '#00e5ff',
                                        pointBackgroundColor: '#00e5ff',
                                        borderWidth: 2,
                                        pointRadius: 4
                                    },
                                    {
                                        label: p2Full.name,
                                        data: [p2Gls, p2Sht, p2Toi, p2Pwr, p2Adv],
                                        backgroundColor: 'rgba(255, 51, 51, 0.3)',
                                        borderColor: '#ff3333',
                                        pointBackgroundColor: '#ff3333',
                                        borderWidth: 2,
                                        pointRadius: 4
                                    }
                                ]
                            },
                            options: {
                                responsive: true,
                                maintainAspectRatio: false,
                                scales: {
                                    r: {
                                        angleLines: { color: 'rgba(255,255,255,0.1)' },
                                        grid: { color: 'rgba(255,255,255,0.1)' },
                                        ticks: { display: false, min: 0, max: 100 },
                                        pointLabels: { color: '#ccc', font: { size: 10, weight: 'bold' } }
                                    }
                                },
                                plugins: {
                                    legend: { position: 'top', labels: { color: '#fff', font: { weight: 'bold' } } },
                                    tooltip: { enabled: false }
                                }
                            }
                        });
                    }, 200);
                }

            } catch (e) {
                console.error(e);
                if (typeof hideFullScreenLoader === 'function') hideFullScreenLoader();
                alert("Erreur serveur lors du calcul du duel.");
            }
        };

        window.exportDuelImage = async function () {
            if (typeof html2canvas === 'undefined') { alert("Erreur module photo."); return; }
            let container = document.getElementById('duel-results');
            if (!container) return;

            if (typeof showFullScreenLoader === 'function') showFullScreenLoader("Génération de l'Affiche", "Développement HD en cours...", false);

            let btn = document.getElementById('btn-export-duel');
            if (btn) btn.style.display = 'none';

            let watermark = document.createElement('div');
            watermark.innerHTML = '<span style="color:#ef4444; font-weight:900; font-size:12px; letter-spacing: 2px; text-shadow: 0 0 10px #000;">⚡ L\'ARÈNE HOCKAI</span>';
            watermark.style.position = 'absolute'; watermark.style.bottom = '15px'; watermark.style.right = '20px'; watermark.style.zIndex = '50'; watermark.id = 'temp-duel-watermark';
            container.appendChild(watermark);

            // --- L'ARME ULTIME : PYTHON + BASE64 ---
            let images = container.querySelectorAll('img');
            let originalSrcs = [];

            for (let i = 0; i < images.length; i++) {
                let img = images[i];
                originalSrcs[i] = img.src;
                
                // Si c'est une image de joueur de la NHL
                if (img.src.startsWith('http') && img.src.includes('nhle.com')) {
                    try {
                        // LA BONNE ADRESSE EST ICI : proxy-image-base64
                        let res = await fetch(API_BASE + '/proxy-image-base64?url=' + encodeURIComponent(img.src));
                        let data = await res.json();
                        if (data.base64) {
                            img.src = data.base64; // Remplacement par le texte Base64
                        }
                    } catch (e) {
                        console.error("Erreur proxy Python:", e);
                    }
                }
            }

            // Petite pause de sécurité pour afficher le Base64
            await new Promise(resolve => setTimeout(resolve, 500));
            // ---------------------------------------

            html2canvas(container, { 
                backgroundColor: '#0a0f1a', 
                scale: 2, 
                useCORS: true,
                logging: false
            }).then(canvas => {
                images.forEach((img, index) => { img.src = originalSrcs[index]; });
                if (btn) btn.style.display = '';
                let wm = document.getElementById('temp-duel-watermark'); if (wm) wm.remove();
                
                let link = document.createElement('a'); 
                link.download = 'HOCKAI_Duel.png'; 
                link.href = canvas.toDataURL('image/png'); 
                link.click();
                if (typeof hideFullScreenLoader === 'function') hideFullScreenLoader();
            }).catch(err => {
                images.forEach((img, index) => { img.src = originalSrcs[index]; });
                if (btn) btn.style.display = '';
                let wm = document.getElementById('temp-duel-watermark'); if (wm) wm.remove();
                console.error(err); 
                if (typeof hideFullScreenLoader === 'function') hideFullScreenLoader(); 
                alert("Erreur d'exportation.");
            });
        };