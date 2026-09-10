export type LLMGenerateText = {
  prompt: string;
  abortSignal?: AbortSignal;
};

export type LLMProvider = {
  generateText(input: LLMGenerateText): Promise<string>;
  estimateCost(input: {
    promptTokens: number;
    completionTokens: number;
  }): number;
};

export const noopLlmProvider: LLMProvider = {
  async generateText() {
    throw new Error("LLM adapter is not wired until the AI layer phase");
  },
  estimateCost() {
    return 0;
  },
};
