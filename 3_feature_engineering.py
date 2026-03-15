import pandas as pd
from sqlalchemy import create_engine
import time
import numpy as np

print("🧠 Démarrage du Feature Engineering (Préparation des données pour l'IA)...")
start_time = time.time()

# ==========================================
# 1. CONNEXION ET EXTRACTION
# ==========================================
MOT_DE_PASSE = "Jo23071993"  # J'ai vu que c'était votre mot de passe sur la photo !
DATABASE_URI = f"postgresql://postgres:{MOT_DE_PASSE}@localhost:5432/nhl_oracle"
engine = create_engine(DATABASE_URI)

# On fusionne les tables 'games' et 'player_game_stats' directement avec SQL
# On ne garde que la saison régulière (game_type = 2) car les Playoffs ont une dynamique trop différente
query = """
SELECT 
    p.player_id, p.player_name, p.team_abbrev, p.position, 
    p.goals, p.assists, p.points, p.shots, p.toi,
    g.game_date, g.home_team, g.away_team
FROM player_game_stats p
JOIN games g ON p.game_id = g.game_id
WHERE g.game_type = 2
ORDER BY p.player_id, g.game_date ASC;
"""

print("📥 Extraction des centaines de milliers de lignes depuis PostgreSQL...")
df = pd.read_sql(query, engine)
print(f"✅ Extraction terminée : {len(df)} performances individuelles chargées.")

# ==========================================
# 2. NETTOYAGE ET TRANSFORMATIONS
# ==========================================
print("⚙️ Calcul des dynamiques et du momentum (Feature Engineering)...")

# Convertir le temps de jeu (ex: "18:30") en minutes décimales (18.5)
def toi_to_minutes(toi_str):
    try:
        m, s = map(int, str(toi_str).split(':'))
        return m + (s / 60.0)
    except:
        return 0.0

df['toi_min'] = df['toi'].apply(toi_to_minutes)

# Déterminer si le joueur joue à domicile (Avantage de la glace)
df['is_home'] = (df['team_abbrev'] == df['home_team']).astype(int)

# ==========================================
# 3. CRÉATION DES VARIABLES CIBLES (Ce qu'on veut prédire)
# ==========================================
# C'est ce que le joueur a FAIT lors de ce match précis.
df['target_goal'] = (df['goals'] >= 1).astype(int)     # 1 s'il a marqué, 0 sinon
df['target_assist'] = (df['assists'] >= 1).astype(int) # 1 s'il a fait une passe, 0 sinon
df['target_point'] = (df['points'] >= 1).astype(int)   # 1 s'il a fait au moins un point, 0 sinon

# ==========================================
# 4. CRÉATION DES VARIABLES PRÉDICTIVES (Le passé du joueur)
# ==========================================
# ⚠️ RÈGLE D'OR : On doit décaler les statistiques d'un cran (shift) 
# pour ne pas utiliser les stats du match actuel pour prédire ce même match !

# On s'assure que les données sont bien triées par joueur et par date
df = df.sort_values(by=['player_id', 'game_date'])

# On groupe par joueur pour calculer ses moyennes sur ses 5 derniers matchs
grouped = df.groupby('player_id')

# Moyenne de tirs sur les 5 derniers matchs (L5 = Last 5)
df['shots_avg_L5'] = grouped['shots'].transform(lambda x: x.shift(1).rolling(window=5, min_periods=1).mean())

# Moyenne de buts sur les 5 derniers matchs (La forme du moment)
df['goals_avg_L5'] = grouped['goals'].transform(lambda x: x.shift(1).rolling(window=5, min_periods=1).mean())

# Moyenne de points sur les 5 derniers matchs
df['points_avg_L5'] = grouped['points'].transform(lambda x: x.shift(1).rolling(window=5, min_periods=1).mean())

# Temps de jeu moyen sur les 5 derniers matchs (Crucial pour prédire un point !)
df['toi_avg_L5'] = grouped['toi_min'].transform(lambda x: x.shift(1).rolling(window=5, min_periods=1).mean())

# Jours de repos depuis le dernier match (Calcul de la fatigue)
df['game_date'] = pd.to_datetime(df['game_date'])
df['days_rest'] = grouped['game_date'].transform(lambda x: (x - x.shift(1)).dt.days)

# Remplacer les valeurs nulles (pour le premier match en carrière d'un joueur par exemple) par 0
df = df.fillna(0)

# Filtrer les aberrations (ex: jours de repos > 100 jours = intersaison, on le capte à 10 pour l'IA)
df['days_rest'] = np.clip(df['days_rest'], 0, 10)

# ==========================================
# 5. SAUVEGARDE DU DATASET FINAL
# ==========================================
print("💾 Sauvegarde du dataset d'entraînement ML...")
# On ne garde que les colonnes utiles pour l'IA
features_columns = [
    'player_id', 'player_name', 'team_abbrev', 'position', 'game_date', 'is_home',
    'shots_avg_L5', 'goals_avg_L5', 'points_avg_L5', 'toi_avg_L5', 'days_rest',
    'target_goal', 'target_assist', 'target_point'
]
ml_dataset = df[features_columns]

# Sauvegarde en format CSV optimisé
dataset_path = "nhl_ml_dataset.csv"
ml_dataset.to_csv(dataset_path, index=False)

end_time = time.time()
print(f"\n✅ OPÉRATION TERMINÉE en {round(end_time - start_time, 1)} secondes !")
print(f"📊 Le fichier '{dataset_path}' a été créé avec succès.")
print("L'IA est prête à aller à l'école (Machine Learning).")