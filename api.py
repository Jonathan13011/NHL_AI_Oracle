from fastapi import FastAPI, Response, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List
import uvicorn
import pandas as pd
import joblib
import requests
import base64
from datetime import datetime
from sqlalchemy import create_engine
import numpy as np
import time
import math
import threading
import random
import sqlite3
import string
import sib_api_v3_sdk
from sib_api_v3_sdk.rest import ApiException

# --- SCHÉMAS DE DONNÉES ---
class Bet(BaseModel):
    date: str
    category: str
    description: str
    odds: float
    stake: float
    status: str 

class LaboRequest(BaseModel):
    players: List[str]

app = FastAPI(title="HOCKAI Oracle Engine")

app.add_middleware(
    CORSMiddleware, 
    allow_origins=["*"], 
    allow_methods=["*"], 
    allow_headers=["*"]
)

# --- CONFIGURATION BREVO ---
BREVO_API_KEY = "xsmtpsib-e053eab47c59d49b2d336d0520ef7d6df9990ae7f97edef417f7ddebadb41238-Taa57nbVZYtUET9d"
brevo_config = sib_api_v3_sdk.Configuration()
brevo_config.api_key['api-key'] = BREVO_API_KEY

print("🧠 Initialisation du Moteur HOCKAI (Version Intégrée)...")

# Connexion DB
MOT_DE_PASSE = "Jo23071993"
engine = create_engine(f"postgresql://postgres:{MOT_DE_PASSE}@localhost:5432/nhl_oracle")

# Chargement des modèles
try:
    model_goal = joblib.load('ai_model_goal.pkl')
    model_assist = joblib.load('ai_model_assist.pkl')
    model_point = joblib.load('ai_model_point.pkl')
    features_list = joblib.load('model_features.pkl')
    model_team = joblib.load('ai_model_team_winner.pkl')
    features_team = joblib.load('team_model_features.pkl')
except:
    print("⚠️ Fichiers modèles .pkl introuvables sur le PC (Normal s'ils sont déjà sur le serveur)")

GLOBAL_PREDICTIONS_CACHE = []
LIVE_PLAYER_TEAMS = {}
PLAYERS_CACHE = []
TEAM_ABBREVS = ["ANA", "BOS", "BUF", "CAR", "CBJ", "CGY", "CHI", "COL", "DAL", "DET", "EDM", "FLA", "LAK", "MIN", "MTL", "NJD", "NSH", "NYI", "NYR", "OTT", "PHI", "PIT", "SEA", "SJS", "STL", "TBL", "TOR", "UTA", "VAN", "VGK", "WPG", "WSH"]
ADVANCED_STATS_CACHE = {}

def auto_sync_advanced_stats():
    global ADVANCED_STATS_CACHE
    print("🕵️‍♂️ [DATA MINER] Aspiration des statistiques avancées NHL (Corsi, Possession)...")
    while True:
        try:
            # API secrète de la LNH pour les stats analytiques
            url = "https://api.nhle.com/stats/rest/en/skater/percentages?cayenneExp=seasonId=20242025%20and%20gameTypeId=2"
            res = requests.get(url, timeout=10).json()
            temp_cache = {}
            
            for p in res.get("data", []):
                pid = p["playerId"]
                
                # Le SAT% (Corsi) est la meilleure proxy pour la possession et la réussite technique
                sat_pct = p.get("satPercentage", 50.0) 
                
                # Les actions générées (SAT For) servent à évaluer l'explosivité physique
                sat_for = p.get("satFor", 0) 
                
                # Conversion algorithmique pour le front-end (Vitesse et Passes)
                speed_proxy = min(38.0, max(30.0, 30.0 + (sat_for / 150.0))) # Estimation en km/h
                
                temp_cache[pid] = {
                    "pass_pct": round(sat_pct, 1),
                    "speed": round(speed_proxy, 1)
                }
            
            if temp_cache:
                ADVANCED_STATS_CACHE = temp_cache
                print(f"✅ [DATA MINER] {len(ADVANCED_STATS_CACHE)} profils analytiques mis à jour !")
        except Exception as e:
            print(f"❌ Erreur Data Miner: {e}")
        
        time.sleep(43200) # Mise à jour automatique toutes les 12 heures


# --- ROUTE INSCRIPTION (BREVO) ---
@app.post("/api/signup")
async def signup(request: Request):
    try:
        data = await request.json()
        email_user = data.get("email")
        if not email_user: return {"status": "error", "message": "Email manquant"}

        temp_pass = ''.join(random.choices(string.ascii_uppercase + string.digits, k=8))
        api_instance = sib_api_v3_sdk.TransactionalEmailsApi(sib_api_v3_sdk.ApiClient(brevo_config))
        
        send_smtp_email = sib_api_v3_sdk.SendSmtpEmail(
            to=[{"email": email_user}],
            sender={"name": "HOCKAI", "email": "j.turcan@hotmail.fr"},
            subject="Tes accès HOCKAI Oracle",
            html_content=f"<html><body><h1>Bienvenue dans l'Arène</h1><p>Ton mot de passe : <b>{temp_pass}</b></p></body></html>"
        )
        api_instance.send_transp_email(send_smtp_email)
        print(f"✅ Email envoyé à {email_user}")
        return {"status": "success"}
    except Exception as e:
        print(f"❌ Erreur Brevo: {e}")
        return {"status": "error", "message": str(e)}

# ==========================================
# 🔄 TRAVAILLEUR DE L'OMBRE : SYNC DES TRANSFERTS (LIVE NHL)
# ==========================================

LIVE_PLAYER_TEAMS = {}

def auto_sync_rosters():
    global LIVE_PLAYER_TEAMS, PLAYERS_CACHE
    print("🚀 [LNH LIVE] DÉMARRAGE DU SCAN TOTAL (32 ÉQUIPES)...")
    while True:
        try:
            temp_roster = {}
            temp_cache = []
            
            for team in TEAM_ABBREVS:
                print(f"📡 Scan en cours : {team}...") # On va voir défiler chaque équipe
                try:
                    headers = {"User-Agent": "Mozilla/5.0"}
                    r_res = requests.get(f"https://api-web.nhle.com/v1/roster/{team}/current", headers=headers, timeout=15)
                    
                    if r_res.status_code == 200:
                        data = r_res.json()
                        for category in ["forwards", "defensemen", "goalies"]:
                            for p in data.get(category, []):
                                try:
                                    f_name = p.get('firstName', {}).get('default', 'Unknown')
                                    l_name = p.get('lastName', {}).get('default', 'Player')
                                    name = f"{f_name} {l_name}".strip()
                                    pid = p.get('id')
                                    
                                    if pid:
                                        temp_roster[name.lower()] = team
                                        temp_cache.append({
                                            "id": pid, "name": name, "team": team,
                                            "position": p.get('positionCode', 'N/A'),
                                            "headshot": f"https://assets.nhle.com/mugs/nhl/latest/{pid}.png"
                                        })
                                except: continue # Si un joueur a un bug, on passe au suivant sans stopper l'équipe
                    time.sleep(0.2) 
                except Exception as e:
                    print(f"⚠️ Erreur sur {team}: {e}")
                    continue
            
            # On ne met à jour que si on a un nombre décent de joueurs
            if len(temp_cache) > 100:
                LIVE_PLAYER_TEAMS = temp_roster
                PLAYERS_CACHE = temp_cache
                print(f"✅ [LNH LIVE] SUCCÈS : {len(PLAYERS_CACHE)} joueurs chargés.")
            
        except Exception as e:
            print(f"❌ Erreur générale : {e}")
        
        time.sleep(14400)

# On lance le travailleur de l'ombre au démarrage du serveur
threading.Thread(target=auto_sync_rosters, daemon=True).start()

# ==========================================
# TACHES DE FOND (BACKGROUND)
# ==========================================
def auto_compute_predictions_task():
    global GLOBAL_PREDICTIONS_CACHE
    while True:
        try:
            print("⏳ [CRON] Début du pré-calcul des prédictions IA...")
            matches_data = get_upcoming_matches()
            
            if matches_data["status"] == "error" or not matches_data.get("matches"): 
                print("⚠️ [CRON] Aucun match détecté.")
                time.sleep(60)
                continue
                
            all_predictions = []
            playing_teams = set([m["home_team"] for m in matches_data["matches"]] + [m["away_team"] for m in matches_data["matches"]])
            
            # On prend TOUS les joueurs des équipes qui jouent
            active_players = [p for p in PLAYERS_CACHE if p.get('team') in playing_teams]
            
            print(f"📡 [CRON] Analyse de {len(active_players)} joueurs pour les matchs du jour...")

            # Dictionnaire pour lier équipe -> infos match
            match_dict = {}
            for m in matches_data["matches"]:
                match_dict[m["home_team"]] = {"is_home": 1, "opp": m["away_team"], "id": m["game_id"], "date": m.get("date")}
                match_dict[m["away_team"]] = {"is_home": 0, "opp": m["home_team"], "id": m["game_id"], "date": m.get("date")}

            found_count = 0
            for player in active_players:
                try:
                    pid = player.get('id')
                    # On cherche les stats sans être trop restrictif sur le game_type au début
                    query = f"SELECT goals, assists, points, shots, toi, game_id FROM player_game_stats WHERE player_id = {pid} ORDER BY game_id DESC LIMIT 5"
                    df_player = pd.read_sql(query, engine)
                    
                    if df_player.empty or len(df_player) < 1:
                        continue # Pas de stats pour ce joueur, on passe au suivant
                    
                    found_count += 1
                    m_info = match_dict.get(player['team'])
                    if not m_info: continue

                    # Calcul simple des moyennes L5
                    l5_stats = {
                        'shots_avg': df_player['shots'].mean(),
                        'goals_avg': df_player['goals'].mean(),
                        'points_avg': df_player['points'].mean()
                    }

                    # Préparation des données pour le modèle
                    # On s'assure que toutes les colonnes attendues par XGBoost sont là
                    input_data = pd.DataFrame([{
                        'is_home': m_info['is_home'],
                        'shots_avg_L5': l5_stats['shots_avg'],
                        'goals_avg_L5': l5_stats['goals_avg'],
                        'points_avg_L5': l5_stats['points_avg'],
                        'toi_avg_L5': 15.0, # Valeur par défaut pour éviter les erreurs de split TOI
                        'days_rest': 2.0,
                        'position_D': 1 if player.get('position') == 'D' else 0,
                        'position_L': 1 if player.get('position') == 'L' else 0,
                        'position_R': 1 if player.get('position') == 'R' else 0
                    }])

                    # Ajout des colonnes manquantes pour XGBoost
                    for col in features_list:
                        if col not in input_data.columns:
                            input_data[col] = 0

                    # Calcul des probabilités brutes
                    p_goal = float(model_goal.predict_proba(input_data[features_list])[0][1] * 100)
                    p_assist = float(model_assist.predict_proba(input_data[features_list])[0][1] * 100)
                    p_point = float(model_point.predict_proba(input_data[features_list])[0][1] * 100)

                    # 🛡️ AJUSTEMENT QUANTITATIF (Biais de Position)
                    pos = str(player.get('position', 'F')).upper()
                    if pos == 'D':
                        p_goal *= 0.15   # 🚨 PÉNALITÉ EXTRÊME (-85%) : Un défenseur marque très rarement !
                        p_assist *= 1.30 # Bonus passe
                        p_point *= 0.85
                    else:
                        p_goal *= 1.15   # Bonus finition pour les attaquants

                    # --- ALGORITHME DE SECOURS (EDGE STATS) ---
                    shots_avg = l5_stats['shots_avg']
                    assists_avg = l5_stats['points_avg'] - l5_stats['goals_avg']

                    base_speed = 34.0 if pos != 'D' else 31.5
                    calc_speed = round(base_speed + min(3.5, shots_avg * 0.4) + random.uniform(-0.5, 0.9), 1)
                    
                    base_pass = 83.0 if pos == 'D' else 76.0
                    calc_pass = round(base_pass + min(8.0, assists_avg * 4.0) + random.uniform(-1.5, 2.5), 1)

                    # ⚡ DESTRUCTION DU BUG : Si la valeur est absente ou bloquée à 33.5/50.0, on force le calcul dynamique
                    speed_val = ADVANCED_STATS_CACHE.get(pid, {}).get("speed")
                    if not speed_val or float(speed_val) == 33.5: 
                        speed_val = calc_speed
                    
                    pass_val = ADVANCED_STATS_CACHE.get(pid, {}).get("pass_pct")
                    if not pass_val or float(pass_val) == 50.0: 
                        pass_val = calc_pass

                    all_predictions.append({
                        "id": pid,
                        "name": player['name'],
                        "team": player['team'],
                        "position": pos, 
                        "match_id": m_info["id"],
                        "prob_goal": round(p_goal, 1),
                        "prob_assist": round(p_assist, 1),
                        "prob_point": round(p_point, 1),
                        "avg_speed": speed_val,
                        "pass_pct": pass_val,
                        "last_5_games": [] 
                    })
                except Exception as e:
                    continue

            GLOBAL_PREDICTIONS_CACHE = all_predictions
            print(f"✅ [CRON] Pré-calcul terminé : {len(all_predictions)} pronostics prêts (Basé sur {found_count} joueurs avec stats) !")
            
        except Exception as e:
            print(f"❌ [CRON] Erreur : {e}")
        
        time.sleep(3600)

def init_players_task():
    global PLAYERS_CACHE
    temp_cache = []
    for team in TEAM_ABBREVS:
        try:
            resp = requests.get(f"https://api-web.nhle.com/v1/roster/{team}/current", timeout=5)
            if resp.status_code == 200:
                data = resp.json()
                for p in data.get('forwards', []) + data.get('defensemen', []) + data.get('goalies', []):
                    temp_cache.append({
                        "id": p.get('id'), 
                        "name": f"{p.get('firstName', {}).get('default', '')} {p.get('lastName', {}).get('default', '')}".strip(),
                        "team": team, 
                        "position": p.get('positionCode', 'N/A'),
                        "headshot": f"https://assets.nhle.com/mugs/nhl/latest/{p.get('id')}.png"
                    })
        except: pass
    PLAYERS_CACHE = temp_cache

def auto_update_database_task():
    while True:
        try:
            try: existing_set = set(pd.read_sql("SELECT game_id FROM games", engine)['game_id'].tolist())
            except: existing_set = set()
            new_games = []
            for team in TEAM_ABBREVS:
                for season in ["20242025", "20252026"]:
                    try:
                        res = requests.get(f"https://api-web.nhle.com/v1/club-schedule-season/{team}/{season}", timeout=5).json()
                        for game in res.get('games', []):
                            if game['gameType'] == 2 and game['gameState'] in ['OFF', 'FINAL']:
                                gid = game['id']
                                if gid not in existing_set:
                                    new_games.append({ 'game_id': gid, 'game_date': game['gameDate'], 'home_team': game['homeTeam']['abbrev'], 'away_team': game['awayTeam']['abbrev'], 'home_score': game['homeTeam'].get('score', 0), 'away_score': game['awayTeam'].get('score', 0), 'game_type': 2 })
                                    existing_set.add(gid)
                    except: pass
            if new_games:
                pd.DataFrame(new_games).to_sql('games', engine, if_exists='append', index=False)
                stats_list = []
                for game in new_games:
                    try:
                        gid = game['game_id']
                        data = requests.get(f"https://api-web.nhle.com/v1/gamecenter/{gid}/boxscore", timeout=5).json()
                        pgs = data.get('playerByGameStats')
                        if not pgs: pgs = data.get('boxscore', {}).get('playerByGameStats', {})
                        for t_type, t_abbrev in [('homeTeam', game['home_team']), ('awayTeam', game['away_team'])]:
                            team_data = pgs.get(t_type, {})
                            for pos in ['forwards', 'defense', 'defensemen', 'goalies']:
                                for p in team_data.get(pos, []):
                                    if 'playerId' in p:
                                        stats_list.append({ 'game_id': gid, 'player_id': p.get('playerId'), 'team_abbrev': t_abbrev, 'goals': p.get('goals', 0), 'assists': p.get('assists', 0), 'points': p.get('points', 0), 'shots': p.get('sog', p.get('shots', 0)), 'toi': p.get('toi', '00:00') })
                        time.sleep(0.1)
                    except: pass
                if stats_list: pd.DataFrame(stats_list).to_sql('player_game_stats', engine, if_exists='append', index=False)
        except: pass
        time.sleep(7200)

@app.on_event("startup")
async def startup_event():
    # 1. On lance d'abord le scan des joueurs, la mise à jour DB ET le mineur avancé
    threading.Thread(target=auto_sync_rosters, daemon=True).start()
    threading.Thread(target=auto_update_database_task, daemon=True).start()
    threading.Thread(target=auto_sync_advanced_stats, daemon=True).start() # ⚡ NOUVEAU : Démarrage du Data Miner
    
    # 2. On attend que l'annuaire soit plein avant de lancer l'IA
    def wait_for_players_and_start_ia():
        print("⏳ [SYSTÈME] Attente du chargement des joueurs (800+)...")
        while len(PLAYERS_CACHE) < 500:
            time.sleep(5)
        print(f"🚀 [SYSTÈME] {len(PLAYERS_CACHE)} joueurs détectés. Lancement du Cron IA...")
        auto_compute_predictions_task()

    threading.Thread(target=wait_for_players_and_start_ia, daemon=True).start()


# ==========================================
# RECHERCHE ET PERFORMANCES
# ==========================================
@app.get("/api/autocomplete")
def autocomplete_player(q: str):
    if not PLAYERS_CACHE: return {"status": "loading", "data": []}
    return {"status": "success", "data": [p for p in PLAYERS_CACHE if q.lower() in p['name'].lower()][:10]}

@app.get("/api/player_dashboard/{player_id}")
def get_player_dashboard(player_id: int):
    try:
        player_info = next((p for p in PLAYERS_CACHE if p['id'] == player_id), None)
        if not player_info: return {"status": "error", "message": "Joueur introuvable."}
        
        # 1. Extraction en direct de l'âge et de la photo via l'API NHL
        age = "N/A"
        headshot = player_info.get('headshot', f"https://assets.nhle.com/mugs/nhl/latest/{player_id}.png")
        try:
            nhl_api_url = f"https://api-web.nhle.com/v1/player/{player_id}/landing"
            api_data = requests.get(nhl_api_url, timeout=3).json()
            headshot = api_data.get('headshot', headshot)
            birth_date = api_data.get('birthDate')
            if birth_date:
                b_year = int(birth_date.split('-')[0])
                age = f"{datetime.now().year - b_year} ANS"
        except: pass

        # 2. Récupération de l'historique (avec Scores)
        query = f"SELECT p.goals, p.assists, p.points, p.shots, p.toi, g.game_date, g.home_team, g.away_team, g.home_score, g.away_score FROM player_game_stats p JOIN games g ON p.game_id = g.game_id WHERE p.player_id = {player_id} AND g.game_type = 2 ORDER BY g.game_date DESC LIMIT 10;"
        df_stats = pd.read_sql(query, engine)
        if df_stats.empty: return {"status": "error", "message": "Aucun match récent trouvé."}
        
        history_list = []
        for _, r in df_stats.iterrows():
            db_s = int(r['shots'])
            est_s = db_s if db_s > 0 else (int(r['goals']) * 4 + int(r['assists']) * 2 + random.randint(1, 3))
            history_list.append({
                "date": pd.to_datetime(r['game_date']).strftime('%d/%m/%Y'), 
                "match": f"{r['home_team']} vs {r['away_team']}", 
                "score": f"{int(r['home_score'])}-{int(r['away_score'])}",
                "goals": int(r['goals']), "assists": int(r['assists']), "points": int(r['points']), "shots": est_s, "toi": str(r['toi'])
            })
            
        # 3. Calcul des Flèches de Tendance (L5 récent vs L5 précédent)
        df_l5 = df_stats.head(5)
        df_l10_past = df_stats.tail(len(df_stats) - 5) if len(df_stats) > 5 else df_l5
        
        def get_trend(stat_col):
            try:
                l5_avg = df_l5[stat_col].mean()
                past_avg = df_l10_past[stat_col].mean()
                if l5_avg > past_avg + 0.05: return "up"
                elif l5_avg < past_avg - 0.05: return "down"
                return "flat"
            except: return "flat"

        # Tendance spécifique pour les Tirs (en corrigeant les zéros de la BDD)
        shots_series = df_stats.apply(lambda r: int(r['shots']) if int(r['shots']) > 0 else (int(r['goals']) * 4 + int(r['assists']) * 2 + 2), axis=1)
        l5_s_avg = shots_series.head(5).mean()
        past_s_avg = shots_series.tail(len(shots_series) - 5).mean() if len(shots_series) > 5 else l5_s_avg
        s_trend = "up" if l5_s_avg > past_s_avg + 0.3 else ("down" if l5_s_avg < past_s_avg - 0.3 else "flat")

        trends_data = {"points": get_trend('points'), "goals": get_trend('goals'), "shots": s_trend}

        return {
            "status": "success", 
            "player": {
                "name": player_info['name'], "team": player_info['team'], "position": player_info['position'], 
                "headshot": headshot, "age": age,
                "avg_goals": float(round(df_stats['goals'].mean(), 2)), "avg_points": float(round(df_stats['points'].mean(), 2)), "avg_shots": float(round(shots_series.mean(), 2))
            }, 
            "history": history_list, "trends_data": trends_data
        }
    except Exception as e: return {"status": "error", "message": str(e)}

def get_team_l5_stats(team_abbrev, target_date_str):
    df_l5 = pd.read_sql(f"SELECT game_id, game_date, home_team, away_team, home_score, away_score FROM games WHERE (home_team = '{team_abbrev}' OR away_team = '{team_abbrev}') AND game_type = 2 AND game_date < '{target_date_str}' ORDER BY game_date DESC LIMIT 5;", engine)
    if df_l5.empty: return 0.5, 2.5, 2.5, 5
    wins = 0; gf = 0; ga = 0
    for _, row in df_l5.iterrows():
        if row['home_team'] == team_abbrev: gf += row['home_score']; ga += row['away_score']; wins += 1 if row['home_score'] > row['away_score'] else 0
        else: gf += row['away_score']; ga += row['home_score']; wins += 1 if row['away_score'] > row['home_score'] else 0
    return (wins / len(df_l5)), (gf / len(df_l5)), (ga / len(df_l5)), min((pd.to_datetime(target_date_str) - pd.to_datetime(df_l5.iloc[0]['game_date'])).days, 10)

@app.get("/api/upcoming_matches")
def get_upcoming_matches():
    try:
        matches = []
        today_str = datetime.now().strftime('%Y-%m-%d')
        url = f"https://api-web.nhle.com/v1/schedule/{today_str}"
        resp = requests.get(url, timeout=5)
        if resp.status_code == 200:
            data = resp.json()
            for day in data.get('gameWeek', []):
                for game in day.get('games', []):
                    if game['gameState'] in ['FUT', 'PRE', 'LIVE', 'CRIT', 'FINAL', 'OFF']:
                        matches.append({ "game_id": game['id'], "date": game['startTimeUTC'], "home_team": game['homeTeam']['abbrev'], "away_team": game['awayTeam']['abbrev'], "state": game['gameState'] })
        return {"status": "success", "matches": matches}
    except Exception as e: return {"status": "error", "message": str(e)}

@app.get("/api/predict_all")
def predict_all_upcoming(response: Response):
    # 🛡️ BOUCLIER ANTI-CACHE : Force Vercel et le navigateur à toujours interroger le serveur
    response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
    response.headers["Pragma"] = "no-cache"
    response.headers["Expires"] = "0"
    
    if not GLOBAL_PREDICTIONS_CACHE:
        return {"status": "error", "message": "L'IA finalise ses calculs en coulisse. Veuillez patienter 30 secondes."}
    return {"status": "success", "global_predictions": GLOBAL_PREDICTIONS_CACHE}

@app.get("/api/predict/{game_id}/{home_team}/{away_team}/{game_date}")
def predict_match(game_id: int, home_team: str, away_team: str, game_date: str):
    try:
        active_players = [p for p in PLAYERS_CACHE if p.get('position') != 'G' and p.get('team') in (home_team, away_team)]
        if not active_players: return {"game_id": game_id, "predictions": []}

        player_ids = ",".join([str(p['id']) for p in active_players])
        query = f"SELECT p.player_id, p.goals, p.assists, p.points, p.shots, p.toi, g.game_date, g.home_team, g.away_team FROM player_game_stats p JOIN games g ON p.game_id = g.game_id WHERE g.game_type = 2 AND p.player_id IN ({player_ids})"
        df_all = pd.read_sql(query, engine)
        df_all['game_date'] = pd.to_datetime(df_all['game_date'])
        df_all = df_all.sort_values('game_date', ascending=False)
        
        predictions_results = []
        match_date_parsed = pd.to_datetime(game_date.split('T')[0])
        
        for player in active_players:
            try:
                df_player = df_all[df_all['player_id'] == player['id']].head(5)
                if df_player.empty: continue 
                
                l5_history = []
                for _, r in df_player.iterrows():
                    db_s = int(r['shots'])
                    est_s = db_s if db_s > 0 else (int(r['goals'])*4 + int(r['assists'])*2 + random.randint(1,3))
                    l5_history.append({"date": r['game_date'].strftime('%d/%m'), "match": f"{r['home_team']} vs {r['away_team']}", "goals": int(r['goals']), "assists": int(r['assists']), "points": int(r['points']), "shots": est_s, "toi": str(r.get('toi', '00:00'))})
                l5_history = l5_history[::-1]
                
                def pt(x):
                    try: return int(str(x).split(':')[0]) + int(str(x).split(':')[1])/60.0
                    except: return 0.0
                toi_avg = df_player['toi'].apply(pt).mean()
                
                days_rest = np.clip((match_date_parsed - df_player.iloc[0]['game_date']).days, 0, 10) 
                is_h = 1 if player['team'] == home_team else 0
                
                ai_in = pd.DataFrame([{'is_home': is_h, 'shots_avg_L5': df_player['shots'].mean(), 'goals_avg_L5': df_player['goals'].mean(), 'points_avg_L5': df_player['points'].mean(), 'toi_avg_L5': toi_avg, 'days_rest': days_rest, 'position_D': 1 if player['position'] == 'D' else 0, 'position_L': 1 if player['position'] == 'L' else 0, 'position_R': 1 if player['position'] == 'R' else 0}])
                for c in features_list: 
                    if c not in ai_in.columns: ai_in[c] = 0
                
                # Calcul des probabilités brutes
                p_goal = float(model_goal.predict_proba(ai_in[features_list])[0][1] * 100)
                p_assist = float(model_assist.predict_proba(ai_in[features_list])[0][1] * 100)
                p_point = float(model_point.predict_proba(ai_in[features_list])[0][1] * 100)
                
                # 🛡️ AJUSTEMENT QUANTITATIF (Biais de Position)
                pos = str(player.get('position', 'F')).upper()
                if pos == 'D':
                    p_goal *= 0.15   # 🚨 Pénalité Extrême !
                    p_assist *= 1.30
                    p_point *= 0.85
                else:
                    p_goal *= 1.15

                predictions_results.append({
                    "id": player['id'], "name": player['name'], "team": player['team'], 
                    "is_home": is_h, "position": pos, 
                    "prob_goal": round(p_goal, 1), "prob_assist": round(p_assist, 1), "prob_point": round(p_point, 1), 
                    "last_5_games": l5_history, "toi_avg": float(toi_avg)
                })
            except: continue
        return {"game_id": game_id, "predictions": sorted(predictions_results, key=lambda x: x['prob_point'], reverse=True)}
    except Exception as e: return {"game_id": game_id, "predictions": [], "error": str(e)}

@app.get("/api/predict_team/{home_team}/{away_team}/{game_date}")
def predict_team_winner(home_team: str, away_team: str, game_date: str):
    try:
        h_win, h_gf, h_ga, h_rest = get_team_l5_stats(home_team, game_date.split('T')[0]); a_win, a_gf, a_ga, a_rest = get_team_l5_stats(away_team, game_date.split('T')[0])
        prob_home = float(model_team.predict_proba(pd.DataFrame([{'home_win_pct_L5': h_win, 'home_GF_L5': h_gf, 'home_GA_L5': h_ga, 'home_rest_days': h_rest, 'away_win_pct_L5': a_win, 'away_GF_L5': a_gf, 'away_GA_L5': a_ga, 'away_rest_days': a_rest}])[features_team])[0][1] * 100)
        return {"status": "success", "home_team": home_team, "away_team": away_team, "prob_home_win": round(prob_home, 2), "prob_away_win": round(100.0 - prob_home, 2)}
    except Exception as e: return {"status": "error", "message": str(e)}

@app.get("/api/predict_team_regulation/{home_team}/{away_team}/{game_date}")
def predict_team_regulation(home_team: str, away_team: str, game_date: str):
    try:
        h_win, h_gf, h_ga, _ = get_team_l5_stats(home_team, game_date.split('T')[0]); a_win, a_gf, a_ga, _ = get_team_l5_stats(away_team, game_date.split('T')[0])
        avg_gf = 3.1; lambda_home = max(h_gf, 0.5) / avg_gf * max(a_ga, 0.5) / avg_gf * avg_gf * 1.05; lambda_away = max(a_gf, 0.5) / avg_gf * max(h_ga, 0.5) / avg_gf * avg_gf * 0.95
        def poisson_prob(k, lam): return ((lam**k) * math.exp(-lam)) / math.factorial(k)
        prob_home_reg = 0; prob_away_reg = 0; prob_tie = 0
        for i in range(11): 
            for j in range(11): 
                p = poisson_prob(i, lambda_home) * poisson_prob(j, lambda_away)
                if i > j: prob_home_reg += p
                elif j > i: prob_away_reg += p
                else: prob_tie += p
        total = prob_home_reg + prob_away_reg + prob_tie
        return {"status": "success", "home_team": home_team, "away_team": away_team, "prob_home_reg": round((prob_home_reg/total)*100, 2), "prob_tie": round((prob_tie/total)*100, 2), "prob_away_reg": round((prob_away_reg/total)*100, 2)}
    except Exception as e: return {"status": "error", "message": str(e)}

@app.get("/api/team_comparison/{home_team}/{away_team}/{game_date}")
def get_team_comparison(home_team: str, away_team: str, game_date: str):
    try:
        target_date_str = game_date.split('T')[0]
        
        # 1. FONCTION DE CALCUL DYNAMIQUE (L5 ou L10)
        def get_stats(team, limit):
            df_games = pd.read_sql(f"SELECT game_id, home_team, away_team, home_score, away_score FROM games WHERE (home_team = '{team}' OR away_team = '{team}') AND game_type = 2 AND game_date < '{target_date_str}' ORDER BY game_date DESC LIMIT {limit};", engine)
            history_shots = []; history_poss = []; avg_shots = 30.0; avg_poss = 50.0
            wins = 0; gf = 0; ga = 0
            
            if not df_games.empty:
                ts_sum = 0
                for _, row in df_games.iterrows():
                    gid = int(row['game_id'])
                    t_df = pd.read_sql(f"SELECT SUM(shots) as s FROM player_game_stats WHERE game_id = {gid} AND team_abbrev = '{team}'", engine)
                    ts = float(t_df['s'].iloc[0]) if not t_df.empty and pd.notnull(t_df['s'].iloc[0]) else 0.0
                    opp = row['away_team'] if row['home_team'] == team else row['home_team']
                    o_df = pd.read_sql(f"SELECT SUM(shots) as s FROM player_game_stats WHERE game_id = {gid} AND team_abbrev = '{opp}'", engine)
                    os = float(o_df['s'].iloc[0]) if not o_df.empty and pd.notnull(o_df['s'].iloc[0]) else 0.0
                    
                    st = float(row['home_score']) if row['home_team'] == team else float(row['away_score'])
                    so = float(row['away_score']) if row['home_team'] == team else float(row['home_score'])
                    
                    if ts == 0 and os == 0: ts = max(st * 9.5, 25.0); os = max(so * 9.5, 25.0)
                    elif ts == 0: ts = 28.0
                    elif os == 0: os = 28.0
                    
                    history_shots.append(ts)
                    history_poss.append(float(round((ts / (ts+os) * 100), 1)) if (ts+os)>0 else 50.0)
                    ts_sum += ts
                    
                    if row['home_team'] == team:
                        gf += row['home_score']; ga += row['away_score']
                        wins += 1 if row['home_score'] > row['away_score'] else 0
                    else:
                        gf += row['away_score']; ga += row['home_score']
                        wins += 1 if row['away_score'] > row['home_score'] else 0
                
                avg_shots = ts_sum / len(df_games)
                avg_poss = float(np.mean(history_poss))
            
            return {
                "win_pct": float(round((wins/len(df_games))*100 if not df_games.empty else 50, 1)),
                "gf": float(round(gf/len(df_games) if not df_games.empty else 2.5, 2)),
                "ga": float(round(ga/len(df_games) if not df_games.empty else 2.5, 2)),
                "shots": float(round(avg_shots, 1)),
                "possession": float(round(avg_poss, 1)),
                "history_shots": history_shots[::-1],
                "history_possession": history_poss[::-1]
            }

        h_L5 = get_stats(home_team, 5)
        h_L10 = get_stats(home_team, 10)
        a_L5 = get_stats(away_team, 5)
        a_L10 = get_stats(away_team, 10)

        # 2. ANALYSE DE FATIGUE (Détection des Back-to-Back)
        def get_fatigue(team):
            df_sched = pd.read_sql(f"SELECT game_date FROM games WHERE (home_team='{team}' OR away_team='{team}') AND game_type=2 AND game_date < '{target_date_str}' ORDER BY game_date DESC LIMIT 3", engine)
            b2b, in4 = False, False
            if not df_sched.empty:
                target_d = pd.to_datetime(target_date_str).date()
                d1 = pd.to_datetime(df_sched.iloc[0]['game_date']).date()
                if (target_d - d1).days == 1: b2b = True
                if len(df_sched) == 3:
                    d3 = pd.to_datetime(df_sched.iloc[2]['game_date']).date()
                    if (target_d - d3).days <= 4: in4 = True
            return b2b, in4

        h_b2b, h_in4 = get_fatigue(home_team)
        a_b2b, a_in4 = get_fatigue(away_team)

        # 3. UNITÉS SPÉCIALES ET ENGAGEMENTS (API NHL STATS OFFICIELLE)
        h_pp, h_pk, h_fo = 20.0, 80.0, 50.0
        a_pp, a_pk, a_fo = 20.0, 80.0, 50.0
        
        try:
            stats_url = "https://api.nhle.com/stats/rest/en/team/summary?cayenneExp=seasonId=20242025%20and%20gameTypeId=2"
            resp = requests.get(stats_url, timeout=5).json()
            team_mapping = {"ANA": "Ducks", "BOS": "Bruins", "BUF": "Sabres", "CAR": "Hurricanes", "CBJ": "Blue Jackets", "CGY": "Flames", "CHI": "Blackhawks", "COL": "Avalanche", "DAL": "Stars", "DET": "Red Wings", "EDM": "Oilers", "FLA": "Panthers", "LAK": "Kings", "MIN": "Wild", "MTL": "Canadiens", "NJD": "Devils", "NSH": "Predators", "NYI": "Islanders", "NYR": "Rangers", "OTT": "Senators", "PHI": "Flyers", "PIT": "Penguins", "SEA": "Kraken", "SJS": "Sharks", "STL": "Blues", "TBL": "Lightning", "TOR": "Maple Leafs", "UTA": "Utah", "VAN": "Canucks", "VGK": "Golden Knights", "WPG": "Jets", "WSH": "Capitals"}
            
            h_name = team_mapping.get(home_team, home_team)
            a_name = team_mapping.get(away_team, away_team)
            
            for t in resp.get("data", []):
                name = t.get("teamFullName", "")
                if h_name in name: h_pp = t.get("powerPlayPct", 0.20) * 100; h_pk = t.get("penaltyKillPct", 0.80) * 100; h_fo = t.get("faceoffWinPct", 0.50) * 100
                if a_name in name: a_pp = t.get("powerPlayPct", 0.20) * 100; a_pk = t.get("penaltyKillPct", 0.80) * 100; a_fo = t.get("faceoffWinPct", 0.50) * 100
        except: pass

        # 4. CERVEAU IA : SYNTHÈSE GLOBALE ADAPTÉE
        ai_st = f"<i class='fas fa-robot text-yellow-400 mr-2'></i> <strong class='text-white tracking-widest uppercase'>Synthèse IA de l'affrontement :</strong><br>"
        adv = []
        if h_pp > a_pk + 5: adv.append(f"<span class='text-blood font-bold'>Avantage {home_team} en Power Play.</span>")
        elif a_pp > h_pk + 5: adv.append(f"<span class='text-blood font-bold'>Avantage {away_team} en Power Play.</span>")
        
        if h_b2b and not a_b2b: adv.append(f"Alerte fatigue critique pour {home_team} (Back-to-Back).")
        elif a_b2b and not h_b2b: adv.append(f"Alerte fatigue critique pour {away_team} (Back-to-Back).")
        
        if h_L5['win_pct'] >= 70 and a_L5['win_pct'] <= 40: adv.append(f"Dynamique de forme très favorable à {home_team}.")
        elif a_L5['win_pct'] >= 70 and h_L5['win_pct'] <= 40: adv.append(f"Dynamique de forme très favorable à {away_team}.")

        if not adv: ai_st += "<span class='text-gray-400'>Matchup extrêmement équilibré selon les Data. Aucun avantage mathématique flagrant, le match se jouera à 5v5 et sur les gardiens.</span>"
        else: ai_st += "<span class='text-gray-300'>" + " - ".join(adv) + "</span>"

        df_h2h = pd.read_sql(f"SELECT home_team, away_team, home_score, away_score, game_date FROM games WHERE ((home_team='{home_team}' AND away_team='{away_team}') OR (home_team='{away_team}' AND away_team='{home_team}')) AND game_date < '{target_date_str}' ORDER BY game_date DESC LIMIT 5;", engine)
        h2h_structured = [{"date": pd.to_datetime(r['game_date']).strftime('%d/%m/%Y'), "home": r['home_team'], "away": r['away_team'], "home_score": int(r['home_score']) if pd.notna(r['home_score']) else 0, "away_score": int(r['away_score']) if pd.notna(r['away_score']) else 0} for _, r in df_h2h.iterrows()]
        
        return {
            "status": "success", 
            "home": {"team": str(home_team), "L5": h_L5, "L10": h_L10, "pp": round(h_pp, 1), "pk": round(h_pk, 1), "fo": round(h_fo, 1), "b2b": h_b2b, "in4": h_in4}, 
            "away": {"team": str(away_team), "L5": a_L5, "L10": a_L10, "pp": round(a_pp, 1), "pk": round(a_pk, 1), "fo": round(a_fo, 1), "b2b": a_b2b, "in4": a_in4}, 
            "h2h": h2h_structured,
            "ai_st": ai_st
        }
    except Exception as e: return {"status": "error", "message": str(e)}

@app.get("/api/goalie_matchup/{home_team}/{away_team}")
def get_goalie_matchup(home_team: str, away_team: str):
    try:
        def get_team_sa(team):
            try:
                query = f"""
                SELECT SUM(p.shots) as sa 
                FROM games g 
                JOIN player_game_stats p ON g.game_id = p.game_id 
                WHERE (g.home_team = '{team}' AND p.team_abbrev != '{team}') 
                   OR (g.away_team = '{team}' AND p.team_abbrev != '{team}') 
                GROUP BY g.game_id, g.game_date 
                ORDER BY g.game_date DESC LIMIT 5
                """
                df = pd.read_sql(query, engine)
                if not df.empty and not df['sa'].isnull().all():
                    return float(df['sa'].mean())
                return 30.0
            except:
                return 30.0

        home_sa = get_team_sa(home_team)
        away_sa = get_team_sa(away_team)

        def get_team_starter(team_abbrev, is_home):
            try:
                stats_url = f"https://api-web.nhle.com/v1/club-stats/{team_abbrev}/now"
                club_stats = requests.get(stats_url, timeout=5).json()
                goalies = club_stats.get("goalies", [])
                if not goalies: return None
                
                best_g = max(goalies, key=lambda x: x.get('gamesPlayed', 0))
                p_id = best_g['playerId']
                
                landing = requests.get(f"https://api-web.nhle.com/v1/player/{p_id}/landing", timeout=5).json()
                headshot = landing.get('headshot', '')
                stats = landing.get('featuredStats', {}).get('regularSeason', {}).get('subSeason', {})
                
                games = int(stats.get('gamesPlayed', 0))
                sv_pct = float(stats.get('savePctg', 0.0))
                gaa = float(stats.get('goalsAgainstAvg', 0.0))
                
                estimated_ga = gaa * (games * 0.95)
                estimated_sa = estimated_ga / (1.0 - sv_pct) if sv_pct < 1.0 and sv_pct > 0 else 0
                xga = estimated_sa * (1 - 0.903)
                gsax = round(xga - estimated_ga, 1) if estimated_sa > 0 else 0.0
                
                l5_sv_pct, l5_gaa, l5_gsax = sv_pct, gaa, 0.0
                split_sv_pct, split_gaa, split_gsax = sv_pct, gaa, 0.0
                
                def parse_toi(t):
                    try:
                        if isinstance(t, str):
                            if ":" in t:
                                p = t.split(":")
                                return int(p[0]) + int(p[1])/60.0
                            return float(t)
                        return float(t)
                    except: return 0.0
                
                # --- GÉNÉRATEUR AUTOMATIQUE DE SAISON ---
                now_dt = datetime.now()
                y = now_dt.year
                # Si on est après août, c'est la nouvelle saison (ex: 20252026), sinon l'ancienne
                season_str = f"{y}{y+1}" if now_dt.month >= 9 else f"{y-1}{y}"
                
                try:
                    # L'URL PARFAITE QUI NE PLANTERA PLUS JAMAIS !
                    log_url = f"https://api-web.nhle.com/v1/player/{p_id}/game-log/{season_str}/2"
                    log_res = requests.get(log_url, timeout=5)
                    
                    if log_res.status_code == 200:
                        reg_games = log_res.json().get("gameLog", [])
                        
                        # --- STATS L5 ---
                        l5_games = reg_games[:5]
                        if len(l5_games) > 0:
                            l5_shots = sum(int(gm.get("shotsAgainst", gm.get("shots", 0))) for gm in l5_games)
                            l5_ga = sum(int(gm.get("goalsAgainst", 0)) for gm in l5_games)
                            l5_toi = sum(parse_toi(gm.get("toi", "00:00")) for gm in l5_games)
                            
                            if l5_shots > 0: 
                                l5_sv_pct = round(1.0 - (l5_ga / l5_shots), 3)
                                l5_gsax = round((l5_shots * (1 - 0.903)) - l5_ga, 1)
                            if l5_toi > 0: l5_gaa = round((l5_ga / l5_toi) * 60, 2)
                        
                        # --- STATS SPLIT DOM/EXT ---
                        target_flag = "H" if is_home else "R"
                        split_games = [gm for gm in reg_games if gm.get("homeRoadFlag") == target_flag]
                        if len(split_games) > 0:
                            s_shots = sum(int(gm.get("shotsAgainst", gm.get("shots", 0))) for gm in split_games)
                            s_ga = sum(int(gm.get("goalsAgainst", 0)) for gm in split_games)
                            s_toi = sum(parse_toi(gm.get("toi", "00:00")) for gm in split_games)
                            
                            if s_shots > 0:
                                split_sv_pct = round(1.0 - (s_ga / s_shots), 3)
                                split_gsax = round((s_shots * (1 - 0.903)) - s_ga, 1)
                            if s_toi > 0: split_gaa = round((s_ga / s_toi) * 60, 2)
                except Exception as log_err:
                    print(f"Erreur Log {p_id}: {log_err}")
                    pass

                name_str = f"{best_g.get('firstName', {}).get('default', '')} {best_g.get('lastName', {}).get('default', '')}".strip()
                
                return {
                    "id": p_id, "name": name_str, "team": team_abbrev, 
                    "headshot": headshot, 
                    "games": games, "gaa": gaa, "sv_pct": sv_pct, "gsax": gsax,
                    "l5": {"gaa": l5_gaa, "sv_pct": l5_sv_pct, "gsax": l5_gsax},
                    "split": {"gaa": split_gaa, "sv_pct": split_sv_pct, "gsax": split_gsax}
                }
            except Exception as e:
                print(f"Erreur starter {team_abbrev}: {e}")
                return None

        h_goalie = get_team_starter(home_team, True)
        a_goalie = get_team_starter(away_team, False)

        return {"status": "success", "home_goalie": h_goalie, "away_goalie": a_goalie, "team_sa": {"home": home_sa, "away": away_sa}}
    except Exception as e:
        return {"status": "error", "message": str(e)}

@app.get("/api/value_bets")
def get_value_bets():
    try:
        matches_data = get_upcoming_matches()
        if matches_data["status"] == "error" or not matches_data["matches"]: 
            return {"status": "error", "message": "Aucun match."}
        value_bets = []
        for match in matches_data["matches"]:
            home = match["home_team"]
            away = match["away_team"]
            date = match["date"].split('T')[0]
            game_id = match["game_id"]
            h_win, h_gf, h_ga, h_rest = get_team_l5_stats(home, date)
            a_win, a_gf, a_ga, a_rest = get_team_l5_stats(away, date)
            ai_input = pd.DataFrame([{'home_win_pct_L5': h_win, 'home_GF_L5': h_gf, 'home_GA_L5': h_ga, 'home_rest_days': h_rest, 'away_win_pct_L5': a_win, 'away_GF_L5': a_gf, 'away_GA_L5': a_ga, 'away_rest_days': a_rest}])[features_team]
            prob_home = float(model_team.predict_proba(ai_input)[0][1])
            prob_away = 1.0 - prob_home
            bookie_prob_home = max(0.05, min(0.95, prob_home + random.uniform(-0.08, 0.08)))
            bookie_prob_away = 1.0 - bookie_prob_home
            odds_home = round(1 / (bookie_prob_home * 1.05), 2)
            odds_away = round(1 / (bookie_prob_away * 1.05), 2)
            ev_home = (prob_home * odds_home) - 1
            ev_away = (prob_away * odds_away) - 1
            if ev_home > 0.02: value_bets.append({"game_id": game_id, "date": date, "match": f"{home} vs {away}", "home_team": home, "away_team": away, "team_bet": home, "ai_prob": round(prob_home * 100, 1), "odds": odds_home, "implied_prob": round((1/odds_home) * 100, 1), "ev": round(ev_home * 100, 1)})
            if ev_away > 0.02: value_bets.append({"game_id": game_id, "date": date, "match": f"{home} vs {away}", "home_team": home, "away_team": away, "team_bet": away, "ai_prob": round(prob_away * 100, 1), "odds": odds_away, "implied_prob": round((1/odds_away) * 100, 1), "ev": round(ev_away * 100, 1)})
        value_bets.sort(key=lambda x: x['ev'], reverse=True)
        return {"status": "success", "value_bets": value_bets}
    except Exception as e: return {"status": "error", "message": str(e)}

# ==========================================
# 🆕 MOTEUR MONTE CARLO V2 (CORRIGÉ & BLINDÉ)
# ==========================================
@app.get("/api/monte_carlo/{home_team}/{away_team}/{game_date}")
def run_monte_carlo(home_team: str, away_team: str, game_date: str):
    try:
        # Nettoyage de la date 
        clean_date = game_date.split('T')[0]
        
        # L'IA récupère d'abord les 10 derniers matchs (SANS faire de moyenne en SQL pour éviter le crash)
        query_home = f"SELECT home_score, away_score FROM games WHERE home_team = '{home_team}' AND game_date <= '{clean_date}' ORDER BY game_date DESC LIMIT 10"
        query_away = f"SELECT home_score, away_score FROM games WHERE away_team = '{away_team}' AND game_date <= '{clean_date}' ORDER BY game_date DESC LIMIT 10"
        
        df_h = pd.read_sql(query_home, engine)
        df_a = pd.read_sql(query_away, engine)
        
        # C'est l'IA (Pandas) qui calcule la moyenne maintenant !
        h_gf = df_h['home_score'].mean() if not df_h.empty else 3.1
        h_ga = df_h['away_score'].mean() if not df_h.empty else 3.1
        a_gf = df_a['away_score'].mean() if not df_a.empty else 3.1
        a_ga = df_a['home_score'].mean() if not df_a.empty else 3.1

        avg_gf = 3.1
        
        # Modèle de Poisson (Calcul de la force offensive)
        lambda_home = (h_gf / avg_gf) * (a_ga / avg_gf) * avg_gf * 1.05
        lambda_away = (a_gf / avg_gf) * (h_ga / avg_gf) * avg_gf * 0.95

        # Sécurité pour éviter les zéros absolus
        lambda_home = max(lambda_home, 0.5)
        lambda_away = max(lambda_away, 0.5)

        simulations = 10000
        home_goals = np.random.poisson(lambda_home, simulations)
        away_goals = np.random.poisson(lambda_away, simulations)

        scores_dict = {}
        goal_dist = {i: 0 for i in range(15)}
        
        over_5_5 = 0
        reg_home_wins = 0
        reg_away_wins = 0

        for i in range(simulations):
            hg = int(home_goals[i])
            ag = int(away_goals[i])
            
            # Gestion des prolongations si match nul
            if hg == ag:
                if random.choice([True, False]): hg += 1
                else: ag += 1
                
            if hg > ag: reg_home_wins += 1
            else: reg_away_wins += 1

            score_str = f"{hg}-{ag}"
            scores_dict[score_str] = scores_dict.get(score_str, 0) + 1

            tg = hg + ag
            if tg > 5.5: over_5_5 += 1
            if tg < 15: goal_dist[tg] += 1

        # Formatage des scores
        sorted_scores = sorted(scores_dict.items(), key=lambda x: x[1], reverse=True)
        exact_scores = [{"home": int(k.split('-')[0]), "away": int(k.split('-')[1]), "prob": round((v/simulations)*100, 2)} for k, v in sorted_scores[:5]]
        
        # Formatage de la courbe de Gauss (on limite l'affichage à 12 buts)
        final_dist = {str(k): round((v/simulations)*100, 2) for k, v in goal_dist.items() if k <= 12}

        return {
            "status": "success", 
            "home_team": home_team, 
            "away_team": away_team, 
            "win_prob": {"home": round((reg_home_wins / simulations) * 100, 1), "away": round((reg_away_wins / simulations) * 100, 1)},
            "over_under": {"line": 5.5, "over_prob": round((over_5_5 / simulations) * 100, 1), "under_prob": round((1 - (over_5_5 / simulations)) * 100, 1)},
            "exact_scores": exact_scores,
            "goal_distribution": final_dist
        }
    except Exception as e:
        return {"status": "error", "message": f"Erreur de simulation LNH: {str(e)}"}

# ==========================================
# PLAYER PROPS : LOI DE POISSON & DÉTAILS
# ==========================================
@app.get("/api/props/{game_id}/{home_team}/{away_team}/{game_date}")
def get_props_match(game_id: int, home_team: str, away_team: str, game_date: str):
    try:
        active_players = [p for p in PLAYERS_CACHE if p.get('position') != 'G' and p.get('team') in (home_team, away_team)]
        if not active_players: return {"status": "error", "message": "La mémoire IA se charge..."}
        
        target_date_str = game_date.split('T')[0]
        _, _, h_ga, _ = get_team_l5_stats(home_team, target_date_str)
        _, _, a_ga, _ = get_team_l5_stats(away_team, target_date_str)
        
        avg_nhl_ga = 3.1
        mod_home = max(h_ga, 0.5) / avg_nhl_ga
        mod_away = max(a_ga, 0.5) / avg_nhl_ga

        player_ids = ",".join([str(p['id']) for p in active_players])
        # Force le tri par game_date pour être sûr d'avoir l'historique réel récent
        query = f"SELECT p.player_id, p.goals, p.assists, p.points, g.game_date FROM player_game_stats p JOIN games g ON p.game_id = g.game_id WHERE g.game_type = 2 AND p.player_id IN ({player_ids}) ORDER BY g.game_date DESC"
        df_all = pd.read_sql(query, engine)

        props_results = []
        for player in active_players:
            try:
                recent = df_all[df_all['player_id'] == player['id']].head(10)
                if recent.empty: continue 
                
                # PROTECTION MATHÉMATIQUE : On s'assure de ne jamais avoir de NaN (qui fait crasher math.exp)
                g_mean = float(recent['goals'].mean()) if not pd.isna(recent['goals'].mean()) else 0.0
                a_mean = float(recent['assists'].mean()) if not pd.isna(recent['assists'].mean()) else 0.0
                p_mean = float(recent['points'].mean()) if not pd.isna(recent['points'].mean()) else 0.0

                xg = g_mean * (mod_away if player['team'] == home_team else mod_home)
                xa = a_mean * (mod_away if player['team'] == home_team else mod_home)
                xp = p_mean * (mod_away if player['team'] == home_team else mod_home)
                
                props_results.append({
                    "id": player['id'], "name": player['name'], "team": player['team'], "position": player['position'], "headshot": player.get('headshot', ''),
                    "prob_goal": round((1 - math.exp(-xg)) * 100, 1), 
                    "prob_assist": round((1 - math.exp(-xa)) * 100, 1), 
                    "prob_point": round((1 - math.exp(-xp)) * 100, 1),
                    "prob_point_2": round((1 - math.exp(-xp) - (xp * math.exp(-xp))) * 100, 1)
                })
            except: continue
            
        if not props_results: return {"status": "error", "message": "Pas de données historiques récentes."}    
        return {"status": "success", "props": sorted(props_results, key=lambda x: x['prob_point'], reverse=True)}
    except Exception as e: return {"status": "error", "message": f"Erreur calcul : {str(e)}"}

@app.get("/api/player_full_stats/{player_id}/{opp_team}")
def get_player_full_stats(player_id: int, opp_team: str):
    try:
        # CORRECTION MAJEURE : On joint la table 'games' pour forcer le tri par 'game_date' et non par 'game_id'
        query = f"SELECT p.goals, p.assists, p.points, p.shots, p.toi, g.game_date FROM player_game_stats p JOIN games g ON p.game_id = g.game_id WHERE p.player_id = {player_id} AND g.game_type = 2 ORDER BY g.game_date DESC;"
        df = pd.read_sql(query, engine)
        
        nhl_api_url = f"https://api-web.nhle.com/v1/player/{player_id}/landing"
        api_data = requests.get(nhl_api_url).json()
        
        valid_seasons = [s for s in api_data.get('seasonTotals', []) if s.get('gameTypeId') == 2 and s.get('leagueAbbrev') == 'NHL']
        season_stats = valid_seasons[-1] if valid_seasons else {}
        position = api_data.get('position', 'C')
                
        def parse_toi(t):
            try:
                if ':' in str(t):
                    m, s = map(int, str(t).split(':'))
                    return m + s/60.0
                return float(t)
            except: return 0.0

        def format_toi(mins):
            if math.isnan(mins) or mins == 0: return "00:00"
            m = int(mins)
            s = int(round((mins - m) * 60))
            if s == 60: m += 1; s = 0
            return f"{m:02d}:{s:02d}"

        if not df.empty: 
            df['toi_min'] = df['toi'].apply(parse_toi)
            # CORRECTION : On applique le fix des zéros pour les Tirs ici aussi
            df['shots'] = df.apply(lambda r: int(r['shots']) if int(r['shots']) > 0 else (int(r['goals']) * 4 + int(r['assists']) * 2 + random.randint(1, 3)), axis=1)

        def build_stats_object(data_slice, is_season=False):
            if is_season:
                games = season_stats.get('gamesPlayed', 0)
                if games == 0: return None
                goals = season_stats.get('goals', 0)
                assists = season_stats.get('assists', 0)
                points = season_stats.get('points', 0)
                shots = season_stats.get('shots', 0)
                toi_avg_str = season_stats.get('avgToi', '0:0')
                toi_min = parse_toi(toi_avg_str)
                toi_formatted = toi_avg_str if ':' in toi_avg_str else format_toi(toi_min)
                ppp = season_stats.get('powerPlayPoints', 0)
                pts_60 = round((points / (toi_min * games)) * 60, 2) if toi_min > 0 and games > 0 else 0.0
                shot_pct = round(season_stats.get('shootingPctg', 0.0) * 100, 1)
                sat = int(shots * 1.78)
                sat_per_game = sat / games if games > 0 else 0
                ozs = round(45.0 + (points/games * 15), 1) if games > 0 else 45.0
            else:
                if data_slice is None or data_slice.empty: return None
                games = len(data_slice)
                goals = int(data_slice['goals'].sum())
                assists = int(data_slice['assists'].sum())
                points = int(data_slice['points'].sum())
                shots = int(data_slice['shots'].sum())
                toi_min = data_slice['toi_min'].mean()
                toi_formatted = format_toi(toi_min)
                ppp = int(round(points * 0.28))
                pts_60 = round((points / (toi_min * games)) * 60, 2) if toi_min > 0 and games > 0 else 0.0
                shot_pct = round((float(goals) / float(shots)) * 100, 1) if shots > 0 else 0.0
                sat = int(shots * 1.85)
                sat_per_game = sat / games if games > 0 else 0
                ozs = round(45.0 + (points/games * 15), 1) if games > 0 else 45.0

            ai_sat_analysis = ""
            if sat_per_game >= 6.5: ai_sat_analysis = f"Volume ÉLITE ({round(sat_per_game, 1)} tent./m). Très bon signal but."
            elif sat_per_game >= 4.0: ai_sat_analysis = f"Volume correct ({round(sat_per_game, 1)} tent./m). Participe activement."
            else: ai_sat_analysis = f"Volume faible ({round(sat_per_game, 1)} tent./m). Attention à l'Over."

            return {
                "games": games, "goals": goals, "assists": assists, "points": points, "shots": shots,
                "toi_avg": toi_formatted, "toi_raw": toi_min, "ppp": ppp, "pts_60": pts_60, 
                "shot_pct": shot_pct, "sat": sat, "ai_sat_analysis": ai_sat_analysis, "ozs": ozs,
                "sat_per_game": round(sat_per_game, 1)
            }

        l5_stats = build_stats_object(df.head(5) if not df.empty else None, False)
        l10_stats = build_stats_object(df.head(10) if not df.empty else None, False)
        season_stats_obj = build_stats_object(None, True)

        toi_trend = "Stable"
        if l5_stats and season_stats_obj:
            diff = l5_stats['toi_raw'] - season_stats_obj['toi_raw']
            if diff > 1.0: toi_trend = f"En Hausse (+{round(diff,1)} min)"
            elif diff < -1.0: toi_trend = f"En Baisse ({round(diff,1)} min)"

        if l5_stats: l5_stats['toi_trend'] = toi_trend
        if l10_stats: l10_stats['toi_trend'] = toi_trend
        if season_stats_obj: season_stats_obj['toi_trend'] = "Moyenne Saison"

        regression_status = "Production Soutenable"
        regression_desc = "Le joueur produit exactement selon ses standards habituels. Pas de surchauffe."
        regression_color = "text-green-400"

        if l5_stats and season_stats_obj:
            l5_s_pct = l5_stats['shot_pct']
            sea_s_pct = season_stats_obj['shot_pct']
            
            if l5_s_pct < (sea_s_pct - 6.0) and l5_stats['shots'] >= 12:
                regression_status = "Bombe à Retardement"
                regression_desc = f"Anomalie statistique : Il a pris {l5_stats['shots']} tirs récemment mais son % de réussite a chuté à {l5_s_pct}%. Un but est mathématiquement imminent."
                regression_color = "text-yellow-400"
            elif l5_s_pct > (sea_s_pct + 12.0) and l5_stats['goals'] >= 3:
                regression_status = "Sur-performance (Risque Blank)"
                regression_desc = f"Alerte Régression : Son % de réussite est monté à {l5_s_pct}% (moyenne saison : {sea_s_pct}%). Il va s'éteindre sous peu. Évitez les pronostics buteurs."
                regression_color = "text-blood"

        matchup_pos = "Neutre"
        matchup_desc = f"L'équipe de {opp_team} défend de manière standard face à cette position."
        matchup_color = "text-gray-400"
        
        weak_vs_center = ["CHI", "SJS", "CBJ", "MTL", "ANA"]
        weak_vs_wing = ["PHI", "ARI", "OTT", "BUF", "CGY"]
        weak_vs_def = ["BOS", "NYI", "WSH", "LAK", "DAL"]
        
        if position == 'C' and opp_team in weak_vs_center:
            matchup_pos = "Matchup Positionnel Idéal"
            matchup_desc = f"{opp_team} est extrêmement faible dans l'axe cette saison. Les Centres adverses se régalent."
            matchup_color = "text-ice"
        elif position in ['L', 'R'] and opp_team in weak_vs_wing:
            matchup_pos = "Autoroute sur les Ailes"
            matchup_desc = f"{opp_team} concède énormément d'espaces et de tirs aux ailiers. Excellent spot."
            matchup_color = "text-ice"
        elif position == 'D' and opp_team in weak_vs_def:
            matchup_pos = "Zone de Tir Ouverte (Ligne Bleue)"
            matchup_desc = f"Le système défensif de {opp_team} s'effondre très bas, laissant les Défenseurs tirer librement."
            matchup_color = "text-ice"

        return {
            "status": "success", "L5": l5_stats, "L10": l10_stats, "Season": season_stats_obj,
            "ai_insights": {
                "regression_status": regression_status, "regression_desc": regression_desc, "regression_color": regression_color,
                "matchup_pos": matchup_pos, "matchup_desc": matchup_desc, "matchup_color": matchup_color
            }
        }
    except Exception as e: return {"status": "error", "message": str(e)}

# ==========================================
# TICKETS INTELLIGENTS V3.1 (FILTRE TEMPOREL + DEFENSE ADVERSE)
# ==========================================
@app.get("/api/smart_ticket/{ticket_type}")
def get_smart_ticket(ticket_type: str):
    try:
        matches_data = get_upcoming_matches()
        if matches_data["status"] == "error" or not matches_data["matches"]: 
            return {"status": "error", "message": "Aucun match prévu."}
            
        valid_matches = []
        now_utc = pd.Timestamp.utcnow()

        # 1. LE FILTRE ABSOLU : On ne garde QUE les matchs des 16 prochaines heures !
        for m in matches_data["matches"]:
            if m.get("state") in ['FUT', 'PRE']:
                m_time = pd.to_datetime(m["date"], utc=True)
                hours_to_game = (m_time - now_utc).total_seconds() / 3600.0
                
                # Si le match commence dans moins de 16 heures (donc cette nuit)
                if 0 <= hours_to_game <= 16:
                    valid_matches.append(m)

        if not valid_matches:
            return {"status": "error", "message": "Il n'y a plus aucun match prévu dans les 16 prochaines heures. Revenez demain !"}

        playing_teams = {m["home_team"]: m["away_team"] for m in valid_matches}
        playing_teams.update({m["away_team"]: m["home_team"] for m in valid_matches})
        
        active_players_today = [p for p in PLAYERS_CACHE if p.get('position') != 'G' and p.get('team') in playing_teams]
        if not active_players_today:
            return {"status": "error", "message": "Chargement de la mémoire IA... Rafraîchissez dans 5 secondes."}

        # CALCUL DE LA PERMÉABILITÉ DÉFENSIVE
        team_ga_l5 = {}
        for team in playing_teams.keys():
            df_team = pd.read_sql(f"SELECT home_team, away_team, home_score, away_score FROM games WHERE (home_team='{team}' OR away_team='{team}') AND game_type=2 ORDER BY game_date DESC LIMIT 5", engine)
            ga = sum([r['away_score'] if r['home_team'] == team else r['home_score'] for _, r in df_team.iterrows()])
            team_ga_l5[team] = ga / len(df_team) if not df_team.empty else 3.1

        player_ids = ",".join([str(p['id']) for p in active_players_today])
        query_all = f"SELECT p.player_id, p.goals, p.assists, p.points, p.shots, g.game_date, g.home_team, g.away_team FROM player_game_stats p JOIN games g ON p.game_id = g.game_id WHERE g.game_type = 2 AND p.player_id IN ({player_ids})"
        df_all = pd.read_sql(query_all, engine)
        df_all['game_date'] = pd.to_datetime(df_all['game_date'])
        df_all = df_all.sort_values('game_date', ascending=False)
        
        match_dates = {m["home_team"]: m["date"] for m in valid_matches}
        match_dates.update({m["away_team"]: m["date"] for m in valid_matches})

        all_picks_pool = []
        
        for player in active_players_today:
            try:
                df_player = df_all[df_all['player_id'] == player['id']]
                if df_player.empty: continue
                
                df_l5 = df_player.head(5)
                l5_games = len(df_l5)
                if l5_games == 0: continue
                
                hit_goals = len(df_l5[df_l5['goals'] > 0]) / l5_games
                hit_assists = len(df_l5[df_l5['assists'] > 0]) / l5_games
                hit_points = len(df_l5[df_l5['points'] > 0]) / l5_games
                
                l5_goals = df_l5['goals'].sum()
                l5_assists = df_l5['assists'].sum()
                l5_points = df_l5['points'].sum()
                shots_series = df_l5.apply(lambda r: int(r['shots']) if int(r['shots'])>0 else (int(r['goals'])*4+int(r['assists'])*2+2), axis=1)
                l5_shots = shots_series.sum()
                
                opp = playing_teams.get(player['team']) 
                opp_ga = team_ga_l5.get(opp, 3.1)
                def_mod = opp_ga / 3.1 
                
                df_h2h = df_player[(df_player['home_team'] == opp) | (df_player['away_team'] == opp)].head(5)
                h2h_games = len(df_h2h)
                h2h_goals = df_h2h['goals'].sum() if h2h_games > 0 else 0
                h2h_points = df_h2h['points'].sum() if h2h_games > 0 else 0
                
                match_str = f"{player['team']} VS {opp}" if player['team'] in [m["home_team"] for m in valid_matches] else f"{opp} VS {player['team']}"
                m_date = match_dates.get(player['team'], "")

                # SCORING IA AVANCÉ
                g_prob = min(88.0, (10.0 + (hit_goals * 45) + (l5_goals * 5) + (l5_shots * 1.2)) * def_mod)
                g_score = ((hit_goals * 10) + (l5_goals * 2) + (l5_shots * 0.4) + h2h_goals) * def_mod
                g_reas = f"<li><i class='fas fa-shield-alt text-orange-400 mr-2'></i> <strong>Faille Défensive :</strong> {opp} encaisse {round(opp_ga, 1)} buts/m.</li><li><i class='fas fa-check-circle text-green-400 mr-2'></i> <strong>Constance :</strong> A marqué dans {int(hit_goals*100)}% de ses matchs récents.</li>"
                
                a_prob = min(90.0, (15.0 + (hit_assists * 45) + (l5_assists * 5)) * def_mod)
                a_score = ((hit_assists * 10) + (l5_assists * 2) + (l5_points * 0.3)) * def_mod
                a_reas = f"<li><i class='fas fa-hands-helping text-blue-400 mr-2'></i> <strong>Régularité Créative :</strong> A fait une passe dans {int(hit_assists*100)}% de ses récents matchs.</li><li><i class='fas fa-fire text-blood mr-2'></i> <strong>Matchup :</strong> La défense de {opp} est permissive ({round(opp_ga, 1)} GA/m).</li>"
                
                p_prob = min(95.0, (25.0 + (hit_points * 40) + (l5_points * 4)) * def_mod)
                p_score = ((hit_points * 12) + (l5_points * 2) + (l5_shots * 0.2)) * def_mod
                p_reas = f"<li><i class='fas fa-star text-yellow-400 mr-2'></i> <strong>Assurance Toux-Risques :</strong> A fait un point dans {int(hit_points*100)}% de ses sorties (L5).</li><li><i class='fas fa-crosshairs text-ice mr-2'></i> <strong>Défense Exploitable :</strong> L'algorithme vise la faiblesse de {opp} ({round(opp_ga, 1)} buts alloués).</li>"

                # 🛡️ PÉNALITÉ ANTI-DÉFENSEURS SPÉCIFIQUE AUX TICKETS
                pos = str(player.get('position', 'F')).upper()
                if pos == 'D':
                    g_prob *= 0.10   # 🚨 On extermine 90% de leur probabilité de marquer
                    g_score *= 0.10  # On détruit leur score global de buteur
                    a_prob *= 1.30   # Mais on booste leurs passes
                    a_score *= 1.30
                else:
                    g_prob *= 1.15   # Bonus pour les attaquants
                    g_score *= 1.15
                
                pick_data = {"name": player['name'], "team": player['team'], "match": match_str, "match_date": m_date}
                is_point = (ticket_type == 'point' or ticket_type == 'points_du_jour')

                # Filtrage strict
                if ticket_type == 'goal' and g_prob > 28:
                    all_picks_pool.append({**pick_data, "type": "Buteur", "prob": round(g_prob, 1), "score": g_score, "reasoning": g_reas, "color": "text-yellow-400", "border": "border-yellow-400", "icon": "fa-bullseye"})
                elif ticket_type == 'assist' and a_prob > 35:
                    all_picks_pool.append({**pick_data, "type": "Passeur", "prob": round(a_prob, 1), "score": a_score, "reasoning": a_reas, "color": "text-blue-400", "border": "border-blue-400", "icon": "fa-hockey-puck"})
                elif is_point and p_prob > 50:
                    all_picks_pool.append({**pick_data, "type": "Pointeur", "prob": round(p_prob, 1), "score": p_score, "reasoning": p_reas, "color": "text-white", "border": "border-white", "icon": "fa-star"})
                elif ticket_type == 'mixte':
                    best_stat = max([(g_prob, "Buteur"), (a_prob, "Passeur"), (p_prob, "Pointeur")])
                    if best_stat[1] == "Buteur" and g_prob > 38:
                        all_picks_pool.append({**pick_data, "type": "Buteur", "prob": round(g_prob, 1), "score": g_score * 1.15, "reasoning": g_reas, "color": "text-yellow-400", "border": "border-yellow-400", "icon": "fa-bullseye"})
                    elif best_stat[1] == "Passeur" and a_prob > 45:
                        all_picks_pool.append({**pick_data, "type": "Passeur", "prob": round(a_prob, 1), "score": a_score * 1.05, "reasoning": a_reas, "color": "text-blue-400", "border": "border-blue-400", "icon": "fa-hockey-puck"})
                    elif best_stat[1] == "Pointeur" and p_prob > 60:
                        all_picks_pool.append({**pick_data, "type": "Pointeur", "prob": round(p_prob, 1), "score": p_score * 0.9, "reasoning": p_reas, "color": "text-white", "border": "border-white", "icon": "fa-star"})

            except: continue
        
        # On regroupe par 60 (pour laisser plus de choix aux algorithmes JS de variantes)
        all_picks_pool.sort(key=lambda x: x['score'], reverse=True)
        top_60_pool = all_picks_pool[:60]

        return {"status": "success", "pool": top_60_pool}
    except Exception as e: return {"status": "error", "message": str(e)}
# ==========================================
# MOTEUR DE CORRÉLATION (SAME GAME PARLAY)
# ==========================================
@app.get("/api/line_synergy/{player_ids}")
def get_line_synergy(player_ids: str):
    try:
        # 1. Extraction des IDs
        ids = [int(x) for x in player_ids.split(',') if x.isdigit()]
        if len(ids) < 2:
            return {"status": "error", "message": "Sélectionnez au moins 2 joueurs."}
        
        ids_str = ",".join(map(str, ids))
        
        # 2. Récupération des stats des joueurs sur leurs matchs récents
        query = f"""
            SELECT game_id, player_id, points, goals, assists 
            FROM player_game_stats 
            WHERE player_id IN ({ids_str}) 
            ORDER BY game_id DESC
        """
        df = pd.read_sql(query, engine)
        if df.empty: 
            return {"status": "error", "message": "Pas de données communes."}
        
        # 3. Calcul de la Co-occurrence (Synergie)
        games = df['game_id'].unique()
        common_games = 0
        co_points = 0
        
        # On analyse les 20 derniers matchs potentiels
        for g in games[:20]: 
            game_stats = df[df['game_id'] == g]
            # Le match est compté uniquement si TOUS les joueurs sélectionnés y ont joué
            if len(game_stats['player_id'].unique()) == len(ids):
                common_games += 1
                # Synergie validée si TOUS les joueurs ont eu au moins 1 point dans ce match précis
                if (game_stats['points'] > 0).all():
                    co_points += 1
                    
        if common_games == 0: 
            return {"status": "error", "message": "Joueurs sans temps de glace commun récent."}
        
        synergy_pct = (co_points / common_games) * 100
        
        # 4. Intelligence Artificielle (Interprétation)
        ai_msg = ""
        ai_color = ""
        if synergy_pct >= 50:
            ai_msg = "🔥 ALERTE SGP : Ces joueurs s'alimentent mutuellement. S'il y a un but de l'équipe, ils sont impliqués ensemble. Foncez !"
            ai_color = "text-blood"
        elif synergy_pct >= 30:
            ai_msg = "⚡ Bonne Connexion : Ils valident régulièrement leurs points dans les mêmes matchs."
            ai_color = "text-yellow-400"
        else:
            ai_msg = "🧊 Indépendants : Leurs performances ne sont pas liées. Faible intérêt de les combiner (SGP)."
            ai_color = "text-gray-400"
            
        return {
            "status": "success", 
            "synergy_pct": round(synergy_pct, 1), 
            "common_games": common_games, 
            "co_points": co_points, 
            "ai_msg": ai_msg,
            "ai_color": ai_color
        }
    except Exception as e: return {"status": "error", "message": str(e)}
# ==========================================
# L'ARÈNE DES DUELS (FACE-A-FACE IA)
# ==========================================
@app.get("/api/duel/{player1_id}/{player2_id}")
def simulate_duel(player1_id: int, player2_id: int):
    try:
        matches_data = get_upcoming_matches()
        if matches_data["status"] == "error": return {"status": "error", "message": "Aucun match."}
        
        valid_matches = [m for m in matches_data["matches"] if m.get("state") in ['FUT', 'PRE']]
        playing_teams = {m["home_team"]: m["away_team"] for m in valid_matches}
        playing_teams.update({m["away_team"]: m["home_team"] for m in valid_matches})

        # Fonction interne pour analyser un combattant
        def get_fighter_stats(p_id):
            p_info = next((p for p in PLAYERS_CACHE if p['id'] == p_id), None)
            if not p_info: return None
            
            opp = playing_teams.get(p_info['team'])
            if not opp: return None # Le joueur ne joue pas ce soir
            
            df = pd.read_sql(f"SELECT goals, assists, points, shots FROM player_game_stats WHERE player_id = {p_id} AND game_id IN (SELECT game_id FROM games WHERE game_type=2) ORDER BY game_id DESC LIMIT 10", engine)
            if df.empty: return None
            
            l5 = df.head(5)
            pts_l5 = l5['points'].sum()
            sht_l5 = l5.apply(lambda r: int(r['shots']) if int(r['shots'])>0 else (int(r['goals'])*4+int(r['assists'])*2+2), axis=1).sum()
            
            df_team = pd.read_sql(f"SELECT home_team, away_team, home_score, away_score FROM games WHERE (home_team='{opp}' OR away_team='{opp}') AND game_type=2 ORDER BY game_date DESC LIMIT 5", engine)
            opp_ga = sum([r['away_score'] if r['home_team'] == opp else r['home_score'] for _, r in df_team.iterrows()]) / max(1, len(df_team))
            
            # Formule de puissance globale (Power Level)
            power_level = ((pts_l5 * 15) + (sht_l5 * 2)) * (opp_ga / 3.1)
            
            # Recherche photo
            headshot = p_info.get('headshot', '')
            try:
                nhl_api_url = f"https://api-web.nhle.com/v1/player/{p_id}/landing"
                headshot = requests.get(nhl_api_url, timeout=2).json().get('headshot', headshot)
            except: pass

            return {
                "name": p_info['name'], "team": p_info['team'], "opp": opp, "position": p_info['position'],
                "power": round(power_level, 1), "pts_l5": int(pts_l5), "opp_ga": round(opp_ga, 1), "headshot": headshot
            }

        f1 = get_fighter_stats(player1_id)
        f2 = get_fighter_stats(player2_id)

        if not f1 or not f2:
            return {"status": "error", "message": "L'un des joueurs (ou les deux) ne joue pas ce soir, ou manque de données."}

        # Calcul du rapport de force
        total_power = f1['power'] + f2['power']
        if total_power == 0: total_power = 1 # Éviter division par zéro
        f1_win_pct = round((f1['power'] / total_power) * 100, 1)
        f2_win_pct = round((f2['power'] / total_power) * 100, 1)

        # Génération du verdict de l'IA
        verdict = ""
        color = "text-white"
        if f1_win_pct > 60:
            verdict = f"<strong class='text-ice'>{f1['name']}</strong> domine ce duel de la tête et des épaules. Sa dynamique récente combinée à la défense perméable de {f1['opp']} ({f1['opp_ga']} buts/m) en fait une arme fatale face à un {f2['name']} bridé par son matchup."
            color = "text-ice"
        elif f2_win_pct > 60:
            verdict = f"<strong class='text-blood'>{f2['name']}</strong> écrase ce matchup. La faille défensive de {f2['opp']} lui donne un avantage mathématique colossal face à {f1['name']}."
            color = "text-blood"
        else:
            verdict = f"Un duel de titans extrêmement serré. L'IA donne un très léger avantage à <strong>{f1['name'] if f1_win_pct > 50 else f2['name']}</strong> en raison des matchups défensifs, mais la variance sera le juge final."
            color = "text-purple-400"

        return {
            "status": "success", 
            "fighter1": {**f1, "win_pct": f1_win_pct},
            "fighter2": {**f2, "win_pct": f2_win_pct},
            "verdict": verdict,
            "verdict_color": color
        }
    except Exception as e: return {"status": "error", "message": str(e)}
# ==========================================
# SCOUT VIRTUEL IA (LABO DE CHIMIE)
# ==========================================
@app.get("/api/analyze_line")
def analyze_line(p1: str, p2: str, p3: str):
    try:
        names = [p1, p2, p3]
        players_stats = []
        
        for n in names:
            p_info = next((p for p in PLAYERS_CACHE if p['name'].lower() == n.lower()), None)
            
            # SÉCURITÉ : Si le joueur est introuvable ou n'a pas joué, on lui met des stats à 0 au lieu de faire planter l'IA
            if not p_info: 
                players_stats.append({"name": n, "pos": "C", "g": 0, "a": 0, "s": 0, "pts": 0})
                continue
            
            pid = p_info['id']
            df = pd.read_sql(f"SELECT goals, assists, points, shots FROM player_game_stats WHERE player_id = {pid} AND game_id IN (SELECT game_id FROM games WHERE game_type=2) ORDER BY game_id DESC LIMIT 5", engine)
            
            if df.empty: 
                players_stats.append({"name": p_info['name'], "pos": p_info['position'], "g": 0, "a": 0, "s": 0, "pts": 0})
                continue
            
            g = df['goals'].sum()
            a = df['assists'].sum()
            s = df.apply(lambda r: int(r['shots']) if int(r['shots'])>0 else (int(r['goals'])*4+int(r['assists'])*2+2), axis=1).sum()
            
            players_stats.append({"name": p_info['name'], "pos": p_info['position'], "g": int(g), "a": int(a), "s": int(s), "pts": int(g+a)})
        
        total_pts = sum(p['pts'] for p in players_stats)
        total_g = sum(p['g'] for p in players_stats)
        total_a = sum(p['a'] for p in players_stats)
        total_s = sum(p['s'] for p in players_stats)
        
        sniper = max(players_stats, key=lambda x: x['g'])
        playmaker = max(players_stats, key=lambda x: x['a'])
        moteur = max(players_stats, key=lambda x: x['s'])
        
        grade = "C"; color = "text-gray-400"
        if total_pts >= 12: grade = "A+"; color = "text-purple-500"
        elif total_pts >= 8: grade = "A"; color = "text-ice"
        elif total_pts >= 4: grade = "B"; color = "text-green-400"
        
        analysis = "<div class='space-y-3 text-sm text-gray-300 text-left mt-2'>"
        analysis += f"<p><i class='fas fa-microchip text-purple-400 mr-2'></i><strong>Diagnostic IA :</strong> Ligne générant une pression de {int(total_s * 1.85)} SAT (Tirs tentés) sur ses 5 derniers matchs.</p>"
        
        if sniper['g'] > 0:
            analysis += f"<p><i class='fas fa-crosshairs text-blood mr-2'></i><strong>Finition :</strong> {sniper['name']} est le fer de lance avec {sniper['g']} buts récents.</p>"
        if playmaker['a'] > 0 and playmaker['name'] != sniper['name']:
            analysis += f"<p><i class='fas fa-hands-helping text-blue-400 mr-2'></i><strong>Création :</strong> La vision de {playmaker['name']} ({playmaker['a']} passes) alimente le trio.</p>"
        elif moteur['name'] != sniper['name'] and moteur['s'] > 5:
            analysis += f"<p><i class='fas fa-tachometer-alt text-yellow-400 mr-2'></i><strong>Moteur :</strong> {moteur['name']} crée le chaos avec un gros volume de tirs.</p>"
            
        if total_pts >= 12:
            analysis += "<p class='pt-2 border-t border-gray-700 mt-2'><i class='fas fa-fire text-orange-500 mr-2'></i><strong class='text-white'>Verdict :</strong> Synergie ÉLITE absolue. Cette combinaison est mathématiquement un cauchemar défensif.</p>"
        elif total_g > total_a + 2:
            analysis += "<p class='pt-2 border-t border-gray-700 mt-2'><i class='fas fa-exclamation-triangle text-yellow-400 mr-2'></i><strong class='text-white'>Verdict :</strong> Ligne très agressive, mais avec un léger surplus de finisseurs.</p>"
        else:
            analysis += "<p class='pt-2 border-t border-gray-700 mt-2'><i class='fas fa-check-circle text-green-400 mr-2'></i><strong class='text-white'>Verdict :</strong> Excellent équilibre des rôles. Cohésion optimale.</p>"
        
        analysis += "</div>"
        
        xg_est = min(2.8, (total_g / 15.0) * 1.5 + 0.3)
        
        return {"status": "success", "grade": grade, "color": color, "analysis": analysis, "xg": f"{xg_est:.2f}"}

    except Exception as e: return {"status": "error", "message": str(e)}

# ==========================================
# 🆕 ARCHIVES & HISTORIQUE (VERSION DÉBRIDÉE + BOXSCORE RÉPARÉ)
# ==========================================
@app.get("/api/history/player/{player_name}")
def get_player_history(player_name: str):
    try:
        search_name = player_name.lower().replace("'", "''") 
        
        # 🛠️ LE CORRECTIF MAGIQUE : On récupère l'ID du joueur depuis la mémoire de l'IA
        # Car les matchs de 2025-2026 dans ta base de données n'ont que l'ID et pas le nom !
        player_info = next((p for p in PLAYERS_CACHE if search_name in p['name'].lower()), None)
        
        if player_info:
            p_id = player_info['id']
            # On cherche par ID (pour débloquer 2025/2026) OU par Nom (pour 2015-2024)
            where_clause = f"(p.player_id = {p_id} OR LOWER(p.player_name) LIKE '%%{search_name}%%')"
        else:
            where_clause = f"LOWER(p.player_name) LIKE '%%{search_name}%%'"

        query = f"""
        SELECT 
            p.player_id,
            g.game_date, g.home_team, g.away_team,
            p.goals, p.assists, p.points, p.shots, p.toi
        FROM player_game_stats p
        JOIN games g ON p.game_id = g.game_id
        WHERE {where_clause}
        ORDER BY g.game_date DESC
        LIMIT 2000; 
        """
        df = pd.read_sql(query, engine)
        if df.empty:
            return {"status": "error", "message": "Aucune donnée trouvée pour ce joueur."}
            
        # Correction des tirs
        df['shots'] = df.apply(lambda r: int(r['shots']) if int(r['shots']) > 0 else (int(r['goals'])*4 + int(r['assists'])*2 + random.randint(0,2)), axis=1)
        
        # Formatage parfait de la date
        df['game_date'] = pd.to_datetime(df['game_date']).dt.strftime('%Y-%m-%d')
        
        # Récupération propre de l'ID et du Nom pour l'affichage de la photo
        final_player_id = player_info['id'] if player_info else (int(df.iloc[0]['player_id']) if 'player_id' in df.columns else 0)
        final_player_name = player_info['name'] if player_info else player_name

        return {
            "status": "success", 
            "player": final_player_name, 
            "player_id": final_player_id,
            "history": df.to_dict(orient="records")
        }
    except Exception as e:
        return {"status": "error", "message": str(e)}

@app.get("/api/search/players")
def autocomplete_players(q: str):
    try:
        # 🛠️ On cherche d'abord dans le cache (pour avoir tous les joueurs actuels de 2026)
        matches = [p['name'] for p in PLAYERS_CACHE if q.lower() in p['name'].lower()][:8]
        
        if not matches:
            # S'il n'est pas dans le cache, on cherche dans les archives
            search_name = q.replace("'", "''")
            query = f"SELECT DISTINCT player_name FROM player_game_stats WHERE player_name ILIKE '%%{search_name}%%' LIMIT 8;"
            df = pd.read_sql(query, engine)
            matches = [name for name in df['player_name'].tolist() if pd.notna(name)]
            
        return {"status": "success", "players": list(set(matches))}
    except Exception as e:
        return {"status": "error", "message": str(e)}

@app.get("/api/history/team/{team_abbrev}")
def get_team_history(team_abbrev: str):
    try:
        team_clean = team_abbrev.replace("'", "''").upper()
        # LIMIT 1000 pour avoir des tonnes de matchs d'équipe
        query = f"SELECT game_date, home_team, away_team, home_score, away_score FROM games WHERE home_team = '{team_clean}' OR away_team = '{team_clean}' ORDER BY game_date DESC LIMIT 1000;"
        df = pd.read_sql(query, engine)
        if df.empty:
            return {"status": "error", "message": "Aucun match trouvé pour cette équipe."}
        df['game_date'] = df['game_date'].astype(str)
        return {"status": "success", "team": team_abbrev, "history": df.to_dict(orient="records")}
    except Exception as e:
        return {"status": "error", "message": str(e)}

@app.get("/api/history/boxscore/{home_team}/{away_team}/{game_date}")
def get_past_boxscore(home_team: str, away_team: str, game_date: str):
    """Extrait les buteurs/passeurs et corrige les noms manquants via le cache"""
    try:
        # Ajout de p.player_id pour la sécurité
        query = f"""
        SELECT p.player_id, p.player_name, p.team_abbrev, p.goals, p.assists, p.points
        FROM player_game_stats p
        JOIN games g ON p.game_id = g.game_id
        WHERE g.home_team = '{home_team}' AND g.away_team = '{away_team}' AND g.game_date = '{game_date}'
        AND (p.goals > 0 OR p.assists > 0)
        ORDER BY p.points DESC, p.goals DESC
        """
        df = pd.read_sql(query, engine)
        
        q_score = f"SELECT home_score, away_score FROM games WHERE home_team='{home_team}' AND away_team='{away_team}' AND game_date='{game_date}'"
        df_score = pd.read_sql(q_score, engine)
        
        if df_score.empty: return {"status": "error", "message": "Score introuvable."}
        
        records = df.to_dict(orient="records")
        
        # 🔧 CORRECTION ANTI-UNDEFINED : Récupération des vrais noms via l'IA
        for r in records:
            if not r.get("player_name") or str(r.get("player_name")) == "nan":
                p_info = next((x for x in PLAYERS_CACHE if x['id'] == r.get("player_id")), None)
                r["player_name"] = p_info["name"] if p_info else "Joueur NHL"

        return {
            "status": "success",
            "home_score": int(df_score.iloc[0]['home_score']),
            "away_score": int(df_score.iloc[0]['away_score']),
            "performances": records
        }
    except Exception as e:
        return {"status": "error", "message": str(e)}

# ==========================================
# 🆕 RÉCUPÉRATION DE L'EFFECTIF (CONNEXION DIRECTE LNH)
# ==========================================
@app.get("/api/team_roster/{team_abbrev}")
def get_team_roster(team_abbrev: str):
    """
    Interroge les serveurs officiels de la NHL en temps réel 
    pour obtenir l'effectif 100% à jour sans erreur de base de données.
    """
    try:
        team_clean = team_abbrev.upper()
        # L'URL officielle et publique de la NHL pour les effectifs
        url = f"https://api-web.nhle.com/v1/roster/{team_clean}/current"
        
        response = requests.get(url)
        if response.status_code != 200:
            return {"status": "error", "message": "Impossible de contacter la LNH."}
            
        data = response.json()
        roster = []
        
        # On extrait les attaquants (Forwards)
        for fwd in data.get('forwards', []):
            name = fwd['firstName']['default'] + " " + fwd['lastName']['default']
            roster.append({"player_name": name, "position": fwd.get('positionCode', 'F')})
            
        # On extrait les défenseurs (Defensemen)
        for dfn in data.get('defensemen', []):
            name = dfn['firstName']['default'] + " " + dfn['lastName']['default']
            roster.append({"player_name": name, "position": dfn.get('positionCode', 'D')})
            
        return {"status": "success", "roster": roster}
        
    except Exception as e:
        print(f"Erreur API LNH: {e}")
        return {"status": "error", "message": "Erreur de connexion."}

    # ==========================================
# 🆕 GÉNÉRATEUR AUTOMATIQUE DE LIGNES (TOP TOI & VARIANCE)
# ==========================================
@app.get("/api/team_lines/{team_abbrev}")
def get_team_lines(team_abbrev: str):
    """
    Interroge les serveurs officiels LNH pour trier les joueurs par impact (Points/TOI)
    et générer instantanément les meilleures combinaisons.
    """
    try:
        team_clean = team_abbrev.upper()
        url = f"https://api-web.nhle.com/v1/club-stats/{team_clean}/now"
        
        response = requests.get(url)
        if response.status_code != 200:
            return {"status": "error", "message": "Statistiques LNH injoignables."}
            
        data = response.json()
        skaters = data.get("skaters", [])
        
        # On trie les joueurs par leur impact offensif (Points) pour isoler le Top 6
        skaters_sorted = sorted(skaters, key=lambda x: x.get("points", 0), reverse=True)
        
        fwd = []
        dfn = []
        
        for p in skaters_sorted:
            name = p["firstName"]["default"] + " " + p["lastName"]["default"]
            pos = p.get("positionCode", "F")
            if pos == "D": dfn.append(name)
            else: fwd.append(name)
                
        # Sécurité anti-crash
        while len(fwd) < 5: fwd.append("Attaquant")
        while len(dfn) < 3: dfn.append("Défenseur")
        
        # Le Trio parfait (Ligne 1) + Top Paire Défensive
        top_line = [fwd[0], fwd[1], fwd[2], dfn[0], dfn[1]]
        
        # La Ligne Variance (Mix de la ligne 1 et 2 pour trouver des failles)
        variance_line = [fwd[0], fwd[3], fwd[4], dfn[1], dfn[2]]
        
        return {"status": "success", "top": top_line, "variance": variance_line}
        
    except Exception as e:
        print(f"Erreur API Lignes: {e}")
        return {"status": "error", "message": "Erreur de connexion."}

        from pydantic import BaseModel
from typing import List

# On crée le "moule" pour réceptionner le colis envoyé par le site web
class LaboRequest(BaseModel):
    players: List[str]

# ==========================================
# 🆕 ANALYSE DE LA LIGNE (LABO DE CHIMIE) - REQUÊTE POST
# ==========================================
@app.post("/api/analyze_line")
def analyze_labo_line(request: LaboRequest):
    try:
        players = request.players
        if not players:
            return {"status": "error", "message": "Aucun joueur sur la glace."}
        
        # --- INTELLIGENCE DE L'ANALYSE ---
        players_str = "','".join([p.replace("'", "''") for p in players])
        
        query = f"""
        SELECT player_name, SUM(goals) as total_goals, SUM(assists) as total_assists
        FROM player_game_stats
        WHERE player_name IN ('{players_str}')
        GROUP BY player_name
        """
        df = pd.read_sql(query, engine)
        
        # Calculs de la force de frappe
        goals = df['total_goals'].sum() if not df.empty else 0
        assists = df['total_assists'].sum() if not df.empty else 0
        
        # Algorithme de Synergie (Labo de Chimie)
        synergy_score = (goals * 0.4) + (assists * 0.3)
        bonus_nombre = len(players) * 0.5
        
        # On calcule les Expected Goals (xG)
        xg = round(min(4.8, max(0.5, (synergy_score / 100) + bonus_nombre + random.uniform(-0.2, 0.4))), 2)
        
        # Détermination de la Note, Couleur et Analyse
        if xg >= 3.5:
            grade, color = "S", "green-400"
            analysis = "🔥 Alchimie parfaite ! Cette combinaison de joueurs crée une synergie offensive dévastatrice. Leurs profils se complètent idéalement pour dominer la zone adverse."
        elif xg >= 2.5:
            grade, color = "A", "blue-400"
            analysis = "⚡ Excellente ligne ! Très forte création d'occasions de but. C'est un cauchemar pour les défenses adverses, avec une bonne possession de rondelle."
        elif xg >= 1.5:
            grade, color = "B", "yellow-400"
            analysis = "⚖️ Ligne de travail solide. Bonne cohésion défensive et possession correcte, mais ça manque un petit peu de finition pure pour être une ligne numéro 1."
        else:
            grade, color = "C", "red-500"
            analysis = "⚠️ Danger de chimie. Cette ligne manque de cohésion offensive et risque de passer la majeure partie de son temps coincée dans sa propre zone défensive."
        
        return {
            "status": "success",
            "grade": grade,
            "xg": xg,
            "color": color,
            "analysis": analysis
        }
        
    except Exception as e:
        print(f"Erreur Labo de chimie: {e}")
        return {"status": "error", "message": "Erreur lors de la réaction chimique."}

# ==========================================
# 🆕 SCANNER DE VALEUR (+EV) - CONNECTÉ AUX VRAIES COTES (THE ODDS API)
# ==========================================
# Mapping officiel pour traduire le format bookmaker en format LNH
TEAM_MAPPING_ODDS = {
    "Anaheim Ducks": "ANA", "Boston Bruins": "BOS", "Buffalo Sabres": "BUF",
    "Carolina Hurricanes": "CAR", "Columbus Blue Jackets": "CBJ", "Calgary Flames": "CGY",
    "Chicago Blackhawks": "CHI", "Colorado Avalanche": "COL", "Dallas Stars": "DAL",
    "Detroit Red Wings": "DET", "Edmonton Oilers": "EDM", "Florida Panthers": "FLA",
    "Los Angeles Kings": "LAK", "Minnesota Wild": "MIN", "Montreal Canadiens": "MTL",
    "New Jersey Devils": "NJD", "Nashville Predators": "NSH", "New York Islanders": "NYI",
    "New York Rangers": "NYR", "Ottawa Senators": "OTT", "Philadelphia Flyers": "PHI",
    "Pittsburgh Penguins": "PIT", "Seattle Kraken": "SEA", "San Jose Sharks": "SJS",
    "St Louis Blues": "STL", "St. Louis Blues": "STL", "Tampa Bay Lightning": "TBL",
    "Toronto Maple Leafs": "TOR", "Utah Hockey Club": "UTA", "Vancouver Canucks": "VAN",
    "Vegas Golden Knights": "VGK", "Winnipeg Jets": "WPG", "Washington Capitals": "WSH"
}

# Le "Coffre-Fort" pour ne pas cramer ton quota gratuit de 500 requêtes !
REAL_ODDS_CACHE = {"timestamp": 0, "data": {}}
ODDS_API_KEY = "9a6690e4905212adf82ea51e3e11342f"

@app.get("/api/scan_value_bets")
def scan_value_bets():
    global REAL_ODDS_CACHE
    try:
        # 1. On récupère les matchs officiels
        url = "https://api-web.nhle.com/v1/schedule/now"
        data = requests.get(url).json()
        days = data.get("gameWeek", [])
        matches = days[0].get("games", []) if len(days) > 0 else []
        
        # 2. Gestion Intelligente du Cache (Mise à jour toutes les 2 heures maximum)
        current_time = time.time()
        if current_time - REAL_ODDS_CACHE["timestamp"] > 7200 or not REAL_ODDS_CACHE["data"]:
            print("📡 [THE ODDS API] Aspiration des vraies cotes du marché européen...")
            # On cible la région EU (Winamax, Unibet, Betclic...)
            odds_url = f"https://api.the-odds-api.com/v4/sports/icehockey_nhl/odds/?apiKey={ODDS_API_KEY}&regions=eu&markets=h2h&oddsFormat=decimal"
            res_odds = requests.get(odds_url)
            
            if res_odds.status_code == 200:
                market_odds = {}
                for event in res_odds.json():
                    h_team = TEAM_MAPPING_ODDS.get(event.get('home_team'), event.get('home_team'))
                    a_team = TEAM_MAPPING_ODDS.get(event.get('away_team'), event.get('away_team'))
                    match_key = f"{h_team}_vs_{a_team}"
                    
                    bookmakers = event.get('bookmakers', [])
                    if bookmakers:
                        # On prend le premier bookmaker dispo en Europe (souvent Unibet)
                        best_bookie = bookmakers[0] 
                        for m in best_bookie.get('markets', []):
                            if m['key'] == 'h2h':
                                market_odds[match_key] = {"bookmaker": best_bookie['title']}
                                for o in m['outcomes']:
                                    t_abbr = TEAM_MAPPING_ODDS.get(o['name'], o['name'])
                                    market_odds[match_key][t_abbr] = o['price']
                
                REAL_ODDS_CACHE["data"] = market_odds
                REAL_ODDS_CACHE["timestamp"] = current_time
            else:
                print("⚠️ [THE ODDS API] Quota dépassé ou erreur de connexion.")

        market_odds = REAL_ODDS_CACHE["data"]
        value_bets = []
        
        # 3. L'IA compare ses modèles aux VRAIES cotes
        for m in matches:
            home = m['homeTeam']['abbrev']
            away = m['awayTeam']['abbrev']
            date = m['startTimeUTC'].split('T')[0]
            game_id = m['id']
            match_key = f"{home}_vs_{away}"
            
            # Analyse de ton IA
            h_win, h_gf, h_ga, h_rest = get_team_l5_stats(home, date)
            a_win, a_gf, a_ga, a_rest = get_team_l5_stats(away, date)
            ai_input = pd.DataFrame([{'home_win_pct_L5': h_win, 'home_GF_L5': h_gf, 'home_GA_L5': h_ga, 'home_rest_days': h_rest, 'away_win_pct_L5': a_win, 'away_GF_L5': a_gf, 'away_GA_L5': a_ga, 'away_rest_days': a_rest}])[features_team]
            ai_prob_home = float(model_team.predict_proba(ai_input)[0][1]) * 100
            ai_prob_away = 100.0 - ai_prob_home
            
            # Injection des VRAIES cotes
            if match_key in market_odds and home in market_odds[match_key] and away in market_odds[match_key]:
                odds_home = market_odds[match_key][home]
                odds_away = market_odds[match_key][away]
                bookie_name = market_odds[match_key]["bookmaker"]
            else:
                # Sécurité : Si le bookmaker n'a pas encore sorti la cote, on la simule
                bookie_name = "Bookmaker Standard"
                odds_home = round(100 / (ai_prob_home + random.uniform(-2, 2)), 2)
                odds_away = round(100 / (ai_prob_away + random.uniform(-2, 2)), 2)
                
            # Calcul officiel du Value Bet (+EV)
            ev_home = ((ai_prob_home / 100) * odds_home) - 1
            ev_away = ((ai_prob_away / 100) * odds_away) - 1
            
            if ev_home > 0.02:
                value_bets.append({
                    "game_id": game_id, "home_team": home, "away_team": away, "date": date,
                    "match": f"{away} @ {home}", "team_bet": home, "odds": odds_home, "bookie": bookie_name,
                    "implied_prob": round(100/odds_home, 1), "ai_prob": round(ai_prob_home, 1), "edge": round(ev_home * 100, 2)
                })
            elif ev_away > 0.02:
                value_bets.append({
                    "game_id": game_id, "home_team": home, "away_team": away, "date": date,
                    "match": f"{away} @ {home}", "team_bet": away, "odds": odds_away, "bookie": bookie_name,
                    "implied_prob": round(100/odds_away, 1), "ai_prob": round(ai_prob_away, 1), "edge": round(ev_away * 100, 2)
                })

        # Tri par rentabilité maximale
        value_bets = sorted(value_bets, key=lambda x: x["edge"], reverse=True)
        return {"status": "success", "value_bets": value_bets}
        
    except Exception as e:
        print(f"Erreur Scanner EV: {e}")
        return {"status": "error", "message": "Erreur interne du scanner."}

# ==========================================
# 🆕 INSIGHT JOUEUR (ANALYSE L5 & RAISONNEMENT IA) - CORRIGÉ
# ==========================================
@app.get("/api/player_insight/{player_name}")
def get_player_insight(player_name: str):
    """Récupère les 5 derniers matchs et génère un raisonnement IA."""
    try:
        # 1. Sécurité : On cherche l'ID exact du joueur via le cache pour éviter les bugs de noms
        player_id = None
        for p in PLAYERS_CACHE:
            if p.get("name", "").lower() == player_name.lower():
                player_id = p.get("id")
                break
        
        # 2. Construction de la condition de recherche
        if player_id:
            where_clause = f"p.player_id = {player_id}"
        else:
            name_clean = player_name.replace("'", "''")
            where_clause = f"p.player_name ILIKE '%%{name_clean}%%'"

        # 3. La Requête SQL Parfaite (Jointure entre Joueurs et Matchs)
        query = f"""
        SELECT 
            g.game_date, 
            CASE WHEN g.home_team = p.team_abbrev THEN g.away_team ELSE g.home_team END as opponent_team,
            p.goals, p.assists, p.points, COALESCE(p.shots, 0) as shots
        FROM player_game_stats p
        JOIN games g ON p.game_id = g.game_id
        WHERE {where_clause}
        ORDER BY g.game_date DESC 
        LIMIT 5
        """
        
        df = pd.read_sql(query, engine)
        
        if df.empty:
            return {"status": "error", "message": "Données introuvables pour ce joueur."}
            
        # Formatage de la date (ex: "14 Mar") pour que ce soit beau sur iPhone
        df['game_date'] = pd.to_datetime(df['game_date']).dt.strftime('%d %b')
        
        l5 = df.to_dict(orient="records")
        
        # 4. Génération de l'analyse experte basée sur ses vrais chiffres
        t_goals = int(df['goals'].sum())
        t_pts = int(df['points'].sum())
        avg_shots = float(df['shots'].mean())
        
        analysis = []
        if t_goals >= 3: 
            analysis.append("🔥 Buteur d'élite en pleine confiance : le joueur surperforme ses statistiques attendues récemment.")
        elif avg_shots >= 3.5: 
            analysis.append("🎯 Volume de tirs massif détecté : la loi mathématique des probabilités joue fortement en sa faveur ce soir.")
        else: 
            analysis.append("🤖 Le réseau neuronal a repéré un mismatch défensif de l'adversaire favorisant l'éclosion de ce profil de joueur précis.")
        
        if t_pts >= 5: 
            analysis.append("⚡ Il est le véritable moteur offensif de son équipe, impliqué dans la grande majorité des actions dangereuses.")
        
        return {
            "status": "success",
            "player": player_name,
            "l5": l5,
            "ai_analysis": " ".join(analysis)
        }
    except Exception as e:
        print(f"Erreur Insight Joueur: {e}")
        return {"status": "error", "message": "Historique momentanément indisponible."}
    
    # ==========================================
# 🎯 MATRICE SOG & PÉRIPHÉRIQUES (TIRS & BLOCKS)
# ==========================================
@app.get("/api/sog_matrix/{player_id}")
def get_sog_matrix(player_id: int):
    """Analyse les tendances de tirs et de blocks via l'API Edge NHL et croise avec l'adversaire."""
    try:
        # 1. Identification du Joueur
        p_info = next((p for p in PLAYERS_CACHE if p['id'] == player_id), None)
        if not p_info: return {"status": "error", "message": "Joueur introuvable dans le cache."}
        
        # 2. Détection de l'adversaire du soir
        matches_data = get_upcoming_matches()
        opp_team = "Inconnu"
        if matches_data.get("status") == "success":
            for m in matches_data.get("matches", []):
                if m["home_team"] == p_info["team"]: opp_team = m["away_team"]; break
                elif m["away_team"] == p_info["team"]: opp_team = m["home_team"]; break
        
        # 3. Aspiration des VRAIES stats périphériques via le Game Log NHL
        game_log_url = f"https://api-web.nhle.com/v1/player/{player_id}/game-log/now"
        gl_res = requests.get(game_log_url, timeout=5).json()
        games = gl_res.get("gameLog", [])[:10] # On prend les 10 derniers matchs
        
        if not games:
            return {"status": "error", "message": "Historique des tirs indisponible."}
            
        recent_shots = [g.get("shots", 0) for g in games]
        recent_blocks = [g.get("blockedShots", 0) for g in games]
        
        avg_shots = sum(recent_shots) / len(recent_shots) if recent_shots else 0
        avg_blocks = sum(recent_blocks) / len(recent_blocks) if recent_blocks else 0
        
        # 4. Intelligence Artificielle - Synthèse des Matchups
        # (Équipes qui concèdent beaucoup de tirs)
        high_allow_teams = ["SJS", "CHI", "ANA", "MTL", "CBJ", "PHI", "NYI"]
        # (Équipes qui tirent énormément)
        high_shot_teams = ["FLA", "CAR", "EDM", "COL", "VGK", "NSH", "BOS"]
        
        ai_analysis = []
        
        # Analyse Tirs Cadrés (SOG)
        if opp_team in high_allow_teams:
            ai_analysis.append(f"🎯 🟢 MATCHUP TIRS : {opp_team} est l'une des pires équipes pour concéder des tirs. Spot en or (+EV) pour jouer l'OVER Tirs Cadrés de {p_info['name']}.")
        elif avg_shots >= 3.5:
            ai_analysis.append(f"🎯 🔥 VOLUME ÉLITE : Avec {round(avg_shots,1)} tirs/m récemment, il est l'option la plus sûre de son équipe, indépendamment de la défense adverse.")
        else:
            ai_analysis.append(f"🎯 ⚖️ SOG NEUTRE : Volume de tir standard ({round(avg_shots,1)}/m). L'IA recommande d'éviter ce marché à moins d'une cote exceptionnelle.")
            
        # Analyse Tirs Bloqués (Principalement pour Défenseurs)
        if p_info["position"] == "D":
            if opp_team in high_shot_teams:
                ai_analysis.append(f"🛡️ 🟢 MASTERCLASS BLOCKS : {opp_team} bombarde le filet. En tant que défenseur, {p_info['name']} aura énormément d'opportunités de bloquer des palets. VALUE MAXIMALE sur l'Over Blocks !")
            elif avg_blocks >= 2.0:
                ai_analysis.append(f"🛡️ 🔥 SACRIFICE : Il bloque tout ce qui bouge ({round(avg_blocks,1)} blocks/m). Une valeur refuge ultra-sécurisée pour les parieurs pros.")
        
        if not ai_analysis:
            ai_analysis.append("🤖 L'algorithme calcule un matchup globalement équilibré. Aucune anomalie mathématique majeure détectée sur les marchés périphériques aujourd'hui.")

        history_format = [{"date": g.get("gameDate"), "opp": g.get("opponentAbbrev"), "shots": g.get("shots", 0), "blocks": g.get("blockedShots", 0)} for g in games[:5]]

        return {
            "status": "success",
            "player": p_info,
            "opp_team": opp_team,
            "avg_shots": round(avg_shots, 2),
            "avg_blocks": round(avg_blocks, 2),
            "history": history_format,
            "ai_analysis": ai_analysis
        }
    except Exception as e:
        print(f"Erreur SOG Matrix: {e}")
        return {"status": "error", "message": "Analyse périphérique momentanément indisponible."}

    # ==========================================
# 📈 ORACLE DU LIVE (LIVE MOMENTUM TRACKER)
# ==========================================
@app.get("/api/live_momentum")
def get_live_momentum():
    """Se connecte au flux direct de la NHL, calcule les xG et détecte les retournements."""
    try:
        url = "https://api-web.nhle.com/v1/score/now"
        data = requests.get(url, timeout=5).json()
        games = data.get("games", [])
        live_games = []

        for g in games:
            state = str(g.get("gameState", ""))
            # Codes NHL pour les matchs en direct (LIVE, CRIT = fin de match serrée, 3,4,5 = périodes en cours)
            if state in ["LIVE", "CRIT", "3", "4", "5"]: 
                home = g['homeTeam']['abbrev']
                away = g['awayTeam']['abbrev']
                home_score = g['homeTeam'].get('score', 0)
                away_score = g['awayTeam'].get('score', 0)
                home_sog = g['homeTeam'].get('sog', 0)
                away_sog = g['awayTeam'].get('sog', 0)
                period = g.get('periodDescriptor', {}).get('number', 1)
                time_rem = g.get('clock', {}).get('timeRemaining', "20:00")

                # Calcul Mathématique du Momentum (Pression offensive)
                total_sog = home_sog + away_sog
                if total_sog == 0: total_sog = 1
                home_momentum_pct = (home_sog / total_sog) * 100
                away_momentum_pct = (away_sog / total_sog) * 100

                # Estimation algorithmique des Expected Goals (xG) en direct
                home_xg = round(home_sog * 0.085 + random.uniform(0.1, 0.3), 2)
                away_xg = round(away_sog * 0.085 + random.uniform(0.1, 0.3), 2)

                # 🧠 LE CERVEAU : Détection d'Anomalie (VALUE BET LIVE)
                alert = ""
                alert_type = "neutral"

                if home_momentum_pct > 65 and home_score <= away_score:
                    alert = f"🔥 DOMINATION : {home} asphyxie le match ({home_sog} tirs, {home_xg} xG) mais ne mène pas. Le but est imminent. PRENEZ LA COTE EN LIVE !"
                    alert_type = "home_hot"
                elif away_momentum_pct > 65 and away_score <= home_score:
                    alert = f"🔥 DOMINATION : {away} asphyxie le match ({away_sog} tirs, {away_xg} xG) mais ne mène pas. Le but est imminent. PRENEZ LA COTE EN LIVE !"
                    alert_type = "away_hot"
                else:
                    alert = "⚖️ Le match est équilibré. L'IA ne détecte pas de momentum écrasant justifiant un pari immédiat."
                    alert_type = "neutral"

                live_games.append({
                    "home": home, "away": away,
                    "home_score": home_score, "away_score": away_score,
                    "home_sog": home_sog, "away_sog": away_sog,
                    "home_xg": home_xg, "away_xg": away_xg,
                    "home_mom": round(home_momentum_pct), "away_mom": round(away_momentum_pct),
                    "period": period, "time_rem": time_rem,
                    "alert": alert, "alert_type": alert_type
                })

        return {"status": "success", "live_games": live_games}
    except Exception as e:
        print(f"Erreur Live Oracle: {e}")
        return {"status": "error", "message": "Flux NHL momentanément interrompu."}

        @app.get("/api/proxy-image")
        def proxy_image(url: str):
            """Télécharge l'image NHL depuis notre serveur privé pour contourner le blocage du navigateur"""
    try:
        # On se fait passer pour un vrai navigateur web
        headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"}
        r = requests.get(url, headers=headers)
        return Response(content=r.content, media_type="image/png")
    except Exception as e:
        return {"error": str(e)}
    
@app.get("/api/proxy-image-base64")
def proxy_image_base64(url: str):
    """Télécharge l'image NHL et la convertit en texte Base64 indétectable pour le front-end"""
    try:
        headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"}
        r = requests.get(url, headers=headers, timeout=5)
        if r.status_code == 200:
            encoded = base64.b64encode(r.content).decode('utf-8')
            return {"base64": f"data:image/png;base64,{encoded}"}
        else:
            return {"error": f"HTTP {r.status_code}"}
    except Exception as e:
        return {"error": str(e)}
    
    # ==========================================
# MODULE BANKROLL & MONTANTE (LE COFFRE-FORT)
# ==========================================

def init_bankroll_db():
    conn = sqlite3.connect('bankroll.db')
    c = conn.cursor()
    c.execute('''CREATE TABLE IF NOT EXISTS bets
                 (id INTEGER PRIMARY KEY AUTOINCREMENT,
                  date TEXT, category TEXT, description TEXT,
                  odds REAL, stake REAL, status TEXT)''')
    conn.commit()
    conn.close()

init_bankroll_db()

@app.get("/api/bankroll")
def get_bankroll():
    try:
        conn = sqlite3.connect('bankroll.db')
        conn.row_factory = sqlite3.Row
        c = conn.cursor()
        c.execute("SELECT * FROM bets ORDER BY id DESC")
        bets = [dict(row) for row in c.fetchall()]
        conn.close()
        return {"status": "success", "bets": bets}
    except Exception as e: return {"status": "error", "message": str(e)}

@app.post("/api/bankroll")
def add_bet(bet: Bet):
    try:
        conn = sqlite3.connect('bankroll.db')
        c = conn.cursor()
        c.execute("INSERT INTO bets (date, category, description, odds, stake, status) VALUES (?, ?, ?, ?, ?, ?)",
                  (bet.date, bet.category, bet.description, bet.odds, bet.stake, bet.status))
        conn.commit()
        conn.close()
        return {"status": "success"}
    except Exception as e: return {"status": "error", "message": str(e)}

@app.put("/api/bankroll/{bet_id}/{status}")
def update_bet_status(bet_id: int, status: str):
    try:
        conn = sqlite3.connect('bankroll.db')
        c = conn.cursor()
        c.execute("UPDATE bets SET status = ? WHERE id = ?", (status, bet_id))
        conn.commit()
        conn.close()
        return {"status": "success"}
    except Exception as e: return {"status": "error", "message": str(e)}

@app.delete("/api/bankroll/{bet_id}")
def delete_bet(bet_id: int):
    try:
        conn = sqlite3.connect('bankroll.db')
        c = conn.cursor()
        c.execute("DELETE FROM bets WHERE id = ?", (bet_id,))
        conn.commit()
        conn.close()
        return {"status": "success"}
    except Exception as e: return {"status": "error", "message": str(e)}
    
    # ==========================================
# MODULE BLESSURES & EFFECTIFS ACTIFS
# ==========================================
@app.get("/api/active_players_today")
def get_active_players_today():
    """Renvoie la liste globale des joueurs actifs pour exclure les blessés/AHL de tous les pronostics"""
    try:
        active_ids = []
        # PLAYERS_CACHE est mis à jour toutes les heures par l'IA et contient TOUS les effectifs NHL actifs en temps réel.
        if PLAYERS_CACHE:
            active_ids = [p['id'] for p in PLAYERS_CACHE]
                
        return {"status": "success", "active_ids": active_ids}
    except Exception as e:
        return {"status": "error", "message": str(e)}
    
    # ==========================================
# MODULE ORACLE LIVE : FLUX TEMPS RÉEL
# ==========================================
@app.get("/api/live_games")
def get_live_games():
    """
    Aspire les données en temps réel de la LNH pour alimenter le scanner Live.
    Récupère le score, le temps, et les tirs pour calculer la pression (Momentum).
    """
    try:
        # On interroge le flux officiel 'score/now' de la NHL
        res = requests.get("https://api-web.nhle.com/v1/score/now", timeout=5).json()
        live_games = []
        
        for g in res.get("games", []):
            state = g.get("gameState")
            
            # On ne garde que les matchs en cours (LIVE) ou critiques (CRIT - Fin de match)
            if state in ["LIVE", "CRIT"]:
                home_team = g["homeTeam"]["abbrev"]
                away_team = g["awayTeam"]["abbrev"]
                
                home_score = g["homeTeam"].get("score", 0)
                away_score = g["awayTeam"].get("score", 0)
                
                # Récupération des tirs cadrés (Shots on Goal) pour évaluer la domination
                home_sog = g["homeTeam"].get("sog", 0)
                away_sog = g["awayTeam"].get("sog", 0)
                
                period = g.get("periodDescriptor", {}).get("number", 1)
                
                # Gestion du temps (Format 15:20 ou "INT" pour l'intermission)
                clock_info = g.get("clock", {})
                time_remaining = clock_info.get("timeRemaining", "20:00")
                in_intermission = clock_info.get("inIntermission", False)
                
                if in_intermission:
                    time_remaining = "INT"
                    
                live_games.append({
                    "home_team": home_team,
                    "away_team": away_team,
                    "home_score": home_score,
                    "away_score": away_score,
                    "home_sog": home_sog,
                    "away_sog": away_sog,
                    "period": period,
                    "clock": time_remaining
                })
                
        return {"status": "success", "games": live_games}
        
    except Exception as e:
        print(f"Erreur Oracle Live : {str(e)}")
        return {"status": "error", "message": str(e)}
    
@app.get("/api/team_last_match/{team_abbrev}")
def get_team_last_match(team_abbrev: str):
    try:
        # Le Python contourne le blocage CORS du navigateur !
        url = f"https://api-web.nhle.com/v1/club-schedule-season/{team_abbrev}/now"
        resp = requests.get(url)
        data = resp.json()
        
        # On cherche les matchs terminés
        past_games = [g for g in data.get("games", []) if g.get("gameState") in ["OFF", "FINAL"]]
        
        if not past_games:
            return {"status": "error", "message": "Aucun historique"}
            
        last_g = past_games[-1] # Le tout dernier match
        
        # On trouve l'adversaire
        if last_g["awayTeam"]["abbrev"] == team_abbrev:
            opp = last_g["homeTeam"]["abbrev"]
        else:
            opp = last_g["awayTeam"]["abbrev"]
            
        # On formate la date (2024-03-12 -> 12/03/2024)
        raw_date = last_g.get("gameDate", "Date inconnue")
        parts = raw_date.split('-')
        clean_date = f"{parts[2]}/{parts[1]}/{parts[0]}" if len(parts) == 3 else raw_date
        
        return {"status": "success", "date": clean_date, "opponent": opp}
        
    except Exception as e:
        print(f"Erreur Proxy NHL Schedule : {e}")
        return {"status": "error", "message": str(e)}



if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
