export const getFriendlyErrorMessage = (err, context = 'chat') => {
  const msg = err.message || String(err);
  const msgLower = msg.toLowerCase();

  // 1. API Rate Limit / Quota Exceeded
  if (
    msgLower.includes('quota') ||
    msgLower.includes('rate limit') ||
    msgLower.includes('resource exhausted') ||
    msgLower.includes('resource_exhausted') ||
    msgLower.includes('429')
  ) {
    return `### ⏳ API Limit Reached\n\nYour Gemini API quota or rate limit has been exceeded.\n\n* **Wait a moment** and try asking your question again.\n* Check your Gemini API usage and quota in the [Google AI Studio Console](https://aistudio.google.com/).`;
  }

  // 2. Invalid API Key / Authorization
  if (
    msgLower.includes('invalid api key') ||
    msgLower.includes('api_key_invalid') ||
    msgLower.includes('unauthorized') ||
    msgLower.includes('permission denied') ||
    msgLower.includes('403') ||
    (msgLower.includes('api key') && (msgLower.includes('invalid') || msgLower.includes('required') || msgLower.includes('not valid')))
  ) {
    return `### 🔑 Invalid or Missing API Key\n\nThe provided Gemini API key is missing or invalid.\n\n* Click on the **Settings (⚙️)** icon in the top right.\n* Verify that your Gemini API key is entered correctly.\n* Ensure the key is active in [Google AI Studio](https://aistudio.google.com/).`;
  }

  // 3. Network / Backend Server Connection Issues
  if (
    msgLower.includes('failed to fetch') ||
    msgLower.includes('networkerror') ||
    msgLower.includes('typeerror: failed') ||
    msgLower.includes('unreachable') ||
    msgLower.includes('network connection') ||
    msgLower.includes('econnrefused')
  ) {
    return `### ⚠️ Server Connection Error\n\nUnable to connect to the backend server.\n\n* Please make sure the backend is running on \`http://localhost:8000\`.\n* If you launched via launcher, check that the backend terminal is active.`;
  }

  // 4. Ollama Specific Errors
  if (
    msgLower.includes('ollama is not working') ||
    msgLower.includes('connection refused') ||
    msgLower.includes('11434') ||
    msgLower.includes('connecterror')
  ) {
    return `### 🦙 Local Ollama Offline\n\nCould not connect to Ollama at \`http://localhost:11434\`.\n\n1. Launch the **Ollama** desktop app, or\n2. Open terminal and run: \`ollama serve\`\n3. Or switch to **Gemini mode** to use cloud AI instead.`;
  }
  if (msgLower.includes('ollama model') && msgLower.includes('not found')) {
    return `### 🔍 Local AI Model Not Found\n\nThe required model is not installed locally. Run this command in your terminal:\n\n\`\`\`bash\nollama pull gemma2:2b\n\`\`\``;
  }

  // 5. Dimension / Index Mismatch
  if (msgLower.includes('dimension') || msgLower.includes('collection expecting') || msgLower.includes('index mismatch')) {
    return `### 📄 Document Index Mismatch\n\nThe document was previously indexed with a different embedding size.\n\n* Please re-upload or re-open the document to re-index it.`;
  }

  // 6. Token / Context Window Exceeded
  if (
    msgLower.includes('token exceeded') ||
    msgLower.includes('context window') ||
    msgLower.includes('too many tokens') ||
    msgLower.includes('exceeds the gemini model')
  ) {
    return `### 📈 Context Length Exceeded\n\nThe document context and chat history exceed the maximum token budget.\n\n* Try asking a more specific, shorter question.\n* Clear previous chat history to free up space.`;
  }

  // 7. Ingestion Failures
  if (
    context === 'ingest' ||
    msgLower.includes('ingest') ||
    msgLower.includes('pdf extraction') ||
    msgLower.includes('parsing')
  ) {
    return `### ❌ Document Processing Failed\n\nCould not extract or index text from this document:\n\n* Ensure the file is not corrupted or password-protected.\n* If it is a scanned/image PDF, ensure text is selectable.\n\n*Details: ${msg}*`;
  }

  // General Fallback
  return `### ⚠️ Server Error\n\n${msg}`;
};
