import pandas as pd
from sklearn.model_selection import train_test_split
from sklearn.metrics import accuracy_score
from xgboost import XGBClassifier
import joblib
import time

print("🧠 Début de l'entraînement de l'Intelligence Artificielle...")
start_time = time.time()

# ==========================================
# 1. CHARGEMENT DES DONNÉES
# ==========================================
print("📂 Lecture du dataset historique...")
df = pd.read_csv("nhl_ml_dataset.csv")

# ==========================================
# 2. PRÉPARATION (Feature Engineering avancé)
# ==========================================
# Les IA ne comprennent que les nombres. On transforme la position (C, L, R, D) en colonnes mathématiques (0 ou 1)
df = pd.get_dummies(df, columns=['position'], drop_first=True)

# On liste les colonnes que l'IA a le droit de regarder pour s'entraîner (Le "X")
features = [col for col in df.columns if col not in [
    'player_id', 'player_name', 'team_abbrev', 'game_date', 
    'target_goal', 'target_assist', 'target_point'
]]
X = df[features]

# ==========================================
# 3. ENTRAÎNEMENT DES 3 CERVEAUX (XGBoost)
# ==========================================
def train_and_save_model(target_column, model_name, description):
    print(f"\n🏒 Entraînement de l'IA '{description}' en cours...")
    
    y = df[target_column]
    
    # On sépare les données : 80% pour apprendre, 20% pour vérifier la fiabilité
    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)
    
    # Création du modèle XGBoost (Les hyperparamètres sont optimisés pour la NHL)
    model = XGBClassifier(
        n_estimators=150,      # Nombre d'arbres de décision
        learning_rate=0.05,    # Vitesse d'apprentissage (plus c'est bas, plus c'est précis)
        max_depth=5,           # Profondeur de réflexion
        random_state=42, 
        eval_metric='logloss'
    )
    
    # L'IA étudie (C'est ici que la magie opère)
    model.fit(X_train, y_train)
    
    # L'IA passe son examen sur les 20% de données qu'elle n'a jamais vues
    predictions = model.predict(X_test)
    acc = accuracy_score(y_test, predictions)
    
    print(f"✅ Modèle '{description}' entraîné ! Précision globale de prédiction : {acc * 100:.2f}%")
    
    # On sauvegarde le cerveau sur le disque dur
    joblib.dump(model, f"{model_name}.pkl")

# Lancement des 3 entraînements
train_and_save_model('target_goal', 'ai_model_goal', 'Buteur')
train_and_save_model('target_assist', 'ai_model_assist', 'Passeur')
train_and_save_model('target_point', 'ai_model_point', 'Pointeur')

# On sauvegarde aussi la liste des caractéristiques pour que l'API sache comment parler à l'IA plus tard
joblib.dump(features, 'model_features.pkl')

end_time = time.time()
print(f"\n🎓 ÉCOLE TERMINÉE avec succès en {round(end_time - start_time, 1)} secondes !")
print("Vos 3 modèles prédictifs ont été générés sous forme de fichiers (.pkl).")