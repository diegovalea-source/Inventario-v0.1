(function () {
  const STORAGE_KEY = "inventario-junio-2026-recuento";
  const items = (window.INVENTORY_DATA && window.INVENTORY_DATA.items) || [];
  const state = {
    query: "",
    area: "all",
    section: "all",
    status: "all",
    counts: loadCounts(),
  };

  const els = {
    counted: document.getElementById("countedValue"),
    pending: document.getElementById("pendingValue"),
    total: document.getElementById("totalValue"),
    search: document.getElementById("searchInput"),
    area: document.getElementById("areaFilter"),
    status: document.getElementById("statusFilter"),
    sections: document.getElementById("sectionTabs"),
    list: document.getElementById("itemList"),
    template: document.getElementById("itemTemplate"),
    clear: document.getElementById("clearBtn"),
    copy: document.getElementById("copyBtn"),
    export: document.getElementById("exportBtn"),
  };

  init();

  function init() {
    fillAreaFilter();
    bindEvents();
    render();
  }

  function bindEvents() {
    els.search.addEventListener("input", () => {
      state.query = els.search.value.trim().toLowerCase();
      render();
    });

    els.area.addEventListener("change", () => {
      state.area = els.area.value;
      state.section = "all";
      render();
    });

    els.status.addEventListener("change", () => {
      state.status = els.status.value;
      render();
    });

    els.clear.addEventListener("click", () => {
      if (!confirm("¿Limpiar todos los recuentos guardados en este dispositivo?")) return;
      state.counts = {};
      saveCounts();
      render();
    });

    els.copy.addEventListener("click", copySummary);
    els.export.addEventListener("click", exportCsv);
  }

  function fillAreaFilter() {
    const areas = unique(items.map((item) => item.area)).sort(sortText);
    els.area.innerHTML = '<option value="all">Todas</option>' + areas.map((area) => {
      return `<option value="${escapeAttr(area)}">${escapeHtml(area)}</option>`;
    }).join("");
  }

  function render() {
    renderSummary();
    renderSections();
    renderItems();
  }

  function renderSummary() {
    const counted = items.filter((item) => hasCount(item.id)).length;
    els.counted.textContent = counted.toString();
    els.pending.textContent = (items.length - counted).toString();
    els.total.textContent = items.length.toString();
  }

  function renderSections() {
    const base = items.filter((item) => state.area === "all" || item.area === state.area);
    const sections = unique(base.map((item) => item.seccion || "General")).sort(sortText);
    const exists = sections.includes(state.section);
    if (state.section !== "all" && !exists) state.section = "all";

    const buttons = ['<button class="tab" type="button" data-section="all">Todas</button>'].concat(
      sections.map((section) => {
        return `<button class="tab" type="button" data-section="${escapeAttr(section)}">${escapeHtml(section)}</button>`;
      })
    );
    els.sections.innerHTML = buttons.join("");
    els.sections.querySelectorAll(".tab").forEach((button) => {
      button.classList.toggle("active", button.dataset.section === state.section);
      button.addEventListener("click", () => {
        state.section = button.dataset.section;
        render();
      });
    });
  }

  function renderItems() {
    const visible = filteredItems();
    els.list.innerHTML = "";

    if (!visible.length) {
      els.list.innerHTML = '<div class="empty">No hay productos con estos filtros.</div>';
      return;
    }

    const fragment = document.createDocumentFragment();
    visible.forEach((item) => fragment.appendChild(renderItem(item)));
    els.list.appendChild(fragment);
  }

  function renderItem(item) {
    const node = els.template.content.firstElementChild.cloneNode(true);
    const entry = state.counts[item.id] || {};
    const qty = entry.qty ?? "";
    node.classList.toggle("counted", hasCount(item.id));
    node.querySelector(".section").textContent = item.seccion || "General";
    node.querySelector("h2").textContent = item.descripcion;
    node.querySelector(".meta").textContent = metaText(item);

    const input = node.querySelector(".qty");
    input.value = qty;
    input.addEventListener("input", () => updateCount(item.id, input.value, node));

    node.querySelector(".up").addEventListener("click", () => {
      input.value = formatQty((parseQty(input.value) || 0) + 1);
      updateCount(item.id, input.value, node);
    });

    node.querySelector(".down").addEventListener("click", () => {
      input.value = formatQty(Math.max(0, (parseQty(input.value) || 0) - 1));
      updateCount(item.id, input.value, node);
    });

    const note = node.querySelector("textarea");
    note.value = entry.note || "";
    note.addEventListener("input", () => {
      const current = state.counts[item.id] || {};
      state.counts[item.id] = { ...current, note: note.value, updatedAt: new Date().toISOString() };
      pruneEmpty(item.id);
      saveCounts();
    });

    return node;
  }

  function filteredItems() {
    return items.filter((item) => {
      if (state.area !== "all" && item.area !== state.area) return false;
      if (state.section !== "all" && item.seccion !== state.section) return false;
      if (state.status === "pending" && hasCount(item.id)) return false;
      if (state.status === "counted" && !hasCount(item.id)) return false;
      if (!state.query) return true;
      const haystack = `${item.descripcion} ${item.seccion} ${item.area} ${item.archivo}`.toLowerCase();
      return haystack.includes(state.query);
    });
  }

  function updateCount(id, value, node) {
    const qty = parseQty(value);
    const current = state.counts[id] || {};
    state.counts[id] = { ...current, qty: qty === null ? "" : qty, updatedAt: new Date().toISOString() };
    pruneEmpty(id);
    saveCounts();
    node.classList.toggle("counted", hasCount(id));
    renderSummary();
  }

  function pruneEmpty(id) {
    const current = state.counts[id];
    if (!current) return;
    const emptyQty = current.qty === "" || current.qty === null || typeof current.qty === "undefined";
    const emptyNote = !current.note || !current.note.trim();
    if (emptyQty && emptyNote) delete state.counts[id];
  }

  function hasCount(id) {
    const entry = state.counts[id];
    if (!entry) return false;
    return entry.qty !== "" && entry.qty !== null && typeof entry.qty !== "undefined";
  }

  function metaText(item) {
    const bits = [item.area, item.archivo.replace(".xlsx", "")];
    if (typeof item.coste === "number") bits.push(`Coste ${item.coste.toLocaleString("es-ES", { maximumFractionDigits: 3 })}`);
    if (typeof item.stockExcel === "number") bits.push(`Excel ${item.stockExcel.toLocaleString("es-ES", { maximumFractionDigits: 2 })}`);
    return bits.join(" · ");
  }

  function exportCsv() {
    const rows = [["Area", "Seccion", "Producto", "Recuento", "Nota", "Coste", "Stock Excel", "Archivo", "Hoja", "Fila Excel"]];
    items.forEach((item) => {
      const entry = state.counts[item.id] || {};
      rows.push([
        item.area,
        item.seccion,
        item.descripcion,
        entry.qty ?? "",
        entry.note ?? "",
        item.coste ?? "",
        item.stockExcel ?? "",
        item.archivo,
        item.hoja,
        item.filaExcel,
      ]);
    });
    const csv = rows.map((row) => row.map(csvCell).join(";")).join("\r\n");
    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `recuento-inventario-${dateStamp()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function copySummary() {
    const counted = items.filter((item) => hasCount(item.id));
    const lines = counted.map((item) => {
      const entry = state.counts[item.id] || {};
      return `${item.area} | ${item.seccion} | ${item.descripcion}: ${entry.qty}`;
    });
    const text = lines.length ? lines.join("\n") : "No hay productos contados todavía.";
    try {
      await navigator.clipboard.writeText(text);
      els.copy.textContent = "Copiado";
      setTimeout(() => { els.copy.textContent = "Copiar resumen"; }, 1200);
    } catch {
      alert(text);
    }
  }

  function loadCounts() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    } catch {
      return {};
    }
  }

  function saveCounts() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.counts));
  }

  function parseQty(value) {
    const normalized = String(value).replace(",", ".").trim();
    if (normalized === "") return null;
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  }

  function formatQty(value) {
    return Number.isInteger(value) ? String(value) : String(Math.round(value * 100) / 100);
  }

  function dateStamp() {
    const now = new Date();
    return now.toISOString().slice(0, 10);
  }

  function csvCell(value) {
    const text = String(value ?? "");
    return `"${text.replace(/"/g, '""')}"`;
  }

  function unique(values) {
    return Array.from(new Set(values.filter(Boolean)));
  }

  function sortText(a, b) {
    return a.localeCompare(b, "es", { sensitivity: "base" });
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;",
    }[char]));
  }

  function escapeAttr(value) {
    return escapeHtml(value);
  }
})();
