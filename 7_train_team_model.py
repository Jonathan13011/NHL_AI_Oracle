import pandas as pd
from xgboost import XGBClassifier
from sklearn.model_selection import train_test_split
from sklearn.metrics import accuracy_score
import joblib
import time

print("🤖 Début de l'entraînement du 4ème Cerveau (Prédiction des Matchs)...")
start_time = time.time()

# 1. Chargement des données d'équipes
df = pd.read_csv("nhl_team_ml_dataset.csv")

# Les critères que l'IA a le droit de regarder
features = [
    'home_win_pct_L5', 'home_GF_L5', 'home_GA_L5', 'home_rest_days',
    'away_win_pct_L5', 'away_GF_L5', 'away_GA_L5', 'away_rest_days'
]

X = df[features]
y = df['target_home_win']

# 2. Séparation : 80% apprentissage, 20% examen
X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)

# 3. Création du modèle XGBoost paramétré pour les résultats d'équipes
model = XGBClassifier(
    n_estimators=200, 
    learning_rate=0.05, 
    max_depth=4, 
    random_state=42, 
    eval_metric='logloss'
)

# L'IA étudie les schémas de victoire
model.fit(X_train, y_train)

# 4. Le test de fiabilité
predictions = model.predict(X_test)
acc = accuracy_score(y_test, predictions)

print(f"\n✅ Modèle 'Match Winner' entraîné !")
print(f"🎯 Précision absolue de prédiction sur des matchs jamais vus : {acc * 100:.2f}%")

# Sauvegarde du cerveau
joblib.dump(model, 'ai_model_team_winner.pkl')
joblib.dump(features, 'team_model_features.pkl')

print(f"💾 Cerveau sauvegardé sous 'ai_model_team_winner.pkl' en {round(time.time() - start_time, 1)}s.")