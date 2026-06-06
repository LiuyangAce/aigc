const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000'

async function parseResponse(response) {
  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error.detail || `请求失败：${response.status}`)
  }
  return response.json()
}

export async function fetchQuestions() {
  const response = await fetch(`${API_BASE}/api/questions`)
  return parseResponse(response)
}

export async function fetchKnowledgeGraph() {
  const response = await fetch(`${API_BASE}/api/knowledge-graph`)
  return parseResponse(response)
}

export async function analyzeQuestion(payload) {
  const response = await fetch(`${API_BASE}/api/analyze-question`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  return parseResponse(response)
}

export async function ocrQuestion(image, subject) {
  const formData = new FormData()
  formData.append('image', image)
  formData.append('subject', subject)

  const response = await fetch(`${API_BASE}/api/ocr-question`, {
    method: 'POST',
    body: formData,
  })
  return parseResponse(response)
}

