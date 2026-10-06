// CLIP byte-level BPE; vocabulary and merge order exported from OpenCLIP.
export class Tokenizer {
  constructor(config) {
    this.config = config;
    this.ranks = new Map(config.merges.map((p, i) => [p.join("\0"), i]));
    const bytes = [
      ...Array.from({ length: 94 }, (_, i) => i + 33),
      ...Array.from({ length: 12 }, (_, i) => i + 161),
      ...Array.from({ length: 82 }, (_, i) => i + 174),
    ];
    const codes = [...bytes];
    for (let b = 0, n = 0; b < 256; b++)
      if (!bytes.includes(b)) {
        bytes.push(b);
        codes.push(256 + n++);
      }
    this.byteEncoder = new Map(bytes.map((b, i) => [b, String.fromCodePoint(codes[i])]));
    this.cache = new Map();
  }
  bpe(token) {
    if (this.cache.has(token)) return this.cache.get(token);
    let word = [...token];
    word[word.length - 1] += "</w>";
    while (word.length > 1) {
      let best = Infinity,
        pair;
      for (let i = 0; i < word.length - 1; i++) {
        const key = word[i] + "\0" + word[i + 1];
        const rank = this.ranks.get(key);
        if (rank < best) {
          best = rank;
          pair = key;
        }
      }
      if (!pair) break;
      const [a, b] = pair.split("\0"),
        next = [];
      for (let i = 0; i < word.length; i++) {
        if (word[i] === a && word[i + 1] === b) {
          next.push(a + b);
          i++;
        } else next.push(word[i]);
      }
      word = next;
    }
    const ids = word.map((w) => this.config.encoder[w]);
    this.cache.set(token, ids);
    return ids;
  }
  encode(text) {
    const entities = this.config.entities;
    text = text
      .replace(/[\uff01-\uff5e]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
      .replace(/[\ufb00-\ufb06]/g, (c) => c.normalize("NFKC"))
      .replace(/[\u0000-\u0008\u000b\u000e-\u001f\u007f\ufeff]/g, "")
      .normalize("NFC")
      .replace(/[\u2018-\u201b]/g, "'")
      .replace(/[\u201c-\u201f]/g, '"');
    for (let i = 0; i < 2; i++)
      text = text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, k) =>
        k[0] === "#" ? String.fromCodePoint(k[1].toLowerCase() === "x" ? parseInt(k.slice(2), 16) : parseInt(k.slice(1), 10)) : entities[k] ?? m
      );
    text = text.replace(/\s+/gu, " ").trim().toLowerCase();
    const pattern = /<start_of_text>|<end_of_text>|'s|'t|'re|'ve|'m|'ll|'d|[\p{L}]+|[\p{N}]|[^\s\p{L}\p{N}]+/giu;
    let ids = [this.config.sot];
    for (const match of text.matchAll(pattern)) {
      if (match[0] in this.config.encoder && /^<(start|end)_of_text>$/.test(match[0])) {
        ids.push(this.config.encoder[match[0]]);
        continue;
      }
      const bytes = new TextEncoder().encode(match[0]);
      ids.push(...this.bpe(Array.from(bytes, (b) => this.byteEncoder.get(b)).join("")));
    }
    ids.push(this.config.eot);
    const truncated = ids.length > this.config.contextLength;
    ids = ids.slice(0, this.config.contextLength);
    if (truncated) ids[ids.length - 1] = this.config.eot;
    while (ids.length < this.config.contextLength) ids.push(0);
    return { ids, truncated };
  }
}
