export const getFriendlyErrorMessage = (err, context = 'chat') => {
  const msg = err.message || String(err);
  const msgLower = msg.toLowerCase();

  // 1. Network / Server connection issues
  if (msgLower.includes('failed to fetch') || msgLower.includes('networkerror') || msgLower.includes('typeerror: failed') || msgLower.includes('unreachable') || msgLower.includes('network connection')) {
    return `### ⚠️ Connection Unreachable\n\nUnable to connect to the backend FastAPI server. Please check that the backend service is running locally on \`http://localhost:8000\`.`;
  }

  // 2. Ollama specific errors
  if (msgLower.includes('ollama is not working') || msgLower.includes('connection refused') || msgLower.includes('11434') || msgLower.includes('connecterror')) {
    return `### 🦙 Ollama Offline / Not Running\n\nWe could not connect to Ollama at \`http://localhost:11434\`. Please make sure the Ollama application is running on your system:\n\n1. Launch the Ollama desktop application, or\n2. Open your terminal and run:\n   \`\`\`bash\n   ollama serve\n   \`\`\``;
  }
  if (msgLower.includes('ollama model') && msgLower.includes('not found')) {
    return `### 🔍 Model Not Found\n\nThe required LLM model was not found in your local Ollama library. Please download it by running this command in your terminal:\n\n\`\`\`bash\nollama pull llama3.2:1b\n\`\`\``;
  }

  // 3. Token / Context limit exceeded issues
  if (msgLower.includes('token exceeded') || msgLower.includes('exceeds the gemini model') || msgLower.includes('limit exceeded') || msgLower.includes('context window') || msgLower.includes('too many tokens') || msgLower.includes('resource exhausted') || msgLower.includes('429')) {
    return `### 📈 Context Token Limit Exceeded\n\nThe text context plus your chat history exceeds the model's maximum allowed tokens. To resolve this, you can:\n\n* Clear the chat history using the **Clear All Data** setting or reload the document.\n* Ask a shorter, more focused question.\n* Switch to cloud mode (Gemini) which supports significantly larger context windows.`;
  }

  // 4. Ingest/Processing failures
  if (context === 'ingest' || msgLower.includes('ingest') || msgLower.includes('upload') || msgLower.includes('pdf extraction') || msgLower.includes('parsing')) {
    return `### ❌ Document Ingestion Failed\n\nThere was an issue processing and embedding this document. This usually happens if:\n\n* The PDF file is scanned/image-only and requires OCR.\n* The file is password-protected or corrupted.\n* The local embedding service (Ollama) is offline.\n\n*Error Detail: ${msg}*`;
  }

  // General fallback
  if (context === 'ingest') {
    return `### ❌ Ingestion Failed\n\n${msg}`;
  }
  return `### ⚠️ API Service Error\n\n${msg}`;
};
