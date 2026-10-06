import json
from common import ASSETS, load_model

_, _, t = load_model()
queries = [
    "café ☕",
    "a red café chair",
    "α robot β",
    "日本の電車",
    "grünes Gemüse",
    "“a glass”",
    "don’t step on this",
    "a cup &amp; a plate",
    "a cup &amp;amp; a plate",
    "a cup &mdash; a plate",
    "a cup &#x26; a plate",
    "red\tmetal\nobject",
    "１２３ tools",
    "a ﬁne tool",
    "cafe\u0301",
    "a 🦾 robot",
    "<start_of_text>a cup<end_of_text>",
    "a tool " + ("with metal " * 100),
]
f = [dict(query=q, tokens=ids.tolist()) for q, ids in zip(queries, t(queries))]
(ASSETS / "models/tokenizer-edge-fixtures.json").write_text(
    json.dumps(f, ensure_ascii=False, indent=2) + "\n"
)
