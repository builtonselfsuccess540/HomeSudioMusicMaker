import { GoogleGenAI } from '@google/genai'

class CompatChatSession {
  constructor(ai, modelName, modelConfig, history) {
    this.chat = ai.chats.create({ model: modelName, config: modelConfig, history })
  }

  async sendMessageStream(text) {
    const stream = await this.chat.sendMessageStream({ message: text })
    return {
      stream: (async function* () {
        for await (const chunk of stream) {
          yield { text: () => chunk.text ?? '' }
        }
      })()
    }
  }
}

class CompatModel {
  constructor(ai, modelName, modelConfig) {
    this.ai = ai
    this.modelName = modelName
    this.modelConfig = modelConfig
  }

  async generateContent(prompt) {
    const response = await this.ai.models.generateContent({
      model: this.modelName,
      contents: prompt,
      config: this.modelConfig
    })
    const text = response.text ?? ''
    return { response: { text: () => text } }
  }

  async generateContentStream(prompt) {
    const stream = await this.ai.models.generateContentStream({
      model: this.modelName,
      contents: prompt,
      config: this.modelConfig
    })
    return {
      stream: (async function* () {
        for await (const chunk of stream) {
          yield { text: () => chunk.text ?? '' }
        }
      })()
    }
  }

  startChat({ history = [] } = {}) {
    return new CompatChatSession(this.ai, this.modelName, this.modelConfig, history)
  }
}

class GoogleGenerativeAI {
  constructor(apiKey) {
    this.ai = new GoogleGenAI({ apiKey })
  }

  getGenerativeModel({ model, systemInstruction, generationConfig } = {}) {
    const config = {}
    if (systemInstruction) config.systemInstruction = systemInstruction
    if (generationConfig?.temperature !== undefined) config.temperature = generationConfig.temperature
    if (generationConfig?.maxOutputTokens !== undefined) config.maxOutputTokens = generationConfig.maxOutputTokens
    return new CompatModel(this.ai, model, Object.keys(config).length ? config : undefined)
  }
}

export { GoogleGenerativeAI }
