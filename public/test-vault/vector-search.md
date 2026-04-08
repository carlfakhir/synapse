# Vector Search

Vector search finds the nearest neighbors of a query vector in a high-dimensional embedding space. Exact search is O(n·d) and fine for small corpora; at scale, approximate nearest neighbor indexes like HNSW, IVF, and ScaNN trade a small amount of recall for orders-of-magnitude speedup.

The typical flow: embed documents offline, store their [[embeddings]] in an index, embed the query at runtime, return top-K by cosine or dot product. This is the retrieval layer of most production RAG systems built on [[llms]].

Vector search only works as well as the embedding model behind it. Good [[semantic-similarity]] is what makes the results feel intuitive rather than random.
