import requests
import pandas as pd
from sqlalchemy import create_engine
import time

print("🚀 FINAL SYNC 2026 : Ciblage du nouveau dossier NHL...")
MOT_DE_PASSE = "Jo23071993"
engine = create_engine(f"postgresql://postgres:{MOT_DE_PASSE}@localhost:5432/nhl_oracle")

HEADERS = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0"}

try: count_before = pd.read_sql("SELECT COUNT(*) as c FROM player_game_stats", engine)['c'].iloc[0]
except: count_before = 0
print(f"📊 Lignes actuelles : {count_before}")

TEAM_ABBREVS = ["ANA", "BOS", "BUF", "CAR", "CBJ", "CGY", "CHI", "COL", "DAL", "DET", "EDM", "FLA", "LAK", "MIN", "MTL", "NJD", "NSH", "NYI", "NYR", "OTT", "PHI", "PIT", "SEA", "SJS", "STL", "TBL", "TOR", "UTA", "VAN", "VGK", "WPG", "WSH"]
SEASONS = ["20242025", "20252026"]

try: existing_stats_games = set(pd.read_sql("SELECT DISTINCT game_id FROM player_game_stats", engine)['game_id'].tolist())
except: existing_stats_games = set()

games_to_process = []
games_meta = []

print("📅 Check du calendrier...")
for team in TEAM_ABBREVS:
    for season in SEASONS:
        try:
            res = requests.get(f"https://api-web.nhle.com/v1/club-schedule-season/{team}/{season}", headers=HEADERS).json()
            for game in res.get('games', []):
                if game.get('gameType') == 2 and game.get('gameState') in ['OFF', 'FINAL']:
                    gid = game['id']
                    if gid not in existing_stats_games and gid not in [g['game_id'] for g in games_meta]:
                        games_to_process.append(gid)
                        games_meta.append({'game_id': gid, 'game_date': game['gameDate'], 'home_team': game['homeTeam']['abbrev'], 'away_team': game['awayTeam']['abbrev'], 'home_score': game['homeTeam'].get('score', 0), 'away_score': game['awayTeam'].get('score', 0), 'game_type': 2})
        except: pass

if not games_to_process:
    print("✅ Vous êtes déjà à jour !")
else:
    try:
        existing_games_table = set(pd.read_sql("SELECT game_id FROM games", engine)['game_id'].tolist())
        games_to_insert = [g for g in games_meta if g['game_id'] not in existing_games_table]
        if games_to_insert: pd.DataFrame(games_to_insert).to_sql('games', engine, if_exists='append', index=False)
    except: pass

    count = 0
    total = len(games_to_process)
    stats_list = []
    
    print("🏒 Extraction des joueurs (Vous devez voir environ ~36 joueurs par match !)")
    for gid in games_to_process:
        count += 1
        try:
            url = f"https://api-web.nhle.com/v1/gamecenter/{gid}/boxscore"
            resp = requests.get(url, headers=HEADERS, timeout=10)
            
            if resp.status_code == 200:
                data = resp.json()
                
                # LA CORRECTION EST ICI : La NHL a sorti ça du "boxscore" !
                pgs = data.get('playerByGameStats')
                if not pgs: # Sécurité si vieux match
                    pgs = data.get('boxscore', {}).get('playerByGameStats', {})
                
                players_found = 0
                for t_type in ['homeTeam', 'awayTeam']:
                    team_data = pgs.get(t_type, {})
                    # On récupère l'abréviation de l'équipe proprement
                    t_abbrev = data.get(t_type, {}).get('abbrev', next((g['home_team'] if t_type=='homeTeam' else g['away_team'] for g in games_meta if g['game_id'] == gid), "UNK"))
                    
                    # On fouille dans toutes les positions possibles
                    for pos in ['forwards', 'defense', 'defensemen', 'goalies']:
                        for p in team_data.get(pos, []):
                            if 'playerId' in p:
                                stats_list.append({
                                    'game_id': gid, 'player_id': p.get('playerId'), 'team_abbrev': t_abbrev,
                                    'goals': p.get('goals', 0), 'assists': p.get('assists', 0),
                                    'points': p.get('points', 0), 'shots': p.get('shots', 0), 'toi': p.get('toi', '00:00')
                                })
                                players_found += 1
                
                # Affichage en temps réel
                print(f"   ✔️ Match {gid} ({count}/{total}) -> Extraits : {players_found} joueurs", end="\r")
                
                if len(stats_list) >= 1000:
                    pd.DataFrame(stats_list).to_sql('player_game_stats', engine, if_exists='append', index=False)
                    stats_list = []
            
            time.sleep(0.1) # Ça va aller très vite !
        except Exception as e:
            pass
            
    if stats_list:
        pd.DataFrame(stats_list).to_sql('player_game_stats', engine, if_exists='append', index=False)
        
    count_after = pd.read_sql("SELECT COUNT(*) as c FROM player_game_stats", engine)['c'].iloc[0]
    print(f"\n\n🎉 VICTOIRE ABSOLUE ! La base de données est passée de {count_before} à {count_after} lignes !")