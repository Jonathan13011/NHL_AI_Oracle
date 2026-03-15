// ==========================================
        // MOTEUR LABO DE CHIMIE (Swipe iPhone & LNH Live)
        // ==========================================
        window.laboLine = [null, null, null, null, null]; // 0,1,2 = FWD, 3,4 = DEF
        window.currentLaboRoster = [];

        window.updateLaboMatchSelector = async function () {
            let container = document.getElementById('labo-match-selector');
            if (!container) return;

            if (typeof window.fetchedMatchesPool === 'undefined' || window.fetchedMatchesPool.length === 0) {
                if (typeof window.fetchMatches === 'function') await window.fetchMatches(true);
            }

            let unfinishedMatches = (window.fetchedMatchesPool || []).filter(m => m.state !== 'FINAL' && m.state !== 'OFF');
            let activeDates = window.selectedFilterDates || [];
            let validMatches = [];

            if (activeDates.length > 0) {
                validMatches = unfinishedMatches.filter(m => activeDates.includes(m.date.split('T')[0]));
            } else if (unfinishedMatches.length > 0) {
                unfinishedMatches.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
                let targetDateStr = unfinishedMatches[0].date.split('T')[0];
                validMatches = unfinishedMatches.filter(m => m.date.split('T')[0] === targetDateStr);
            }

            if (validMatches.length === 0) {
                container.innerHTML = '<span class="text-gray-500 text-xs italic font-bold">Aucun match disponible à cette date.</span>';
                return;
            }

            container.innerHTML = '';
            validMatches.forEach(m => {
                let hLogo = typeof getLogoUrl === 'function' ? getLogoUrl(m.home_team) : "assets/logo_hockAI.png";
                let aLogo = typeof getLogoUrl === 'function' ? getLogoUrl(m.away_team) : "assets/logo_hockAI.png";

                // Nouvelle carte Verticale très élégante
                container.innerHTML += `
                    <div onclick="window.selectLaboMatch('${m.home_team}', '${m.away_team}')" class="flex items-center justify-between p-4 rounded-xl border border-gray-800 bg-gray-900/80 hover:bg-gray-800 hover:border-lab cursor-pointer transition-all transform hover:-translate-y-1 shadow-lg w-full group">
                        <div class="flex items-center gap-3 w-[40%]">
                            <img src="${aLogo}" onerror="this.src='assets/logo_hockAI.png'" class="w-10 h-10 object-contain drop-shadow-md">
                            <span class="text-sm md:text-base font-black text-white uppercase group-hover:text-lab transition">${m.away_team}</span>
                        </div>
                        <div class="text-gray-600 font-black italic text-xs">@</div>
                        <div class="flex items-center justify-end gap-3 w-[40%]">
                            <span class="text-sm md:text-base font-black text-white uppercase group-hover:text-lab transition">${m.home_team}</span>
                            <img src="${hLogo}" onerror="this.src='assets/logo_hockAI.png'" class="w-10 h-10 object-contain drop-shadow-md">
                        </div>
                        <i class="fas fa-chevron-right text-gray-700 group-hover:text-lab ml-2 transition"></i>
                    </div>
                `;
            });
        };

        window.selectLaboMatch = function (home, away) {
            let step1 = document.getElementById('labo-step-1');
            let step2 = document.getElementById('labo-step-2');

            window.currentLaboHome = home;
            window.currentLaboAway = away;
            let titleAway = document.getElementById('auto-title-away');
            let titleHome = document.getElementById('auto-title-home');
            if (titleAway) titleAway.innerText = away + " (EXT)";
            if (titleHome) titleHome.innerText = home + " (DOM)";

            step1.classList.add('opacity-0', '-translate-x-full');

            setTimeout(() => {
                step1.classList.add('hidden');
                step2.classList.remove('hidden');
                setTimeout(() => {
                    step2.classList.remove('opacity-0', 'translate-x-full');
                    step2.classList.add('opacity-100', 'translate-x-0');
                }, 50);

                let hLogo = typeof getLogoUrl === 'function' ? getLogoUrl(home) : "assets/logo_hockAI.png";
                let aLogo = typeof getLogoUrl === 'function' ? getLogoUrl(away) : "assets/logo_hockAI.png";

                document.getElementById('labo-team-toggles').innerHTML = `
                    <button onclick="window.fetchTeamRoster('${away}')" class="flex-1 bg-gray-800 hover:bg-gray-700 border border-gray-600 p-2 rounded-lg flex flex-col items-center transition focus:border-lab focus:bg-lab/20 shadow-inner">
                        <img src="${aLogo}" onerror="this.src='assets/logo_hockAI.png'" class="w-8 h-8 object-contain mb-1">
                        <span class="text-[9px] font-black text-white uppercase">${away}</span>
                    </button>
                    <button onclick="window.fetchTeamRoster('${home}')" class="flex-1 bg-gray-800 hover:bg-gray-700 border border-gray-600 p-2 rounded-lg flex flex-col items-center transition focus:border-lab focus:bg-lab/20 shadow-inner">
                        <img src="${hLogo}" onerror="this.src='assets/logo_hockAI.png'" class="w-8 h-8 object-contain mb-1">
                        <span class="text-[9px] font-black text-white uppercase">${home}</span>
                    </button>
                `;

                window.fetchTeamRoster(away);
            }, 300);
        };

        // ANIMATION SWIPE : Retour à l'Étape 1
        window.laboGoToStep1 = function () {
            let step1 = document.getElementById('labo-step-1');
            let step2 = document.getElementById('labo-step-2');

            step2.classList.remove('opacity-100', 'translate-x-0');
            step2.classList.add('opacity-0', 'translate-x-full');

            setTimeout(() => {
                step2.classList.add('hidden');
                step1.classList.remove('hidden');

                setTimeout(() => {
                    step1.classList.remove('opacity-0', '-translate-x-full');
                    step1.classList.add('opacity-100', 'translate-x-0');
                }, 50);
            }, 300);
        };

        // CONNEXION À LA LNH
        window.fetchTeamRoster = async function (team) {
            let list = document.getElementById('labo-roster-list');
            list.innerHTML = `<div class="text-center text-lab py-12"><i class="fas fa-circle-notch fa-spin text-3xl mb-3 drop-shadow-[0_0_10px_#A855F7]"></i><p class="text-xs uppercase tracking-widest font-bold">Liaison LNH en cours...</p></div>`;

            try {
                const res = await fetch(`${API_BASE}/team_roster/${team}`);
                const data = await res.json();

                if (data.status === "error") { list.innerHTML = `<div class="text-red-500 text-xs text-center font-bold p-4">${data.message}</div>`; return; }

                window.currentLaboRoster = data.roster;
                window.renderLaboRoster(data.roster);
            } catch (e) { list.innerHTML = `<div class="text-red-500 text-xs text-center p-4">Erreur Réseau</div>`; }
        };

        window.renderLaboRoster = function (roster) {
            let list = document.getElementById('labo-roster-list');
            list.innerHTML = '';

            let search = document.getElementById('labo-player-search').value.toLowerCase();
            let filtered = roster.filter(p => p.player_name.toLowerCase().includes(search));

            let fwd = filtered.filter(p => ['C', 'L', 'R', 'W', 'F'].includes(p.position));
            let def = filtered.filter(p => p.position === 'D');

            const createPlayerChip = (p, colorClass, icon) => `
                <button onclick="addPlayerToLine('${p.player_name.replace(/'/g, "\\'")}', '${p.position}')" class="w-full text-left bg-gray-900 border border-gray-700 hover:border-${colorClass} p-3 rounded-lg flex items-center justify-between group transition hover:-translate-y-0.5 shadow-md">
                    <div>
                        <span class="text-white font-black text-[11px] md:text-sm block group-hover:text-${colorClass} transition">${p.player_name}</span>
                        <span class="text-gray-500 text-[9px] font-bold uppercase tracking-widest">${p.position === 'D' ? 'Défenseur' : 'Attaquant'}</span>
                    </div>
                    <div class="bg-gray-800 p-2 rounded-full group-hover:bg-${colorClass}/20 transition">
                        <i class="fas ${icon} text-gray-500 group-hover:text-${colorClass}"></i>
                    </div>
                </button>
            `;

            if (fwd.length > 0) {
                list.innerHTML += `<div class="text-[10px] text-lab font-black uppercase tracking-widest mt-2 mb-2 px-2"><i class="fas fa-fire mr-1"></i> Attaquants</div>`;
                fwd.forEach(p => list.innerHTML += createPlayerChip(p, 'lab', 'fa-fire'));
            }
            if (def.length > 0) {
                list.innerHTML += `<div class="text-[10px] text-blue-400 font-black uppercase tracking-widest mt-4 mb-2 px-2"><i class="fas fa-shield-alt mr-1"></i> Défenseurs</div>`;
                def.forEach(p => list.innerHTML += createPlayerChip(p, 'blue-400', 'fa-shield-alt'));
            }
        };

        window.filterLaboRoster = function () {
            window.renderLaboRoster(window.currentLaboRoster);
        };

        window.autoFillLine = async function (type, btn) {
            let originalHTML = btn.innerHTML;
            btn.innerHTML = `<i class="fas fa-spinner fa-spin text-white"></i>`;

            // L'IA détecte quelle équipe on cible et quel type de ligne on veut
            let isAway = type.includes('away');
            let isVariance = type.includes('variance');
            let teamToQuery = isAway ? window.currentLaboAway : window.currentLaboHome;

            try {
                const res = await fetch(`${API_BASE}/team_lines/${teamToQuery}`);
                const data = await res.json();

                if (data.status === "success") {
                    // On injecte le Trio et la Paire Défensive sur la glace !
                    window.laboLine = isVariance ? data.variance : data.top;
                    window.updateLaboUI();
                    document.getElementById('labo-results').classList.add('hidden');

                    // On bascule instantanément le vestiaire sur l'équipe choisie
                    window.fetchTeamRoster(teamToQuery);
                } else {
                    alert("Stats LNH indisponibles pour le moment.");
                }
            } catch (e) {
                console.error(e);
            }
            btn.innerHTML = originalHTML;
        };

        window.addPlayerToLine = function (name, position) {
            let isDef = position === 'D';
            let targetSlot = -1;

            if (!isDef) {
                if (!window.laboLine[0]) targetSlot = 0;
                else if (!window.laboLine[1]) targetSlot = 1;
                else if (!window.laboLine[2]) targetSlot = 2;
            } else {
                if (!window.laboLine[3]) targetSlot = 3;
                else if (!window.laboLine[4]) targetSlot = 4;
            }

            if (targetSlot !== -1) {
                window.laboLine[targetSlot] = name;
                window.updateLaboUI();
            } else {
                alert(isDef ? "La défense est pleine ! Touchez un joueur sur la glace pour le retirer." : "L'attaque est pleine ! Touchez un joueur sur la glace pour le retirer.");
            }
        };

        window.removeLaboPlayer = function (index) {
            window.laboLine[index] = null;
            window.updateLaboUI();
            document.getElementById('labo-results').classList.add('hidden');
        };

        window.updateLaboUI = function () {
            const positions = ["Ailier G.", "Centre", "Ailier D.", "Défenseur G.", "Défenseur D."];
            for (let i = 0; i < 5; i++) {
                let slot = document.getElementById(`labo-slot-${i}`);
                if (window.laboLine[i]) {
                    let color = i < 3 ? 'text-lab border-lab bg-lab/10' : 'text-blue-400 border-blue-400 bg-blue-400/10';
                    slot.className = `labo-slot relative border-2 ${color} w-[70px] h-[85px] md:w-24 md:h-28 rounded-lg flex flex-col items-center justify-center cursor-pointer shadow-[0_0_15px_currentColor] transition hover:bg-red-900/50 hover:border-red-500 hover:text-red-500 group ${i === 1 ? 'transform -translate-y-3 md:-translate-y-6' : ''}`;

                    let nameParts = window.laboLine[i].split(' ');
                    let shortName = nameParts.length > 1 ? nameParts[1] : nameParts[0];

                    slot.innerHTML = `
                        <i class="fas fa-times absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition text-[10px]"></i>
                        <i class="fas ${i < 3 ? 'fa-fire' : 'fa-shield-alt'} text-sm md:text-xl mb-1 opacity-50"></i>
                        <span class="text-[9px] md:text-[11px] font-black uppercase text-center px-1 leading-tight text-white">${shortName}</span>
                    `;
                } else {
                    let color = i < 3 ? 'border-lab/50' : 'border-blue-400/50';
                    slot.className = `labo-slot relative border-2 border-dashed ${color} w-[70px] h-[85px] md:w-24 md:h-28 rounded-lg flex flex-col items-center justify-center bg-black/60 cursor-pointer hover:border-white transition ${i === 1 ? 'transform -translate-y-3 md:-translate-y-6' : ''}`;
                    slot.innerHTML = `<span class="text-gray-600 text-[8px] md:text-[9px] font-black uppercase tracking-widest text-center px-1">${positions[i]}</span>`;
                }
            }
        };

        window.analyzeLaboLine = async function () {
            let container = document.getElementById('labo-results');
            let activePlayers = window.laboLine.filter(p => p !== null);

            if (activePlayers.length === 0) {
                alert("Placez au moins un joueur sur la glace !");
                return;
            }

            container.innerHTML = `<div class="text-lab font-bold text-center py-6 animate-pulse"><i class="fas fa-flask text-3xl mb-2 block"></i>Réaction chimique en cours...</div>`;
            container.classList.remove('hidden');

            try {
                const res = await fetch(`${API_BASE}/analyze_line`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ players: activePlayers })
                });
                const data = await res.json();

                if (data.status === "error") { container.innerHTML = `<div class="text-red-500 font-bold">${data.message}</div>`; return; }

                let colorMap = { "green-400": "#4ADE80", "yellow-400": "#FACC15", "orange-500": "#F97316", "red-500": "#EF4444" };
                let hexColor = colorMap[data.color] || "#A855F7";

                container.innerHTML = `
                    <div class="flex flex-col md:flex-row items-center gap-6 p-2">
                        <div class="w-full md:w-1/3 flex flex-col items-center">
                            <div class="relative">
                                <svg class="w-32 h-32 md:w-40 md:h-40" viewBox="0 0 36 36">
                                    <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="#1f2937" stroke-width="3"/>
                                    <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="${hexColor}" stroke-width="3" stroke-dasharray="${Math.min(100, data.xg * 30)}, 100" class="animate-[dash_2s_ease-out]"/>
                                </svg>
                                <div class="absolute inset-0 flex flex-col items-center justify-center">
                                    <span class="text-3xl font-black" style="color: ${hexColor}">${data.grade}</span>
                                    <span class="text-[8px] text-gray-400 uppercase tracking-widest font-black">Note Globale</span>
                                </div>
                            </div>
                        </div>
                        <div class="w-full md:w-2/3 flex flex-col gap-4">
                            <div class="grid grid-cols-2 gap-4">
                                <div class="bg-black/50 p-4 rounded-xl border border-gray-800 shadow-inner">
                                    <div class="text-[9px] md:text-[10px] text-gray-500 uppercase tracking-widest mb-1"><i class="fas fa-bullseye text-red-500 mr-1"></i> Expected Goals</div>
                                    <div class="text-2xl md:text-3xl font-black text-red-500 drop-shadow-md">${data.xg} <span class="text-[10px] text-gray-500 font-normal">buts/match</span></div>
                                </div>
                                <div class="bg-black/50 p-4 rounded-xl border border-gray-800 shadow-inner">
                                    <div class="text-[9px] md:text-[10px] text-gray-500 uppercase tracking-widest mb-1"><i class="fas fa-bolt text-ice mr-1"></i> Potentiel</div>
                                    <div class="text-2xl md:text-3xl font-black text-ice drop-shadow-md">${Math.min(99, data.xg * 25).toFixed(1)}%</div>
                                </div>
                            </div>
                            <div class="text-xs md:text-sm text-gray-300 p-4 bg-gray-950 rounded-xl border border-gray-800 shadow-inner leading-relaxed">
                                <i class="fas fa-robot text-lab mr-2"></i> ${data.analysis}
                            </div>
                        </div>
                    </div>
                `;
            } catch (e) {
                container.innerHTML = `<div class="text-red-500 font-bold text-center">Erreur L'Oracle</div>`;
            }
        };

        // Initialize au clic sur l'onglet
        let laboTabBtn = document.querySelector('button[onclick*="tab-labo"]');
        if (laboTabBtn) laboTabBtn.addEventListener('click', () => { window.updateLaboMatchSelector(); });