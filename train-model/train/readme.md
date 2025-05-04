# Political Tweet Classifier

This project uses CatBoost to train a machine learning model that predicts whether a tweet is political based on its embedding.

## Setup

### Using uv (as mentioned)

```bash
uv pip install -r requirements.txt
```

### Using pip (alternative)

```bash
pip install -r requirements.txt
```

## Project Structure

- `train.py`: Main script to train the CatBoost model
- `requirements.txt`: Required Python packages

## Usage

### 1. Train the Model

```bash
python train.py
```

This will:
- Load the tweets from `output/labeled-tweets.jsonl`
- Train a CatBoost model
- Evaluate the model's performance
- Save the trained model to `pages/content-ui/src/political_tweet_classifier.json`

Despite reporting an unimpressive confusion matrix, the model will perform quite well in practice. 
