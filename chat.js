#!/usr/bin/env node

// Load environment variables from a .env file.
import dotenv from 'dotenv';
dotenv.config();

import fs from 'fs';
import readline from 'readline';
import { parseArgs } from 'node:util';
import OpenAI from 'openai';
import { encodingForModel } from 'js-tiktoken';

// --- Configuration ---
const DEFAULT_MODEL = 'o3-mini';
const DEFAULT_REASONING = 'high';
const MAX_TOKENS = 200_000;
const PROMPT_COST_PER_TOKEN = 1.1 / 1_000_000;      // $1.1 per 1,000,000 tokens (prompt/input)
const COMPLETION_COST_PER_TOKEN = 4.4 / 1_000_000;  // $4.4 per 1,000,000 tokens (completion/output)

// --- Command-Line Argument Parsing ---
const args = parseArgs({
  options: {
    context: {
      type: 'string',
      short: 'c',
      description: 'Path to a context file',
    },
    output: {
      type: 'string',
      short: 'o',
      description: 'Path to log conversation output',
    },
  },
});
const contextFile = args.values.context || null;
const outputFile = args.values.output || null;

// --- Setup Logging (if requested) ---
let logStream = null;
if (outputFile) {
  try {
    logStream = fs.createWriteStream(outputFile, { flags: 'a' });
  } catch (error) {
    console.error("Error opening output file:", error);
    process.exit(1);
  }
}

/**
 * Helper function to log conversation messages to file.
 * Skips logging if the message is a user command (/tokens, exit, or quit)
 * or if the role is 'system'.
 *
 * @param {string} role - The role of the message (e.g. "user", "assistant", "system").
 * @param {string} content - The content of the message.
 */
function logMessage(role, content) {
  const trimmed = content.trim().toLowerCase();
  if (role === 'user' && (trimmed === '/tokens' || trimmed === 'exit' || trimmed === 'quit')) {
    return;
  }
  // Do not log system messages.
  if (role === 'system') {
    return;
  }
  if (logStream) {
    // Log in a simple format: Role: Message
    logStream.write(`${role}: ${content}\n`);
  }
}

// --- Ensure the API key is set ---
if (!process.env.OPENAI_API_KEY) {
  console.error("Please set the OPENAI_API_KEY environment variable (or in your .env file).");
  process.exit(1);
}

// --- Initialize OpenAI Client (v4) ---
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// --- Read Context File (if provided) ---
let contextData = "";
if (contextFile) {
  try {
    contextData = fs.readFileSync(contextFile, "utf-8");
  } catch (error) {
    console.error("Error reading context file:", error);
    process.exit(1);
  }
}

// --- Conversation History ---
// If a context file was provided, add its content as a system message.
// Note: We do not log system messages.
let conversation = [];
if (contextData) {
  conversation.push({
    role: "system",
    content: contextData,
  });
}

/**
 * Count tokens for messages, separating input and output tokens.
 * Uses the new js-tiktoken API (encodingForModel).
 *
 * @param {Array} messages - Array of message objects.
 * @param {string} model - The model name (default is DEFAULT_MODEL).
 * @returns {Object} - An object with `inputTokens` and `outputTokens` counts.
 */
function countTokensByRole(messages, model = DEFAULT_MODEL) {
  let tokensPerMessage, tokensPerName;
  if (model === 'o3-mini') {
    tokensPerMessage = 3;
    tokensPerName = -1;
  } else if (model.startsWith('gpt-4')) {
    tokensPerMessage = 3;
    tokensPerName = 1;
  } else {
    tokensPerMessage = 4;
    tokensPerName = -1;
  }

  const enc = encodingForModel(model);
  let inputTokens = 0;
  let outputTokens = 0;

  for (const message of messages) {
    let messageTokens = tokensPerMessage;
    for (const [key, value] of Object.entries(message)) {
      messageTokens += enc.encode(value).length;
      if (key === 'name') {
        messageTokens += tokensPerName;
      }
    }
    // Separate tokens by role: assistant messages count as output,
    // all others count as input.
    if (message.role === 'assistant') {
      outputTokens += messageTokens;
    } else {
      inputTokens += messageTokens;
    }
  }
  // Add 2 extra tokens for the reply (assumed to be part of the output).
  outputTokens += 2;
  return { inputTokens, outputTokens };
}

// --- Interactive Command-Line Interface ---
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  prompt: "You: ",
});

/**
 * Calls the OpenAI Chat API with the current conversation.
 * Uses the v4 SDK method and the DEFAULT_MODEL.
 */
async function getAssistantResponse() {
  try {
    const chatCompletion = await openai.chat.completions.create({
      model: DEFAULT_MODEL,
      reasoning_effort: DEFAULT_REASONING,
      messages: conversation,
    });
    return chatCompletion.choices[0];
  } catch (error) {
    if (error instanceof OpenAI.APIError) {
      console.error("API Error:", error.status);
      console.error(error.message);
      console.error(error.code);
      console.error(error.type);
    } else {
      console.error("Error:", error);
    }
    return null;
  }
}

/**
 * Processes a user message by:
 *   1. Appending it to the conversation (and logging it if appropriate).
 *   2. Displaying the current token count and cost.
 *   3. Calling the API.
 *   4. Displaying and logging the assistant's response.
 *   5. Automatically continuing if the response was truncated.
 *
 * Special command:
 *   Typing "/tokens" will print the current token count and cost breakdown.
 *
 * @param {string} message - The user's input.
 */
async function processUserMessage(message) {
  const trimmedMsg = message.trim();
  // Special command: /tokens (do not log this command).
  if (trimmedMsg === "/tokens") {
    const { inputTokens, outputTokens } = countTokensByRole(conversation, DEFAULT_MODEL);
    const totalTokens = inputTokens + outputTokens;
    const costInput = inputTokens * PROMPT_COST_PER_TOKEN;
    const costOutput = outputTokens * COMPLETION_COST_PER_TOKEN;
    console.log(`Token Count: ${totalTokens} (Input: ${inputTokens}, Output: ${outputTokens})`);
    console.log(`Cost: $${costInput.toFixed(6)} prompt, $${costOutput.toFixed(6)} completion, Total: $${(costInput + costOutput).toFixed(6)}`);
    return;
  }

  // Append and log the user's message.
  conversation.push({ role: "user", content: message });
  logMessage("user", message);

  // Get the assistant's response.
  let assistantResponse = await getAssistantResponse();
  if (!assistantResponse) {
    console.error("No response from API.");
    return;
  }

  // Append and log the assistant's response.
  conversation.push({
    role: "assistant",
    content: assistantResponse.message.content,
  });
  logMessage("assistant", assistantResponse.message.content);
  process.stdout.write("Assistant: " + assistantResponse.message.content + "\n");

  // Automatically continue if the response was truncated.
  while (assistantResponse.finish_reason === "length") {
    console.log("[Response truncated. Automatically continuing...]");
    // Append and log a "Continue" prompt.
    conversation.push({ role: "user", content: "Continue" });
    logMessage("user", "Continue");
    assistantResponse = await getAssistantResponse();
    if (!assistantResponse) {
      console.error("No continuation response from API.");
      break;
    }
    conversation.push({
      role: "assistant",
      content: assistantResponse.message.content,
    });
    logMessage("assistant", assistantResponse.message.content);
    process.stdout.write(assistantResponse.message.content + "\n");
  }
}

// --- Start the Interactive CLI ---
console.log("Interactive chat. Type your message and press enter.");
console.log("Type '/tokens' to see the current token count and cost.");
console.log("Type 'exit' or 'quit' to end the session.");
rl.prompt();

rl.on("line", async (line) => {
  const trimmed = line.trim();
  if (trimmed.toLowerCase() === "exit" || trimmed.toLowerCase() === "quit") {
    rl.close();
    return;
  }
  await processUserMessage(trimmed);
  rl.prompt();
}).on("close", () => {
  console.log("Exiting chat.");
  if (logStream) {
    logStream.end();
  }
  process.exit(0);
});
