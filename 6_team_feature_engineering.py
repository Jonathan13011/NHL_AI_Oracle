import pandas as pd
from sqlalchemy import create_engine
import numpy as np
import time

print("🧠 [CERVEAU TACTIQUE] Analyse des dynamiques collectives en cours...")
start_time = time.time()

# 1. Connexion à la base de données
MOT_DE_PASSE = "Jo23071993"
engine = create_engine(f"postgresql://postgres:{MOT_DE_PASSE}@localhost:5432/nhl_oracle")

# On récupère tous les matchs de saison régulière
df_games = pd.read_sql("SELECT * FROM games WHERE game_type = 2 ORDER BY game_date ASC", engine)

print("📥 Extraction des 10 ans d'historique de matchs réussie.")
print("⚙️ Calcul des moyennes de victoires, d'attaque et de défense...")

# 2. Création du journal de bord par équipe
# On sépare les matchs pour analyser l'équipe à Domicile et l'équipe à l'Extérieur séparément
home_log = df_games[['game_id', 'game_date', 'home_team', 'home_score', 'away_score']].copy()
home_log.columns = ['game_id', 'game_date', 'team', 'GF', 'GA'] # GF = Goals For, GA = Goals Against
home_log['is_home'] = 1
home_log['win'] = (home_log['GF'] > home_log['GA']).astype(int)

away_log = df_games[['game_id', 'game_date', 'away_team', 'away_score', 'home_score']].copy()
away_log.columns = ['game_id', 'game_date', 'team', 'GF', 'GA']
away_log['is_home'] = 0
away_log['win'] = (away_log['GF'] > away_log['GA']).astype(int)

# On fusionne pour avoir le parcours temporel de chaque équipe
team_log = pd.concat([home_log, away_log]).sort_values(by=['team', 'game_date'])

# 3. Calcul des dynamiques sur les 5 derniers matchs (L5)
grouped = team_log.groupby('team')
team_log['win_pct_L5'] = grouped['win'].transform(lambda x: x.shift(1).rolling(5, min_periods=1).mean())
team_log['GF_L5'] = grouped['GF'].transform(lambda x: x.shift(1).rolling(5, min_periods=1).mean())
team_log['GA_L5'] = grouped['GA'].transform(lambda x: x.shift(1).rolling(5, min_periods=1).mean())

# Calcul de la fatigue
team_log['game_date'] = pd.to_datetime(team_log['game_date'])
team_log['rest_days'] = grouped['game_date'].transform(lambda x: (x - x.shift(1)).dt.days)
team_log['rest_days'] = np.clip(team_log['rest_days'], 0, 10).fillna(10)

# 4. Reconstruction des matchs avec ces nouvelles statistiques prédictives
home_features = team_log[team_log['is_home'] == 1][['game_id', 'win_pct_L5', 'GF_L5', 'GA_L5', 'rest_days']]
home_features.columns = ['game_id', 'home_win_pct_L5', 'home_GF_L5', 'home_GA_L5', 'home_rest_days']

away_features = team_log[team_log['is_home'] == 0][['game_id', 'win_pct_L5', 'GF_L5', 'GA_L5', 'rest_days']]
away_features.columns = ['game_id', 'away_win_pct_L5', 'away_GF_L5', 'away_GA_L5', 'away_rest_days']

# 5. Création du Dataset Final pour l'IA
df_ml = df_games[['game_id', 'home_score', 'away_score']].copy()
# C'est ce que l'IA va devoir apprendre à prédire (1 = Domicile gagne, 0 = Extérieur gagne)
df_ml['target_home_win'] = (df_ml['home_score'] > df_ml['away_score']).astype(int)

df_ml = df_ml.merge(home_features, on='game_id').merge(away_features, on='game_id')
df_ml = df_ml.dropna()

dataset_path = "nhl_team_ml_dataset.csv"
df_ml.to_csv(dataset_path, index=False)

print(f"✅ Terminé en {round(time.time() - start_time, 1)} secondes !")
print(f"📊 Le fichier '{dataset_path}' contenant les secrets tactiques est prêt.")