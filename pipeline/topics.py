"""Topic clusters for the layout: cleaned CLIP vectors, KMeans, and keywords per cluster."""
import re

import numpy as np
import pandas as pd

# Words that are everywhere in lyrics and say nothing about a topic.
FILLER = {
    "dont", "cant", "wont", "aint", "im", "ive", "youre", "youve", "youll", "youd", "id", "ill", "its", "itll",
    "thats", "theres", "whats", "wheres", "hows", "hes", "shes", "shell", "shed", "hed", "theyre", "theyll",
    "theyd", "weve", "were", "wed", "lets", "isnt", "didnt", "doesnt", "wasnt", "couldnt", "wouldnt", "shouldnt",
    "gonna", "wanna", "gotta", "yeah", "yea", "ooh", "oooh", "ohh", "whoa", "woah", "hey", "uh", "na", "la", "da",
    "doo", "chorus", "verse", "repeat", "bridge", "intro", "outro", "pre", "got", "get", "just", "like", "know",
    "let", "make", "come", "said", "say", "way", "time", "want", "need", "feel", "baby", "love", "cause", "tell",
    "thing", "things", "really", "right", "little", "going", "goes", "gone", "away", "good", "yes", "ah", "oh",
    "think", "look", "day", "man",
}
# Never shown as topic labels: slurs and profanity.
BLOCKED = {
    "nigga", "niggas", "nigger", "niggaz", "fuck", "fucking", "fuckin", "fucked", "motherfucker", "motherfuckers",
    "shit", "bitch", "bitches", "hoe", "hoes", "pussy", "dick", "ass", "faggot", "cunt", "whore", "slut",
}


def layout_vectors(emb: np.ndarray, drop: int = 3, seed: int = 0) -> np.ndarray:
    """CLIP text vectors share one large common direction (raw cosines are all ~0.75-0.99).
    Removing the mean and the top principal directions ("all-but-the-top") exposes finer
    topic structure for clustering and layout. Returns unit vectors."""
    x = emb - emb.mean(axis=0, keepdims=True)
    rng = np.random.default_rng(seed)
    sample = x[rng.choice(len(x), min(len(x), 20000), replace=False)]
    _, _, vt = np.linalg.svd(sample, full_matrices=False)
    top = vt[:drop]
    x = x - (x @ top.T) @ top
    return (x / np.linalg.norm(x, axis=1, keepdims=True)).astype(np.float32)


def cluster_songs(vectors: np.ndarray, k: int, seed: int = 0) -> np.ndarray:
    from sklearn.cluster import KMeans

    return KMeans(n_clusters=k, n_init=4, random_state=seed).fit_predict(vectors).astype(np.int32)


def topic_keywords(texts: pd.Series, labels: np.ndarray, n_words: int = 5) -> list[list[str]]:
    """Distinctive words per cluster with class-based TF-IDF (as in BERTopic)."""
    from sklearn.feature_extraction.text import ENGLISH_STOP_WORDS, CountVectorizer

    clean = texts.str.lower().map(lambda t: re.sub(r"'", "", t))
    cv = CountVectorizer(stop_words=list(ENGLISH_STOP_WORDS | FILLER | BLOCKED), token_pattern=r"(?u)\b[a-z]{3,}\b",
                         min_df=15)
    counts = cv.fit_transform(clean)
    vocab = np.array(cv.get_feature_names_out())
    k = int(labels.max()) + 1
    tf = np.vstack([np.asarray(counts[labels == c].sum(0)).ravel() for c in range(k)]).astype(float)
    docs = np.vstack([np.asarray((counts[labels == c] > 0).sum(0)).ravel() for c in range(k)]).astype(float)
    sizes = np.bincount(labels, minlength=k)
    w = (tf / tf.sum(1, keepdims=True).clip(1)) * np.log(1 + tf.sum(1).mean() / tf.sum(0).clip(1))
    w[docs < 0.04 * sizes[:, None]] = 0  # a keyword must appear in at least 4% of the cluster's songs
    return [vocab[np.argsort(-w[c])[:n_words]].tolist() for c in range(k)]
