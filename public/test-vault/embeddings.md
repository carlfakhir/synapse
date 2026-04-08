# Embeddings

An embedding is a dense vector representation of a piece of content — text, image, audio — produced by a model trained so that semantically related inputs land close together in the vector space. The quality of an embedding is measured by how well cosine distance tracks human intuition about similarity.

Modern sentence embedding models like all-MiniLM-L6-v2 produce 384-dimensional vectors and are small enough to run in the browser. Larger models like OpenAI's text-embedding-3 produce higher-quality vectors at the cost of API calls.

Embeddings are the backbone of [[vector-search]], retrieval-augmented generation with [[llms]], and any system that needs to measure [[semantic-similarity]].
