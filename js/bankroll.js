// ==========================================
// MOTEUR BANKROLL & MONTANTE IA
// ==========================================
window.globalBankroll = [];

window.loadBankroll = async function () {
    try {
        // ANTI-CACHE : On force le navigateur à recharger la vraie base de données
        let res = await fetch(`${API_BASE}/bankroll?timestamp=${new Date().getTime()}`, { cache: 'no-store' });
        let data = await res.json();
        if (data.status === 'success') {
            window.globalBankroll = data.bets;
            if (typeof updateBankrollDashboard === 'function') updateBankrollDashboard();
            if (typeof updateMontanteModule === 'function') updateMontanteModule();
            if (typeof renderBetHistory === 'function') renderBetHistory();
        }
    } catch (e) {
        console.error("Erreur chargement Bankroll", e);
    }
};

window.addBetToBankroll = async function (category, description, odds, stake) {
    // 📡 RADAR GOOGLE : Pari ajouté au coffre
    if (typeof gtag === 'function') {
        gtag('event', 'ajout_coffre_fort', {
            'categorie_pari': category
        });
    }
    let bet = {
        date: new Date().toISOString(),
        category: category,
        description: description,
        odds: parseFloat(odds),
        stake: parseFloat(stake),
        status: "PENDING"
    };
    await fetch(`${API_BASE}/bankroll`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bet)
    });
    alert("Ticket sauvegardé dans le Coffre-Fort !");
    window.loadBankroll();
};

window.changeBetStatus = async function (id, status) {
    await fetch(`${API_BASE}/bankroll/${id}/${status}`, { method: 'PUT' });
    window.loadBankroll();
};

window.deleteBet = async function (btnElement, id) {
    if (confirm("Supprimer ce pari de l'historique ?")) {

        // 1. Suppression visuelle ABSOLUE (Ciblage physique du parent)
        let card = btnElement.closest('.bg-gray-900');

        if (card) {
            card.style.transition = 'all 0.3s ease';
            card.style.opacity = '0';
            card.style.transform = 'scale(0.9) translateX(50px)';
            setTimeout(() => { card.remove(); }, 300);
        }

        // 2. Mise à jour de la mémoire JavaScript
        window.globalBankroll = window.globalBankroll.filter(b => String(b.id) !== String(id));

        // 3. Mise à jour des bilans et de la montante sans recharger la page
        if (typeof updateBankrollDashboard === 'function') updateBankrollDashboard();
        if (typeof updateMontanteModule === 'function') updateMontanteModule();

        // 4. Suppression silencieuse dans la base de données Python
        try {
            await fetch(`${API_BASE}/bankroll/${id}`, { method: 'DELETE' });
        } catch (e) { console.error("Erreur serveur", e); }
    }
};

// --- LE CERVEAU FINANCIER (DOUBLE BILAN) ---
function updateBankrollDashboard() {
    let statsCombo = { inv: 0, ret: 0, won: 0, res: 0 };
    let statsSimple = { inv: 0, ret: 0, won: 0, res: 0 };

    window.globalBankroll.forEach(b => {
        if (b.status === "PENDING") return; // On ne compte pas les paris en cours

        // Détection de l'IA : C'est un pari "Simple" SI la cote est >= 2.00 ET qu'il contient "1 Sélection"
        let desc = b.description || "";
        let match = desc.match(/\((\d+)\s+Sélection/i);
        let numSelections = match ? parseInt(match[1]) : 1;

        // Si ce n'est pas un ticket généré par l'IA, on regarde si c'est un pari simple manuel
        let isSimple = (numSelections === 1 && b.odds >= 2.00);

        let target = isSimple ? statsSimple : statsCombo;

        target.inv += b.stake;
        target.res++;
        if (b.status === "WON") {
            target.ret += (b.stake * b.odds);
            target.won++;
        }
    });

    // Fonction de mise à jour de l'interface visuelle
    const updateUI = (prefix, stats) => {
        let profit = stats.ret - stats.inv;
        let roi = stats.inv > 0 ? (profit / stats.inv) * 100 : 0;
        let winrate = stats.res > 0 ? (stats.won / stats.res) * 100 : 0;

        let elProfit = document.getElementById(`br-profit-${prefix}`);
        if (elProfit) {
            elProfit.innerText = (profit >= 0 ? '+' : '') + profit.toFixed(2) + ' €';
            elProfit.className = `text-xl md:text-2xl font-black ${profit >= 0 ? 'text-money drop-shadow-[0_0_10px_#22c55e]' : 'text-blood drop-shadow-[0_0_10px_#ff3333]'}`;
        }

        let elRoi = document.getElementById(`br-roi-${prefix}`);
        if (elRoi) elRoi.innerText = roi.toFixed(1) + ' %';

        let elWinrate = document.getElementById(`br-winrate-${prefix}`);
        if (elWinrate) elWinrate.innerText = winrate.toFixed(1) + ' %';

        let elInv = document.getElementById(`br-invested-${prefix}`);
        if (elInv) elInv.innerText = stats.inv.toFixed(2) + ' €';
    };

    // On met à jour les deux tableaux en direct
    updateUI('combo', statsCombo);
    updateUI('simple', statsSimple);
}

// --- MODULE MONTANTE (CALCULATEUR DE COUVERTURE) ---
function updateMontanteModule() {
    let consecutiveLosses = 0;

    // On cherche les pertes consécutives depuis le dernier pari terminé
    for (let i = 0; i < window.globalBankroll.length; i++) {
        let b = window.globalBankroll[i];
        if (b.status === "PENDING") continue;
        if (b.status === "WON") break; // On s'arrête au dernier pari gagnant
        if (b.status === "LOST") consecutiveLosses += b.stake;
    }

    document.getElementById('montante-losses').innerText = consecutiveLosses.toFixed(2) + ' €';
    window.currentMontanteLosses = consecutiveLosses;
    calculateMontanteStake(); // Met à jour le calculateur avec la valeur par défaut
}

window.calculateMontanteStake = function () {
    let odds = parseFloat(document.getElementById('montante-odds').value);
    let targetProfit = parseFloat(document.getElementById('montante-profit').value) || 0;
    let resBox = document.getElementById('montante-result');

    if (window.currentMontanteLosses === 0 && targetProfit === 0) {
        resBox.innerHTML = `<span class="text-green-400 font-bold"><i class="fas fa-check-circle"></i> Aucune perte à couvrir.</span>`;
        return;
    }

    if (!odds || odds <= 1) {
        resBox.innerHTML = `<span class="text-gray-500 italic">Entrez une cote valide (> 1.0)</span>`;
        return;
    }

    // FORMULE MAGIQUE : Mise = (Pertes + Bénéfice Souhaité) / (Cote - 1)
    let requiredStake = (window.currentMontanteLosses + targetProfit) / (odds - 1);

    resBox.innerHTML = `
        <div class="text-[10px] text-gray-400 uppercase tracking-widest font-bold mb-1">Mise Recommandée par l'IA :</div>
        <div class="text-3xl font-black text-ice drop-shadow-[0_0_10px_#00e5ff] animate-pulse">${requiredStake.toFixed(2)} €</div>
        <div class="text-[9px] text-gray-500 mt-2">En gagnant, vous récupérez vos ${window.currentMontanteLosses.toFixed(2)}€ perdus ${targetProfit > 0 ? 'et ferez ' + targetProfit + '€ de bénéfice' : 'exactement'}.</div>
    `;
};

// --- RENDU VISUEL DE L'HISTORIQUE ---
function renderBetHistory() {
    let container = document.getElementById('bankroll-history');
    container.innerHTML = '';

    if (window.globalBankroll.length === 0) {
        container.innerHTML = `<div class="text-center p-10 text-gray-500 font-bold italic">Le coffre-fort est vide. Sauvegardez un ticket !</div>`;
        return;
    }

    window.globalBankroll.forEach(b => {
        let dateStr = new Date(b.date).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

        let statusHtml = '';
        if (b.status === "PENDING") statusHtml = `<div class="flex gap-2"><button onclick="changeBetStatus(${b.id}, 'WON')" class="bg-green-500/20 text-green-400 border border-green-500 px-3 py-1 rounded text-xs font-black hover:bg-green-500 hover:text-black transition"><i class="fas fa-check"></i></button><button onclick="changeBetStatus(${b.id}, 'LOST')" class="bg-red-500/20 text-red-500 border border-red-500 px-3 py-1 rounded text-xs font-black hover:bg-red-500 hover:text-white transition"><i class="fas fa-times"></i></button></div>`;
        else if (b.status === "WON") statusHtml = `<span class="text-green-400 font-black text-sm drop-shadow-[0_0_5px_#22c55e]"><i class="fas fa-check-circle"></i> GAGNÉ (+${(b.stake * b.odds - b.stake).toFixed(2)}€)</span>`;
        else statusHtml = `<span class="text-red-500 font-black text-sm drop-shadow-[0_0_5px_#ff3333]"><i class="fas fa-times-circle"></i> PERDU (-${b.stake.toFixed(2)}€)</span>`;

        // NOUVEAU : Ajout de l'ID 'bet-card-${b.id}' et des classes de transition CSS (transition-all duration-300 transform)
        container.innerHTML += `
            <div id="bet-card-${b.id}" class="bg-gray-900 border border-gray-800 p-4 rounded-xl shadow-md flex flex-col md:flex-row justify-between items-center gap-4 relative transition-all duration-300 transform origin-left">
                <button onclick="window.deleteBet(this, ${b.id})" class="absolute top-2 right-2 text-gray-600 hover:text-blood transition z-50"><i class="fas fa-trash-alt"></i></button>
                <div class="flex-1 w-full">
                    <div class="text-[10px] text-gray-500 font-black tracking-widest uppercase mb-1">${dateStr} • ${b.category}</div>
                    <div class="text-white font-bold text-sm">${b.description}</div>
                </div>
                <div class="flex items-center gap-6 w-full md:w-auto bg-black p-3 rounded-lg border border-gray-800">
                    <div class="text-center"><div class="text-[10px] text-gray-500 uppercase tracking-widest font-bold">Cote</div><div class="text-yellow-500 font-black">${b.odds.toFixed(2)}</div></div>
                    <div class="text-center"><div class="text-[10px] text-gray-500 uppercase tracking-widest font-bold">Mise</div><div class="text-white font-black">${b.stake.toFixed(2)}€</div></div>
                </div>
                <div class="w-full md:w-48 flex justify-center md:justify-end">
                    ${statusHtml}
                </div>
            </div>
        `;
    });
}

// ==========================================
// SAISIE MANUELLE & BARRE DE RECHERCHE INTELLIGENTE V2
// ==========================================
const NHL_TEAMS_LIST = [
    "Anaheim Ducks", "Boston Bruins", "Buffalo Sabres", "Carolina Hurricanes", "Columbus Blue Jackets",
    "Calgary Flames", "Chicago Blackhawks", "Colorado Avalanche", "Dallas Stars", "Detroit Red Wings",
    "Edmonton Oilers", "Florida Panthers", "Los Angeles Kings", "Minnesota Wild", "Montreal Canadiens",
    "New Jersey Devils", "Nashville Predators", "New York Islanders", "New York Rangers", "Ottawa Senators",
    "Philadelphia Flyers", "Pittsburgh Penguins", "Seattle Kraken", "San Jose Sharks", "St. Louis Blues",
    "Tampa Bay Lightning", "Toronto Maple Leafs", "Vancouver Canucks", "Vegas Golden Knights", "Washington Capitals", "Winnipeg Jets", "Utah Hockey Club"
];

window.filterManualSelection = async function() {
    let input = document.getElementById('manual-bet-target').value.toLowerCase().trim();
    let dropdown = document.getElementById('manual-target-dropdown');
    
    // On cache si moins de 2 lettres
    if (input.length < 2) {
        dropdown.classList.add('hidden');
        return;
    }

    // ⚡ NOUVEAUTÉ : Si la base de données des joueurs est vide, on la télécharge instantanément en arrière-plan !
    if (!window.globalPredictionsPool || window.globalPredictionsPool.length === 0) {
        try {
            let res = await fetch(`${API_BASE}/predict_all`);
            let data = await res.json();
            window.globalPredictionsPool = data.global_predictions || [];
        } catch (e) {
            console.warn("Chargement des joueurs en attente...");
        }
    }

    let matchesHtml = "";
    let resultCount = 0;

    // 1. Recherche dans les Équipes NHL d'abord
    let matchedTeams = NHL_TEAMS_LIST.filter(t => t.toLowerCase().includes(input));
    matchedTeams.forEach(team => {
        if (resultCount >= 4) return; // Max 4 équipes
        matchesHtml += `
            <div class="p-3 hover:bg-gray-800 cursor-pointer border-b border-gray-800/50 flex items-center gap-3 transition group" onclick="window.selectManualTarget('${team}', 'team')">
                <div class="w-8 h-8 rounded-full border border-gray-700 group-hover:border-money bg-gray-900 flex items-center justify-center text-gray-500"><i class="fas fa-shield-alt"></i></div>
                <div>
                    <div class="text-white text-xs font-black uppercase tracking-widest group-hover:text-money transition">${team}</div>
                    <div class="text-[9px] text-blue-400 font-bold uppercase tracking-widest">Équipe LNH</div>
                </div>
            </div>
        `;
        resultCount++;
    });

    // 2. Recherche dans les Joueurs ensuite
    let pool = window.globalPredictionsPool || [];
    let seenPlayers = new Set();
    
    for (let p of pool) {
        if (resultCount >= 10) break; // Max 10 résultats globaux
        if (p.name.toLowerCase().includes(input) && !seenPlayers.has(p.name)) {
            matchesHtml += `
                <div class="p-3 hover:bg-gray-800 cursor-pointer border-b border-gray-800/50 flex items-center gap-3 transition group" onclick="window.selectManualTarget('${p.name.replace(/'/g, "\\'")}', 'player')">
                    <img src="${p.headshot || 'assets/logo_hockAI.png'}" class="w-8 h-8 rounded-full border border-gray-700 group-hover:border-money transition object-cover bg-gray-900">
                    <div>
                        <div class="text-white text-xs font-black uppercase tracking-widest group-hover:text-money transition">${p.name}</div>
                        <div class="text-[9px] text-purple-400 font-bold uppercase tracking-widest">Joueur • ${p.team}</div>
                    </div>
                </div>
            `;
            seenPlayers.add(p.name);
            resultCount++;
        }
    }

    if (matchesHtml === "") {
        dropdown.innerHTML = '<div class="p-3 text-xs text-gray-500 font-bold italic text-center">Aucune équipe ou joueur trouvé.</div>';
    } else {
        dropdown.innerHTML = matchesHtml;
    }
    dropdown.classList.remove('hidden');
};

// Quand l'utilisateur clique sur un joueur ou une équipe dans la liste
window.selectManualTarget = function(name, category) {
    document.getElementById('manual-bet-target').value = name;
    document.getElementById('manual-bet-category').value = category; // Enregistre si c'est 'team' ou 'player'
    document.getElementById('manual-target-dropdown').classList.add('hidden');

    // MÉTAMORPHOSE DE LA LISTE DÉROULANTE DES PRONOSTICS
    let selectType = document.getElementById('manual-bet-type');
    selectType.innerHTML = ''; // On vide les anciens choix

    if (category === 'player') {
        selectType.innerHTML += `<option value="Buteur">Buteur (Temps Rég.)</option>`;
        selectType.innerHTML += `<option value="Passeur">Passeur</option>`;
        selectType.innerHTML += `<option value="Pointeur">Pointeur (+0.5 point)</option>`;
        selectType.innerHTML += `<option value="+2.5 Tirs Cadrés">Tirs (+2.5 Cadrés)</option>`;
        selectType.innerHTML += `<option value="+3.5 Tirs Cadrés">Tirs (+3.5 Cadrés)</option>`;
    } else if (category === 'team') {
        selectType.innerHTML += `<option value="Vainqueur (TR)">Vainqueur (Temps Réglementaire)</option>`;
        selectType.innerHTML += `<option value="Vainqueur (Prolo. Incluses)">Vainqueur (Inc. Prolongation/TAB)</option>`;
        selectType.innerHTML += `<option value="Match Nul">Match Nul</option>`;
        selectType.innerHTML += `<option value="Puckline -1.5">Écart de Buts (Puckline -1.5)</option>`;
    }
};

// Ferme le menu de recherche si on clique à côté
document.addEventListener('click', function(e) {
    let dropdown = document.getElementById('manual-target-dropdown');
    let input = document.getElementById('manual-bet-target');
    if (dropdown && !dropdown.contains(e.target) && e.target !== input) {
        dropdown.classList.add('hidden');
    }
});

// Enregistrement final du pari
window.submitManualBet = function() {
    let target = document.getElementById('manual-bet-target').value.trim();
    let type = document.getElementById('manual-bet-type').value; // Valeur du menu déroulant
    let odds = parseFloat(document.getElementById('manual-bet-odds').value);
    let stake = parseFloat(document.getElementById('manual-bet-stake').value);

    if (!target || !type || isNaN(odds) || isNaN(stake)) {
        alert("Action requise : Veuillez sélectionner une cible, une cote et une mise valide.");
        return;
    }

    // Création de l'étiquette pour l'historique
    let description = `${target} - ${type} (1 Sélection)`;
    
    // Sauvegarde en base de données
    window.addBetToBankroll('MANUEL', description, odds, stake);

    // Réinitialisation de l'interface visuelle
    document.getElementById('manual-bet-target').value = '';
    document.getElementById('manual-bet-category').value = '';
    document.getElementById('manual-bet-odds').value = '';
    document.getElementById('manual-bet-stake').value = '';
    document.getElementById('manual-bet-type').innerHTML = `<option value="" disabled selected>Sélectionnez une cible</option>`;
};