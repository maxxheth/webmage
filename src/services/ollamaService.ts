import { Ollama, type Tool as OllamaToolType } from 'ollama';
import { z, type ZodSchema } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';

/**
 * Ollama Cloud message type
 */
export interface OllamaMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_calls?: OllamaToolCall[];
  tool_name?: string;
}

export interface OllamaToolCall {
  function: {
    name: string;
    arguments: Record<string, unknown>;
  };
}

/**
 * Tool definition for the Ollama API
 */
export interface OllamaTool {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: {
      type: 'object';
      required: string[];
      properties: Record<string, {
        type: string;
        description: string;
        enum?: string[];
        items?: { type: string };
      }>;
    };
  };
}

/**
 * Central AI service wrapping Ollama Cloud API.
 *
 * Provides:
 * - Structured JSON output with Zod schema validation
 * - Free-form chat completion
 * - Multi-turn tool-calling agent loop
 */
export class OllamaService {
  private client: Ollama;
  private model: string;

  constructor() {
    const apiKey = process.env.OLLAMA_API_KEY;
    if (!apiKey) {
      throw new Error('OLLAMA_API_KEY environment variable is required');
    }

    this.client = new Ollama({
      host: 'https://ollama.com',
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });

    this.model = process.env.OLLAMA_MODEL || 'gpt-oss:120b';
  }

  /**
   * Generate structured JSON output validated against a Zod schema
   */
  async generateStructured<T>(
    prompt: string,
    schema: ZodSchema<T>,
    systemPrompt?: string
  ): Promise<T> {
    const messages: Array<{ role: string; content: string }> = [];

    if (systemPrompt) {
      messages.push({ role: 'system', content: systemPrompt });
    }
    messages.push({ role: 'user', content: prompt });

    const response = await this.client.chat({
      model: this.model,
      messages,
      format: zodToJsonSchema(schema) as Record<string, unknown>,
      stream: false,
    });

    const parsed = JSON.parse(response.message.content);
    return schema.parse(parsed);
  }

  /**
   * Free-form chat completion (non-streaming)
   */
  async chat(
    messages: OllamaMessage[],
    systemPrompt?: string
  ): Promise<string> {
    const allMessages: Array<{ role: string; content: string }> = [];

    if (systemPrompt) {
      allMessages.push({ role: 'system', content: systemPrompt });
    }
    allMessages.push(...messages);

    const response = await this.client.chat({
      model: this.model,
      messages: allMessages,
      stream: false,
    });

    return response.message.content;
  }

  /**
   * Streaming chat completion for long-form content generation
   */
  async chatStream(
    messages: OllamaMessage[],
    onChunk: (text: string) => void,
    systemPrompt?: string
  ): Promise<string> {
    const allMessages: Array<{ role: string; content: string }> = [];

    if (systemPrompt) {
      allMessages.push({ role: 'system', content: systemPrompt });
    }
    allMessages.push(...messages);

    const response = await this.client.chat({
      model: this.model,
      messages: allMessages,
      stream: true,
    });

    let fullContent = '';
    for await (const part of response) {
      const chunk = part.message.content;
      fullContent += chunk;
      onChunk(chunk);
    }

    return fullContent;
  }

  /**
   * Multi-turn tool-calling agent loop.
   * 
   * Sends messages with tools, processes tool calls by invoking the provided
   * handlers, and continues until the model stops requesting tools.
   */
  async agentLoop(
    messages: OllamaMessage[],
    tools: OllamaTool[],
    toolHandlers: Record<string, (args: Record<string, unknown>) => Promise<string>>,
    maxIterations = 10
  ): Promise<OllamaMessage[]> {
    const conversation = [...messages];
    let iterations = 0;

    while (iterations < maxIterations) {
      iterations++;

      const response = await this.client.chat({
        model: this.model,
        messages: conversation as Array<{ role: string; content: string }>,
        tools: tools as unknown as OllamaToolType[],
        stream: false,
      });

      const assistantMessage = response.message as unknown as OllamaMessage;
      conversation.push({
        role: 'assistant',
        content: assistantMessage.content,
        tool_calls: assistantMessage.tool_calls,
      });

      const toolCalls = assistantMessage.tool_calls ?? [];
      if (toolCalls.length === 0) {
        break;
      }

      for (const call of toolCalls) {
        const handler = toolHandlers[call.function.name];
        if (!handler) {
          console.warn(`  ⚠ Unknown tool call: ${call.function.name}`);
          conversation.push({
            role: 'tool',
            tool_name: call.function.name,
            content: `Error: Unknown tool "${call.function.name}"`,
          });
          continue;
        }

        try {
          const result = await handler(call.function.arguments);
          conversation.push({
            role: 'tool',
            tool_name: call.function.name,
            content: result,
          });
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : String(error);
          conversation.push({
            role: 'tool',
            tool_name: call.function.name,
            content: `Error: ${errorMsg}`,
          });
        }
      }
    }

    return conversation;
  }

  /**
   * Test connection to Ollama Cloud
   */
  async testConnection(): Promise<boolean> {
    try {
      const TestSchema = z.object({ ok: z.boolean() });
      const result = await this.generateStructured(
        'Respond with ok: true',
        TestSchema
      );
      return result.ok === true;
    } catch (error) {
      console.error('Ollama Cloud connection test failed:', error);
      return false;
    }
  }

  /**
   * Get the configured model name
   */
  getModel(): string {
    return this.model;
  }
}
