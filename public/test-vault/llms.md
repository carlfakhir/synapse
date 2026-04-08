# LLMs

Large language models are transformer-based neural networks trained on text to predict the next token. The scaling hypothesis — that capability emerges with parameter count, data, and compute — has largely held through the GPT, Claude, and Gemini families.

In production systems LLMs rarely operate alone. They're wrapped in retrieval layers using [[vector-search]] over [[embeddings]] so responses can be grounded in up-to-date context outside the model's training data. This pattern is called RAG.

The model itself is stateless; memory is an application-layer concept. How to give an LLM persistent memory that feels coherent over long horizons remains an active research area connected to [[associative-memory]].
