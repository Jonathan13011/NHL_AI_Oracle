// ==========================================
// MOTEUR BANKROLL & MONTANTE IA (CONNECTÉ À SUPABASE)
// ==========================================
window.globalBankroll = [];

// 1. Charger la Bankroll depuis Supabase
window.loadBankroll = async function () {
    if (!window.isUserLoggedIn || typeof supabaseClient === 'undefined') {
        console.warn("Utilisateur non connecté ou Supabase non initialisé. Bankroll vide.");
        window.globalBankroll = [];
        if (typeof updateBankrollDashboard === 'function') updateBankrollDashboard();
        if (typeof renderBetHistory === 'function') renderBetHistory();
        return;
    }

    try {
        // On récupère tous les paris de l'utilisateur connecté, triés du plus récent au plus ancien
        const { data, error } = await supabaseClient
            .from('bankroll')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) throw error;

        // On adapte le format des données de Supabase au format attendu par ton code (date au lieu de created_at)
        window.globalBankroll = data.map(bet => ({
            ...bet,
            date: bet.created_at 
        }));

        if (typeof updateBankrollDashboard === 'function') updateBankrollDashboard();
        if (typeof updateMontanteModule === 'function') updateMontanteModule();
        if (typeof renderBetHistory === 'function') renderBetHistory();

    } catch (e) {
        console.error("Erreur chargement Bankroll Supabase :", e);
    }
};

// 2. Ajouter un pari dans Supabase (Avec données structurées)
window.addBetToBankroll = async function (category, description, odds, stake, selections = []) {
    if (!window.isUserLoggedIn || typeof supabaseClient === 'undefined') {
        alert("🛡️ Vous devez être connecté pour sauvegarder un ticket dans le Coffre-Fort.");
        window.openAuthModal();
        return;
    }

    if (typeof gtag === 'function') {
        gtag('event', 'ajout_coffre_fort', {
            'categorie_pari': category
        });
    }

    try {
        const { data: { user } } = await supabaseClient.auth.getUser();

        const { data, error } = await supabaseClient
            .from('bankroll')
            .insert([
                { 
                    user_id: user.id,
                    category: category, 
                    description: description, 
                    odds: parseFloat(odds), 
                    stake: parseFloat(stake), 
                    status: "PENDING",
                    selections: selections // ⚡ NOUVEAU : On sauvegarde les détails techniques !
                }
            ]);

        if (error) throw error;

        alert("Ticket sauvegardé en toute sécurité dans votre Coffre-Fort !");
        window.loadBankroll(); 

    } catch (e) {
        console.error("Erreur d'insertion Bankroll :", e);
        alert("Une erreur est survenue lors de la sauvegarde du ticket.");
    }
};

// 3. Modifier le statut d'un pari (Gagné/Perdu)
window.changeBetStatus = async function (id, status) {
    if (!window.isUserLoggedIn || typeof supabaseClient === 'undefined') return;

    try {
        const { data, error } = await supabaseClient
            .from('bankroll')
            .update({ status: status })
            .eq('id', id); // On met à jour la ligne qui a cet ID précis

        if (error) throw error;
        window.loadBankroll(); // On recharge l'affichage

    } catch (e) {
        console.error("Erreur de mise à jour Bankroll :", e);
    }
};

// 4. Supprimer un pari
window.deleteBet = async function (btnElement, id) {
    if (!window.isUserLoggedIn || typeof supabaseClient === 'undefined') return;

    if (confirm("Supprimer ce pari de l'historique de manière permanente ?")) {

        // 1. Suppression visuelle instantanée
        let card = btnElement.closest('.bg-gray-900');
        if (card) {
            card.style.transition = 'all 0.3s ease';
            card.style.opacity = '0';
            card.style.transform = 'scale(0.9) translateX(50px)';
            setTimeout(() => { card.remove(); }, 300);
        }

        // 2. Mise à jour de la mémoire JavaScript
        window.globalBankroll = window.globalBankroll.filter(b => String(b.id) !== String(id));

        // 3. Mise à jour des bilans et de la montante
        if (typeof updateBankrollDashboard === 'function') updateBankrollDashboard();
        if (typeof updateMontanteModule === 'function') updateMontanteModule();

        // 4. Suppression réelle dans Supabase
        try {
            const { error } = await supabaseClient
                .from('bankroll')
                .delete()
                .eq('id', id);
                
            if (error) throw error;
        } catch (e) { 
            console.error("Erreur de suppression Bankroll :", e); 
            // En cas d'erreur, on recharge la bankroll pour remettre le ticket
            window.loadBankroll(); 
        }
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
window.renderBetHistory = function() {
    let container = document.getElementById('bankroll-history');
    if (!container) return;
    container.innerHTML = '';

    if (window.globalBankroll.length === 0) {
        container.innerHTML = `<div class="text-center p-10 text-gray-500 font-bold italic">Le coffre-fort est vide. Sauvegardez un ticket !</div>`;
        return;
    }

    window.globalBankroll.forEach(b => {
        let dateStr = new Date(b.date).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

        let statusHtml = '';
        if (b.status === "PENDING") {
            // ⚡ NOUVEAU : Le Compteur Live Cyberpunk au lieu des boutons !
            statusHtml = `
                <div class="flex flex-col items-center justify-center bg-black border border-gray-800 px-4 py-2 rounded-lg shadow-inner min-w-[140px]">
                    <span class="text-[8px] text-gray-500 uppercase font-black tracking-widest mb-1 flex items-center">
                        <i class="fas fa-robot text-purple-400 mr-1.5 animate-pulse"></i> Arbitrage IA
                    </span>
                    <span class="text-xs text-yellow-500 font-black font-mono tracking-wider timer-9am drop-shadow-[0_0_5px_rgba(234,179,8,0.4)]">--h --m --s</span>
                </div>
            `;
        }
        else if (b.status === "WON") {
            statusHtml = `<span class="text-green-400 font-black text-sm drop-shadow-[0_0_5px_#22c55e]"><i class="fas fa-check-circle"></i> GAGNÉ (+${(b.stake * b.odds - b.stake).toFixed(2)}€)</span>`;
        }
        else {
            statusHtml = `<span class="text-red-500 font-black text-sm drop-shadow-[0_0_5px_#ff3333]"><i class="fas fa-times-circle"></i> PERDU (-${b.stake.toFixed(2)}€)</span>`;
        }

        container.innerHTML += `
            <div id="bet-card-${b.id}" class="bg-gray-900 border border-gray-800 p-4 rounded-xl shadow-md flex flex-col md:flex-row justify-between items-center gap-4 relative transition-all duration-300 transform origin-left hover:border-purple-500/30">
                <button onclick="window.deleteBet(this, '${b.id}')" class="absolute top-2 right-2 text-gray-600 hover:text-blood transition z-50"><i class="fas fa-trash-alt"></i></button>
                <div class="flex-1 w-full mt-2 md:mt-0">
                    <div class="text-[10px] text-gray-500 font-black tracking-widest uppercase mb-1">${dateStr} • ${b.category}</div>
                    <div class="text-white font-bold text-sm">${b.description}</div>
                </div>
                <div class="flex items-center gap-6 w-full md:w-auto bg-black p-3 rounded-lg border border-gray-800">
                    <div class="text-center"><div class="text-[10px] text-gray-500 uppercase tracking-widest font-bold">Cote</div><div class="text-yellow-500 font-black">${b.odds.toFixed(2)}</div></div>
                    <div class="text-center"><div class="text-[10px] text-gray-500 uppercase tracking-widest font-bold">Mise</div><div class="text-white font-black">${b.stake.toFixed(2)}€</div></div>
                </div>
                <div class="w-full md:w-auto flex justify-center md:justify-end shrink-0">
                    ${statusHtml}
                </div>
            </div>
        `;
    });
    
    // On lance la mise à jour des compteurs immédiatement
    if (typeof window.updateArbitrageTimers === 'function') window.updateArbitrageTimers();
};

// ==========================================
// MOTEUR DE COMPTE À REBOURS (ARBITRAGE IA)
// ==========================================
window.updateArbitrageTimers = function() {
    let timers = document.querySelectorAll('.timer-9am');
    if (timers.length === 0) return;

    let now = new Date();
    let next9am = new Date();
    // Le serveur Cron est réglé sur 09h00 du matin
    next9am.setHours(9, 0, 0, 0);

    // Si on est déjà passé 09h00 aujourd'hui, le prochain arbitrage est demain à 09h00
    if (now.getHours() >= 9) {
        next9am.setDate(next9am.getDate() + 1);
    }

    let diff = next9am - now;
    let h = Math.floor(diff / (1000 * 60 * 60));
    let m = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    let s = Math.floor((diff % (1000 * 60)) / 1000);

    // Formatage propre avec des zéros (ex: 08h 05m 09s)
    let timeString = `${h.toString().padStart(2, '0')}h ${m.toString().padStart(2, '0')}m ${s.toString().padStart(2, '0')}s`;

    timers.forEach(t => {
        t.innerText = timeString;
    });
};

// On actualise les compteurs automatiquement toutes les secondes (1000ms)
setInterval(window.updateArbitrageTimers, 1000);

// N'oublie pas de garder tes fonctions de recherche (NHL_TEAMS_LIST, etc.) qui étaient en dessous intactes !

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

// Enregistrement final du pari manuel
window.submitManualBet = function() {
    let target = document.getElementById('manual-bet-target').value.trim();
    let type = document.getElementById('manual-bet-type').value; 
    let odds = parseFloat(document.getElementById('manual-bet-odds').value);
    let stake = parseFloat(document.getElementById('manual-bet-stake').value);
    let category = document.getElementById('manual-bet-category').value; // 'team' ou 'player'

    if (!target || !type || isNaN(odds) || isNaN(stake)) {
        alert("Action requise : Veuillez sélectionner une cible, une cote et une mise valide.");
        return;
    }

    let description = `${target} - ${type} (1 Sélection)`;
    
    // ⚡ NOUVEAU : On crée la structure technique pour le serveur Python
    let selectionsData = [{
        target_name: target,
        market: type,
        target_type: category // Permet au serveur de savoir si c'est un joueur ou une équipe
    }];
    
    // On envoie le pari AVEC les sélections JSON
    window.addBetToBankroll('MANUEL', description, odds, stake, selectionsData);

    // Réinitialisation de l'interface
    document.getElementById('manual-bet-target').value = '';
    document.getElementById('manual-bet-category').value = '';
    document.getElementById('manual-bet-odds').value = '';
    document.getElementById('manual-bet-stake').value = '';
    document.getElementById('manual-bet-type').innerHTML = `<option value="" disabled selected>Sélectionnez une cible</option>`;
};