# X-Terminate

## Installation from Source

Installation from source requires `pnpm` and `nvm`.

```
git clone https://github.com/wafer-inc/x-terminate.git
cd x-terminate
nvm use
pnpm dev
```

This will create a folder called `dist`. Follow the instruction [here](https://developer.chrome.com/docs/extensions/get-started/tutorial/hello-world#load-unpacked) to load the extension in chrome. While `pnpm dev` is running, any changes to the chrome extension source will be immediately reflected in the `dist` folder and should automatically update in the browser. However, you can kill the `pnpm dev` process and the chrome extension will continue to function.

## Training the model

### Collecting tweets

The chrome extension collects all tweets that get loaded. They can be downloaded by clicking the "Save tweets to file" button.

### Labeling

Requires cargo. Tweet data is in `train-model/data/tweets.jsonl` (and you can always add to this file). 

Ensure you have the `OPENAI_API_KEY` environment variable exported and set to your API key. Then:

```
cd x-terminate/train-model
cargo run
```

After a few moments, the tweets will be labeled. The labels will be recorded in `train-model/cache`, so you don't have to worry about going broke if you run it multiple times.

### Training the model

90% of the work is getting a python environment set up. Detailed instructions are recorded at `train-model/train/readme.md`


## Credits

Many thanks to [Jonghakseo's chrome extension boilerplate](https://github.com/Jonghakseo/chrome-extension-boilerplate-react-vite).
