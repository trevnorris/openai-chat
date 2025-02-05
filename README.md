# Chat CLI with Token & Cost Calculation

This interactive command-line tool lets you chat with an OpenAI language model (default: `o3-mini`) using the new OpenAI v4 SDK. It maintains full conversation history, allows you to attach an initial context from a file, counts tokens separately for user (input) and assistant (output) messages using the `js-tiktoken` package, and calculates estimated costs based on provided pricing. In addition, you can optionally log the conversation to a file using the `--output` option so that you don't have to copy the console content manually.

## Features

- **Interactive CLI:** Chat with the model in real time.
- **Context File Support:** Optionally load a file at startup to supply context (added as a system message but not logged).
- **Token Counting:** Uses the latest `js-tiktoken` API to count tokens in messages.
- **Cost Calculation:** Estimates prompt (input) and completion (output) costs based on:
  - **Max Tokens:** 200,000
  - **Prompt Cost:** $1.1 per 1,000,000 tokens
  - **Completion Cost:** $4.4 per 1,000,000 tokens
- **Automatic Continuation:** If the API response is truncated (i.e. `finish_reason` is `"length"`), the tool automatically issues a "Continue" prompt until the response is complete.
- **Conversation Logging:** Use the `--output` (or `-o`) option to log the conversation to a file. The log will include user and assistant messages (including automatic "Continue" prompts) but will not include system messages (such as the contents of your context file) or commands like `/tokens`, `exit`, or `quit`.

## Requirements

- [Node.js](https://nodejs.org/) (v14 or higher is recommended)
- NPM (or Yarn)

## Installation

1. **Clone or download** this repository (or copy the script file into your project).

2. **Install dependencies** by running:
   ```bash
   npm install dotenv openai js-tiktoken
   ```

3. **Configure your environment:**
   Create a `.env` file in the same directory as the script and add your OpenAI API key:
   ```env
   OPENAI_API_KEY=your-api-key-here
   ```

## Usage

Run the script using Node.js. You can supply a context file and/or specify an output file for logging. For example:

```bash
node chat.mjs --context path/to/your/context.txt --output conversation.log
```

### Command-Line Options

- **`--context` (`-c`):**
  Specifies the path to a context file. The contents of this file are added as a system message to the conversation (but are **not** logged to the output file).

- **`--output` (`-o`):**
  Specifies the path to a file where the conversation will be logged. The log will include all user and assistant messages (and any automatic "Continue" prompts), except for system messages and commands such as `/tokens`, `exit`, or `quit`.

## Interactive Commands

Once the script is running, you'll see an interactive prompt like:

```
Interactive chat. Type your message and press enter.
Type '/tokens' to see the current token count and cost.
Type 'exit' or 'quit' to end the session.
You:
```

- **Any text:** Your message will be sent to the model.
- **`/tokens`:** Displays the current token counts (input and output) along with the estimated cost.
- **`exit` or `quit`:** Ends the chat session.

## How It Works

1. **Initialization:**
   - Loads environment variables from a `.env` file.
   - Parses command-line arguments using Node's built-in `parseArgs` from `node:util`.
   - Initializes the OpenAI v4 client using your API key.

2. **Context File:**
   - If provided, the contents of the file are read and added as a system message to the conversation history (but are not logged).

3. **Chat Interaction:**
   - Uses Node’s `readline` module to prompt for user input.
   - Sends the full conversation history (including context) to the model.
   - Automatically detects truncated responses and sends a "Continue" prompt until the response is complete.

4. **Token Counting & Cost Calculation:**
   - Uses `encodingForModel` from `js-tiktoken` to count tokens in messages.
   - Calculates cost based on:
     - **Prompt (Input):** $1.1 per 1,000,000 tokens
     - **Completion (Output):** $4.4 per 1,000,000 tokens
   - The `/tokens` command shows the current totals and cost estimates.

5. **Conversation Logging:**
   - If an output file is specified using the `--output` option, the script writes all user and assistant messages to that file.
   - System messages (like context file contents) and commands (`/tokens`, `exit`, or `quit`) are **not** logged.

## Customization

- **Model:**
  The default model is set to `o3-mini`. To change this, modify the `DEFAULT_MODEL` variable in the script.

- **Pricing & Token Limits:**
  You can adjust the cost parameters (`PROMPT_COST_PER_TOKEN` and `COMPLETION_COST_PER_TOKEN`) or maximum token values directly in the script if needed.

## License

This project is open-source and available under the [MIT License](LICENSE).
