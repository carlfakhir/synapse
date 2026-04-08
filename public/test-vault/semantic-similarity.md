# Semantic Similarity

Semantic similarity measures how close two pieces of content are in meaning, regardless of their surface form. "Attestation" and "trusted boot" share no words but are semantically adjacent; "bank" (river) and "bank" (finance) share every letter but are semantically distant.

Classical approaches like TF-IDF and BM25 only capture lexical overlap. They fail on paraphrase and synonymy. Modern approaches compute [[embeddings]] and measure cosine distance in the vector space, which captures meaning much better.

This is also the core of how [[associative-memory]] works in brain-inspired systems: related concepts activate each other not because they share tokens, but because they share meaning.
