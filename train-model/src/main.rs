use futures::StreamExt;
use serde::{Deserialize, Serialize};
use std::io::BufRead;
use std::io::Write;
use std::sync::LazyLock;
use tysm::chat_completions::ChatClient;
use tysm::embeddings::EmbeddingsClient;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Tweet {
    tweet: TweetData,
    #[serde(rename = "textRepresentation")]
    text_representation: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TweetData {
    pub index: usize,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub id: Option<String>,
    pub author: Author,
    pub content: Content,
    pub engagement: Engagement,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub timestamp: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub collected_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tab_id: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Author {
    pub name: String,
    pub handle: String,
    pub verified: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Content {
    pub text: String,
    #[serde(default)]
    pub is_quote: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub quoted_tweet: Option<QuotedTweet>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QuotedTweet {
    pub author: String,
    pub handle: String,
    pub text: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub id: Option<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct Engagement {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub replies: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reposts: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub likes: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub views: Option<String>,
}

static CLIENT_4O: LazyLock<ChatClient> = LazyLock::new(|| {
    ChatClient::from_env("gpt-4o")
        .unwrap()
        .with_cache_directory("./cache")
});

static CLIENT_EMBEDDING: LazyLock<EmbeddingsClient> = LazyLock::new(|| {
    EmbeddingsClient::from_env("text-embedding-3-small")
        .unwrap()
        .with_dimensions(256)
});

#[derive(Debug, Clone, Deserialize, schemars::JsonSchema)]
struct Political {
    political: bool,
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    // Example of parsing a JSONL file with tweets
    let file = std::fs::File::open("data/tweets.jsonl").expect("Failed to open file");
    let reader = std::io::BufReader::new(file);
    let mut tweets = Vec::new();
    for line in reader.lines() {
        let line = line.expect("Failed to read line");
        let tweet: Tweet = serde_json::from_str(&line).expect("Failed to parse JSON");
        println!(
            "Tweet from {}: {}",
            tweet.tweet.author.name, tweet.tweet.content.text
        );
        tweets.push(tweet);
    }

    let classified_tweets = futures::stream::iter(tweets)
    .map(async |tweet| {
        let political: Political = CLIENT_4O.chat_with_system_prompt(
            "A tweet will be provided. Respond with a JSON object with a single field `political` that is a boolean. The boolean should be 'true' if the tweet could be described as political, and 'false' otherwise. Tweets that simply discuss one's identity are not political.",
            &tweet.text_representation,
        )
        .await?;

        Ok((tweet, political))
    })
    .buffered(10)
    .inspect(|result| {
        let _ = result.as_ref().inspect_err(|e: &&tysm::chat_completions::ChatError| eprintln!("error: {e}"));
    })
    .filter_map(async |result| result.ok())
    .collect::<Vec<_>>().await;

    let embeddings = CLIENT_EMBEDDING
        .embed_fn(&classified_tweets, |political| {
            &political.0.text_representation
        })
        .await?;

    // write to jsonl file
    let file = std::fs::File::create("output/labeled-tweets.jsonl").expect("Failed to create file");
    let mut writer = std::io::BufWriter::new(file);
    for ((tweet, political), embedding) in embeddings {
        writer
            .write_all(
                serde_json::to_string(&(
                    &tweet.text_representation,
                    political.political,
                    embedding.elements,
                ))
                .unwrap()
                .as_bytes(),
            )
            .unwrap();
        writer.write_all(b"\n").unwrap();
    }

    Ok(())
}
