export type LLMGenerateText = {
  prompt: string;
  abortSignal?: AbortSignal;
};

export type LLMGenerateStructured = {
  schemaName: string;
  prompt: string;
  abortSignal?: AbortSignal;
};

export type LLMEmbed = {
  text: string;
  abortSignal?: AbortSignal;
};

export type LLMProvider = {
  generateText(input: LLMGenerateText): Promise<string>;
  generateStructured(input: LLMGenerateStructured): Promise<unknown>;
  embed(input: LLMEmbed): Promise<number[]>;
  estimateCost(input: {
    promptTokens: number;
    completionTokens: number;
  }): number;
};

export const noopLlmProvider: LLMProvider = {
  async generateText() {
    throw new Error("LLM adapter is not wired");
  },
  async generateStructured() {
    throw new Error("LLM adapter is not wired");
  },
  async embed() {
    throw new Error("LLM adapter is not wired");
  },
  estimateCost() {
    return 0;
  },
};
