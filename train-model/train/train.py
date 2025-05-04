import json
import numpy as np
from sklearn.model_selection import train_test_split
from sklearn.metrics import (
    classification_report,
    accuracy_score,
    precision_recall_fscore_support,
)
from catboost import CatBoostClassifier
import matplotlib.pyplot as plt
import os

# Path to the JSONL file
data_path = "../output/labeled-tweets.jsonl"


# Function to load data from JSONL
def load_data(file_path):
    embeddings = []
    labels = []
    raw_tweets = []

    with open(file_path, "r", encoding="utf-8") as f:
        for line in f:
            try:
                tweet_data = json.loads(line)
                # Extract the tweet text, political label (boolean), and embedding
                tweet_text = tweet_data[0]
                is_political = tweet_data[1]
                embedding = tweet_data[2]

                # Append to our lists
                raw_tweets.append(tweet_text)
                labels.append(int(is_political))  # Convert boolean to int (0 or 1)
                embeddings.append(embedding)
            except json.JSONDecodeError:
                print(f"Error decoding JSON line: {line}")
            except IndexError:
                print(f"Index error in line: {line}")
            except Exception as e:
                print(f"Error processing line: {e}")

    return np.array(embeddings), np.array(labels), raw_tweets


# Function to train and evaluate the model
def train_and_evaluate(X, y):
    # Split data into train and test sets (80/20)
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42, stratify=y
    )

    print(f"Training set size: {X_train.shape[0]}")
    print(f"Testing set size: {X_test.shape[0]}")
    print(
        f"Political tweets in training: {sum(y_train)} ({sum(y_train)/len(y_train):.2%})"
    )
    print(f"Political tweets in testing: {sum(y_test)} ({sum(y_test)/len(y_test):.2%})")

    # Initialize CatBoost model
    model = CatBoostClassifier(
        iterations=500,
        learning_rate=0.05,
        depth=6,
        loss_function="Logloss",
        eval_metric="AUC",
        random_seed=42,
        verbose=100,  # Print training progress every 100 iterations
    )

    # Train the model
    print("Training model...")
    model.fit(X_train, y_train, eval_set=(X_test, y_test), plot=False)

    # Make predictions
    y_pred = model.predict(X_test)

    # Evaluate model
    accuracy = accuracy_score(y_test, y_pred)
    precision, recall, f1, _ = precision_recall_fscore_support(
        y_test, y_pred, average="binary"
    )

    print(f"\nModel Performance:")
    print(f"Accuracy: {accuracy:.4f}")
    print(f"Precision: {precision:.4f}")
    print(f"Recall: {recall:.4f}")
    print(f"F1 Score: {f1:.4f}")

    print("\nDetailed Classification Report:")
    print(classification_report(y_test, y_pred))

    # Plot feature importance
    feature_importance = model.get_feature_importance()
    plt.figure(figsize=(10, 6))
    plt.barh(range(len(feature_importance)), feature_importance, align="center")
    plt.yticks(
        range(len(feature_importance)),
        [f"Feature {i}" for i in range(len(feature_importance))],
    )
    plt.xlabel("Importance")
    plt.title("Feature Importance")

    # Create output directory if it doesn't exist
    os.makedirs("output/figures", exist_ok=True)
    plt.savefig("output/figures/feature_importance.png")
    print("Feature importance plot saved to 'output/figures/feature_importance.png'")

    return model


# Function to save the model
def save_model(model, file_path="../../pages/content-ui/src/political_tweet_classifier.json"):
    os.makedirs(os.path.dirname(file_path), exist_ok=True)
    model.save_model(file_path, format="json")
    print(f"Model saved to {file_path}")


# Main function
def main():
    # Load data
    print("Loading data...")
    X, y, raw_tweets = load_data(data_path)

    # Print data stats
    print(f"Loaded {len(X)} tweets")
    print(f"Embedding dimension: {X.shape[1]}")
    print(f"Political tweets: {sum(y)} ({sum(y)/len(y):.2%})")

    # Train and evaluate model
    model = train_and_evaluate(X, y)

    # Save the model
    save_model(model)


if __name__ == "__main__":
    main()
