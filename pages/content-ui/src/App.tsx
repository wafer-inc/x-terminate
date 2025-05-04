import { useEffect, useState, useMemo } from 'react';
import { ToggleButton } from '@extension/ui';
import { exampleThemeStorage } from '@extension/storage';
import { t } from '@extension/i18n';
import type { TweetData } from '../../../types';
import { CatBoost } from 'catboost-inference';
import political_tweet_classifier from './political_tweet_classifier.json?raw';

export default function App() {
  const [isScrapingActive, setIsScrapingActive] = useState(true);
  const [tweetCount, setTweetCount] = useState(0);
  const [exterminateMode, setExterminateMode] = useState(false);

  const catboost_model = useMemo(() => {
    console.log('loading model... !');
    const catboost_model = new CatBoost(political_tweet_classifier);
    console.log('loaded model!');
    return catboost_model;
  }, []);

  // Function to classify a tweet using its embedding
  const classifyTweetWithEmbedding = async (tweetId: string) => {
    try {
      // Request the embedding from the background script
      return new Promise<{ isPolitical: boolean; confidence: number }>((resolve, reject) => {
        chrome.runtime.sendMessage(
          {
            type: 'GET_TWEET_EMBEDDING',
            tweetId: tweetId,
          },
          response => {
            if (response?.success) {
              // Use the embedding with the CatBoost model
              const embedding = response.embedding;
              const prediction = catboost_model.infer(embedding);

              // CatBoost returns probability of class 1 (political)
              const isPolitical = prediction > 0.5;
              const confidence = isPolitical ? prediction : 1 - prediction;

              console.log(
                `Tweet classified as ${isPolitical ? 'political' : 'non-political'} with ${(confidence * 100).toFixed(2)}% confidence ${response.fromCache ? '(using cached embedding)' : '(using new embedding)'}`,
              );

              resolve({
                isPolitical,
                confidence,
              });
            } else {
              reject(new Error('Error getting embedding: ' + (response?.error || 'Unknown error')));
            }
          },
        );
      });
    } catch (error) {
      console.error('Error classifying tweet:', error);
      throw error;
    }
  };

  // Check for exterminate mode setting
  useEffect(() => {
    chrome.storage.local.get('exterminateMode', result => {
      if (result.exterminateMode !== undefined) {
        setExterminateMode(result.exterminateMode);
        console.log(`Exterminate mode is ${result.exterminateMode ? 'ON' : 'OFF'}`);
      }
    });

    // Listen for changes to exterminate mode
    chrome.storage.onChanged.addListener(changes => {
      if (changes.exterminateMode) {
        setExterminateMode(changes.exterminateMode.newValue);
        console.log(`Exterminate mode changed to ${changes.exterminateMode.newValue ? 'ON' : 'OFF'}`);
      }
    });
  }, []);

  useEffect(() => {
    console.log('Twitter scraper content UI loaded');

    // Function to scrape tweets
    const scrapeTweets = () => {
      // Find the timeline container
      const timelineContainer = document.querySelector('div[aria-label^="Timeline: "]');

      if (timelineContainer) {
        // Get the first child div which contains all tweets
        const tweetsContainer = timelineContainer.children[0];

        if (tweetsContainer) {
          // Get all tweet divs (direct children of the tweets container)
          const tweetDivs = Array.from(tweetsContainer.children);

          console.log(`Found ${tweetDivs.length} tweets in the timeline`);
          setTweetCount(tweetDivs.length);

          // Process each tweet with structured data extraction
          tweetDivs.forEach((tweetDiv, index) => {
            try {
              const tweetElement = tweetDiv as HTMLElement;

              // Check if a badge already exists
              const existingBadge = tweetElement.querySelector('.tweet-classification-badge');

              if (existingBadge) {
                // We don't have to do anything here
              } else {
                // Extract structured data from the tweet
                const tweetData = extractTweetData(tweetDiv, index);

                // Log the structured data
                console.log(`Tweet #${index + 1}:`, tweetData);

                // Generate and log a human-readable text description
                const readableText = generateReadableText(tweetData);
                console.log(`\nTweet #${index + 1} (Text for LLM):\n${readableText}\n`);

                // Send tweet data to background script
                if (tweetData.id) {
                  sendTweetToBackground(tweetData)
                    .then(() => {
                      // After storing the tweet, classify it
                      return classifyTweetWithEmbedding(tweetData.id!);
                    })
                    .then(classification => {
                      try {
                        // Check if we should delete the tweet (exterminate mode + political)
                        if (exterminateMode && classification.isPolitical) {
                          console.log(
                            `Exterminating political tweet #${tweetData.index} (${(classification.confidence * 100).toFixed(0)}% confidence)`,
                          );

                          tweetElement.style.display = 'none';
                        } else if (!exterminateMode) {
                          console.log(
                            `Not exterminating tweet #${tweetData.index} (${(classification.confidence * 100).toFixed(0)}% confidence) (exterminateMode: ${exterminateMode}, isPolitical: ${classification.isPolitical})`,
                          );

                          // Create a new classification badge
                          const badge = document.createElement('div');
                          badge.className = 'tweet-classification-badge'; // Add a class for identification
                          badge.style.padding = '5px';
                          badge.style.paddingLeft = '70px';
                          badge.style.borderRadius = '0px 0px 4px 4px';

                          if (classification.isPolitical) {
                            badge.textContent = `Political (${(classification.confidence * 100).toFixed(0)}%)`;
                          } else {
                            badge.textContent = `Non-political (${(classification.confidence * 100).toFixed(0)}%)`;
                          }

                          // Add the badge to the tweet
                          tweetElement.appendChild(badge);

                          // If political, highlight the entire tweet with a red background
                          if (classification.isPolitical) {
                            tweetElement.style.backgroundColor = 'rgba(254, 0, 38, .2)'; // light red background
                            tweetElement.style.borderLeft = '4px solid rgba(220, 38, 38, 0.5)'; // red left border
                            tweetElement.style.borderRadius = '4px';
                          } else {
                            tweetElement.style.backgroundColor = 'rgba(16, 185, 129, .2)'; // light green background
                            tweetElement.style.borderLeft = '4px solid rgba(16, 185, 129, 0.5)'; // green left border
                            tweetElement.style.borderRadius = '4px';
                          }
                        }
                      } catch (error) {
                        console.error('Error processing tweet classification:', error);
                      }
                    })
                    .catch(error => {
                      console.error('Error in tweet classification process:', error);
                    });
                }
              }
            } catch (error) {
              console.error(`Error processing tweet #${index + 1}:`, error);
            }
          });
        } else {
          console.log('Tweets container not found inside timeline');
        }
      } else {
        console.log('Twitter timeline not found on the page');
      }
    };

    // Function to extract structured data from a tweet
    const extractTweetData = (tweetDiv: Element, index: number): TweetData => {
      // Create a structured object for the tweet data
      const tweetData: TweetData = {
        index: index + 1,
        author: {
          name: 'Unknown',
          handle: 'Unknown',
          verified: false,
        },
        content: {
          text: '',
          isQuote: false,
        },
        engagement: {},
      };

      // Try to extract tweet ID
      try {
        // Look for links to the tweet which contain the ID
        const tweetLink = tweetDiv.querySelector('a[href*="/status/"]');
        if (tweetLink) {
          const href = tweetLink.getAttribute('href');
          if (href) {
            // Extract ID from URL pattern like /username/status/1234567890
            const match = href.match(/\/status\/(\d+)/);
            if (match && match[1]) {
              tweetData.id = match[1];
            }
          }
        }
      } catch (error) {
        console.warn('Error extracting tweet ID:', error);
      }

      // Try to extract author information
      try {
        // Find the user name element
        const userNameElement = tweetDiv.querySelector('[data-testid="User-Name"]');
        if (userNameElement) {
          // Extract the author's name
          const nameElement = userNameElement.querySelector('.r-b88u0q');
          if (nameElement) {
            tweetData.author.name = nameElement.textContent?.trim() || 'Unknown';
          }

          // Extract the author's handle
          const handleElement = userNameElement.querySelector('.r-1wvb978');
          if (handleElement) {
            tweetData.author.handle = handleElement.textContent?.trim() || 'Unknown';
          }

          // Check if verified
          tweetData.author.verified = !!userNameElement.querySelector('[data-testid="icon-verified"]');

          // Extract timestamp if available
          const timeElement = userNameElement.querySelector('time');
          if (timeElement) {
            tweetData.timestamp = timeElement.getAttribute('datetime') || timeElement.textContent?.trim() || undefined;
          }
        }
      } catch (error) {
        console.warn('Error extracting author data:', error);
      }

      // Extract tweet text content
      try {
        const tweetTextElement = tweetDiv.querySelector('[data-testid="tweetText"]');
        if (tweetTextElement) {
          tweetData.content.text = tweetTextElement.textContent?.trim() || '';
        } else {
          // Fallback to general text content if specific element not found
          tweetData.content.text = tweetDiv.textContent?.trim() || '';
        }
      } catch (error) {
        console.warn('Error extracting tweet text:', error);
        tweetData.content.text = tweetDiv.textContent?.trim() || '';
      }

      // Check for quoted tweet
      try {
        // Look for a quote container - it's typically a div with role="link" inside the tweet
        // that contains another tweet structure
        const quoteContainer = tweetDiv.querySelector('div[role="link"][tabindex="0"]');

        if (quoteContainer) {
          tweetData.content.isQuote = true;

          // The quoted tweet has its own tweetText and User-Name elements inside the container
          const quotedTextElement = quoteContainer.querySelector('[data-testid="tweetText"]');
          const quotedAuthorElement = quoteContainer.querySelector('[data-testid="User-Name"]');

          // Make sure we're not getting the original tweet's elements
          if (
            quotedAuthorElement &&
            quotedTextElement &&
            quotedAuthorElement !== tweetDiv.querySelector('[data-testid="User-Name"]')
          ) {
            const quotedName = quotedAuthorElement.querySelector('.r-b88u0q')?.textContent?.trim() || 'Unknown';
            const quotedHandle = quotedAuthorElement.querySelector('.r-1wvb978')?.textContent?.trim() || 'Unknown';
            const quotedText = quotedTextElement.textContent?.trim() || '';

            tweetData.content.quotedTweet = {
              author: quotedName,
              handle: quotedHandle,
              text: quotedText,
            };

            // Try to extract quoted tweet ID
            const quotedTweetLink = quoteContainer.querySelector('a[href*="/status/"]');
            if (quotedTweetLink) {
              const href = quotedTweetLink.getAttribute('href');
              if (href) {
                const match = href.match(/\/status\/(\d+)/);
                if (match && match[1]) {
                  tweetData.content.quotedTweet.id = match[1];
                }
              }
            }
          }
        }
      } catch (error) {
        console.warn('Error processing quoted tweet:', error);
      }

      // Extract engagement metrics
      try {
        // Find all engagement elements (replies, reposts, likes, views)
        const engagementGroup = tweetDiv.querySelector('[role="group"]');
        if (engagementGroup) {
          // Extract replies
          const repliesElement = engagementGroup.querySelector('[data-testid="reply"]');
          if (repliesElement) {
            tweetData.engagement.replies = repliesElement.textContent?.match(/\d+(\.\d+)?[KM]?/)?.[0] || '';
          }

          // Extract reposts
          const repostsElement = engagementGroup.querySelector('[data-testid="retweet"]');
          if (repostsElement) {
            tweetData.engagement.reposts = repostsElement.textContent?.match(/\d+(\.\d+)?[KM]?/)?.[0] || '';
          }

          // Extract likes
          const likesElement = engagementGroup.querySelector('[data-testid="like"]');
          if (likesElement) {
            tweetData.engagement.likes = likesElement.textContent?.match(/\d+(\.\d+)?[KM]?/)?.[0] || '';
          }

          // Extract views
          const viewsElement = engagementGroup.querySelector('[aria-label*="views"]');
          if (viewsElement) {
            tweetData.engagement.views = viewsElement.textContent?.match(/\d+(\.\d+)?[KM]?/)?.[0] || '';
          }
        }
      } catch (error) {
        console.warn('Error extracting engagement metrics:', error);
      }

      return tweetData;
    };

    // Function to send tweet data to background script
    const sendTweetToBackground = (tweetData: any): Promise<void> => {
      return new Promise((resolve, reject) => {
        try {
          chrome.runtime.sendMessage(
            {
              type: 'TWEET_DATA',
              tweet: tweetData,
            },
            response => {
              if (response?.success) {
                console.log(`Tweet #${tweetData.index} sent to background script`);
                resolve();
              } else {
                console.warn(`Tweet #${tweetData.index} may not have been processed correctly`);
                reject(new Error('Tweet may not have been processed correctly'));
              }
            },
          );
        } catch (error) {
          console.error('Failed to send tweet to background:', error);
          reject(error);
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

    let intervalId: number | null = null;

    // Start or stop scraping based on state
    if (isScrapingActive) {
      console.log('Starting Twitter scraper...');
      intervalId = window.setInterval(scrapeTweets, 1000);
      // Run once immediately
      scrapeTweets();
    } else if (intervalId) {
      console.log('Stopping Twitter scraper...');
      clearInterval(intervalId);
    }

    // Cleanup on unmount
    return () => {
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [isScrapingActive, exterminateMode]);

  return (
    <div className="flex flex-col gap-2 rounded bg-blue-100 p-3" style={{ display: `None` }}>
      <div className="flex items-center justify-between">
        <div className="text-blue-700 font-bold">Twitter Timeline Scraper</div>
        <ToggleButton onClick={() => setIsScrapingActive(!isScrapingActive)}>
          {isScrapingActive ? 'Stop Scraping' : 'Start Scraping'}
        </ToggleButton>
      </div>
      <div className="text-sm text-blue-600">
        {isScrapingActive
          ? `Scraping active - Found ${tweetCount} tweets`
          : 'Scraper is inactive. Click the button to start.'}
      </div>
      <div className="text-xs text-gray-500">Check the browser console to see the scraped tweets.</div>
    </div>
  );
}
