import { shuffled } from "./geo.js";

// Balance countries over successive matches, independently of photo counts.
// Each country cycles through its own unseen photos before repeating one.
export function selectRounds(pack, previous = {}, count = 5, shuffle = shuffled) {
  const groups = new Map();
  for (const photo of pack) {
    if (!groups.has(photo.country)) groups.set(photo.country, []);
    groups.get(photo.country).push(photo);
  }
  if (groups.size < count) throw Error("Not enough countries for a balanced match");
  const counts = {},
    seen = {},
    rounds = [],
    used = new Set();
  for (const [country, photos] of groups) {
    const value = previous.counts?.[country];
    counts[country] = Number.isSafeInteger(value) && value >= 0 ? value : 0;
    const ids = new Set(photos.map((p) => p.id));
    seen[country] = Array.isArray(previous.seen?.[country]) ? previous.seen[country].filter((id) => ids.has(id)) : [];
  }
  while (rounds.length < count) {
    const eligible = [...groups.keys()].filter((country) => !used.has(country));
    const minimum = Math.min(...eligible.map((country) => counts[country]));
    const country = shuffle(eligible.filter((country) => counts[country] === minimum))[0];
    let available = groups.get(country).filter((p) => !seen[country].includes(p.id));
    if (!available.length) {
      seen[country] = [];
      available = groups.get(country);
    }
    const photo = shuffle(available)[0];
    rounds.push(photo);
    used.add(country);
    seen[country].push(photo.id);
    counts[country]++;
  }
  return { rounds, history: { counts, seen } };
}
