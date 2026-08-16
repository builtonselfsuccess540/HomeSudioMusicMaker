import Anthropic from '@anthropic-ai/sdk'

const MODEL = 'claude-sonnet-4-6'
const MAX_TOKENS = 8192

function getClient() {
  return new Anthropic({
    apiKey: import.meta.env.VITE_ANTHROPIC_API_KEY || '',
    dangerouslyAllowBrowser: true
  })
}

class CompatChatSession {
  constructor(systemInstruction, history) {
    this.client = getClient()
    this.systemInstruction = systemInstruction
    this.messages = history.map(h => ({
      role: h.role === 'model' ? 'assistant' : h.role,
      content: Array.isArray(h.parts) ? h.parts.map(p => p.text).join('') : (h.content || '')
    }))
  }

  async sendMessageStream(text) {
    this.messages.push({ role: 'user', content: text })
    const params = {
      model: MODEL,
      max_tokens: MAX_TOKENS,
      messages: this.messages
    }
    if (this.systemInstruction) params.system = this.systemInstruction

    const stream = this.client.messages.stream(params)
    const self = this

    return {
      stream: (async function* () {
        let full = ''
        for await (const chunk of stream) {
          if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
            full += chunk.delta.text
            yield { text: () => chunk.delta.text }
          }
        }
        self.messages.push({ role: 'assistant', content: full })
      })()
    }
  }
}

class CompatModel {
  constructor(systemInstruction, temperature) {
    this.client = getClient()
    this.systemInstruction = systemInstruction
    this.temperature = temperature !== undefined ? Math.min(temperature, 1.0) : undefined
  }

  async generateContent(prompt) {
    const content = typeof prompt === 'string' ? prompt : JSON.stringify(prompt)
    const params = {
      model: MODEL,
      max_tokens: MAX_TOKENS,
      messages: [{ role: 'user', content }]
    }
    if (this.systemInstruction) params.system = this.systemInstruction
    if (this.temperature !== undefined) params.temperature = this.temperature

    const response = await this.client.messages.create(params)
    const text = response.content[0]?.text ?? ''
    return { response: { text: () => text } }
  }

  async generateContentStream(prompt) {
    const content = typeof prompt === 'string' ? prompt : JSON.stringify(prompt)
    const params = {
      model: MODEL,
      max_tokens: MAX_TOKENS,
      messages: [{ role: 'user', content }]
    }
    if (this.systemInstruction) params.system = this.systemInstruction
    if (this.temperature !== undefined) params.temperature = this.temperature

    const stream = this.client.messages.stream(params)
    return {
      stream: (async function* () {
        for await (const chunk of stream) {
          if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
            yield { text: () => chunk.delta.text }
          }
        }
      })()
    }
  }

  startChat({ history = [] } = {}) {
    return new CompatChatSession(this.systemInstruction, history)
  }
}

class GoogleGenerativeAI {
  constructor(apiKey) {}

  getGenerativeModel({ model, systemInstruction, generationConfig } = {}) {
    return new CompatModel(systemInstruction, generationConfig?.temperature)
  }
}

export { GoogleGenerativeAI }
