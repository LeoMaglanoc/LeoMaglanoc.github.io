const STOPWORDS = new Set([
  "a", "an", "and", "are", "at", "be", "did", "do", "does", "for", "from",
  "has", "have", "he", "his", "how", "i", "in", "is", "it", "leo", "me",
  "of", "on", "or", "tell", "that", "the", "to", "was", "what", "which", "who",
  "with", "would", "you",
]);

const SYNONYMS = {
  rl: ["reinforcement", "learning"],
  il: ["imitation", "learning"],
  vla: ["vision", "language", "action"],
  bmw: ["bmw", "research"],
  publication: ["paper", "tro"],
  publications: ["paper", "tro"],
  paper: ["publication", "tro"],
  stack: ["skills", "software", "robotics"],
  framework: ["tools", "software"],
};

const BROAD_PATTERNS = [
  /tell me about (leo|him)/i,
  /who is leo/i,
  /strongest skills/i,
  /fit .* role/i,
  /relevant .* role/i,
  /background/i,
];

function singularize(token) {
  if (token.length > 4 && token.endsWith("ies")) return `${token.slice(0, -3)}y`;
  if (token.length > 3 && token.endsWith("s") && !token.endsWith("ss")) return token.slice(0, -1);
  return token;
}

export function tokenize(value = "") {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9+#.-]+/g, " ")
    .replace(/[.#-]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map(singularize);
}

export function expandQuery(query) {
  const tokens = tokenize(query);
  const expanded = new Set(tokens);
  tokens.forEach((token) => {
    (SYNONYMS[token] || []).forEach((synonym) => expanded.add(singularize(synonym)));
  });

  const normalized = String(query).toLowerCase();
  if (normalized.includes("robotics stack")) {
    ["skills", "software", "robotics"].forEach((token) => expanded.add(token));
  }
  if (normalized.includes("real robot") || normalized.includes("physical robot")) {
    ["deployment", "so", "101", "manipulation"].forEach((token) => expanded.add(token));
  }
  return [...expanded].filter((token) => !STOPWORDS.has(token));
}

function searchable(record, field) {
  const value = record[field];
  if (Array.isArray(value)) return value.join(" ");
  return value || "";
}

function hasPhrase(haystack, phrase) {
  const normalizedHaystack = tokenize(haystack).join(" ");
  const normalizedPhrase = tokenize(phrase).join(" ");
  return normalizedPhrase.length > 1 && normalizedHaystack.includes(normalizedPhrase);
}

function countMatches(queryTokens, text) {
  const fieldTokens = new Set(tokenize(text));
  return queryTokens.reduce((sum, token) => sum + Number(fieldTokens.has(token)), 0);
}

function recordScore(record, query, queryTokens, contextIds) {
  const title = searchable(record, "title");
  const aliases = searchable(record, "aliases");
  const skills = searchable(record, "skills");
  const tags = searchable(record, "tags");
  const summary = searchable(record, "summary");
  const facts = searchable(record, "facts");

  let score = 0;
  if (hasPhrase(query, title)) score += 8;
  if (hasPhrase(query, aliases)) score += 6;
  score += countMatches(queryTokens, title) * 8;
  score += countMatches(queryTokens, aliases) * 6;
  score += countMatches(queryTokens, skills) * 5;
  score += countMatches(queryTokens, tags) * 4;
  score += countMatches(queryTokens, summary) * 2;
  score += countMatches(queryTokens, facts);
  // A short follow-up such as "What framework did he use there?" may have no
  // lexical overlap with the preceding answer. The caller supplies only the
  // records used in the last two answers, so this is bounded conversation
  // context rather than an unbounded semantic memory.
  if (contextIds.includes(record.id)) score += 4;
  return score;
}

export function isBroadQuestion(question) {
  return BROAD_PATTERNS.some((pattern) => pattern.test(question));
}

/**
 * Deterministic lexical retrieval. Results include a score so the UI and test
 * harness can inspect provenance without involving a language model.
 */
export function retrieve(question, kb, options = {}) {
  const records = kb?.records || [];
  const queryTokens = expandQuery(question);
  const contextIds = options.contextIds || [];
  const ranked = records
    .map((record) => ({
      ...record,
      score: recordScore(record, question, queryTokens, contextIds),
    }))
    .filter((record) => record.score > 0)
    .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title));

  const topK = options.topK || 4;
  const selected = ranked.slice(0, topK);
  const profile = records.find((record) => record.id === "profile");
  if (profile && isBroadQuestion(question) && !selected.some((record) => record.id === profile.id)) {
    if (selected.length >= topK) selected.pop();
    selected.push({ ...profile, score: 0, broadContext: true });
  }

  return selected.slice(0, topK);
}

export function hasMeaningfulMatch(results) {
  return results.some((result) => result.score >= 4 || result.broadContext);
}
