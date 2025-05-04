export type TweetData = {
  index: number;
  id?: string;
  author: {
    name: string;
    handle: string;
    verified: boolean;
  };
  content: {
    text: string;
    isQuote: boolean;
    quotedTweet?: {
      author: string;
      handle: string;
      text: string;
      id?: string;
    };
  };
  engagement: {
    replies?: string;
    reposts?: string;
    likes?: string;
    views?: string;
  };
  timestamp?: string;
  collectedAt?: string;
  tabId?: number;
  url?: string;
};
