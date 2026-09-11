import { MODEL_CONFIG, WASM_FALLBACK_MODEL_CONFIG } from "./model-config.js";
import { buildMessages, classifyQuestion, OFF_TOPIC_RESPONSE, PERSONAL_RESPONSE, UNKNOWN_PROFESSIONAL_RESPONSE } from "./prompt.js";
import { hasMeaningfulMatch, retrieve } from "./retrieval.js";

const root = document.querySelector("[data-ask-leo]");

if (root) {
  const kbElement = root.querySelector("#ask-leo-kb");
  const kb = JSON.parse(kbElement.textContent);
  const conversation = root.querySelector("[data-conversation]");
  const form = root.querySelector("[data-form]");
  const input = root.querySelector("[data-input]");
  const submit = root.querySelector("[data-submit]");
  const stop = root.querySelector("[data-stop]");
  const status = root.querySelector("[data-status]");
  const srStatus = root.querySelector("[data-sr-status]");
  const history = [];
  const debugMode = new URLSearchParams(window.location.search).get("ask-leo-debug") === "1";
  let worker;
  let loadPromise;
  let activeAnswer;
  let announceTimer;

  const hasWebGPU = () => Boolean(navigator.gpu);
  const savesData = () => Boolean(navigator.connection && navigator.connection.saveData);
  const runtimeConfig = hasWebGPU() ? MODEL_CONFIG : WASM_FALLBACK_MODEL_CONFIG;

  function setStatus(message, announce = false) {
    status.textContent = message;
    if (announce) {
      window.clearTimeout(announceTimer);
      announceTimer = window.setTimeout(() => {
        srStatus.textContent = message;
      }, 250);
    }
  }

  function setBusy(isBusy) {
    submit.disabled = isBusy;
    input.disabled = isBusy;
    stop.hidden = !isBusy;
  }

  function makeMessage(role, text = "") {
    const article = document.createElement("article");
    article.className = `ask-leo-message ask-leo-message-${role}`;
    const label = document.createElement("p");
    label.className = "ask-leo-message-label";
    label.textContent = role === "user" ? "You" : "Ask Leo";
    const content = document.createElement("p");
    content.className = "ask-leo-message-content";
    content.textContent = text;
    article.append(label, content);
    conversation.append(article);
    conversation.scrollTop = conversation.scrollHeight;
    return { article, content };
  }

  function renderSources(answer, records) {
    const sources = records.flatMap((record) => record.sources || []);
    const unique = sources.filter((source, index) =>
      sources.findIndex((candidate) => candidate.url === source.url && candidate.label === source.label) === index,
    );
    if (!unique.length) return;
    const wrapper = document.createElement("div");
    wrapper.className = "ask-leo-sources";
    const label = document.createElement("span");
    label.textContent = "Sources";
    wrapper.append(label);
    unique.forEach((source) => {
      const link = document.createElement("a");
      link.href = source.url;
      link.textContent = source.label;
      if (/^https?:\/\//.test(source.url)) {
        link.target = "_blank";
        link.rel = "noopener";
      }
      wrapper.append(link);
    });
    answer.article.append(wrapper);
  }

  function renderDebug(records) {
    if (!debugMode) return;
    const existing = root.querySelector("[data-retrieval-debug]");
    if (existing) existing.remove();
    const panel = document.createElement("pre");
    panel.className = "ask-leo-debug";
    panel.dataset.retrievalDebug = "";
    panel.textContent = records.length
      ? records.map((record, index) => `${index + 1}. ${record.title} — score ${record.score}`).join("\n")
      : "No records retrieved.";
    root.querySelector("[data-status]").after(panel);
  }

  function ensureWorker() {
    if (loadPromise) return loadPromise;
    worker = new Worker(root.dataset.workerUrl, { type: "module" });
    loadPromise = new Promise((resolve, reject) => {
      worker.addEventListener("message", ({ data }) => {
        if (data.type === "checking") setStatus(runtimeConfig.device === "webgpu" ? "Checking WebGPU…" : "Preparing local CPU mode…", true);
        if (data.type === "progress") {
          const percentage = Number.isFinite(data.progress?.progress) ? ` — ${Math.round(data.progress.progress)}%` : "";
          const phase = data.progress?.status === "done" ? "Initializing local model" : `Downloading ${runtimeConfig.label}`;
          setStatus(`${phase}${percentage}`, true);
        }
        if (data.type === "ready") {
          const backend = data.config?.device === "wasm" ? "CPU mode" : "WebGPU";
          setStatus(`Local model ready (${backend}).`, true);
          resolve();
        }
        if (data.type === "generation-start") {
          setStatus("Generating locally…", true);
        }
        if (data.type === "token" && activeAnswer) {
          activeAnswer.text += data.text;
          activeAnswer.message.content.textContent = activeAnswer.text;
          conversation.scrollTop = conversation.scrollHeight;
        }
        if (data.type === "generation-complete" && activeAnswer) {
          const finished = activeAnswer;
          activeAnswer = undefined;
          setBusy(false);
          setStatus(`Local model ready (${runtimeConfig.device === "wasm" ? "CPU mode" : "WebGPU"}).`, true);
          history.push({ role: "user", content: finished.question });
          history.push({ role: "assistant", content: finished.text || UNKNOWN_PROFESSIONAL_RESPONSE, sourceIds: finished.records.map((record) => record.id) });
          while (history.length > 4) history.shift();
        }
        if (data.type === "error") {
          if (activeAnswer) {
            activeAnswer.message.content.textContent = "Local generation could not finish in this browser. You can still explore the listed portfolio sources.";
            activeAnswer = undefined;
            setBusy(false);
          }
          setStatus(data.message || "Local AI could not start.", true);
          reject(new Error(data.message));
        }
      });
      worker.postMessage({ type: "load", config: runtimeConfig });
    });
    return loadPromise;
  }

  function contextIds() {
    return history.filter((entry) => entry.role === "assistant").flatMap((entry) => entry.sourceIds || []);
  }

  function replyWithoutModel(question, response, records = []) {
    makeMessage("user", question);
    const answer = makeMessage("assistant", response);
    renderSources(answer, records);
    history.push({ role: "user", content: question });
    history.push({ role: "assistant", content: response, sourceIds: records.map((record) => record.id) });
    while (history.length > 4) history.shift();
  }

  async function ask(question) {
    const cleanQuestion = question.trim();
    if (!cleanQuestion || activeAnswer) return;
    input.value = "";
    const questionType = classifyQuestion(cleanQuestion);
    if (questionType === "personal") return replyWithoutModel(cleanQuestion, PERSONAL_RESPONSE);
    if (questionType === "off-topic") return replyWithoutModel(cleanQuestion, OFF_TOPIC_RESPONSE);

    const records = retrieve(cleanQuestion, kb, { contextIds: contextIds(), topK: 4 });
    renderDebug(records);
    if (!hasMeaningfulMatch(records)) return replyWithoutModel(cleanQuestion, UNKNOWN_PROFESSIONAL_RESPONSE);

    makeMessage("user", cleanQuestion);
    const message = makeMessage("assistant", "");
    renderSources(message, records);
    activeAnswer = { question: cleanQuestion, message, records, text: "" };
    setBusy(true);
    try {
      await ensureWorker();
      const messages = buildMessages(cleanQuestion, records, history.map(({ role, content }) => ({ role, content })));
      worker.postMessage({ type: "generate", messages });
    } catch (_) {
      // The worker has already displayed a browser-safe error message.
    }
  }

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    ask(input.value);
  });

  root.querySelectorAll("[data-question]").forEach((button) => {
    button.addEventListener("click", () => {
      ask(button.dataset.question);
    });
  });

  stop.addEventListener("click", () => {
    if (worker && activeAnswer) worker.postMessage({ type: "stop" });
  });

  if (!hasWebGPU()) {
    root.classList.add("ask-leo-cpu");
    root.querySelector(".ask-leo-local-badge small").textContent = "Transformers.js · CPU fallback";
  }

  if (savesData()) {
    setStatus("Local AI will load when you ask a question. Data Saver is enabled.");
  } else {
    const backend = runtimeConfig.device === "wasm" ? "CPU mode" : "WebGPU";
    setStatus(`Downloading local model for ${backend} (${runtimeConfig.approximateDownload} first use).`);
    ensureWorker().catch(() => {});
  }
}
