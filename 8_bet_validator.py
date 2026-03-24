import pandas as pd
from sqlalchemy import create_engine
from supabase import create_client, Client
import time
import requests # <--- NOUVEAU : Pour interroger ta propre API
from datetime import datetime

print("🤖 [ARBITRE IA] Démarrage du validateur de tickets...")

# 1. Configuration Supabase (Le Cloud)
SUPABASE_URL = "https://gfmquozjspyuoppunojs.supabase.co"
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdmbXF1b3pqc3B5dW9wcHVub2pzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NDExMDQ2NSwiZXhwIjoyMDg5Njg2NDY1fQ.tASu6FFKT0kj5l2QlPb_nrmC2-TeJi5MCFvyK972mKc" # <-- RE-COLLE TA CLÉ ICI
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

# 2. Configuration Base de Données Locale (Hetzner)
MOT_DE_PASSE = "Jo23071993"
engine = create_engine(f"postgresql://postgres:{MOT_DE_PASSE}@localhost:5432/nhl_oracle")

def valider_paris():
    print("🔍 Recherche des paris 'EN COURS' dans Supabase...")
    
    try:
        response = supabase.table("bankroll").select("*").eq("status", "PENDING").execute()
        bets = response.data
    except Exception as e:
        print(f"❌ Erreur Supabase: {e}")
        return

    if not bets:
        print("✅ Aucun pari en attente.")
        return

    print(f"📊 {len(bets)} pari(s) en attente de validation.")

    for bet in bets:
        bet_id = bet['id']
        bet_date_str = bet['created_at'].split('T')[0]
        selections = bet.get('selections', [])

        if not selections: continue
        
        selection = selections[0]
        target_name = selection.get('target_name')
        market = selection.get('market')
        target_type = selection.get('target_type')

        if target_type == "player":
            # --- NOUVEAU : On trouve l'ID du joueur en interrogeant ta propre API ! ---
            player_id = None
            try:
                # On interroge ton API locale (port 8000)
                res = requests.get(f"http://localhost:8000/api/autocomplete?q={target_name}").json()
                if res.get('status') == 'success' and len(res.get('data', [])) > 0:
                    player_id = res['data'][0]['id']
            except Exception as e:
                print(f"⚠️ Impossible de contacter l'API pour {target_name}")
                continue

            if not player_id:
                print(f"⚠️ Joueur {target_name} introuvable dans l'annuaire.")
                continue

            # --- On utilise l'ID (des chiffres) au lieu du nom pour interroger la base ---
            query = f"""
            SELECT p.goals, p.assists, p.points, p.shots, g.game_date
            FROM player_game_stats p
            JOIN games g ON p.game_id = g.game_id
            WHERE p.player_id = {player_id}
            AND g.game_date >= '{bet_date_str}'
            ORDER BY g.game_date ASC
            LIMIT 1
            """
            try:
                df = pd.read_sql(query, engine)
            except Exception as e:
                print(f"⚠️ Erreur DB pour {target_name}: {e}")
                continue

            if df.empty:
                print(f"⏳ Match non terminé ou introuvable pour {target_name}. On patiente...")
                continue

            stats = df.iloc[0]
            is_won = False

            if market == "Buteur" and stats['goals'] > 0: is_won = True
            elif market == "Passeur" and stats['assists'] > 0: is_won = True
            elif market == "Pointeur" and stats['points'] > 0: is_won = True
            elif market == "+2.5 Tirs Cadrés" and stats['shots'] >= 3: is_won = True
            elif market == "+3.5 Tirs Cadrés" and stats['shots'] >= 4: is_won = True

            nouveau_statut = "WON" if is_won else "LOST"
            print(f"🏒 {target_name} ({market}) -> Match du {stats['game_date'][:10]} -> Résultat: {nouveau_statut}")

            supabase.table("bankroll").update({"status": nouveau_statut}).eq("id", bet_id).execute()

        elif target_type == "team":
            print(f"⏳ Arbitrage équipe ({target_name}) en développement.")

if __name__ == "__main__":
    valider_paris()
    print("🏁 Validation terminée.")