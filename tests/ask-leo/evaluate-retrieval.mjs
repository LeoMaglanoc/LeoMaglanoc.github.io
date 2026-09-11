import { readFileSync } from "node:fs";
import { hasMeaningfulMatch, retrieve } from "../../assets/js/ask-leo/retrieval.js";

const siteHtml = readFileSync(process.argv[2] || "_site/chat/index.html", "utf8");
const kbMatch = siteHtml.match(/<script id="ask-leo-kb" type="application\/json">\s*([\s\S]*?)\s*<\/script>/);
if (!kbMatch) throw new Error("Could not find the rendered Ask Leo knowledge base. Build the Jekyll site first.");
const kb = JSON.parse(kbMatch[1]);
const questions = JSON.parse(readFileSync("tests/ask-leo/questions.json", "utf8"));
let expected = 0;
let recovered = 0;
const failures = [];

for (const test of questions) {
  const results = retrieve(test.question, kb, { topK: 4, contextIds: test.context_ids || [] });
  const ids = results.map((result) => result.id);
  if (test.expected_sources.length) {
    expected += test.expected_sources.length;
    for (const source of test.expected_sources) {
      if (ids.includes(source)) recovered += 1;
      else failures.push({ question: test.question, expected: source, retrieved: ids });
    }
  } else if (hasMeaningfulMatch(results)) {
    failures.push({ question: test.question, expected: "no meaningful retrieval", retrieved: ids });
  }
}

const recall = expected ? recovered / expected : 1;
console.log(`Retrieval recall@4: ${(recall * 100).toFixed(1)}% (${recovered}/${expected})`);
if (failures.length) {
  console.table(failures);
  process.exitCode = 1;
}
if (recall < 0.95) process.exitCode = 1;
