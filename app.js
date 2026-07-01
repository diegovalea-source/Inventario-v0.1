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
    bits.push(item.codigoBarras ? `Cód. barras ${escapeHtml(item.codigoBarras)}` : '<span class="missing-ref">Sin cód. barras</span>');
    if (typeof item.coste === "number") bits.push(`Coste ${item.coste.toLocaleString("es-ES", { maximumFractionDigits: 3 })}`);
    if (typeof item.stockExcel === "number") bits.push(`Excel ${item.stockExcel.toLocaleString("es-ES", { maximumFractionDigits: 2 })}`);
    return bits.join(" · ");
  }

  function exportExcel() {
    const detailRows = buildDetailRows();
    const summaryRows = buildSummaryRows(detailRows);
    const workbook = buildXlsx(summaryRows, detailRows);
    const blob = new Blob([workbook], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `inventario-valorado-${dateStamp()}.xlsx`;
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

  function buildXlsx(summaryRows, detailRows) {
    const totalProducts = detailRows.length;
    const countedProducts = detailRows.filter((row) => row.counted === "Sí").length;
    const totalValue = detailRows.reduce((sum, row) => sum + row.value, 0);
    const generated = new Date().toLocaleString("es-ES");
    const areaRows = buildAreaRows(summaryRows);

    const summarySheet = worksheetXml([
      xlsxRow([xlsxText("Inventario valorado", 1)]),
      xlsxRow([xlsxText(`Generado: ${generated}`, 2)]),
      xlsxRow([]),
      xlsxRow([xlsxText("Total inventario", 3), xlsxNumber(totalValue, 6)]),
      xlsxRow([xlsxText("Productos contados", 3), xlsxNumber(countedProducts, 4)]),
      xlsxRow([xlsxText("Productos totales", 3), xlsxNumber(totalProducts, 4)]),
      xlsxRow([]),
      xlsxRow([xlsxText("Área", 3), xlsxText("Contados", 3), xlsxText("Valor €", 3)]),
      ...areaRows.map((row) => xlsxRow([
        xlsxText(row.area),
        xlsxNumber(row.counted, 4),
        xlsxNumber(row.value, 6),
      ])),
    ], [24, 14, 16]);

    const detailSheet = worksheetXml([
      xlsxRow([
        xlsxText("Área", 3),
        xlsxText("Sección", 3),
        xlsxText("Referencia", 3),
        xlsxText("Producto", 3),
        xlsxText("Recuento", 3),
        xlsxText("Último coste", 3),
        xlsxText("Valor €", 3),
        xlsxText("Contado", 3),
        xlsxText("Nota", 3),
      ]),
      ...detailRows.map((row) => xlsxRow([
        xlsxText(row.area),
        xlsxText(row.section),
        xlsxText(row.reference),
        xlsxText(row.product),
        xlsxNumber(row.qty, 5),
        xlsxNumber(row.cost, 6),
        xlsxNumber(row.value, 6),
        xlsxText(row.counted),
        xlsxText(row.note),
      ])),
    ], [16, 24, 14, 42, 12, 14, 14, 10, 34]);

    return zipStore({
      "[Content_Types].xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`,
      "_rels/.rels": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
      "xl/workbook.xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Resumen" sheetId="1" r:id="rId1"/><sheet name="Detalle" sheetId="2" r:id="rId2"/></sheets></workbook>`,
      "xl/_rels/workbook.xml.rels": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
      "xl/styles.xml": xlsxStylesXml(),
      "xl/worksheets/sheet1.xml": summarySheet,
      "xl/worksheets/sheet2.xml": detailSheet,
    });
  }

  function buildAreaRows(summaryRows) {
    const byArea = new Map();
    summaryRows.forEach((row) => {
      const current = byArea.get(row.area) || { area: row.area, counted: 0, value: 0 };
      current.counted += row.counted;
      current.value += row.value;
      byArea.set(row.area, current);
    });
    return Array.from(byArea.values());
  }

  function worksheetXml(rows, widths) {
    const cols = widths.map((width, index) => `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`).join("");
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><cols>${cols}</cols><sheetData>${rows.join("")}</sheetData></worksheet>`;
  }

  function xlsxRow(cells) {
    return `<row>${cells.join("")}</row>`;
  }

  function xlsxText(value, styleId = 0) {
    return `<c t="inlineStr"${styleId ? ` s="${styleId}"` : ""}><is><t>${xmlEscape(value)}</t></is></c>`;
  }

  function xlsxNumber(value, styleId = 0) {
    const number = Number.isFinite(value) ? value : 0;
    return `<c${styleId ? ` s="${styleId}"` : ""}><v>${number}</v></c>`;
  }

  function xlsxStylesXml() {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="3"><numFmt numFmtId="164" formatCode="0"/><numFmt numFmtId="165" formatCode="0.00"/><numFmt numFmtId="166" formatCode="#,##0.00 €"/></numFmts><fonts count="4"><font><sz val="11"/><color rgb="FF18211F"/><name val="Calibri"/></font><font><b/><sz val="16"/><color rgb="FF1F6F68"/><name val="Calibri"/></font><font><sz val="11"/><color rgb="FF68716E"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF1F6F68"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="7"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="0" fontId="3" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="166" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;
  }

  function zipStore(files) {
    const encoder = new TextEncoder();
    const localParts = [];
    const centralParts = [];
    let offset = 0;
    Object.entries(files).forEach(([name, content]) => {
      const nameBytes = encoder.encode(name);
      const data = encoder.encode(content);
      const crc = crc32(data);
      const localHeader = zipHeader(0x04034b50, [[20, 2], [0, 2], [0, 2], [0, 2], [0, 2], [crc, 4], [data.length, 4], [data.length, 4], [nameBytes.length, 2], [0, 2]]);
      localParts.push(localHeader, nameBytes, data);
      const centralHeader = zipHeader(0x02014b50, [[20, 2], [20, 2], [0, 2], [0, 2], [0, 2], [0, 2], [crc, 4], [data.length, 4], [data.length, 4], [nameBytes.length, 2], [0, 2], [0, 2], [0, 2], [0, 2], [0, 4], [offset, 4]]);
      centralParts.push(centralHeader, nameBytes);
      offset += localHeader.length + nameBytes.length + data.length;
    });
    const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0);
    const fileCount = Object.keys(files).length;
    const end = zipHeader(0x06054b50, [[0, 2], [0, 2], [fileCount, 2], [fileCount, 2], [centralSize, 4], [offset, 4], [0, 2]]);
    return concatBytes([...localParts, ...centralParts, end]);
  }

  function zipHeader(signature, fields) {
    const bytes = new Uint8Array(4 + fields.reduce((sum, field) => sum + field[1], 0));
    const view = new DataView(bytes.buffer);
    view.setUint32(0, signature, true);
    let cursor = 4;
    fields.forEach(([value, length]) => {
      if (length === 2) view.setUint16(cursor, value, true);
      if (length === 4) view.setUint32(cursor, value >>> 0, true);
      cursor += length;
    });
    return bytes;
  }

  function concatBytes(parts) {
    const bytes = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
    let cursor = 0;
    parts.forEach((part) => {
      bytes.set(part, cursor);
      cursor += part.length;
    });
    return bytes;
  }

  function crc32(bytes) {
    let crc = -1;
    for (let index = 0; index < bytes.length; index += 1) {
      crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ bytes[index]) & 0xff];
    }
    return (crc ^ -1) >>> 0;
  }

  const CRC_TABLE = (() => {
    const table = [];
    for (let index = 0; index < 256; index += 1) {
      let value = index;
      for (let bit = 0; bit < 8; bit += 1) {
        value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
      }
      table[index] = value >>> 0;
    }
    return table;
  })();

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
