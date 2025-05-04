import browser from 'webextension-polyfill';
import { exampleThemeStorage } from '@extension/storage';
import type { TweetData } from '../../../pages/types';

// Initialize in-memory cache
let collectedTweetsCache: Record<string, TweetData> = {};
let openaiApiKey: string = '';
// Cache for embeddings to avoid redundant API calls
let embeddingsCache: Record<string, number[]> = {};

// Load any existing tweets and API key from storage
browser.storage.local.get(['collectedTweets', 'openaiApiKey', 'embeddingsCache']).then(result => {
  if (result.collectedTweets) {
    collectedTweetsCache = result.collectedTweets;
    console.log(`Loaded ${Object.keys(collectedTweetsCache).length} tweets from storage`);
  }

  if (result.openaiApiKey) {
    openaiApiKey = result.openaiApiKey;
    console.log('OpenAI API key loaded from storage');
  }

  if (result.embeddingsCache) {
    embeddingsCache = result.embeddingsCache;
    console.log(`Loaded ${Object.keys(embeddingsCache).length} cached embeddings from storage`);
  }
});

// Function to get embedding from OpenAI API
async function getEmbedding(text: string, apiKey: string): Promise<number[]> {
  try {
    const response = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        input: text,
        model: 'text-embedding-3-small',
        dimensions: 256,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`OpenAI API error: ${errorData.error?.message || response.statusText}`);
    }

    const data = await response.json();
    return data.data[0].embedding;
  } catch (error) {
    console.error('Error getting embedding:', error);
    throw error;
  }
}

// Listen for messages from content scripts and popup
browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log(message);
  if (message.type === 'TWEET_DATA') {
    const { tweet } = message;

    // Store tweet by ID to avoid duplicates
    if (tweet.id) {
      // Add to in-memory cache
      collectedTweetsCache[tweet.id] = {
        ...tweet,
        collectedAt: new Date().toISOString(),
        tabId: sender.tab?.id,
        url: sender.url,
      };

      // Save to persistent storage
      browser.storage.local
        .set({ collectedTweets: collectedTweetsCache })
        .then(() => {
          console.log(`Tweet stored: ${tweet.id} by @${tweet.author.handle}`);
          console.log(`Total tweets in storage: ${Object.keys(collectedTweetsCache).length}`);
        })
        .catch(error => {
          console.error('Error saving tweet to storage:', error);
        });
    }

    // Use sendResponse for synchronous response
    sendResponse({ success: true });
  } else if (message.type === 'GET_TWEET_EMBEDDING') {
    // Get embedding for a specific tweet
    const { tweetId } = message;

    if (!tweetId) {
      sendResponse({ success: false, error: 'Tweet ID is required' });
      return true;
    }

    if (!openaiApiKey) {
      sendResponse({ success: false, error: 'OpenAI API key is not set' });
      return true;
    }

    const tweet = collectedTweetsCache[tweetId];
    if (!tweet) {
      sendResponse({ success: false, error: 'Tweet not found' });
      return true;
    }

    // Generate text representation for embedding
    const textForEmbedding = generateReadableText(tweet);

    // Create a cache key based on the tweet ID
    const cacheKey = tweetId;

    // Check if we already have this embedding cached
    if (embeddingsCache[cacheKey]) {
      console.log(`Using cached embedding for tweet ${tweetId}`);
      sendResponse({
        success: true,
        embedding: embeddingsCache[cacheKey],
        tweet,
        textRepresentation: textForEmbedding,
        fromCache: true,
      });
      return true;
    }

    // Get embedding from OpenAI
    getEmbedding(textForEmbedding, openaiApiKey)
      .then(embedding => {
        // Cache the embedding
        embeddingsCache[cacheKey] = embedding;
        console.log(`Cached new embedding for tweet ${tweetId}`);

        // Periodically save the embeddings cache to storage
        browser.storage.local.set({ embeddingsCache }).catch(error => {
          console.error('Error saving embeddings cache to storage:', error);
        });

        sendResponse({
          success: true,
          embedding,
          tweet,
          textRepresentation: textForEmbedding,
          fromCache: false,
        });
      })
      .catch(error => {
        console.error('Error getting embedding:', error);
        sendResponse({
          success: false,
          error: error.toString(),
        });
      });

    return true; // Keep the message channel open for async response
  } else if (message.type === 'SAVE_API_KEY') {
    // Save the OpenAI API key
    const { apiKey } = message;

    if (!apiKey) {
      sendResponse({ success: false, error: 'API key is required' });
      return true;
    }

    openaiApiKey = apiKey;

    // Save to persistent storage
    browser.storage.local
      .set({ openaiApiKey })
      .then(() => {
        console.log('OpenAI API key saved to storage');
        sendResponse({ success: true });
      })
      .catch(error => {
        console.error('Error saving API key to storage:', error);
        sendResponse({ success: false, error: error.toString() });
      });

    return true; // Keep the message channel open for async response
  } else if (message.type === 'GET_API_KEY') {
    // Return the saved API key
    sendResponse({
      success: true,
      apiKey: openaiApiKey,
    });
  } else if (message.type === 'GET_TWEETS_DATA') {
    // Return all tweets data for the popup to save
    sendResponse({
      success: true,
      tweets: Object.values(collectedTweetsCache),
    });
  } else if (message.type === 'GET_TWEET_COUNT') {
    // Return the count of stored tweets
    sendResponse({
      success: true,
      count: Object.keys(collectedTweetsCache).length,
    });
  }

  // Return true to indicate we'll respond asynchronously
  return true;
});

// Expose collected tweets for debugging
// @ts-ignore
globalThis.getTweets = () => collectedTweetsCache;

// Utility to export collected tweets
// @ts-ignore
globalThis.exportTweets = () => {
  const tweetsArray = Object.values(collectedTweetsCache);
  const dataStr = JSON.stringify(tweetsArray, null, 2);
  const dataUri = 'data:application/json;charset=utf-8,' + encodeURIComponent(dataStr);

  browser.downloads.download({
    url: dataUri,
    filename: `twitter_tweets_${new Date().toISOString().slice(0, 10)}.json`,
    saveAs: true,
  });

  return `Exporting ${tweetsArray.length} tweets`;
};

// Utility to export tweets as JSONL with textual representation
// @ts-ignore
globalThis.exportTweetsAsJSONL = () => {
  const tweetsArray = Object.values(collectedTweetsCache);

  // Create JSONL content - each line is a JSON object
  let jsonlContent = '';

  tweetsArray.forEach(tweet => {
    // Generate human-readable text representation
    const textRepresentation = generateReadableText(tweet);

    // Create a new object with the tweet data and its text representation
    const exportObject = {
      tweet: tweet,
      textRepresentation: textRepresentation,
    };

    // Add as a line to the JSONL file
    jsonlContent += JSON.stringify(exportObject) + '\n';
  });

  const dataUri = 'data:application/jsonl;charset=utf-8,' + encodeURIComponent(jsonlContent);

  return chrome.downloads
    .download({
      url: dataUri,
      filename: `twitter_tweets_${new Date().toISOString().slice(0, 10)}.jsonl`,
      saveAs: true,
    })
    .then(() => {
      return `Exporting ${tweetsArray.length} tweets as JSONL`;
    });
};

// Function to generate human-readable text from tweet data
function generateReadableText(tweetData: any): string {
  let text = '';

  // Author information and tweet ID
  text += `Author: ${tweetData.author.name} (@${tweetData.author.handle})`;
  if (tweetData.author.verified) {
    text += ' ✓';
  }
  if (tweetData.id) {
    text += `\nTweet ID: ${tweetData.id}`;
    text += `\nLink: https://twitter.com/${tweetData.author.handle.replace('@', '')}/status/${tweetData.id}`;
  }

  // Timestamp
  if (tweetData.timestamp) {
    const date = new Date(tweetData.timestamp);
    text += `\nPosted: ${date.toLocaleString()}`;
  }

  // Tweet content
  text += `\n\nContent: ${tweetData.content.text}`;

  // Quoted tweet (if any)
  if (tweetData.content.isQuote && tweetData.content.quotedTweet) {
    text += `\n\nQuoted Tweet:\n  Author: ${tweetData.content.quotedTweet.author} (@${tweetData.content.quotedTweet.handle})`;
    if (tweetData.content.quotedTweet.id) {
      text += `\n  Tweet ID: ${tweetData.content.quotedTweet.id}`;
      text += `\n  Link: https://twitter.com/${tweetData.content.quotedTweet.handle.replace('@', '')}/status/${tweetData.content.quotedTweet.id}`;
    }
    text += `\n  Content: ${tweetData.content.quotedTweet.text}`;
  }

  // Engagement metrics
  text += '\n\nEngagement:';
  if (tweetData.engagement.replies) {
    text += `\n  Replies: ${tweetData.engagement.replies}`;
  }
  if (tweetData.engagement.reposts) {
    text += `\n  Reposts: ${tweetData.engagement.reposts}`;
  }
  if (tweetData.engagement.likes) {
    text += `\n  Likes: ${tweetData.engagement.likes}`;
  }
  if (tweetData.engagement.views) {
    text += `\n  Views: ${tweetData.engagement.views}`;
  }

  return text;
}

// Utility to clear all tweets
// @ts-ignore
globalThis.clearTweets = () => {
  collectedTweetsCache = {};
  return browser.storage.local
    .remove('collectedTweets')
    .then(() => 'All tweets cleared from storage')
    .catch(error => {
      console.error('Error clearing tweets:', error);
      return 'Error clearing tweets';
    });
};

// Utility to clear embeddings cache
// @ts-ignore
globalThis.clearEmbeddingsCache = () => {
  embeddingsCache = {};
  return browser.storage.local
    .remove('embeddingsCache')
    .then(() => 'Embeddings cache cleared from storage')
    .catch(error => {
      console.error('Error clearing embeddings cache:', error);
      return 'Error clearing embeddings cache';
    });
};

// Utility to get embeddings cache stats
// @ts-ignore
globalThis.getEmbeddingsCacheStats = () => {
  return {
    count: Object.keys(embeddingsCache).length,
    size: JSON.stringify(embeddingsCache).length / 1024, // Size in KB
    keys: Object.keys(embeddingsCache),
  };
};

exampleThemeStorage.get().then(theme => {
  console.log('theme', theme);
});

console.log('Background loaded');
console.log("Edit 'chrome-extension/src/background/index.ts' and save to reload.");
console.log('To export collected tweets as JSON, open the background console and run: globalThis.exportTweets()');
console.log('To export collected tweets as JSONL with text, run: globalThis.exportTweetsAsJSONL()');
console.log('To view collected tweets, run: globalThis.getTweets()');
console.log('To clear all tweets, run: globalThis.clearTweets()');
console.log('To get the saved API key, run: openaiApiKey');
console.log('To view embeddings cache stats, run: globalThis.getEmbeddingsCacheStats()');
console.log('To clear embeddings cache, run: globalThis.clearEmbeddingsCache()');
