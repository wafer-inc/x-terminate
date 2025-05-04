import '@src/Popup.css';
import { useEffect, useState } from 'react';
import { useStorage, withErrorBoundary, withSuspense } from '@extension/shared';
import { exampleThemeStorage } from '@extension/storage';
import { t } from '@extension/i18n';
import { ToggleButton } from '@extension/ui';
import { TweetData } from '../../types';

const notificationOptions = {
  type: 'basic',
  iconUrl: chrome.runtime.getURL('icon-34.png'),
  title: 'Injecting content script error',
  message: 'You cannot inject script here!',
} as const;

const Popup = () => {
  const theme = useStorage(exampleThemeStorage);
  const isLight = theme === 'light';
  const logo = isLight ? 'popup/logo_vertical.svg' : 'popup/logo_vertical_dark.svg';
  const [tweetCount, setTweetCount] = useState<number>(0);
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [message, setMessage] = useState<string>('');
  const [apiKey, setApiKey] = useState<string>('');
  const [savedApiKey, setSavedApiKey] = useState<string>('');
  const [isSavingKey, setIsSavingKey] = useState<boolean>(false);
  const [isGettingEmbedding, setIsGettingEmbedding] = useState<boolean>(false);
  const [tweets, setTweets] = useState<TweetData[]>([]);
  const [selectedTweetId, setSelectedTweetId] = useState<string>('');
  const [exterminateMode, setExterminateMode] = useState<boolean>(false);

  useEffect(() => {
    // Get the current tweet count when popup opens
    chrome.runtime.sendMessage({ type: 'GET_TWEET_COUNT' }, response => {
      if (response?.success) {
        setTweetCount(response.count);
      }
    });

    // Get exterminate mode setting
    chrome.storage.local.get('exterminateMode', (result) => {
      if (result.exterminateMode !== undefined) {
        setExterminateMode(result.exterminateMode);
      }
    });

    // Get saved API key if available
    chrome.runtime.sendMessage({ type: 'GET_API_KEY' }, response => {
      if (response?.success && response.apiKey) {
        setSavedApiKey(response.apiKey);
        setApiKey(response.apiKey);
      }
    });

    // Get all tweets for the dropdown
    chrome.runtime.sendMessage({ type: 'GET_TWEETS_DATA' }, response => {
      if (response?.success && response.tweets) {
        setTweets(response.tweets);
        if (response.tweets.length > 0 && response.tweets[0].id) {
          setSelectedTweetId(response.tweets[0].id);
        }
      }
    });
  }, []);

  const goGithubSite = () =>
    chrome.tabs.create({ url: 'https://github.com/Jonghakseo/chrome-extension-boilerplate-react-vite' });

  const injectContentScript = async () => {
    const [tab] = await chrome.tabs.query({ currentWindow: true, active: true });

    if (tab.url!.startsWith('about:') || tab.url!.startsWith('chrome:')) {
      chrome.notifications.create('inject-error', notificationOptions);
    }

    await chrome.scripting
      .executeScript({
        target: { tabId: tab.id! },
        files: ['/content-runtime/index.js'],
      })
      .catch(err => {
        // Handling errors related to other paths
        if (err.message.includes('Cannot access a chrome:// URL')) {
          chrome.notifications.create('inject-error', notificationOptions);
        }
      });
  };

  // Function to generate human-readable text from tweet data
  const generateReadableText = (tweetData: TweetData): string => {
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
  };

  const handleSaveApiKey = () => {
    if (!apiKey.trim()) {
      setMessage('Please enter a valid API key');
      return;
    }

    setIsSavingKey(true);
    setMessage('Saving API key...');

    chrome.runtime.sendMessage(
      {
        type: 'SAVE_API_KEY',
        apiKey: apiKey.trim(),
      },
      response => {
        if (response?.success) {
          setSavedApiKey(apiKey.trim());
          setMessage('API key saved successfully!');
        } else {
          setMessage('Error saving API key: ' + (response?.error || 'Unknown error'));
        }
        setIsSavingKey(false);
      },
    );
  };

  const handleGetEmbedding = () => {
    if (!selectedTweetId) {
      setMessage('Please select a tweet');
      return;
    }

    if (!savedApiKey) {
      setMessage('Please save an OpenAI API key first');
      return;
    }

    setIsGettingEmbedding(true);
    setMessage('Getting embedding from OpenAI...');

    chrome.runtime.sendMessage(
      {
        type: 'GET_TWEET_EMBEDDING',
        tweetId: selectedTweetId,
      },
      response => {
        if (response?.success) {
          const embeddingPreview =
            response.embedding
              .slice(0, 5)
              .map((n: number) => n.toFixed(4))
              .join(', ') + '...';
          setMessage(`Successfully got embedding: [${embeddingPreview}] (${response.embedding.length} dimensions)`);

          // Log the full embedding and tweet data to console for inspection
          console.log('Tweet embedding:', response.embedding);
          console.log('Tweet data:', response.tweet);
          console.log('Text representation:', response.textRepresentation);
        } else {
          setMessage('Error getting embedding: ' + (response?.error || 'Unknown error'));
        }
        setIsGettingEmbedding(false);
      },
    );
  };

  const handleSaveToFile = async () => {
    if (tweetCount === 0) return;

    setIsExporting(true);
    setMessage('Preparing tweets for export...');

    try {
      // Get all tweets from background script
      chrome.runtime.sendMessage({ type: 'GET_TWEETS_DATA' }, async response => {
        if (!response?.success) {
          setMessage('Error retrieving tweets: ' + (response?.error || 'Unknown error'));
          setIsExporting(false);
          return;
        }

        const tweets = response.tweets;

        try {
          // Create JSONL content - each line is a JSON object with tweet data and text representation
          let jsonlContent = '';
          tweets.forEach((tweet: any) => {
            const textRepresentation = generateReadableText(tweet);
            const exportObject = {
              tweet: tweet,
              textRepresentation: textRepresentation,
            };
            jsonlContent += JSON.stringify(exportObject) + '\n';
          });

          // Use File System Access API to save the file
          try {
            // Show the file save dialog
            const options = {
              suggestedName: `twitter_tweets_${new Date().toISOString().slice(0, 10)}.jsonl`,
              types: [
                {
                  description: 'JSONL Files',
                  accept: {
                    'application/jsonl': ['.jsonl'],
                  },
                },
              ],
            };

            const fileHandle = await window.showSaveFilePicker(options);

            // Create a writable stream
            const writable = await fileHandle.createWritable();

            // Write the content to the file
            await writable.write(jsonlContent);

            // Close the file
            await writable.close();

            setMessage(`Successfully saved ${tweets.length} tweets to file.`);
          } catch (error) {
            // Handle errors from the file picker (e.g., user canceled)
            if (error.name === 'AbortError') {
              setMessage('File save was canceled.');
            } else {
              console.error('Error saving file:', error);
              setMessage('Error saving file: ' + error.toString());
            }
          }
        } catch (error) {
          console.error('Error processing tweets:', error);
          setMessage('Error processing tweets: ' + error.toString());
        }

        setIsExporting(false);
      });
    } catch (error) {
      console.error('Error in export process:', error);
      setMessage('Error in export process: ' + error.toString());
      setIsExporting(false);
    }
  };

  return (
    <div className={`App ${isLight ? 'bg-slate-50' : 'bg-gray-800'}`}>
      <header className={`App-header ${isLight ? 'text-gray-900' : 'text-gray-100'}`}>
        <div className="mb-4 w-full">
          <div className="text-center mb-2">
            <h2 className="text-lg font-bold">X-Terminate</h2>
            <p className="text-sm">
              {tweetCount === 0 ? 'No tweets collected yet.' : `${tweetCount} tweets collected and stored.`}
            </p>
          </div>

          <div className="mb-3">
            <label className="block text-sm font-medium mb-1">
              OpenAI API Key {savedApiKey && <span className="text-green-600 text-xs">(Saved)</span>}
            </label>
            <div className="flex gap-2">
              <input
                type="password"
                value={apiKey}
                onChange={e => setApiKey(e.target.value)}
                placeholder="Enter your OpenAI API key"
                className={`flex-1 px-2 py-1 text-sm border rounded ${isLight ? 'border-gray-300' : 'border-gray-700 bg-gray-700 text-white'}`}
              />
              <button
                onClick={handleSaveApiKey}
                disabled={isSavingKey || !apiKey.trim()}
                className={`px-2 py-1 rounded text-sm ${isLight ? 'bg-blue-200 text-black' : 'bg-blue-700 text-white'} ${isSavingKey || !apiKey.trim() ? 'opacity-50 cursor-not-allowed' : 'hover:scale-105'}`}>
                {isSavingKey ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>

          <div className="flex items-center justify-between mb-2 mt-2 p-2 rounded border border-red-500">
            <div className="flex items-center">
              <span className={`text-red-600 font-bold text-sm mr-2`}>Exterminate Mode</span>
              <div className="relative inline-block w-10 mr-2 align-middle select-none">
                <input
                  type="checkbox"
                  id="exterminate-toggle"
                  checked={exterminateMode}
                  onChange={() => {
                    const newValue = !exterminateMode;
                    setExterminateMode(newValue);
                    chrome.storage.local.set({ exterminateMode: newValue });
                  }}
                  className="sr-only"
                />
                <label
                  htmlFor="exterminate-toggle"
                  className={`block overflow-hidden h-6 rounded-full cursor-pointer ${
                    exterminateMode ? 'bg-red-600' : isLight ? 'bg-gray-300' : 'bg-gray-600'
                  }`}
                >
                  <span
                    className={`block h-6 w-6 rounded-full bg-white transform transition-transform ${
                      exterminateMode ? 'translate-x-4' : 'translate-x-0'
                    }`}
                  ></span>
                </label>
              </div>
            </div>
            <div className="text-xs text-red-500">
              {exterminateMode ? 'Political tweets will be deleted' : 'Political tweets will be highlighted'}
            </div>
          </div>

          <button
            className={
              'w-full font-bold mt-2 py-2 px-4 rounded shadow hover:scale-105 ' +
              (isLight ? 'bg-green-200 text-black' : 'bg-green-700 text-white') +
              (isExporting || tweetCount === 0 ? ' opacity-50 cursor-not-allowed' : '')
            }
            onClick={handleSaveToFile}
            disabled={isExporting || tweetCount === 0}>
            {isExporting ? 'Saving...' : 'Save Tweets to File'}
          </button>

          {message && (
            <div
              className={`mt-2 p-2 rounded text-sm ${isLight ? 'bg-blue-100 text-blue-800' : 'bg-blue-900 text-blue-100'}`}>
              {message}
            </div>
          )}
        </div>

        <p>
          Edit <code>pages/popup/src/Popup.tsx</code>
        </p>
      </header>
    </div>
  );
};

export default withErrorBoundary(withSuspense(Popup, <div> Loading ... </div>), <div> Error Occur </div>);
