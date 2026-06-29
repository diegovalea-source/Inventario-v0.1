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
    manager: document.getElementById("managerBtn"),
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
    els.manager.addEventListener("click", exportManagerCsv);
    els.export.addEventListener("click", exportExcel);
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
    node.querySelector(".meta").innerHTML = metaText(item);

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
      const haystack = `${item.descripcion} ${item.seccion} ${item.area} ${item.archivo} ${item.referencia || ""} ${item.codigoBarras || ""}`.toLowerCase();
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
    const bits = [escapeHtml(item.area)];
    bits.push(item.referencia ? `Ref. ${escapeHtml(item.referencia)}` : '<span class="missing-ref">Sin ref.</span>');
    if (typeof item.coste === "number") bits.push(`Coste ${item.coste.toLocaleString("es-ES", { maximumFractionDigits: 3 })}`);
    if (typeof item.stockExcel === "number") bits.push(`Excel ${item.stockExcel.toLocaleString("es-ES", { maximumFractionDigits: 2 })}`);
    return bits.join(" · ");
  }

  function exportExcel() {
    const detailRows = buildDetailRows();
    const summaryRows = buildSummaryRows(detailRows);
    const xml = buildExcelXml(summaryRows, detailRows);
    const blob = new Blob([xml], { type: "application/vnd.ms-excel;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `inventario-valorado-${dateStamp()}.xls`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function exportManagerCsv() {
    const rows = [];
    items.forEach((item) => {
      if (!hasCount(item.id) || !item.codigoBarras) return;
      const entry = state.counts[item.id] || {};
      rows.push([item.codigoBarras, formatCsvQuantity(entry.qty)]);
    });

    const csv = rows.map((row) => `${excelTextCsvCell(row[0])};${csvCell(row[1])}`).join("\r\n");
    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `manager-inventario-${dateStamp()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function buildDetailRows() {
    return items.map((item) => {
      const entry = state.counts[item.id] || {};
      const qty = hasCount(item.id) ? Number(entry.qty) : 0;
      const cost = typeof item.coste === "number" ? item.coste : 0;
      const value = qty * cost;
      return {
        area: item.area,
        section: item.seccion,
        reference: item.referencia || "",
        product: item.descripcion,
        qty,
        cost,
        value,
        note: entry.note || "",
        counted: hasCount(item.id) ? "Sí" : "No",
      };
    });
  }

  function buildSummaryRows(detailRows) {
    const grouped = new Map();
    detailRows.forEach((row) => {
      const key = `${row.area}|||${row.section}`;
      const current = grouped.get(key) || {
        area: row.area,
        section: row.section,
        products: 0,
        counted: 0,
        value: 0,
      };
      current.products += 1;
      if (row.counted === "Sí") current.counted += 1;
      current.value += row.value;
      grouped.set(key, current);
    });
    return Array.from(grouped.values()).sort((a, b) => {
      const areaSort = sortText(a.area, b.area);
      return areaSort || sortText(a.section, b.section);
    });
  }

  function buildExcelXml(summaryRows, detailRows) {
    const totalProducts = detailRows.length;
    const countedProducts = detailRows.filter((row) => row.counted === "Sí").length;
    const totalValue = detailRows.reduce((sum, row) => sum + row.value, 0);
    const generated = new Date().toLocaleString("es-ES");

    const summaryTable = [
      excelRow([textCell("Inventario valorado", "Title")]),
      excelRow([textCell(`Generado: ${generated}`, "Muted")]),
      excelRow([]),
      excelRow([textCell("Total inventario", "Header"), numberCell(totalValue, "Euro")]),
      excelRow([textCell("Productos contados", "Header"), numberCell(countedProducts, "Integer")]),
      excelRow([textCell("Productos totales", "Header"), numberCell(totalProducts, "Integer")]),
      excelRow([]),
      excelRow([
        textCell("Área", "Header"),
        textCell("Contados", "Header"),
        textCell("Valor €", "Header"),
      ]),
      ...buildSummaryExcelRows(summaryRows),
    ].join("");

    const detailTable = [
      excelRow([
        textCell("Área", "Header"),
        textCell("Sección", "Header"),
        textCell("Referencia", "Header"),
        textCell("Producto", "Header"),
        textCell("Recuento", "Header"),
        textCell("Último coste", "Header"),
        textCell("Valor €", "Header"),
        textCell("Contado", "Header"),
        textCell("Nota", "Header"),
      ]),
      ...detailRows.map((row) => excelRow([
        textCell(row.area),
        textCell(row.section),
        textCell(row.reference),
        textCell(row.product),
        numberCell(row.qty, "Decimal"),
        numberCell(row.cost, "Euro"),
        numberCell(row.value, "Euro"),
        textCell(row.counted),
        textCell(row.note),
      ])),
    ].join("");

    return `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
 <Styles>
  <Style ss:ID="Default" ss:Name="Normal"><Alignment ss:Vertical="Center"/></Style>
  <Style ss:ID="Title"><Font ss:Bold="1" ss:Size="16" ss:Color="#1f6f68"/></Style>
  <Style ss:ID="Muted"><Font ss:Color="#68716e"/></Style>
  <Style ss:ID="Header"><Font ss:Bold="1" ss:Color="#FFFFFF"/><Interior ss:Color="#1f6f68" ss:Pattern="Solid"/></Style>
  <Style ss:ID="Integer"><NumberFormat ss:Format="0"/></Style>
  <Style ss:ID="Decimal"><NumberFormat ss:Format="0.00"/></Style>
  <Style ss:ID="Euro"><NumberFormat ss:Format="#,##0.00 €"/></Style>
 </Styles>
 <Worksheet ss:Name="Resumen">
  <Table>
   <Column ss:Width="150"/><Column ss:Width="90"/><Column ss:Width="110"/>
   ${summaryTable}
  </Table>
 </Worksheet>
 <Worksheet ss:Name="Detalle">
  <Table>
   <Column ss:Width="110"/><Column ss:Width="170"/><Column ss:Width="95"/><Column ss:Width="260"/><Column ss:Width="80"/><Column ss:Width="90"/><Column ss:Width="100"/><Column ss:Width="70"/><Column ss:Width="220"/>
   ${detailTable}
  </Table>
 </Worksheet>
</Workbook>`;
  }

  function excelRow(cells) {
    return `<Row>${cells.join("")}</Row>`;
  }

  function buildSummaryExcelRows(summaryRows) {
    const byArea = new Map();
    summaryRows.forEach((row) => {
      const current = byArea.get(row.area) || {
        area: row.area,
        counted: 0,
        value: 0,
      };
      current.counted += row.counted;
      current.value += row.value;
      byArea.set(row.area, current);
    });

    return Array.from(byArea.values()).map((row) => excelRow([
      textCell(row.area),
      numberCell(row.counted, "Integer"),
      numberCell(row.value, "Euro"),
    ]));
  }

  function textCell(value, style, attrs = "") {
    return `<Cell${styleAttr(style)}${attrs}><Data ss:Type="String">${xmlEscape(value)}</Data></Cell>`;
  }

  function numberCell(value, style) {
    const number = Number.isFinite(value) ? value : 0;
    return `<Cell${styleAttr(style)}><Data ss:Type="Number">${number}</Data></Cell>`;
  }

  function styleAttr(style) {
    return style ? ` ss:StyleID="${style}"` : "";
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
    localStorage.removeItem(STORAGE_KEY);
    return {};
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

  function excelTextCsvCell(value) {
    const text = String(value ?? "").replace(/"/g, '""');
    return `="${text}"`;
  }

  function formatCsvQuantity(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return "";
    return Number.isInteger(number) ? String(number) : String(number).replace(",", ".");
  }

  function xmlEscape(value) {
    return String(value ?? "").replace(/[<>&'"]/g, (char) => ({
      "<": "&lt;",
      ">": "&gt;",
      "&": "&amp;",
      "'": "&apos;",
      '"': "&quot;",
    }[char]));
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
