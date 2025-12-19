// practice.js
(() => {
  const $ = (id) => document.getElementById(id);

  const els = {
    modeSelect: $("modeSelect"),
    scopeSelect: $("scopeSelect"),
    startBtn: $("startBtn"),
    shuffleBtn: $("shuffleBtn"),
    resetBtn: $("resetBtn"),

    progressText: $("progressText"),
    streakText: $("streakText"),
    scoreText: $("scoreText"),

    recipeTitle: $("recipeTitle"),
    recipeMeta: $("recipeMeta"),
    phaseTitle: $("phaseTitle"),

    searchInput: $("searchInput"),
    clearSelectedBtn: $("clearSelectedBtn"),
    nothingPostBakeBtn: $("nothingPostBakeBtn"),

    bank: $("ingredientBank"),
    selected: $("selectedZone"),

    checkBtn: $("checkBtn"),
    nextBtn: $("nextBtn"),

    feedbackText: $("feedbackText"),
    feedbackDetails: $("feedbackDetails"),
    correctList: $("correctList"),
    missingList: $("missingList"),
    wrongList: $("wrongList"),
  };

  if (!window.RECIPES || !Array.isArray(window.RECIPES)) {
    els.feedbackText.textContent = "Error: no se encontró data.js (window.RECIPES).";
    return;
  }

  // ---------- Helpers ----------
  const norm = (s) => String(s).trim().toLowerCase();
  const uniq = (arr) => Array.from(new Set(arr));
  const shuffle = (arr) => {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };
  const sample = (arr, n) => shuffle(arr).slice(0, Math.max(0, n));

  function getAllIngredients(recipes) {
    const all = [];
    for (const r of recipes) {
      all.push(...(r.preBake || []), ...(r.postBake || []));
    }
    return uniq(all);
  }

  // ---------- State ----------
  const state = {
    started: false,
    recipes: [],
    order: [],
    idx: 0,
    phase: "pre", // "pre" or "post"
    selected: new Set(),
    score: 0,
    streak: 0,
    lastCheckWasPerfect: false,
    bankIngredients: [],
  };

  // ---------- UI Builders ----------
  function setText(el, text) {
    if (!el) return;
    el.textContent = text;
  }

  function setLists({ correct = [], missing = [], wrong = [] }) {
    const fill = (ul, items) => {
      ul.innerHTML = "";
      for (const x of items) {
        const li = document.createElement("li");
        li.textContent = x;
        ul.appendChild(li);
      }
    };
    fill(els.correctList, correct);
    fill(els.missingList, missing);
    fill(els.wrongList, wrong);
    els.feedbackDetails.style.display = "block";
  }

  function clearFeedback(msg = "Aquí verás el resultado al comprobar.") {
    setText(els.feedbackText, msg);
    els.feedbackDetails.style.display = "none";
    els.correctList.innerHTML = "";
    els.missingList.innerHTML = "";
    els.wrongList.innerHTML = "";
  }

  function updateTopStats() {
    setText(els.progressText, `${Math.min(state.idx + 1, state.order.length)}/${state.order.length}`);
    setText(els.scoreText, String(state.score));
    setText(els.streakText, String(state.streak));
  }

  function currentRecipe() {
    return state.order[state.idx] || null;
  }

  function currentTargetIngredients() {
    const r = currentRecipe();
    if (!r) return [];
    return state.phase === "pre" ? (r.preBake || []) : (r.postBake || []);
  }

  function phaseLabel() {
    return state.phase === "pre" ? "Ronda A — Antes de hornear" : "Ronda B — Después de hornear";
  }

  function renderRecipeHeader() {
    const r = currentRecipe();
    if (!r) {
      setText(els.recipeTitle, "Pulsa “Empezar”");
      setText(els.recipeMeta, "");
      setText(els.phaseTitle, "");
      return;
    }
    setText(els.recipeTitle, r.name);
    setText(els.recipeMeta, r.type === "calzone" ? "Calzone" : "Pizza");
    setText(els.phaseTitle, phaseLabel());
  }

  function makeChip(name, location) {
    // location: "bank" or "selected"
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "chip";
    btn.textContent = name;
    btn.setAttribute("data-ingredient", name);
    btn.setAttribute("data-location", location);
    btn.draggable = true;

    // Click/tap: toggle between bank and selected
    btn.addEventListener("click", () => {
      if (!state.started) return;
      const ingredient = btn.getAttribute("data-ingredient");
      if (!ingredient) return;
      if (location === "bank") {
        state.selected.add(ingredient);
      } else {
        state.selected.delete(ingredient);
      }
      renderZones();
      enableActions();
    });

    // Drag
    btn.addEventListener("dragstart", (ev) => {
      ev.dataTransfer.setData("text/plain", JSON.stringify({ ingredient: name, from: location }));
      ev.dataTransfer.effectAllowed = "move";
    });

    return btn;
  }

  function renderZones(filterText = "") {
    const filter = norm(filterText);

    // Bank: exclude already selected
    els.bank.innerHTML = "";
    const bankItems = state.bankIngredients
      .filter((x) => !state.selected.has(x))
      .filter((x) => (filter ? norm(x).includes(filter) : true));

    for (const ing of bankItems) {
      els.bank.appendChild(makeChip(ing, "bank"));
    }

    // Selected
    els.selected.innerHTML = "";
    const selectedItems = Array.from(state.selected);
    // ordenar para que no “salte” mucho
    selectedItems.sort((a, b) => a.localeCompare(b, "es"));

    for (const ing of selectedItems) {
      els.selected.appendChild(makeChip(ing, "selected"));
    }

    els.clearSelectedBtn.disabled = state.selected.size === 0;
  }

  function allowDrop(zoneEl, onDropTo) {
    zoneEl.addEventListener("dragover", (ev) => {
      ev.preventDefault();
      ev.dataTransfer.dropEffect = "move";
    });

    zoneEl.addEventListener("drop", (ev) => {
      ev.preventDefault();
      if (!state.started) return;

      const raw = ev.dataTransfer.getData("text/plain");
      if (!raw) return;
      let payload;
      try {
        payload = JSON.parse(raw);
      } catch {
        return;
      }
      const ingredient = payload?.ingredient;
      if (!ingredient) return;

      if (onDropTo === "selected") state.selected.add(ingredient);
      if (onDropTo === "bank") state.selected.delete(ingredient);

      renderZones(els.searchInput.value);
      enableActions();
    });
  }

  function buildBank() {
    const r = currentRecipe();
    if (!r) return [];

    const correct = currentTargetIngredients();
    const all = getAllIngredients(state.recipes);

    // Banco “mezclado inteligente”: correctos + distractores con tamaño controlado.
    const targetSize = Math.min(22, Math.max(12, correct.length * 3));
    const distractorCount = Math.max(0, targetSize - correct.length);

    // Para la ronda "post", si correct = [], preferimos distractores que suelen ser post en otras recetas
    let pool = all.filter((x) => !correct.includes(x));
    if (state.phase === "post" && correct.length === 0) {
      const postPool = uniq(state.recipes.flatMap((rr) => rr.postBake || []));
      pool = uniq([...postPool, ...pool]).filter((x) => !correct.includes(x));
    }

    const distractors = sample(pool, distractorCount);
    return shuffle(uniq([...correct, ...distractors]));
  }

  function enableActions() {
    const r = currentRecipe();
    if (!r) {
      els.checkBtn.disabled = true;
      els.nextBtn.disabled = true;
      els.nothingPostBakeBtn.disabled = true;
      return;
    }

    els.checkBtn.disabled = false;
    // "Nada después" solo aplica en fase post
    els.nothingPostBakeBtn.disabled = state.phase !== "post";

    // "Siguiente" se habilita solo después de comprobar, o cuando la ronda se da por completada.
    els.nextBtn.disabled = !state.lastCheckWasPerfect && els.feedbackDetails.style.display === "none";
  }

  function evaluate() {
    const target = currentTargetIngredients();
    const selected = Array.from(state.selected);

    const targetSet = new Set(target);
    const selectedSet = new Set(selected);

    const correct = selected.filter((x) => targetSet.has(x));
    const wrong = selected.filter((x) => !targetSet.has(x));
    const missing = target.filter((x) => !selectedSet.has(x));

    // Perfecto si no hay wrong y no hay missing
    const perfect = wrong.length === 0 && missing.length === 0;

    // Puntuación
    const mode = els.modeSelect.value; // learn/exam
    if (mode === "learn") {
      // En aprender, solo sumamos por acierto; no penalizamos.
      state.score += correct.length;
    } else {
      state.score += correct.length;
      state.score -= wrong.length;
      if (state.score < 0) state.score = 0;
    }

    // Feedback + racha
    if (perfect) {
      state.streak += 1;
      state.lastCheckWasPerfect = true;
      setText(els.feedbackText, "Perfecto. Pasas a la siguiente ronda o a la siguiente receta.");
    } else {
      state.streak = 0;
      state.lastCheckWasPerfect = false;
      setText(els.feedbackText, "Revisa: te marco correctos, faltantes e incorrectos.");
    }

    setLists({
      correct: correct.sort((a, b) => a.localeCompare(b, "es")),
      missing: missing.sort((a, b) => a.localeCompare(b, "es")),
      wrong: wrong.sort((a, b) => a.localeCompare(b, "es")),
    });

    updateTopStats();

    // En modo aprender, si no es perfecto, opcionalmente podemos limpiar solo incorrectos.
    if (!perfect) {
      // Retira incorrectos automáticamente para que puedas completar sin fricción.
      for (const w of wrong) state.selected.delete(w);
      renderZones(els.searchInput.value);
    }

    enableActions();
  }

  function goNext() {
    const r = currentRecipe();
    if (!r) return;

    clearFeedback();

    if (state.phase === "pre") {
      // pasar a post
      state.phase = "post";
      state.selected.clear();
      state.bankIngredients = buildBank();
      state.lastCheckWasPerfect = false;
      renderRecipeHeader();
      renderZones(els.searchInput.value);
      enableActions();
      return;
    }

    // fase post -> siguiente receta
    state.phase = "pre";
    state.selected.clear();
    state.idx += 1;

    if (state.idx >= state.order.length) {
      // fin
      setText(els.recipeTitle, "Fin de la práctica");
      setText(els.recipeMeta, "");
      setText(els.phaseTitle, "");
      clearFeedback("Has completado todas las recetas seleccionadas. Puedes barajar o reiniciar.");
      els.checkBtn.disabled = true;
      els.nextBtn.disabled = true;
      els.nothingPostBakeBtn.disabled = true;
      els.clearSelectedBtn.disabled = true;
      els.bank.innerHTML = "";
      els.selected.innerHTML = "";
      return;
    }

    // cargar nueva receta
    state.bankIngredients = buildBank();
    renderRecipeHeader();
    renderZones(els.searchInput.value);
    enableActions();
    updateTopStats();
  }

  function resetSession({ reshuffle = false } = {}) {
    state.started = true;
    state.idx = 0;
    state.phase = "pre";
    state.selected.clear();
    state.score = 0;
    state.streak = 0;
    state.lastCheckWasPerfect = false;

    const scope = els.scopeSelect.value;
    const filtered =
      scope === "pizzas" ? window.RECIPES.filter((r) => r.type === "pizza")
      : scope === "calzones" ? window.RECIPES.filter((r) => r.type === "calzone")
      : window.RECIPES.slice();

    state.recipes = filtered;
    state.order = reshuffle ? shuffle(filtered) : filtered.slice();

    state.bankIngredients = buildBank();

    renderRecipeHeader();
    renderZones();
    clearFeedback("Empieza seleccionando ingredientes. Luego pulsa “Comprobar”.");
    updateTopStats();
    enableActions();
  }

  // ---------- Wire events ----------
  els.startBtn.addEventListener("click", () => resetSession({ reshuffle: true }));
  els.shuffleBtn.addEventListener("click", () => resetSession({ reshuffle: true }));
  els.resetBtn.addEventListener("click", () => resetSession({ reshuffle: false }));

  els.checkBtn.addEventListener("click", () => {
    if (!state.started) return;
    evaluate();
  });

  els.nextBtn.addEventListener("click", () => {
    if (!state.started) return;
    goNext();
  });

  els.clearSelectedBtn.addEventListener("click", () => {
    if (!state.started) return;
    state.selected.clear();
    renderZones(els.searchInput.value);
    enableActions();
  });

  els.nothingPostBakeBtn.addEventListener("click", () => {
    if (!state.started) return;
    if (state.phase !== "post") return;

    // Caso especial: usuario declara que no hay ingredientes post.
    state.selected.clear();
    renderZones(els.searchInput.value);

    // Si realmente no hay postBake, esto debe ser perfecto.
    evaluate();
  });

  els.searchInput.addEventListener("input", () => {
    renderZones(els.searchInput.value);
  });

  // Drag targets (opcionales)
  allowDrop(els.selected, "selected");
  allowDrop(els.bank, "bank");

  // Estado inicial
  renderRecipeHeader();
  clearFeedback("Pulsa “Empezar” para comenzar.");
  updateTopStats();
  enableActions();
})();
