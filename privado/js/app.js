(function () {
  const PORTAL = "https://sit.rivasciudad.es/portal";
  const SERVER = "https://sit.rivasciudad.es/server/rest/services";
  const FEATURE_URL = SERVER + "/AREAS_JUEGO_EDICION/FeatureServer";
  const FEATURE_ITEM_ID = "804c3139f17047eb91f7bb12b51c2b8f";
  const TERMINO_MUNICIPAL_URL = SERVER + "/Termino_municipal_actual/FeatureServer/0";
  const SESSION_KEY = "rivasAreasPrivadoSession";
  const NOT_DELETED = "(ELIMINADO <> 'SI' OR ELIMINADO IS NULL)";
  const EXCLUDED_AREA_TYPES = ["AREA DEPORTE", "AREA EDUCACION", "AREA EDUCACIÓN"];

  const TARGETS = {
    area: {
      label: "Área",
      prefix: "A",
      layerId: 2,
      tableId: 3,
      keyField: "CODIGO",
      relField: "CODIGO_AREA",
      epochDates: true,
      search: ["CODIGO", "COD_AREA", "NOMBRE"]
    },
    juego: {
      label: "Elemento de juego",
      prefix: "J",
      layerId: 0,
      tableId: 4,
      keyField: "CODIGO_G",
      relField: "CODIGO",
      epochDates: false,
      search: ["CODIGO_G", "CODIGO", "ELEMENTO", "TIPO"]
    },
    bio: {
      label: "Equipo biosaludable",
      prefix: "B",
      layerId: 1,
      tableId: 5,
      keyField: "CODIGO",
      relField: "CODIGO",
      epochDates: false,
      search: ["CODIGO", "NAME", "ELEMENTO"]
    }
  };

  const CHECKS = [
    ["Limpieza y revisión", [
      ["L_S_LIM_GENERAL", "Limpieza general"],
      ["L_S_ESTADO_SUELO", "Estado del suelo"],
      ["L_S_DEFICIENCIAS", "Deficiencias"]
    ]],
    ["Mantenimiento", [
      ["M_P_S_LIMPIEZA_AREA", "Limpieza del área"],
      ["M_P_S_LIMPIEZA_HIDRO", "Limpieza hidro"],
      ["M_P_S_LIMPIEZA_PINT", "Limpieza de pintura"],
      ["M_P_S_ELIM_M_HIERBA", "Eliminación de malas hierbas"],
      ["M_P_S_LUBRICACION", "Lubricación"],
      ["M_P_S_AJUSTES", "Ajustes"],
      ["M_P_S_REPO_PIEZAS", "Reposición de piezas"],
      ["M_P_S_LIJADO_ARISTAS", "Lijado de aristas"],
      ["M_P_S_REPINTADO", "Repintado"],
      ["M_P_S_RETIRADA_CIMENTA", "Retirada de cimentación"],
      ["M_P_S_APORTE_ARENA", "Aporte de arena"]
    ]],
    ["Funcionamiento", [
      ["M_F_INSP_FUN_CORRECTA", "Funcionamiento correcto"]
    ]]
  ];

  const CHECK_FIELDS = CHECKS.flatMap(function (group) { return group[1]; });

  let session = null;
  let view = null;
  let featureLayers = {};
  let tableLayers = {};
  let areaIconLayer = null;
  let highlightHandle = null;
  let currentRows = [];
  let selectedFeature = null;
  let editingOid = null;
  let activeActuacion = null;
  let popupToken = 0;
  let dashboardToken = 0;
  let dashboardCodes = null;
  let mapFocus = null;
  let layerSnapshot = null;
  let focusLayer = null;
  let addFocusGraphics = function () {};
  let focusToken = 0;
  let syncBusy = false;
  let pollTimer = null;
  const ACTUACIONES_POLL_MS = 15000;

  const $ = function (id) { return document.getElementById(id); };

  function esc(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (ch) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch];
    });
  }

  function sqlStr(value) {
    return "'" + String(value).replace(/'/g, "''") + "'";
  }

  function sqlEquals(field, value) {
    return "UPPER(" + field + ") = " + sqlStr(String(value).trim().toUpperCase());
  }

  function excludedTypeSql() {
    return EXCLUDED_AREA_TYPES.map(sqlStr).join(",");
  }

  function includedAreaWhere() {
    return NOT_DELETED + " AND (TIPO IS NULL OR TIPO NOT IN (" + excludedTypeSql() + "))";
  }

  function readSession() {
    try {
      const raw = sessionStorage.getItem(SESSION_KEY);
      if (!raw) return null;
      const data = JSON.parse(raw);
      if (!data.token || !data.expires || data.expires < Date.now() + 60000) return null;
      return data;
    } catch (err) {
      return null;
    }
  }

  function saveSession(data) {
    session = data;
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(data));
  }

  function clearSession() {
    session = null;
    sessionStorage.removeItem(SESSION_KEY);
  }

  async function assertFeatureAccess(token) {
    let data;
    try {
      const response = await fetch(PORTAL + "/sharing/rest/content/items/" + FEATURE_ITEM_ID, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ f: "json", token: token })
      });
      data = await response.json();
    } catch (err) {
      throw new Error("No se ha podido comprobar el acceso con el portal.");
    }
    if (!data || data.error || !data.id) {
      throw new Error("Tu usuario no pertenece al grupo con acceso a este visor.");
    }
  }

  function setDefaultDates() {
    const today = new Date();
    const from = new Date(today);
    from.setFullYear(from.getFullYear() - 1);
    $("fHasta").value = toInputDate(today.getTime());
    $("fDesde").value = toInputDate(from.getTime());
  }

  function toInputDate(value) {
    if (value == null || value === "") return "";
    if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
    const num = typeof value === "number" ? value : (/^\d{12,}$/.test(String(value)) ? Number(value) : NaN);
    const date = Number.isNaN(num) ? new Date(value) : new Date(num);
    if (Number.isNaN(date.getTime())) return "";
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return date.getFullYear() + "-" + month + "-" + day;
  }

  function formatDateTime(value) {
    if (value == null || value === "") return "—";
    const num = typeof value === "number" ? value : (/^\d{12,}$/.test(String(value)) ? Number(value) : NaN);
    if (!Number.isNaN(num)) {
      return new Date(num).toLocaleString("es-ES", { dateStyle: "short", timeStyle: "short" });
    }
    return String(value);
  }

  function actuacionCode(kind, objectId) {
    return TARGETS[kind].prefix + "-" + objectId;
  }

  function parseActuacionId(text) {
    const match = String(text || "").trim().match(/^([AJB])-?(\d+)$/i);
    if (!match) return null;
    const kind = { A: "area", J: "juego", B: "bio" }[match[1].toUpperCase()];
    return { kind: kind, objectId: Number(match[2]) };
  }

  function dateBounds() {
    const from = $("fDesde").value;
    const to = $("fHasta").value;
    const start = /^\d{4}-\d{2}-\d{2}$/.test(from) ? new Date(from + "T00:00:00").getTime() : null;
    const end = /^\d{4}-\d{2}-\d{2}$/.test(to) ? new Date(to + "T23:59:59.999").getTime() : null;
    return { start: start, end: end };
  }

  function createdTime(value) {
    if (value == null || value === "") return null;
    if (value instanceof Date) return value.getTime();
    if (typeof value === "number") return value;
    if (typeof value === "string" && /^\d{12,}$/.test(value)) return Number(value);
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? null : parsed;
  }

  function inDateRange(value) {
    const range = dateBounds();
    if (range.start == null && range.end == null) return true;
    const time = createdTime(value);
    if (time == null) return false;
    if (range.start != null && time < range.start) return false;
    if (range.end != null && time > range.end) return false;
    return true;
  }

  async function queryActuacionesInRange(layer, where, outFields) {
    const features = [];
    const pageSize = 1000;
    let start = 0;
    const range = dateBounds();
    while (start < 8000) {
      const result = await layer.queryFeatures({
        where: where || "1=1",
        outFields: outFields,
        orderByFields: "CREATED_DATE DESC",
        returnGeometry: false,
        num: pageSize,
        start: start
      });
      const batch = result.features || [];
      let passedStart = false;
      batch.forEach(function (feature) {
        const attrs = feature.attributes || {};
        const time = createdTime(attrs.CREATED_DATE);
        if (range.start != null && time != null && time < range.start) {
          passedStart = true;
          return;
        }
        if (inDateRange(attrs.CREATED_DATE)) features.push(feature);
      });
      if (passedStart || batch.length < pageSize) break;
      start += batch.length;
    }
    return features;
  }

  function selectedKinds() {
    const scope = $("fAmbito").value;
    return scope === "todas" ? ["area", "juego", "bio"] : [scope];
  }

  function markerSymbol(file, size) {
    return {
      type: "picture-marker",
      url: new URL("../" + file, window.location.href).href,
      width: size + "px",
      height: size + "px"
    };
  }

  const SOIL_STYLES = [
    { values: ["Arena"], file: "arena.png" },
    { values: ["Arena rio", "Arena río"], file: "arena-rio.png" },
    { values: ["Terreno natural"], file: "terreno-natural.png" },
    { values: ["Hormigon", "Hormigón"], file: "hormigon.png" },
    { values: ["Caucho continuo"], file: "caucho.png" },
    { values: ["Caucho arena rio", "Caucho y arena de río", "Caucho y arena de rio"], file: "caucho-arena.png" },
    { values: ["Loseta caucho"], file: "loseta-caucho.png" },
    { values: ["Loseta caucho y C continuo", "Loseta caucho y C. continuo"], file: "loseta-mixto.png" },
    { values: ["Corcho"], file: "corcho.png" },
    { values: ["Garbancillo"], file: "garbancillo.jpg" },
    { values: ["-"], file: "suelo-default.png" },
    { values: ["PISCINA"], file: "piscina.png" }
  ];

  function soilFill(fileName) {
    return {
      type: "picture-fill",
      url: new URL("../texturas/" + fileName, window.location.href).href,
      width: 56,
      height: 56,
      outline: { color: [36, 36, 36, 0.9], width: 1.25 }
    };
  }

  function areaSoilRenderer() {
    const uniqueValueInfos = [];
    SOIL_STYLES.forEach(function (style) {
      const symbol = soilFill(style.file);
      style.values.forEach(function (value) {
        uniqueValueInfos.push({ value: value, symbol: symbol });
      });
    });
    return {
      type: "unique-value",
      valueExpression: "IIF(Upper(DefaultValue($feature.USO, '')) == 'PISCINA', 'PISCINA', DefaultValue($feature.TIPOSUELO, ''))",
      defaultSymbol: soilFill("suelo-default.png"),
      uniqueValueInfos: uniqueValueInfos
    };
  }

  function codeLabel(expression, minScale) {
    return [{
      minScale: minScale,
      labelPlacement: "above-center",
      deconflictionStrategy: "static",
      labelExpressionInfo: { expression: expression },
      symbol: {
        type: "text",
        color: "#163024",
        haloColor: "#ffffff",
        haloSize: 1.6,
        font: { size: 10, family: "Arial", weight: "bold" }
      }
    }];
  }

  function uniqueIcons(field, pairs, fallbackFile, fallbackSize) {
    return {
      type: "unique-value",
      field: field,
      defaultSymbol: markerSymbol(fallbackFile, fallbackSize),
      uniqueValueInfos: pairs.map(function (pair) {
        return { value: pair[0], symbol: markerSymbol(pair[1], pair[2]) };
      })
    };
  }

  function areaIconKey(tipo) {
    const key = String(tipo || "").trim().toUpperCase();
    if (key === "JUEGOS DE AGUA" || key === "ZONA DE AGUA") return "agua";
    if (key === "BIOSALUDABLE") return "bio";
    if (key === "CALISTENIA" || key === "AREA DE CALISTENIA") return "calistenia";
    return "infantil";
  }

  const JUEGO_LABEL = 'DefaultValue($feature.CODIGO_G, "")';

  const AREA_LABEL = [
    'var code = DefaultValue($feature.COD_AREA, "");',
    'var name = DefaultValue($feature.NOMBRE, "");',
    'if (IsEmpty(code) && IsEmpty(name)) return "";',
    'if (IsEmpty(name)) return code;',
    'if (IsEmpty(code)) return name;',
    'return code + " – " + name;'
  ].join("\n");

  const BIO_LABEL = [
    'var elem = DefaultValue($feature.CODIGO, "");',
    'var area = "";',
    'if (!IsEmpty($feature["GIS_PRODUCCION.EQUIPACION_BIO_DEPOR.AREA"])) area = $feature["GIS_PRODUCCION.EQUIPACION_BIO_DEPOR.AREA"];',
    'if (IsEmpty(elem) && IsEmpty(area)) return "";',
    'if (IsEmpty(area) || area == elem) return elem;',
    'if (IsEmpty(elem)) return area;',
    'return elem + TextFormatting.NewLine + area;'
  ].join("\n");

  function parentName(kind, attrs) {
    if (!attrs) return "";
    if (kind === "area") return attrs.NOMBRE || "";
    if (kind === "juego") return attrs.ELEMENTO || attrs.TIPO || "";
    return attrs.NAME || attrs.ELEMENTO || "";
  }

  function featureCode(kind, attrs) {
    return attrs ? (attrs[TARGETS[kind].keyField] || "") : "";
  }

  function popupPoint(geometry) {
    if (!geometry || !view) return view ? view.center : null;
    if (geometry.type === "point") return geometry;
    return geometry.centroid || (geometry.extent && geometry.extent.center) || view.center;
  }

  function attachmentUrl(url) {
    if (!url || !session || !session.token || /[?&]token=/.test(url)) return url;
    return url + (url.indexOf("?") === -1 ? "?" : "&") + "token=" + encodeURIComponent(session.token);
  }

  function isImageAttachment(info) {
    const type = String(info.contentType || "").toLowerCase();
    if (type.indexOf("image/") === 0) return true;
    return /\.(png|jpe?g|gif|webp|bmp)$/i.test(info.name || "");
  }

  function soilLabel(kind, attributes) {
    if (kind === "area" && String(attributes.USO || "").toUpperCase() === "PISCINA") return "Piscina";
    const raw = kind === "bio" ? attributes.TIPO_DE_SUELO : attributes.TIPOSUELO;
    const labels = {
      "Arena": "Arena",
      "Arena rio": "Arena de río",
      "Arena río": "Arena de río",
      "Terreno natural": "Terreno natural",
      "Hormigon": "Hormigón",
      "Hormigón": "Hormigón",
      "Caucho continuo": "Caucho continuo",
      "Caucho arena rio": "Caucho y arena",
      "Caucho y arena de río": "Caucho y arena",
      "Loseta caucho": "Loseta de caucho",
      "Loseta caucho y C continuo": "Loseta y caucho continuo",
      "Loseta caucho y C. continuo": "Loseta y caucho continuo",
      "Corcho": "Corcho",
      "Garbancillo": "Garbancillo"
    };
    if (raw == null || raw === "" || raw === "-") return "";
    return labels[raw] || String(raw);
  }

  function closeElementPopup() {
    popupToken += 1;
    if (view && view.popup) view.closePopup();
  }

  async function showElementPopup(kind, attributes, geometry) {
    if (!view || !attributes || attributes.OBJECTID == null) return;
    const request = ++popupToken;
    const code = featureCode(kind, attributes) || "Sin código";
    const content = document.createElement("div");
    content.className = "element-attachments";
    content.textContent = "Cargando actuación...";
    view.openPopup({
      title: code,
      location: popupPoint(geometry),
      content: content
    });
    const oid = attributes.OBJECTID;
    const jobs = [
      featureLayers[kind].queryAttachments({ objectIds: [oid] }).then(function (result) {
        return { ok: true, result: result };
      }, function () {
        return { ok: false };
      })
    ];
    if (featureCode(kind, attributes)) {
      jobs.push(tableLayers[kind].queryFeatures({
        where: TARGETS[kind].relField + " = " + sqlStr(featureCode(kind, attributes)),
        outFields: ["*"],
        orderByFields: "CREATED_DATE DESC",
        returnGeometry: false,
        num: 1
      }).then(function (result) {
        return { ok: true, result: result };
      }, function () {
        return { ok: false };
      }));
    }
    const settled = await Promise.all(jobs);
    if (request !== popupToken) return;
    const attachments = settled[0];
    const actuaciones = settled[1];
    const latest = actuaciones && actuaciones.ok && actuaciones.result.features[0];
    content.textContent = "";
    content.appendChild(popupActuacionBlock(kind, attributes, latest || null, actuaciones && !actuaciones.ok));
    const soil = document.createElement("p");
    soil.className = "popup-soil";
    const soilName = soilLabel(kind, attributes);
    soil.textContent = "Tipo de suelo: " + (soilName || "Sin datos");
    content.appendChild(soil);
    appendPopupAttachments(content, attachments, oid, code);
  }

  function popupActuacionBlock(kind, attributes, feature, failed) {
    const block = document.createElement("div");
    block.className = "popup-actuacion";
    const title = document.createElement("p");
    title.className = "popup-kicker";
    title.textContent = "Última actuación";
    block.appendChild(title);
    const code = featureCode(kind, attributes);
    if (!code) {
      const empty = document.createElement("p");
      empty.textContent = "Este elemento no tiene código y no se puede asociar una actuación.";
      block.appendChild(empty);
      return block;
    }
    if (failed) {
      const empty = document.createElement("p");
      empty.textContent = "No se ha podido consultar la última actuación.";
      block.appendChild(empty);
    } else if (!feature) {
      const empty = document.createElement("p");
      empty.textContent = "Este elemento no tiene actuaciones.";
      block.appendChild(empty);
    } else {
      const attrs = feature.attributes;
      const head = document.createElement("p");
      head.className = "popup-id";
      head.innerHTML = "<strong>" + esc(actuacionCode(kind, attrs.OBJECTID)) + "</strong> " + stateBadge(attrs);
      block.appendChild(head);
      const fecha = document.createElement("p");
      const day = formatDay(attrs.A_I_F_INCIDENCIA);
      fecha.textContent = day ? "Fecha de actuación " + day : "Sin fecha de actuación";
      block.appendChild(fecha);
      const meta = document.createElement("p");
      meta.textContent = "Registrada " + formatDateTime(attrs.CREATED_DATE) + " · " + (attrs.CREATED_USER || "Sin usuario");
      block.appendChild(meta);
    }
    const actions = document.createElement("div");
    actions.className = "popup-actions";
    if (feature) {
      actions.appendChild(popupAction("Modificar actuación", true, function () {
        const row = { kind: kind, attributes: feature.attributes, parent: attributes };
        const card = $("fichaHistory").querySelector('[data-oid="' + feature.attributes.OBJECTID + '"]');
        showActuacion(row, card);
        const form = $("actuacionForm");
        if (form) form.scrollIntoView({ behavior: "smooth", block: "start" });
        if (view) view.closePopup();
      }));
    }
    actions.appendChild(popupAction(feature ? "Nueva actuación" : "Crear actuación", !feature, function () {
      resetForm();
      $("btnSave").disabled = false;
      $("btnSave").textContent = "Registrar actuación";
      $("formStatus").textContent = "Nueva actuación";
      document.querySelectorAll(".history-card.is-active").forEach(function (card) { card.classList.remove("is-active"); });
      const form = $("actuacionForm");
      if (form) form.scrollIntoView({ behavior: "smooth", block: "start" });
      if (view) view.closePopup();
    }));
    block.appendChild(actions);
    return block;
  }

  function popupAction(label, primary, onClick) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "popup-action" + (primary ? " is-primary" : "");
    button.textContent = label;
    button.addEventListener("click", function (event) {
      event.preventDefault();
      event.stopPropagation();
      onClick();
    });
    return button;
  }

  function appendPopupAttachments(content, attachments, oid, code) {
    if (!attachments || !attachments.ok) {
      const fail = document.createElement("p");
      fail.textContent = "No se han podido cargar los adjuntos.";
      content.appendChild(fail);
      return;
    }
    const infos = (attachments.result && (attachments.result[oid] || attachments.result[String(oid)])) || [];
    if (!infos.length) {
      const empty = document.createElement("p");
      empty.textContent = "Este elemento no tiene adjuntos.";
      content.appendChild(empty);
      return;
    }
    infos.forEach(function (info) {
      if (!info || !info.url) return;
      const url = attachmentUrl(info.url);
      if (isImageAttachment(info)) {
        const img = document.createElement("img");
        img.src = url;
        img.alt = info.name || code;
        content.appendChild(img);
      }
      const link = document.createElement("a");
      link.href = url;
      link.target = "_blank";
      link.rel = "noopener";
      link.textContent = info.name || "Abrir adjunto";
      content.appendChild(link);
    });
  }

  function buildForm() {
    const html = CHECKS.map(function (group, index) {
      const fields = group[1].map(function (field) {
        return '<label class="check-field">' + esc(field[1]) +
          '<select data-field="' + field[0] + '" data-kind="check">' +
          '<option value="NO">NO</option><option value="SI">SI</option></select></label>';
      }).join("");
      return '<div class="form-section"><h4><span class="section-num">' + (index + 1) + "</span>" + esc(group[0]) + '</h4><div class="check-grid">' + fields + '</div></div>';
    }).join("");
    $("formFields").innerHTML = html +
      '<div class="form-section"><h4><span class="section-num">4</span>Incidencia</h4>' +
      '<label class="check-field">Hay incidencia<select data-field="A_I_INCIDENCIA" data-kind="check"><option value="NO">NO</option><option value="SI">SI</option></select></label>' +
      '<div class="row2"><label>Fecha de incidencia<input data-field="A_I_F_INCIDENCIA" data-kind="date" type="date" required></label>' +
      '<label>Fecha de resolución<input data-field="A_I_F_RESOLUCION" data-kind="date" type="date"></label></div>' +
      '<label>Material necesario<input data-field="A_I_MAT_NECESARIO" data-kind="text" type="text"></label>' +
      '<label>Descripción<textarea data-field="A_I_DESCRIPCION" data-kind="text"></textarea></label>' +
      '<label>Observaciones<textarea data-field="M_F_OBSERVACIONES" data-kind="text"></textarea></label>' +
      '<label class="file-field">Fotografía<input id="fAdjunto" type="file" accept="image/*"></label>' +
      '<div id="adjuntoList" class="adjunto-list"></div></div>';
  }

  function todayInputDate() {
    return toInputDate(Date.now());
  }

  function resetForm() {
    editingOid = null;
    activeActuacion = null;
    $("btnPrintOne").disabled = true;
    $("btnDelete").disabled = true;
    $("btnSave").textContent = "Registrar actuación";
    $("formStatus").textContent = "";
    $("actuacionForm").querySelectorAll("[data-field]").forEach(function (input) {
      if (input.dataset.kind === "check") input.value = "NO";
      else input.value = "";
    });
    const fechaIncidencia = $("actuacionForm").querySelector('[data-field="A_I_F_INCIDENCIA"]');
    if (fechaIncidencia) fechaIncidencia.value = todayInputDate();
    if ($("fAdjunto")) $("fAdjunto").value = "";
    if ($("adjuntoList")) $("adjuntoList").textContent = "";
  }

  function clearSelection() {
    if (highlightHandle) {
      highlightHandle.remove();
      highlightHandle = null;
    }
    selectedFeature = null;
    resetForm();
    closeElementPopup();
    $("ficha").hidden = true;
    document.querySelectorAll(".result-table tr.is-active, .history-card.is-active").forEach(function (card) {
      card.classList.remove("is-active");
    });
  }

  function fillForm(attrs) {
    $("actuacionForm").querySelectorAll("[data-field]").forEach(function (input) {
      const value = attrs[input.dataset.field];
      if (input.dataset.kind === "date") input.value = toInputDate(value);
      else if (input.dataset.kind === "check") input.value = value === "SI" ? "SI" : "NO";
      else input.value = value == null ? "" : String(value);
    });
  }

  function collectAttributes(kind) {
    const target = TARGETS[kind];
    const code = featureCode(kind, selectedFeature && selectedFeature.attributes);
    const attrs = {};
    attrs[target.relField] = code;
    $("actuacionForm").querySelectorAll("[data-field]").forEach(function (input) {
      const name = input.dataset.field;
      if (input.dataset.kind === "check") attrs[name] = input.value;
      else if (input.dataset.kind === "date") {
        if (!input.value) attrs[name] = null;
        else if (target.epochDates) attrs[name] = new Date(input.value + "T00:00:00").getTime();
        else attrs[name] = input.value;
      } else attrs[name] = input.value.trim() || null;
    });
    return attrs;
  }

  async function login(username, password) {
    const body = new URLSearchParams({
      username: username,
      password: password,
      client: "referer",
      referer: location.origin,
      expiration: "480",
      f: "json"
    });
    const response = await fetch(PORTAL + "/sharing/rest/generateToken", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body
    });
    const data = await response.json();
    if (!data.token) {
      const message = data.error && data.error.message ? data.error.message : "";
      if (/invalid|unable|password|usuario|contrase/i.test(message)) {
        throw new Error("Usuario o contraseña no válidos.");
      }
      throw new Error(message || "ArcGIS no ha devuelto una sesión.");
    }
    await assertFeatureAccess(data.token);
    saveSession({
      token: data.token,
      expires: data.expires,
      userId: username,
      portal: PORTAL
    });
  }

  function showApp() {
    $("loginScreen").hidden = true;
    $("app").hidden = false;
    $("sessionUser").textContent = session.userId;
  }

  async function idsInsideGeometry(layer, geometry) {
    const ids = await layer.queryObjectIds({
      geometry: geometry,
      spatialRelationship: "intersects",
      where: NOT_DELETED
    });
    return ids || [];
  }

  async function hideElementsOfExcludedAreas(FeatureLayer, geometryEngine, juegoLayer, bioLayer) {
    const lookup = new FeatureLayer({ url: FEATURE_URL + "/2", outFields: ["CODIGO"] });
    const result = await lookup.queryFeatures({
      where: NOT_DELETED + " AND TIPO IN (" + excludedTypeSql() + ")",
      outFields: ["CODIGO"],
      returnGeometry: true,
      num: 2000
    });
    const features = result.features || [];
    const codes = features.map(function (feature) { return feature.attributes.CODIGO; }).filter(Boolean);
    const polygons = features.map(function (feature) { return feature.geometry; }).filter(Boolean);
    let merged = null;
    if (polygons.length === 1) merged = polygons[0];
    else if (polygons.length > 1) {
      try { merged = geometryEngine.union(polygons); } catch (err) { merged = null; }
    }

    async function insideIds(layer) {
      if (merged) {
        try { return await idsInsideGeometry(layer, merged); } catch (err) {}
      }
      const found = new Set();
      for (let i = 0; i < polygons.length; i++) {
        try {
          const ids = await idsInsideGeometry(layer, polygons[i]);
          ids.forEach(function (id) { found.add(id); });
        } catch (err) {}
      }
      return Array.from(found);
    }

    async function areaField(layer) {
      try {
        await layer.load();
        const names = (layer.fields || []).map(function (field) { return field.name; });
        return names.filter(function (name) {
          return name === "AREA" || name === "COD_AREA" || name === "CODIGO_AREA" || /\.AREA$/.test(name);
        })[0] || null;
      } catch (err) {
        return null;
      }
    }

    async function apply(layer, codeField) {
      const parts = [NOT_DELETED];
      if (codeField && codes.length) {
        parts.push("(" + codeField + " IS NULL OR " + codeField + " NOT IN (" + codes.map(sqlStr).join(",") + "))");
      }
      const ids = await insideIds(layer);
      if (ids.length) parts.push("OBJECTID NOT IN (" + ids.join(",") + ")");
      layer.definitionExpression = parts.join(" AND ");
    }

    const bioField = await areaField(bioLayer);
    await apply(juegoLayer, "CODIGO");
    await apply(bioLayer, bioField);
  }

  function boot() {
    showApp();
    if (view) return;
    require([
      "esri/config",
      "esri/identity/IdentityManager",
      "esri/Map",
      "esri/views/MapView",
      "esri/layers/FeatureLayer",
      "esri/Graphic",
      "esri/widgets/Home",
      "esri/widgets/ScaleBar",
      "esri/geometry/geometryEngine",
      "esri/layers/GraphicsLayer"
    ], function (esriConfig, IdentityManager, Map, MapView, FeatureLayer, Graphic, Home, ScaleBar, geometryEngine, GraphicsLayer) {
      esriConfig.request.trustedServers.push("https://sit.rivasciudad.es");
      [SERVER, FEATURE_URL, PORTAL + "/sharing/rest"].forEach(function (server) {
        IdentityManager.registerToken({
          server: server,
          token: session.token,
          expires: session.expires,
          userId: session.userId,
          ssl: true
        });
      });

      const map = new Map({ basemap: "streets-navigation-vector" });
      focusLayer = new GraphicsLayer({ listMode: "hide", title: "Resalte de actuaciones" });
      addFocusGraphics = function (graphics) {
        if (!focusLayer) return;
        focusLayer.removeAll();
        graphics.forEach(function (item) {
          focusLayer.add(new Graphic({ geometry: item.geometry, symbol: item.symbol }));
        });
        if (map.layers.includes(focusLayer)) map.reorder(focusLayer, map.layers.length - 1);
        else map.add(focusLayer);
      };
      const terminoLayer = new FeatureLayer({
        url: TERMINO_MUNICIPAL_URL,
        title: "Término municipal",
        popupEnabled: false,
        legendEnabled: false,
        labelingInfo: null,
        renderer: {
          type: "simple",
          symbol: {
            type: "simple-fill",
            color: [0, 0, 0, 0],
            outline: { color: [28, 28, 28, 1], width: 1.15, style: "dash" }
          }
        }
      });
      const areaLayer = new FeatureLayer({
        url: FEATURE_URL + "/2",
        title: "Áreas",
        outFields: ["*"],
        definitionExpression: includedAreaWhere(),
        popupEnabled: false,
        renderer: areaSoilRenderer(),
        labelsVisible: false
      });
      const juegoLayer = new FeatureLayer({
        url: FEATURE_URL + "/0",
        title: "Juegos",
        outFields: ["*"],
        definitionExpression: "ELIMINADO <> 'SI' OR ELIMINADO IS NULL",
        popupEnabled: false,
        labelsVisible: true,
        labelingInfo: codeLabel(JUEGO_LABEL, 5000),
        renderer: uniqueIcons("TIPO", [
          ["Balancin", "Iconos 2D/balancin.png", 24],
          ["Calistenia", "Iconos 2D/Calistemia.png", 32],
          ["Cama Elástica", "Iconos 2D/CamaElastica.png", 24],
          ["Carrusel", "Iconos 2D/carrusel.png", 24],
          ["Columpio", "Iconos 2D/columpio.png", 24],
          ["Compacto", "Iconos 2D/Multijuego.png", 24],
          ["Elemento juego", "Iconos 2D/Elemento_juego.png", 24],
          ["Juego trepar", "Iconos 2D/trepar.png", 24],
          ["Red", "Iconos 2D/Red.png", 24],
          ["Sin datos", "Iconos 2D/cancelar.png", 22],
          ["Tirolina", "Iconos 2D/tirolina.png", 24],
          ["Tobogan", "Iconos 2D/tobogan.png", 24],
          ["Tobogán", "Iconos 2D/tobogan.png", 24]
        ], "Iconos 2D/Elemento_juego.png", 24)
      });
      const bioLayer = new FeatureLayer({
        url: FEATURE_URL + "/1",
        title: "Biosaludables",
        outFields: ["*"],
        definitionExpression: "ELIMINADO <> 'SI' OR ELIMINADO IS NULL",
        popupEnabled: false,
        labelsVisible: true,
        labelingInfo: codeLabel(BIO_LABEL, 5000),
        renderer: {
          type: "unique-value",
          valueExpression: 'When(Lower($feature.ELEMENTO) == "ping pong", "ping", $feature.TIPO == "CALISTENIA", "calistenia", "bio")',
          defaultSymbol: markerSymbol("Iconos 2D/Biosaludable.png", 32),
          uniqueValueInfos: [
            { value: "ping", symbol: markerSymbol("Iconos 2D/ping-pong.png", 32) },
            { value: "calistenia", symbol: markerSymbol("Iconos 2D/Calistemia.png", 32) },
            { value: "bio", symbol: markerSymbol("Iconos 2D/Biosaludable.png", 32) }
          ]
        }
      });
      featureLayers = { area: areaLayer, juego: juegoLayer, bio: bioLayer };
      tableLayers = {
        area: new FeatureLayer({ url: FEATURE_URL + "/3" }),
        juego: new FeatureLayer({ url: FEATURE_URL + "/4" }),
        bio: new FeatureLayer({ url: FEATURE_URL + "/5" })
      };
      map.addMany([terminoLayer, areaLayer, juegoLayer, bioLayer]);
      view = new MapView({
        container: "viewDiv",
        map: map,
        center: [-3.54, 40.355],
        zoom: 13,
        popupEnabled: true,
        highlightOptions: {
          color: [0, 122, 61, 1],
          haloColor: [210, 31, 44, 1],
          haloOpacity: 1,
          fillOpacity: 0.35
        }
      });
      view.popup.dockEnabled = false;
      view.popup.autoCloseEnabled = false;
      view.ui.add(new Home({ view: view }), "top-left");
      view.ui.add($("btnBasemap"), "top-left");
      view.ui.add(new ScaleBar({ view: view, unit: "metric" }), "bottom-right");
      view.on("click", onMapClick);
      juegoLayer.visible = false;
      bioLayer.visible = false;
      hideElementsOfExcludedAreas(FeatureLayer, geometryEngine, juegoLayer, bioLayer).catch(function () {}).then(function () {
        juegoLayer.visible = $("toggleJuego").checked;
        bioLayer.visible = $("toggleBio").checked;
        snapshotLayers();
        if (mapFocus) applyMapFocus();
      });
      view.when(function () {
        return areaLayer.queryFeatures({
          where: includedAreaWhere(),
          outFields: ["OBJECTID", "CODIGO", "COD_AREA", "NOMBRE", "TIPO"],
          returnGeometry: true,
          outSpatialReference: view.spatialReference
        });
      }).then(function (result) {
        const graphics = result.features.map(function (feature) {
          const geom = feature.geometry && (feature.geometry.centroid || (feature.geometry.extent && feature.geometry.extent.center));
          if (!geom) return null;
          return new Graphic({
            geometry: geom,
            attributes: {
              OBJECTID: feature.attributes.OBJECTID,
              CODIGO: feature.attributes.CODIGO || "",
              COD_AREA: feature.attributes.COD_AREA || "",
              NOMBRE: feature.attributes.NOMBRE || "",
              TIPO: feature.attributes.TIPO || "",
              ICON: areaIconKey(feature.attributes.TIPO)
            }
          });
        }).filter(Boolean);
        areaIconLayer = new FeatureLayer({
          source: graphics,
          objectIdField: "OBJECTID",
          geometryType: "point",
          spatialReference: view.spatialReference,
          title: "Iconos de área",
          popupEnabled: false,
          labelsVisible: true,
          labelingInfo: codeLabel(AREA_LABEL, 8000),
          fields: [
            { name: "OBJECTID", type: "oid" },
            { name: "CODIGO", type: "string" },
            { name: "COD_AREA", type: "string" },
            { name: "NOMBRE", type: "string" },
            { name: "TIPO", type: "string" },
            { name: "ICON", type: "string" }
          ],
          renderer: uniqueIcons("ICON", [
            ["infantil", "parque-de-atracciones.png", 36],
            ["agua", "splash-icon.png", 36],
            ["bio", "AreasBiosaludables.png", 36],
            ["calistenia", "AreasCalistenia.png", 36]
          ], "parque-de-atracciones.png", 36)
        });
        map.add(areaIconLayer, 2);
        areaIconLayer.visible = $("toggleArea").checked;
        if (layerSnapshot && !layerSnapshot.icons) layerSnapshot.icons = packLayer(areaIconLayer);
        if (mapFocus) applyMapFocus();
      }).catch(function () {});
      $("toggleArea").addEventListener("change", function () {
        areaLayer.visible = $("toggleArea").checked;
        if (areaIconLayer) areaIconLayer.visible = $("toggleArea").checked;
      });
      $("toggleJuego").addEventListener("change", function () { juegoLayer.visible = $("toggleJuego").checked; });
      $("toggleBio").addEventListener("change", function () { bioLayer.visible = $("toggleBio").checked; });
      Promise.all([areaLayer.load(), juegoLayer.load(), bioLayer.load(), tableLayers.area.load(), tableLayers.juego.load(), tableLayers.bio.load()]).then(function () {
        refreshDashboard();
        startActuacionesPolling();
      }).catch(function () {
        setStatus($("resultStatus"), "No se ha podido abrir el servicio de edición. Vuelve a entrar.", true);
      });
    });
  }

  function closeBasemapMenu() {
    const menu = $("basemapMenu");
    if (!menu || menu.hidden) return;
    menu.hidden = true;
    $("btnBasemap").setAttribute("aria-expanded", "false");
  }

  async function onMapClick(event) {
    closeBasemapMenu();
    const include = [featureLayers.juego, featureLayers.bio, featureLayers.area];
    if (areaIconLayer) include.push(areaIconLayer);
    const hit = await view.hitTest(event, { include: include });
    const found = pickMapHit(hit.results);
    if (!found) {
      clearSelection();
      return;
    }
    const layer = found.graphic.layer;
    const attributes = found.graphic.attributes || {};
    if (attributes.OBJECTID == null && found.graphic.getObjectId) attributes.OBJECTID = found.graphic.getObjectId();
    if (areaIconLayer && layer === areaIconLayer) {
      const full = await featureLayers.area.queryFeatures({
        objectIds: [attributes.OBJECTID],
        outFields: ["*"],
        returnGeometry: true
      });
      if (full.features[0]) await openFeature("area", full.features[0].attributes, full.features[0].geometry);
      return;
    }
    const kind = layer === featureLayers.juego ? "juego" : (layer === featureLayers.bio ? "bio" : "area");
    await openFeature(kind, attributes, found.graphic.geometry);
  }

  function pickMapHit(results) {
    const hits = (results || []).filter(function (item) { return item.graphic && item.graphic.layer; });
    hits.sort(function (a, b) { return hitRank(a.graphic.layer) - hitRank(b.graphic.layer); });
    return hits[0] || null;
  }

  function hitRank(layer) {
    if (layer === featureLayers.juego || layer === featureLayers.bio) return 0;
    if (areaIconLayer && layer === areaIconLayer) return 1;
    return 2;
  }

  async function highlight(kind, objectId) {
    if (highlightHandle) highlightHandle.remove();
    const layerView = await view.whenLayerView(featureLayers[kind]);
    if (!selectedFeature || selectedFeature.kind !== kind || selectedFeature.attributes.OBJECTID !== objectId) return;
    highlightHandle = layerView.highlight(objectId);
  }

  function setResultsVisible(visible) {
    const block = document.querySelector(".results-block");
    if (!block) return;
    block.hidden = !visible;
    if (visible) block.classList.remove("is-collapsed");
    const toggle = $("btnToggleResults");
    if (toggle) {
      toggle.textContent = "Ocultar tabla";
      toggle.setAttribute("aria-expanded", "true");
    }
  }

  async function openFeature(kind, attributes, geometry) {
    const request = ++popupToken;
    setResultsVisible(false);
    selectedFeature = { kind: kind, attributes: attributes, geometry: geometry || null };
    resetForm();
    const code = featureCode(kind, attributes);
    $("ficha").hidden = false;
    $("ficha").scrollIntoView({ behavior: "smooth", block: "start" });
    $("fichaKind").textContent = TARGETS[kind].label;
    $("fichaTitle").textContent = parentName(kind, attributes) || code || "Sin nombre";
    const extra = [code ? "Código " + code : "Sin código", attributes.TIPO || ""].filter(Boolean).join(" · ");
    $("fichaMeta").textContent = extra;
    if (!code) {
      $("fichaHistory").innerHTML = '<p class="hint">Este elemento no tiene código y no se puede asociar una actuación.</p>';
      $("btnSave").disabled = true;
    } else {
      $("btnSave").disabled = false;
    }
    if (geometry && view) {
      try {
        if (geometry.type === "point") await view.goTo({ target: geometry, zoom: Math.max(view.zoom, 17) });
        else await view.goTo(geometry);
      } catch (err) {}
    }
    if (request !== popupToken) return;
    if (attributes.OBJECTID != null) highlight(kind, attributes.OBJECTID);
    showElementPopup(kind, attributes, geometry);
    if (code) await loadHistory(kind, code);
  }

  async function loadHistory(kind, code) {
    const target = TARGETS[kind];
    const result = await tableLayers[kind].queryFeatures({
      where: target.relField + " = " + sqlStr(code),
      outFields: ["*"],
      orderByFields: "CREATED_DATE DESC",
      returnGeometry: false,
      num: 200
    });
    const rows = result.features.filter(function (feature) {
      return inDateRange(feature.attributes.CREATED_DATE);
    }).map(function (feature) {
      return { kind: kind, attributes: feature.attributes, parent: selectedFeature.attributes };
    }).sort(compareActuaciones);
    const caption = rows.length
      ? '<p class="history-caption">' + rows.length + (rows.length === 1 ? " actuación" : " actuaciones") +
        ", de la más reciente a la más antigua por fecha de actuación.</p>"
      : "";
    $("fichaHistory").innerHTML = rows.length
      ? caption + rows.map(function (row, index) { return historyCard(row, index, rows.length); }).join("")
      : '<p class="hint">No hay actuaciones de este elemento con el filtro actual.</p>';
    $("fichaHistory").querySelectorAll("[data-oid]").forEach(function (button) {
      button.addEventListener("click", function () {
        const row = rows.find(function (item) { return String(item.attributes.OBJECTID) === button.dataset.oid; });
        if (row) showActuacion(row, button);
      });
    });
    if (editingOid != null) {
      const current = $("fichaHistory").querySelector('[data-oid="' + editingOid + '"]');
      if (current) current.classList.add("is-active");
    }
  }

  function stateClass(attrs) {
    const state = actuacionState(attrs);
    if (state === "abierta") return "is-abierta";
    if (state === "cerrada") return "is-cerrada";
    return "";
  }

  function stateBadge(attrs) {
    const state = actuacionState(attrs);
    if (state === "abierta") return '<em class="badge is-abierta">Abierta</em>';
    if (state === "cerrada") return '<em class="badge is-cerrada">Cerrada</em>';
    return "";
  }

  function formatDay(value) {
    const iso = toInputDate(value);
    return iso ? iso.split("-").reverse().join("/") : "";
  }

  function compareActuaciones(a, b) {
    const ai = dateStamp(a.attributes.A_I_F_INCIDENCIA);
    const bi = dateStamp(b.attributes.A_I_F_INCIDENCIA);
    if (ai != null && bi != null && ai !== bi) return bi - ai;
    if (ai != null && bi == null) return -1;
    if (ai == null && bi != null) return 1;
    const ac = createdTime(a.attributes.CREATED_DATE);
    const bc = createdTime(b.attributes.CREATED_DATE);
    if (ac == null && bc == null) return 0;
    if (ac == null) return 1;
    if (bc == null) return -1;
    return bc - ac;
  }

  function historyCard(row, index, total) {
    const id = actuacionCode(row.kind, row.attributes.OBJECTID);
    const rank = (index || 0) + 1;
    const place = rank === 1 ? "Más reciente" : (rank === total ? "Más antigua" : "Orden " + rank);
    const fecha = formatDay(row.attributes.A_I_F_INCIDENCIA);
    const fechaLine = fecha
      ? place + " · Fecha de actuación " + fecha
      : place + " · Sin fecha de actuación";
    return '<button type="button" class="history-card ' + stateClass(row.attributes) + '" data-oid="' + row.attributes.OBJECTID + '">' +
      '<span class="history-order">' + rank + '</span><span class="history-body">' +
      stateBadge(row.attributes) +
      '<strong>' + esc(id) + '</strong>' +
      '<span class="history-date">' + esc(fechaLine) + '</span>' +
      '<span>Registrada ' + esc(formatDateTime(row.attributes.CREATED_DATE)) +
      ' · ' + esc(row.attributes.CREATED_USER || "Sin usuario") +
      ' · Incidencia ' + esc(row.attributes.A_I_INCIDENCIA || "NO") + '</span></span></button>';
  }

  async function loadActuacionAttachments(kind, objectId) {
    const box = $("adjuntoList");
    if (!box) return;
    box.textContent = "";
    try {
      const result = await tableLayers[kind].queryAttachments({ objectIds: [objectId] });
      const infos = (result && (result[objectId] || result[String(objectId)])) || [];
      infos.forEach(function (info) {
        if (!info || !info.url) return;
        const url = attachmentUrl(info.url);
        const item = document.createElement("a");
        item.href = url;
        item.target = "_blank";
        item.rel = "noopener";
        if (isImageAttachment(info)) {
          const img = document.createElement("img");
          img.src = url;
          img.alt = info.name || "Fotografía";
          item.appendChild(img);
        } else {
          item.textContent = info.name || "Abrir adjunto";
        }
        box.appendChild(item);
      });
    } catch (err) {
      box.textContent = "No se han podido cargar las fotografías.";
    }
  }

  async function uploadActuacionAttachment(kind, objectId) {
    const input = $("fAdjunto");
    const file = input && input.files && input.files[0];
    if (!file) return false;
    const form = new FormData();
    form.append("attachment", file, file.name);
    form.append("f", "json");
    form.append("token", session.token);
    const response = await fetch(FEATURE_URL + "/" + TARGETS[kind].tableId + "/" + objectId + "/addAttachment", {
      method: "POST",
      body: form
    });
    const data = await response.json();
    const added = data.addAttachmentResult;
    if (data.error || (added && added.error)) {
      const detail = (added && added.error && (added.error.description || added.error.message)) || (data.error && data.error.message);
      throw new Error(detail || "No se ha podido adjuntar la fotografía.");
    }
    input.value = "";
    return true;
  }

  function showActuacion(row, button) {
    editingOid = row.attributes.OBJECTID;
    activeActuacion = row;
    fillForm(row.attributes);
    if ($("fAdjunto")) $("fAdjunto").value = "";
    loadActuacionAttachments(row.kind, row.attributes.OBJECTID);
    $("btnSave").textContent = "Guardar actuación";
    $("btnPrintOne").disabled = false;
    $("btnDelete").disabled = false;
    $("formStatus").textContent = "Editando " + actuacionCode(row.kind, row.attributes.OBJECTID);
    document.querySelectorAll(".history-card").forEach(function (card) { card.classList.remove("is-active"); });
    if (button) {
      button.classList.add("is-active");
      button.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }

  async function findParent(kind, code) {
    if (!code) return null;
    const result = await featureLayers[kind].queryFeatures({
      where: TARGETS[kind].keyField + " = " + sqlStr(code),
      outFields: ["*"],
      returnGeometry: true,
      num: 1
    });
    return result.features[0] || null;
  }

  function actuacionFilterWhere(kind) {
    const text = $("fCodigo").value.trim();
    const parsed = parseActuacionId(text);
    const exactId = parsed && /^[AJB]-?\d+$/i.test(text);
    const parts = [];
    if (exactId) {
      if (parsed.kind !== kind || selectedKinds().indexOf(parsed.kind) === -1) return null;
      parts.push("OBJECTID = " + parsed.objectId);
    } else if (text) {
      parts.push(sqlEquals(TARGETS[kind].relField, text));
    }
    return parts.join(" AND ") || "1=1";
  }

  function dateStamp(value) {
    const iso = toInputDate(value);
    if (!iso) return null;
    const parts = iso.split("-");
    return new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2])).getTime();
  }

  function actuacionState(attrs) {
    const opened = dateStamp(attrs.A_I_F_INCIDENCIA) != null;
    const closed = dateStamp(attrs.A_I_F_RESOLUCION) != null;
    if (opened && !closed) return "abierta";
    if (closed) return "cerrada";
    return "sinfecha";
  }

  function estadoFiltro() {
    const checked = document.querySelector('input[name="fEstado"]:checked');
    return checked ? checked.value : "todas";
  }

  function matchesEstado(attrs) {
    const mode = estadoFiltro();
    if (mode === "todas") return true;
    return actuacionState(attrs) === mode;
  }

  function estadoLabel() {
    const mode = estadoFiltro();
    if (mode === "abierta") return "Abiertas";
    if (mode === "cerrada") return "Cerradas";
    return "Todas";
  }

  function formatCount(value) {
    return Number(value || 0).toLocaleString("es-ES");
  }

  function filterCaption() {
    const from = $("fDesde").value;
    const to = $("fHasta").value;
    const show = function (iso) {
      return iso ? iso.split("-").reverse().join("/") : "…";
    };
    const ambito = $("fAmbito").selectedOptions[0] ? $("fAmbito").selectedOptions[0].textContent : "";
    const bits = [show(from) + " – " + show(to), ambito, estadoLabel()];
    const code = $("fCodigo").value.trim();
    if (code) bits.push(code);
    return bits.join(" · ");
  }

  function packLayer(layer) {
    return {
      where: layer.definitionExpression || "1=1",
      renderer: layer.renderer
    };
  }

  function snapshotLayers() {
    if (!featureLayers.area || layerSnapshot) return;
    layerSnapshot = {
      area: packLayer(featureLayers.area),
      juego: packLayer(featureLayers.juego),
      bio: packLayer(featureLayers.bio),
      icons: areaIconLayer ? packLayer(areaIconLayer) : null
    };
  }

  function focusSymbol(kind, state) {
    const color = state === "cerrada" ? [0, 122, 61, 1] : [210, 31, 44, 1];
    if (kind === "area") {
      return {
        type: "simple",
        symbol: {
          type: "simple-fill",
          color: [color[0], color[1], color[2], 0.38],
          outline: { color: color, width: 2 }
        }
      };
    }
    return {
      type: "simple",
      symbol: {
        type: "simple-marker",
        style: "circle",
        size: kind === "icons" ? 16 : 13,
        color: color,
        outline: { color: [255, 255, 255, 1], width: 1.5 }
      }
    };
  }

  function focusWhere(base, field, codes) {
    const limit = codes.length
      ? field + " IN (" + codes.map(sqlStr).join(",") + ")"
      : "1=0";
    return "(" + (base || "1=1") + ") AND (" + limit + ")";
  }

  function clearFocusGraphics() {
    if (focusLayer) focusLayer.removeAll();
    focusToken += 1;
  }

  function restoreLayerLook() {
    if (!layerSnapshot) return;
    const plan = [
      [featureLayers.area, layerSnapshot.area],
      [featureLayers.juego, layerSnapshot.juego],
      [featureLayers.bio, layerSnapshot.bio],
      [areaIconLayer, layerSnapshot.icons]
    ];
    plan.forEach(function (item) {
      if (!item[0] || !item[1]) return;
      item[0].renderer = item[1].renderer;
      item[0].definitionExpression = item[1].where;
    });
  }

  function focusColor(state) {
    return state === "cerrada" ? [0, 122, 61, 1] : [210, 31, 44, 1];
  }

  function ringSymbol(geometry, state, wide) {
    const color = focusColor(state);
    const ink = wide ? [color[0], color[1], color[2], 0.4] : color;
    if (geometry && geometry.type !== "point") {
      return {
        type: "simple-fill",
        color: [0, 0, 0, 0],
        outline: { color: ink, width: wide ? 14 : 6 }
      };
    }
    return {
      type: "simple-marker",
      style: "circle",
      size: wide ? 48 : 36,
      color: [0, 0, 0, 0],
      outline: { color: ink, width: wide ? 8 : 5 }
    };
  }

  async function paintMapHalo(state) {
    const request = ++focusToken;
    restoreLayerLook();
    if (!dashboardCodes || !dashboardCodes[state]) return;
    const codes = dashboardCodes[state];
    const found = [];
    async function pull(layer, field, list) {
      if (!layer || !list.length) return;
      const result = await layer.queryFeatures({
        where: field + " IN (" + list.map(sqlStr).join(",") + ")",
        returnGeometry: true,
        outFields: ["OBJECTID"]
      });
      if (request !== focusToken) return;
      (result.features || []).forEach(function (feature) {
        if (!feature.geometry) return;
        found.push({ geometry: feature.geometry, symbol: ringSymbol(feature.geometry, state, true) });
        found.push({ geometry: feature.geometry, symbol: ringSymbol(feature.geometry, state, false) });
      });
    }
    await pull(featureLayers.area, "CODIGO", Object.keys(codes.area || {}));
    if (request !== focusToken) return;
    await pull(featureLayers.juego, "CODIGO_G", Object.keys(codes.juego || {}));
    if (request !== focusToken) return;
    await pull(featureLayers.bio, "CODIGO", Object.keys(codes.bio || {}));
    if (request !== focusToken) return;
    addFocusGraphics(found);
    updateMapFocusUi();
  }

  function paintMapOnly(state) {
    clearFocusGraphics();
    if (!layerSnapshot || !dashboardCodes || !dashboardCodes[state]) return;
    const codes = dashboardCodes[state];
    const plan = [
      [featureLayers.area, layerSnapshot.area, "area", "CODIGO"],
      [featureLayers.juego, layerSnapshot.juego, "juego", "CODIGO_G"],
      [featureLayers.bio, layerSnapshot.bio, "bio", "CODIGO"],
      [areaIconLayer, layerSnapshot.icons, "icons", "CODIGO"]
    ];
    plan.forEach(function (item) {
      const layer = item[0];
      const base = item[1];
      if (!layer || !base) return;
      const list = item[2] === "icons" ? Object.keys(codes.area || {}) : Object.keys(codes[item[2]] || {});
      layer.renderer = focusSymbol(item[2], state);
      layer.definitionExpression = focusWhere(base.where, item[3], list);
    });
    updateMapFocusUi();
  }

  function applyMapFocus() {
    if (!mapFocus) return;
    if (mapFocus.mode === "halo") paintMapHalo(mapFocus.state);
    else paintMapOnly(mapFocus.state);
  }

  function showAllElements() {
    mapFocus = null;
    clearFocusGraphics();
    restoreLayerLook();
    updateMapFocusUi();
  }

  function showFocusedElements(state, mode) {
    if (state !== "abierta" && state !== "cerrada") return;
    mapFocus = { state: state, mode: mode === "only" ? "only" : "halo" };
    updateMapFocusUi();
    if (!layerSnapshot || (mapFocus.mode === "halo" && !focusLayer)) {
      $("mapFocusNote").textContent = "Preparando el mapa…";
      return;
    }
    if (!dashboardCodes) {
      $("mapFocusNote").textContent = "Calculando los elementos del filtro…";
      return;
    }
    applyMapFocus();
  }

  function updateMapFocusUi() {
    const state = mapFocus && mapFocus.state;
    const mode = mapFocus && mapFocus.mode;
    const pie = $("dashPie");
    if (pie) {
      pie.classList.toggle("is-open", mode === "halo" && state === "abierta");
      pie.classList.toggle("is-closed", mode === "halo" && state === "cerrada");
    }
    document.querySelectorAll(".pie-legend").forEach(function (button) {
      button.classList.toggle("is-on", mode === "halo" && button.dataset.focus === state);
    });
    document.querySelectorAll(".kpi[data-focus]").forEach(function (button) {
      button.classList.toggle("is-on", mode === "only" && button.dataset.focus === state);
    });
    const note = $("mapFocusNote");
    if (!note) return;
    if (mode === "halo" && state === "abierta") note.textContent = "Borde rojo en los elementos con actuaciones abiertas.";
    else if (mode === "halo" && state === "cerrada") note.textContent = "Borde verde en los elementos con actuaciones cerradas.";
    else if (mode === "only" && state === "abierta") note.textContent = "Solo los elementos con actuaciones abiertas.";
    else if (mode === "only" && state === "cerrada") note.textContent = "Solo los elementos con actuaciones cerradas.";
    else note.textContent = "";
  }

  function pieSlice(event) {
    const pie = $("dashPie");
    if (!pie) return null;
    const box = pie.getBoundingClientRect();
    const dx = event.clientX - (box.left + box.width / 2);
    const dy = event.clientY - (box.top + box.height / 2);
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 43 || dist > box.width / 2) return null;
    const open = Number(pie.dataset.open) || 0;
    const closed = Number(pie.dataset.closed) || 0;
    const total = open + closed;
    if (!total) return null;
    const deg = (Math.atan2(dy, dx) * 180 / Math.PI + 90 + 360) % 360;
    const openDeg = open / total * 360;
    if (deg < openDeg) return "abierta";
    return "cerrada";
  }

  function paintPie(open, closed) {
    const total = open + closed;
    const pie = $("dashPie");
    $("dashPieTotal").textContent = total ? formatCount(total) : "—";
    if (!total) {
      pie.style.background = "#e4ece7";
      pie.dataset.open = "0";
      pie.dataset.closed = "0";
      pie.setAttribute("aria-label", "Sin actuaciones en el filtro");
      return;
    }
    const openEnd = open / total * 100;
    pie.dataset.open = String(open);
    pie.dataset.closed = String(closed);
    pie.style.background = "conic-gradient(#d21f2c 0 " + openEnd + "%, #007A3D " + openEnd + "% 100%)";
    pie.setAttribute("aria-label", formatCount(open) + " abiertas, " + formatCount(closed) + " cerradas");
  }

  function paintDashboard(stats) {
    const open = stats.abierta;
    const closed = stats.cerrada;
    $("dashOpen").textContent = formatCount(open);
    $("dashClosed").textContent = formatCount(closed);
    paintPie(open, closed);
    $("dashFilters").textContent = filterCaption();
    const labels = { area: "Áreas", juego: "Juegos", bio: "Biosaludables" };
    $("dashKinds").innerHTML = stats.kinds.map(function (kind) {
      const row = stats.byKind[kind];
      return "<li><strong>" + esc(labels[kind]) + "</strong><em>" +
        formatCount(row.abierta) + " abiertas · " + formatCount(row.cerrada) + " cerradas</em></li>";
    }).join("");
    $("dashIncidents").textContent = formatCount(stats.incidenciaAbierta);
    $("dashAge").textContent = stats.ageCount ? formatCount(stats.ageAvg) + " días" : "—";
    $("dashOldest").textContent = stats.oldest == null ? "—" : formatCount(stats.oldest) + " días";
    $("dashTotal").textContent = formatCount(open + closed);
    $("dashNote").textContent = stats.truncated
      ? "Hay más actuaciones de las que se han podido contar."
      : "";
  }

  async function refreshDashboard() {
    if (!tableLayers.area) return;
    const request = ++dashboardToken;
    $("dashNote").textContent = "Calculando…";
    try {
      const kinds = selectedKinds();
      const stats = {
        abierta: 0,
        cerrada: 0,
        sinfecha: 0,
        incidenciaAbierta: 0,
        total: 0,
        ageSum: 0,
        ageCount: 0,
        ageAvg: 0,
        oldest: null,
        truncated: false,
        kinds: kinds,
        codes: {
          abierta: { area: {}, juego: {}, bio: {} },
          cerrada: { area: {}, juego: {}, bio: {} }
        },
        byKind: {
          area: { abierta: 0, cerrada: 0 },
          juego: { abierta: 0, cerrada: 0 },
          bio: { abierta: 0, cerrada: 0 }
        }
      };
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      for (const kind of kinds) {
        const where = actuacionFilterWhere(kind);
        if (!where) continue;
        const features = await queryActuacionesInRange(tableLayers[kind], where, ["CREATED_DATE", "A_I_F_INCIDENCIA", "A_I_F_RESOLUCION", "A_I_INCIDENCIA", TARGETS[kind].relField]);
        if (request !== dashboardToken) return;
        features.forEach(function (feature) {
          const attrs = feature.attributes || {};
          if (!inDateRange(attrs.CREATED_DATE) || !matchesEstado(attrs)) return;
          const state = actuacionState(attrs);
          stats[state] += 1;
          stats.total += 1;
          if (state === "abierta" || state === "cerrada") {
            stats.byKind[kind][state] += 1;
            const code = attrs[TARGETS[kind].relField];
            if (code) stats.codes[state][kind][code] = true;
          }
          if (state === "abierta" && attrs.A_I_INCIDENCIA === "SI") stats.incidenciaAbierta += 1;
          if (state === "abierta") {
            const opened = dateStamp(attrs.A_I_F_INCIDENCIA);
            if (opened != null) {
              const days = Math.max(0, Math.round((today.getTime() - opened) / 86400000));
              stats.ageSum += days;
              stats.ageCount += 1;
              if (stats.oldest == null || days > stats.oldest) stats.oldest = days;
            }
          }
        });
      }
      if (request !== dashboardToken) return;
      stats.ageAvg = stats.ageCount ? Math.round(stats.ageSum / stats.ageCount) : 0;
      dashboardCodes = stats.codes;
      paintDashboard(stats);
      if (mapFocus) applyMapFocus();
    } catch (err) {
      if (request !== dashboardToken) return;
      $("dashNote").textContent = "No se ha podido calcular el cuadro de mando.";
    }
  }

  function scheduleDashboard() {
    clearTimeout(scheduleDashboard.timer);
    scheduleDashboard.timer = setTimeout(refreshDashboard, 350);
  }

  function resultsPanelVisible() {
    const block = document.querySelector(".results-block");
    return !!(block && !block.hidden);
  }

  async function queryFilteredActuaciones() {
    const text = $("fCodigo").value.trim();
    const parsed = parseActuacionId(text);
    const kinds = selectedKinds();
    if (parsed && kinds.indexOf(parsed.kind) !== -1 && /^[AJB]-?\d+$/i.test(text)) {
      const result = await tableLayers[parsed.kind].queryFeatures({
        where: "OBJECTID = " + parsed.objectId,
        outFields: ["*"],
        returnGeometry: false,
        num: 1
      });
      const feature = result.features[0];
      if (!feature) return { mode: "empty", rows: [], message: "No existe la actuación " + text.toUpperCase() + ".", isError: true };
      const code = feature.attributes[TARGETS[parsed.kind].relField];
      const parent = await findParent(parsed.kind, code);
      return {
        mode: "single",
        rows: [{ kind: parsed.kind, attributes: feature.attributes, parent: parent && parent.attributes }],
        parent: parent,
        message: "Actuación " + actuacionCode(parsed.kind, feature.attributes.OBJECTID) + "."
      };
    }

    const rows = [];
    for (const kind of kinds) {
      const target = TARGETS[kind];
      const where = text ? sqlEquals(target.relField, text) : "1=1";
      const features = await queryActuacionesInRange(tableLayers[kind], where, ["*"]);
      features.forEach(function (feature) {
        if (!matchesEstado(feature.attributes)) return;
        rows.push({ kind: kind, attributes: feature.attributes, parent: null });
      });
    }
    rows.sort(compareActuaciones);
    await attachParents(rows);
    if (!rows.length && text) {
      const features = await searchFeatures(text, kinds);
      return {
        mode: "features",
        rows: [],
        features: features,
        message: features.length
          ? "Sin actuaciones en el rango. Hay " + features.length + " elementos con ese código."
          : "Sin resultados.",
        isError: !features.length
      };
    }
    return {
      mode: "list",
      rows: rows,
      message: rows.length + (rows.length === 1 ? " actuación." : " actuaciones.")
    };
  }

  async function refreshResultsList(options) {
    options = options || {};
    const data = await queryFilteredActuaciones();
    if (data.mode === "empty") {
      currentRows = [];
      if (!options.silent) setResultsVisible(true);
      renderResults([]);
      setStatus($("resultStatus"), data.message, true);
      $("btnPrintList").disabled = true;
      return data;
    }
    if (data.mode === "single") {
      currentRows = data.rows;
      setStatus($("resultStatus"), data.message, false);
      $("btnPrintList").disabled = false;
      if (options.openSingle) {
        if (data.parent) await openFeature(data.rows[0].kind, data.parent.attributes, data.parent.geometry);
        else setResultsVisible(false);
        showActuacion(data.rows[0]);
      } else if (!options.silent) {
        renderResults(currentRows);
      } else {
        renderResults(currentRows);
        if ($("ficha") && !$("ficha").hidden) setResultsVisible(false);
      }
      return data;
    }
    if (data.mode === "features") {
      currentRows = [];
      renderFeatureHits(data.features);
      setStatus($("resultStatus"), data.message, !!data.isError);
      $("btnPrintList").disabled = true;
      return data;
    }
    currentRows = data.rows;
    renderResults(data.rows);
    setStatus($("resultStatus"), data.message, false);
    $("btnPrintList").disabled = !data.rows.length;
    return data;
  }

  async function searchActuaciones() {
    refreshDashboard();
    const text = $("fCodigo").value.trim();
    const parsed = parseActuacionId(text);
    const openSingle = !!(parsed && /^[AJB]-?\d+$/i.test(text));
    await refreshResultsList({ openSingle: openSingle });
  }

  async function syncActuacionesViews(options) {
    options = options || {};
    if (syncBusy) return;
    syncBusy = true;
    try {
      const tasks = [refreshDashboard()];
      if (options.reloadHistory && selectedFeature) {
        const code = featureCode(selectedFeature.kind, selectedFeature.attributes);
        if (code) tasks.push(loadHistory(selectedFeature.kind, code));
      }
      if (options.reloadResults && resultsPanelVisible()) {
        tasks.push(refreshResultsList({ silent: true }));
      }
      await Promise.all(tasks);
    } finally {
      syncBusy = false;
    }
  }

  function startActuacionesPolling() {
    stopActuacionesPolling();
    pollTimer = setInterval(function () {
      if (document.hidden || syncBusy || !tableLayers.area) return;
      if ($("btnSave") && $("btnSave").disabled) return;
      syncActuacionesViews({
        reloadHistory: !!(selectedFeature && $("ficha") && !$("ficha").hidden),
        reloadResults: resultsPanelVisible()
      }).catch(function () {});
    }, ACTUACIONES_POLL_MS);
  }

  function stopActuacionesPolling() {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  }

  async function attachParents(rows) {
    const byKind = { area: [], juego: [], bio: [] };
    rows.forEach(function (row) {
      const code = row.attributes[TARGETS[row.kind].relField];
      if (code) byKind[row.kind].push(code);
    });
    const parents = {};
    for (const kind of Object.keys(byKind)) {
      const codes = Array.from(new Set(byKind[kind]));
      if (!codes.length) continue;
      const result = await featureLayers[kind].queryFeatures({
        where: TARGETS[kind].keyField + " IN (" + codes.map(sqlStr).join(",") + ")",
        outFields: ["*"],
        returnGeometry: false,
        num: codes.length
      });
      result.features.forEach(function (feature) {
        parents[kind + "|" + feature.attributes[TARGETS[kind].keyField]] = feature.attributes;
      });
    }
    rows.forEach(function (row) {
      const code = row.attributes[TARGETS[row.kind].relField];
      row.parent = parents[row.kind + "|" + code] || null;
    });
  }

  async function searchFeatures(text, kinds) {
    const hits = [];
    for (const kind of kinds) {
      const where = TARGETS[kind].search.map(function (field) {
        return sqlEquals(field, text);
      }).join(" OR ");
      const result = await featureLayers[kind].queryFeatures({
        where: where,
        outFields: ["*"],
        returnGeometry: true,
        num: 30
      });
      result.features.forEach(function (feature) {
        hits.push({ kind: kind, attributes: feature.attributes, geometry: feature.geometry });
      });
    }
    return hits;
  }

  function stateText(attrs) {
    const state = actuacionState(attrs);
    if (state === "abierta") return "Abierta";
    if (state === "cerrada") return "Cerrada";
    return "Sin fechas";
  }

  function elementType(kind, attrs) {
    if (!attrs) return "—";
    const raw = String(attrs.TIPO || "").trim();
    const key = raw.toUpperCase();
    if (kind === "area") {
      if (key === "AREA INFANTIL") return "Área infantil";
      if (key === "JUEGOS DE AGUA" || key === "ZONA DE AGUA") return "Zona de agua";
      if (key === "CALISTENIA" || key === "AREA DEPORTE" || key === "AREA DE CALISTENIA") return "Área de calistenia";
    }
    if (!raw) return kind === "bio" ? "Biosaludable" : "—";
    const names = {
      "BALANCIN": "Balancín",
      "TOBOGAN": "Tobogán",
      "TIROLINA": "Tirolina",
      "COLUMPIO": "Columpio",
      "CARRUSEL": "Carrusel",
      "COMPACTO": "Compacto",
      "CALISTENIA": "Calistenia",
      "RED": "Red",
      "CAMA ELASTICA": "Cama elástica",
      "CAMA ELÁSTICA": "Cama elástica",
      "JUEGO TREPAR": "Juego de trepar",
      "ELEMENTO JUEGO": "Elemento de juego",
      "SIN DATOS": "Sin datos",
      "BIOSALUDABLE": "Biosaludable"
    };
    if (names[key]) return names[key];
    if (raw === raw.toUpperCase()) return raw.charAt(0) + raw.slice(1).toLowerCase();
    return raw;
  }

  function elementName(kind, attrs) {
    if (!attrs) return "—";
    if (kind === "area") return attrs.NOMBRE || "—";
    if (kind === "juego") return attrs.ELEMENTO || "—";
    return attrs.NAME || attrs.ELEMENTO || "—";
  }

  function columnFilterHead() {
    const fields = [
      ["actuacion", "Actuación"],
      ["elemento", "Elemento"],
      ["tipo", "Tipo"],
      ["nombre", "Nombre"],
      ["fecha", "Fecha"],
      ["creador", "Creador"],
      ["estado", "Estado"]
    ];
    return fields.map(function (field) {
      return "<th>" + field[1] +
        "<select data-filter=\"" + field[0] + "\" aria-label=\"Filtrar por " + field[1].toLowerCase() + "\">" +
        "<option value=\"\">Todos</option></select></th>";
    }).join("");
  }

  function filterOptionLabel(key, value) {
    if (key === "estado") {
      if (value === "abierta") return "Abierta";
      if (value === "cerrada") return "Cerrada";
      if (value === "sinfecha") return "Sin fechas";
    }
    return value;
  }

  function sortFilterValues(key, values) {
    if (key === "estado") {
      const order = { abierta: 0, cerrada: 1, sinfecha: 2 };
      return values.sort(function (a, b) {
        return (order[a] == null ? 9 : order[a]) - (order[b] == null ? 9 : order[b]);
      });
    }
    if (key === "fecha") {
      const stamp = function (value) {
        const parts = String(value).split("/");
        if (parts.length !== 3) return 0;
        return Number(parts[2]) * 10000 + Number(parts[1]) * 100 + Number(parts[0]);
      };
      return values.sort(function (a, b) { return stamp(b) - stamp(a); });
    }
    return values.sort(function (a, b) {
      return a.localeCompare(b, "es", { sensitivity: "base" });
    });
  }

  function applyColumnFilters() {
    const keys = ["actuacion", "elemento", "tipo", "nombre", "fecha", "creador", "estado"];
    const rows = Array.prototype.slice.call($("resultList").querySelectorAll("tbody tr"));
    const selected = {};
    keys.forEach(function (key) {
      const input = $("resultList").querySelector('[data-filter="' + key + '"]');
      selected[key] = input ? input.value : "";
    });
    const matches = function (row, ignoreKey) {
      return keys.every(function (key) {
        if (key === ignoreKey || !selected[key]) return true;
        return String(row.dataset[key] || "") === selected[key];
      });
    };
    let shown = 0;
    rows.forEach(function (row) {
      const visible = matches(row);
      row.hidden = !visible;
      if (visible) shown += 1;
    });
    let dropped = false;
    keys.forEach(function (key) {
      const input = $("resultList").querySelector('[data-filter="' + key + '"]');
      if (!input) return;
      const seen = {};
      const values = [];
      rows.forEach(function (row) {
        if (!matches(row, key)) return;
        const value = String(row.dataset[key] || "");
        if (!value || seen[value]) return;
        seen[value] = true;
        values.push(value);
      });
      sortFilterValues(key, values);
      const current = selected[key];
      input.innerHTML = "<option value=\"\">Todos</option>" + values.map(function (value) {
        return "<option value=\"" + esc(value) + "\">" + esc(filterOptionLabel(key, value)) + "</option>";
      }).join("");
      if (current && values.indexOf(current) === -1) {
        input.value = "";
        dropped = true;
      } else {
        input.value = current;
      }
    });
    if (dropped) {
      applyColumnFilters();
      return;
    }
    const note = $("resultFilterNote");
    if (!note) return;
    const active = keys.some(function (key) { return selected[key]; });
    note.textContent = active ? shown + " de " + rows.length : "";
  }

  function bindColumnFilters() {
    $("resultList").querySelectorAll("[data-filter]").forEach(function (input) {
      input.addEventListener("change", applyColumnFilters);
      input.addEventListener("click", function (event) { event.stopPropagation(); });
    });
    applyColumnFilters();
  }

  function resultTable(head, body) {
    return '<div class="result-scroll"><table class="result-table"><thead><tr>' + head + '</tr></thead><tbody>' + body + '</tbody></table></div>';
  }

  function renderResults(rows) {
    setResultsVisible(true);
    if (!rows.length) {
      $("resultList").innerHTML = '<p class="hint">Sin actuaciones para ese filtro.</p>';
      if ($("resultFilterNote")) $("resultFilterNote").textContent = "";
      return;
    }
    const body = rows.map(function (row, index) {
      const code = (row.parent && featureCode(row.kind, row.parent)) || row.attributes[TARGETS[row.kind].relField] || "—";
      const tipo = elementType(row.kind, row.parent);
      const nombre = elementName(row.kind, row.parent);
      const fecha = formatDay(row.attributes.A_I_F_INCIDENCIA) || formatDay(row.attributes.CREATED_DATE) || "—";
      const estado = actuacionState(row.attributes);
      const state = stateClass(row.attributes) || "is-sinfecha";
      return '<tr class="' + state + '" data-index="' + index + '" tabindex="0"' +
        ' data-actuacion="' + esc(actuacionCode(row.kind, row.attributes.OBJECTID)) + '"' +
        ' data-elemento="' + esc(code) + '"' +
        ' data-tipo="' + esc(tipo) + '"' +
        ' data-nombre="' + esc(nombre) + '"' +
        ' data-fecha="' + esc(fecha) + '"' +
        ' data-creador="' + esc(row.attributes.CREATED_USER || "—") + '"' +
        ' data-estado="' + estado + '">' +
        '<td>' + esc(actuacionCode(row.kind, row.attributes.OBJECTID)) + '</td>' +
        '<td>' + esc(code) + '</td>' +
        '<td>' + esc(tipo) + '</td>' +
        '<td>' + esc(nombre) + '</td>' +
        '<td>' + esc(fecha) + '</td>' +
        '<td>' + esc(row.attributes.CREATED_USER || "—") + '</td>' +
        '<td>' + esc(stateText(row.attributes)) + '</td></tr>';
    }).join("");
    $("resultList").innerHTML = resultTable(columnFilterHead(), body);
    if ($("resultFilterNote")) $("resultFilterNote").textContent = "";
    bindColumnFilters();
    $("resultList").querySelectorAll("[data-index]").forEach(function (rowEl) {
      const open = async function () {
        $("resultList").querySelectorAll("tr.is-active").forEach(function (card) { card.classList.remove("is-active"); });
        rowEl.classList.add("is-active");
        const row = currentRows[Number(rowEl.dataset.index)];
        const code = row.attributes[TARGETS[row.kind].relField];
        const parent = await findParent(row.kind, code);
        setResultsVisible(false);
        if (parent) await openFeature(row.kind, parent.attributes, parent.geometry);
        else {
          selectedFeature = { kind: row.kind, attributes: row.parent || {}, geometry: null };
          $("ficha").hidden = false;
          $("fichaKind").textContent = TARGETS[row.kind].label;
          $("fichaTitle").textContent = code || "Actuación";
          $("fichaMeta").textContent = "El elemento ya no está en la capa de edición.";
        }
        const card = $("fichaHistory").querySelector('[data-oid="' + row.attributes.OBJECTID + '"]');
        showActuacion(row, card);
      };
      rowEl.addEventListener("click", open);
      rowEl.addEventListener("keydown", function (event) {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          open();
        }
      });
    });
  }

  function renderFeatureHits(hits) {
    currentRows = [];
    setResultsVisible(true);
    if (!hits.length) {
      $("resultList").innerHTML = '<p class="hint">Sin resultados.</p>';
      return;
    }
    const body = hits.map(function (hit, index) {
      const code = featureCode(hit.kind, hit.attributes) || "—";
      const tipo = elementType(hit.kind, hit.attributes);
      const nombre = elementName(hit.kind, hit.attributes);
      return '<tr data-hit="' + index + '" tabindex="0">' +
        '<td>—</td>' +
        '<td>' + esc(code) + '</td>' +
        '<td>' + esc(tipo) + '</td>' +
        '<td>' + esc(nombre) + '</td>' +
        '<td colspan="3">Sin actuaciones en el rango</td></tr>';
    }).join("");
    $("resultList").innerHTML = resultTable(
      "<th>Actuación</th><th>Elemento</th><th>Tipo</th><th>Nombre</th><th colspan=\"3\">Fecha</th>",
      body
    );
    $("resultList").querySelectorAll("[data-hit]").forEach(function (rowEl) {
      const open = function () {
        const hit = hits[Number(rowEl.dataset.hit)];
        openFeature(hit.kind, hit.attributes, hit.geometry);
      };
      rowEl.addEventListener("click", open);
      rowEl.addEventListener("keydown", function (event) {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          open();
        }
      });
    });
  }

  function setStatus(node, message, isError) {
    node.textContent = message;
    node.classList.toggle("is-error", !!isError);
    node.classList.toggle("is-ok", !isError && !!message);
  }

  async function saveActuacion(event) {
    event.preventDefault();
    if (!selectedFeature) return;
    const kind = selectedFeature.kind;
    const code = featureCode(kind, selectedFeature.attributes);
    if (!code) {
      setStatus($("formStatus"), "El elemento no tiene código.", true);
      return;
    }
    const fechaIncidencia = $("actuacionForm").querySelector('[data-field="A_I_F_INCIDENCIA"]');
    if (!fechaIncidencia || !fechaIncidencia.value) {
      setStatus($("formStatus"), "La fecha de incidencia es obligatoria.", true);
      if (fechaIncidencia) fechaIncidencia.focus();
      return;
    }
    const attrs = collectAttributes(kind);
    $("btnSave").disabled = true;
    try {
      let result;
      if (editingOid) {
        attrs.OBJECTID = editingOid;
        result = await tableLayers[kind].applyEdits({ updateFeatures: [{ attributes: attrs }] });
        const updated = result.updateFeatureResults && result.updateFeatureResults[0];
        if (updated && updated.error) throw new Error(updated.error.description || updated.error.message);
      } else {
        result = await tableLayers[kind].applyEdits({ addFeatures: [{ attributes: attrs }] });
        const added = result.addFeatureResults && result.addFeatureResults[0];
        if (!added || added.error) throw new Error((added && added.error && (added.error.description || added.error.message)) || "No se ha podido registrar.");
        editingOid = added.objectId;
      }
      const codeId = actuacionCode(kind, editingOid);
      let photoError = "";
      try {
        await uploadActuacionAttachment(kind, editingOid);
      } catch (photoErr) {
        photoError = photoErr.message || "No se ha podido adjuntar la fotografía.";
      }
      setStatus($("formStatus"), photoError
        ? "Actuación " + codeId + " guardada. " + photoError
        : "Actuación " + codeId + " guardada.", !!photoError);
      loadActuacionAttachments(kind, editingOid);
      $("btnSave").textContent = "Guardar actuación";
      await loadHistory(kind, code);
      const savedCard = $("fichaHistory").querySelector('[data-oid="' + editingOid + '"]');
      document.querySelectorAll(".history-card").forEach(function (card) { card.classList.remove("is-active"); });
      if (savedCard) savedCard.classList.add("is-active");
      const fresh = await tableLayers[kind].queryFeatures({
        where: "OBJECTID = " + editingOid,
        outFields: ["*"],
        returnGeometry: false,
        num: 1
      });
      if (fresh.features[0]) {
        activeActuacion = { kind: kind, attributes: fresh.features[0].attributes, parent: selectedFeature.attributes };
        $("btnPrintOne").disabled = false;
        $("btnDelete").disabled = false;
      }
      if (!$("fCodigo").value.trim()) $("fCodigo").value = code;
      try {
        await syncActuacionesViews({ reloadResults: true });
        if (resultsPanelVisible()) await refreshResultsList({ silent: true });
      } catch (searchErr) { /* el parte ya está guardado */ }
      setResultsVisible(false);
    } catch (err) {
      setStatus($("formStatus"), err.message || "No se ha podido guardar.", true);
    } finally {
      $("btnSave").disabled = false;
    }
  }

  async function deleteActuacion() {
    if (!selectedFeature || editingOid == null) return;
    const kind = selectedFeature.kind;
    const code = featureCode(kind, selectedFeature.attributes);
    const label = actuacionCode(kind, editingOid);
    const removedId = editingOid;
    if (!window.confirm("¿Eliminar la actuación " + label + "? Esta acción no se puede deshacer.")) return;
    $("btnDelete").disabled = true;
    $("btnSave").disabled = true;
    try {
      const result = await tableLayers[kind].applyEdits({
        deleteFeatures: [{ objectId: removedId }]
      });
      const deleted = result.deleteFeatureResults && result.deleteFeatureResults[0];
      if (!deleted || deleted.error) {
        throw new Error((deleted && deleted.error && (deleted.error.description || deleted.error.message)) || "No se ha podido eliminar.");
      }
      const sameRow = function (row) {
        return row.kind === kind && String(row.attributes.OBJECTID) === String(removedId);
      };
      const keepResultsOpen = resultsPanelVisible();
      resetForm();
      currentRows = currentRows.filter(function (row) { return !sameRow(row); });
      if (keepResultsOpen) {
        try {
          await refreshResultsList({ silent: false });
        } catch (refreshErr) {
          renderResults(currentRows);
          $("btnPrintList").disabled = !currentRows.length;
          setStatus($("resultStatus"), currentRows.length + (currentRows.length === 1 ? " actuación." : " actuaciones."), false);
        }
        if (!$("ficha").hidden) setResultsVisible(false);
      }
      if (code) await loadHistory(kind, code);
      await refreshDashboard();
      setStatus($("formStatus"), "Actuación " + label + " eliminada.", false);
    } catch (err) {
      setStatus($("formStatus"), err.message || "No se ha podido eliminar.", true);
      $("btnDelete").disabled = false;
    } finally {
      const canSave = selectedFeature && featureCode(kind, selectedFeature.attributes);
      $("btnSave").disabled = !canSave;
    }
  }

  function checkLabel(name) {
    const found = CHECK_FIELDS.find(function (field) { return field[0] === name; });
    if (found) return found[1];
    const extra = {
      A_I_INCIDENCIA: "Hay incidencia",
      A_I_F_INCIDENCIA: "Fecha de incidencia",
      A_I_F_RESOLUCION: "Fecha de resolución",
      A_I_MAT_NECESARIO: "Material necesario",
      A_I_DESCRIPCION: "Descripción",
      M_F_OBSERVACIONES: "Observaciones"
    };
    return extra[name] || name;
  }

  function displayValue(name, value) {
    if (name === "A_I_F_INCIDENCIA" || name === "A_I_F_RESOLUCION") return toInputDate(value) ? formatDateTime(typeof value === "number" ? value : new Date(toInputDate(value) + "T00:00:00").getTime()).split(",")[0] : "—";
    if (value == null || value === "") return "—";
    return String(value);
  }

  function waitForPrintImages(root) {
    const images = Array.from(root.querySelectorAll("img"));
    if (!images.length) return Promise.resolve();
    return Promise.all(images.map(function (image) {
      if (image.complete && image.naturalWidth) return Promise.resolve();
      return new Promise(function (resolve) {
        const done = function () { resolve(); };
        image.addEventListener("load", done, { once: true });
        image.addEventListener("error", done, { once: true });
      });
    }));
  }

  function printLogoUrl() {
    return new URL("contenur.jpg", window.location.href).href;
  }

  function printStylesHtml() {
    return [
      "@page{size:A4;margin:10mm;}",
      "html,body{margin:0;padding:0;background:#fff;color:#111;font:13px/1.35 Inter,Arial,sans-serif;}",
      ".print-page{box-sizing:border-box;page-break-after:always;break-after:page;}",
      ".print-page:last-child{page-break-after:auto;break-after:auto;}",
      ".print-report{height:270mm;max-height:270mm;overflow:hidden;display:flex;flex-direction:column;}",
      ".print-header{display:flex;justify-content:space-between;align-items:center;gap:12px;border-bottom:2px solid #007A3D;padding-bottom:4px;flex:0 0 auto;}",
      ".print-header img{height:40px;width:auto;}",
      ".print-header h1{margin:0;font-size:20px;font-family:Outfit,Inter,Arial,sans-serif;}",
      ".print-header p{margin:2px 0 0;color:#333;font-size:12px;}",
      ".print-meta{margin:6px 0 6px;font-size:12px;flex:0 0 auto;}",
      "table{width:100%;border-collapse:collapse;font-size:13px;}",
      "th,td{border:1px solid #cfd8d3;padding:6px 7px;vertical-align:top;text-align:left;}",
      "th{background:#e7f3ec;}",
      ".print-grid{display:grid;grid-template-columns:1fr 1fr;gap:1px 14px;margin:0 0 3mm;flex:0 0 auto;}",
      ".print-grid div{border-bottom:1px solid #e4ece7;padding:1px 0;font-size:12px;}",
      ".print-apartados{flex:1 1 auto;min-height:0;display:flex;flex-direction:column;gap:2.5mm;}",
      ".print-apartado{flex:0 0 auto;border:1.5px solid #007A3D;border-radius:2px;overflow:hidden;display:flex;flex-direction:column;min-height:0;break-inside:avoid;page-break-inside:avoid;}",
      ".print-apartado h2{display:flex;align-items:center;gap:2.5mm;margin:0;padding:1.6mm 3mm;font-size:13px;letter-spacing:0.02em;text-transform:uppercase;}",
      ".print-num{display:inline-flex;align-items:center;justify-content:center;width:5.5mm;height:5.5mm;border-radius:50%;background:#007A3D;color:#fff;font-size:11px;font-weight:700;flex:0 0 auto;}",
      ".tone-limpieza{border-color:#007A3D;}",
      ".tone-limpieza h2{background:#e7f3ec;color:#005028;}",
      ".tone-mantenimiento{border-color:#0e6b8a;}",
      ".tone-mantenimiento h2{background:#e7f3f7;color:#0e4f66;}",
      ".tone-mantenimiento .print-num{background:#0e6b8a;}",
      ".tone-funcionamiento{border-color:#8a5a00;}",
      ".tone-funcionamiento h2{background:#fbf3e4;color:#6d4600;}",
      ".tone-funcionamiento .print-num{background:#8a5a00;}",
      ".tone-incidencia{border-color:#9d1c2b;}",
      ".tone-incidencia h2{background:#fde8ea;color:#9d1c2b;}",
      ".tone-incidencia .print-num{background:#9d1c2b;}",
      ".print-checks{display:grid;grid-template-columns:1fr 1fr 1fr;gap:0 4mm;margin:0;padding:1.5mm 3mm 2mm;}",
      ".print-dates{display:grid;grid-template-columns:1fr 1fr;gap:0 4mm;margin:0;padding:0 3mm 2mm;}",
      ".print-checks div,.print-dates div{display:flex;justify-content:space-between;gap:2mm;border-bottom:1px solid #e4ece7;padding:0.7mm 0;font-size:11px;}",
      ".print-dates div{justify-content:flex-start;gap:3mm;border-bottom:0;}",
      ".print-checks strong,.print-dates strong{font-size:11px;}",
      ".print-checks .is-si strong{color:#005028;}",
      ".print-checks .is-no strong{color:#6b7280;font-weight:600;}",
      ".print-texts{display:flex;flex-direction:column;gap:1.5mm;padding:0 3mm 2.5mm;}",
      ".print-block{overflow:hidden;border:1px solid #e4ece7;padding:1.5mm 2mm;background:#fff;}",
      ".print-block strong{display:block;margin:0 0 1mm;font-size:11px;color:#333;}",
      ".print-block p{margin:0;max-height:28mm;font-size:12px;line-height:1.35;white-space:pre-wrap;word-break:break-word;overflow:hidden;}",
      "h2.print-section{margin:6px 0;font-size:15px;color:#005028;}",
      ".print-page-photos{page-break-before:auto;break-before:auto;}",
      ".print-page-photos .print-section{margin:4px 0 6px;}",
      ".print-empty{margin:4mm 0 0;font-size:13px;color:#444;}",
      ".print-photos{display:grid;grid-template-columns:1fr 1fr;grid-template-rows:repeat(4,50mm);gap:3mm;margin:0;width:100%;}",
      ".print-photo{margin:0;border:1px solid #cfd8d3;padding:2mm;height:50mm;box-sizing:border-box;overflow:hidden;display:flex;flex-direction:column;page-break-inside:avoid;break-inside:avoid;}",
      ".print-photo img{display:block;width:100%;height:40mm;object-fit:contain;}",
      ".print-photo figcaption{margin-top:1mm;font-size:10px;color:#333;line-height:1.15;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}"
    ].join("");
  }

  function printHeaderHtml(title) {
    const from = $("fDesde").value ? toInputDate($("fDesde").value).split("-").reverse().join("/") : "—";
    const to = $("fHasta").value ? toInputDate($("fHasta").value).split("-").reverse().join("/") : "—";
    return '<header class="print-header"><div><h1>' + esc(title) + '</h1>' +
      '<p>Ayuntamiento de Rivas Vaciamadrid · Mantenimiento de áreas de juego</p></div>' +
      '<img src="' + esc(printLogoUrl()) + '" alt="Contenur"></header>' +
      '<p class="print-meta">Rango: ' + esc(from) + ' – ' + esc(to) +
      ' · Emitido: ' + esc(new Date().toLocaleString("es-ES")) +
      ' · ' + esc(session.userId) + '</p>';
  }

  async function printDocument(title, bodyHtml, extraPagesHtml, pageClass) {
    const pagesHtml =
      '<div class="print-page' + (pageClass ? " " + pageClass : "") + '">' + printHeaderHtml(title) + bodyHtml + "</div>" +
      (extraPagesHtml || "");
    const frame = document.createElement("iframe");
    frame.setAttribute("aria-hidden", "true");
    frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;opacity:0;";
    document.body.appendChild(frame);
    const doc = frame.contentDocument || frame.contentWindow.document;
    doc.open();
    doc.write(
      "<!DOCTYPE html><html lang=\"es\"><head><meta charset=\"UTF-8\">" +
      "<title>" + esc(title) + "</title><style>" + printStylesHtml() + "</style></head><body>" +
      pagesHtml + "</body></html>"
    );
    doc.close();
    try {
      await waitForPrintImages(doc);
      const win = frame.contentWindow;
      win.focus();
      await new Promise(function (resolve) {
        const cleanup = function () {
          window.removeEventListener("focus", cleanup);
          setTimeout(function () {
            if (frame.parentNode) frame.parentNode.removeChild(frame);
            resolve();
          }, 300);
        };
        window.addEventListener("focus", cleanup);
        win.print();
      });
    } catch (err) {
      if (frame.parentNode) frame.parentNode.removeChild(frame);
      throw err;
    }
  }

  async function fetchActuacionAttachments(kind, objectId) {
    if (!tableLayers[kind] || objectId == null) return [];
    const result = await tableLayers[kind].queryAttachments({ objectIds: [objectId] });
    return (result && (result[objectId] || result[String(objectId)])) || [];
  }

  function printPhotosPagesHtml(infos, reportTitle) {
    const images = (infos || []).filter(function (info) {
      return info && info.url && isImageAttachment(info);
    });
    if (!images.length) return "";
    const perPage = 8;
    const pages = [];
    for (let i = 0; i < images.length; i += perPage) pages.push(images.slice(i, i + perPage));
    return pages.map(function (pageImages, pageIndex) {
      const figures = pageImages.map(function (info) {
        const url = attachmentUrl(info.url);
        const caption = esc(info.name || "Fotografía");
        return '<figure class="print-photo"><img src="' + esc(url) + '" alt="' + caption + '"><figcaption>' + caption + "</figcaption></figure>";
      }).join("");
      const title = pages.length > 1
        ? "Fotografías (" + (pageIndex + 1) + "/" + pages.length + ")"
        : "Fotografías";
      return '<div class="print-page print-page-photos">' +
        printHeaderHtml(reportTitle) +
        '<h2 class="print-section">' + title + "</h2>" +
        '<div class="print-photos">' + figures + "</div></div>";
    }).join("");
  }

  function printList() {
    if (!currentRows.length) return Promise.resolve();
    const rows = currentRows.map(function (row) {
      const attrs = row.attributes;
      return "<tr><td>" + esc(actuacionCode(row.kind, attrs.OBJECTID)) + "</td><td>" +
        esc(TARGETS[row.kind].label) + "</td><td>" + esc(attrs[TARGETS[row.kind].relField] || "") + "</td><td>" +
        esc(parentName(row.kind, row.parent)) + "</td><td>" + esc(formatDateTime(attrs.CREATED_DATE)) + "</td><td>" +
        esc(attrs.CREATED_USER || "") + "</td><td>" +
        esc(attrs.A_I_INCIDENCIA || "NO") + "</td><td>" +
        esc(attrs.M_F_OBSERVACIONES || attrs.A_I_DESCRIPCION || "") + "</td></tr>";
    }).join("");
    return printDocument("Informe de actuaciones",
      "<table><thead><tr><th>Actuación</th><th>Ámbito</th><th>Código</th><th>Elemento</th><th>Fecha</th><th>Usuario</th><th>Incidencia</th><th>Observaciones</th></tr></thead><tbody>" +
      rows + "</tbody></table>");
  }

  function reportValueFilled(name, value) {
    if (name === "A_I_F_INCIDENCIA") return false;
    if (value == null) return false;
    const text = String(value).trim();
    return text !== "" && text.toUpperCase() !== "NO";
  }

  function printChecksHtml(fields, attrs) {
    return '<div class="print-checks">' + fields.map(function (field) {
      const on = String(attrs[field[0]] == null ? "" : attrs[field[0]]).trim().toUpperCase() === "SI";
      return '<div class="' + (on ? "is-si" : "is-no") + '"><span>' + esc(field[1]) + "</span><strong>" + (on ? "SI" : "NO") + "</strong></div>";
    }).join("") + "</div>";
  }

  function printApartadoHtml(apartado, attrs) {
    const names = (apartado.checks || []).concat(apartado.dates || []).concat(apartado.texts || []);
    const touched = names.some(function (field) { return reportValueFilled(field[0], attrs[field[0]]); });
    if (!touched) return "";
    let body = apartado.checks ? printChecksHtml(apartado.checks, attrs) : "";
    if (apartado.dates) {
      body += '<div class="print-dates">' + apartado.dates.map(function (field) {
        return "<div><span>" + esc(field[1]) + "</span><strong>" + esc(displayValue(field[0], attrs[field[0]])) + "</strong></div>";
      }).join("") + "</div>";
    }
    const texts = (apartado.texts || []).filter(function (field) {
      return reportValueFilled(field[0], attrs[field[0]]);
    });
    if (texts.length) {
      body += '<div class="print-texts">' + texts.map(function (field) {
        return '<div class="print-block"><strong>' + esc(field[1]) + "</strong><p>" + esc(displayValue(field[0], attrs[field[0]])) + "</p></div>";
      }).join("") + "</div>";
    }
    return '<section class="print-apartado tone-' + apartado.tone + '">' +
      '<h2><span class="print-num">' + apartado.number + "</span>" + esc(apartado.title) + "</h2>" +
      body + "</section>";
  }

  function printApartadosHtml(attrs) {
    const apartados = [
      { number: "1", title: "Limpieza y revisión", tone: "limpieza", checks: CHECKS[0][1] },
      { number: "2", title: "Mantenimiento", tone: "mantenimiento", checks: CHECKS[1][1] },
      { number: "3", title: "Funcionamiento", tone: "funcionamiento", checks: CHECKS[2][1] },
      {
        number: "4",
        title: "Incidencia",
        tone: "incidencia",
        checks: [["A_I_INCIDENCIA", "Hay incidencia"]],
        dates: [["A_I_F_INCIDENCIA", "Fecha de incidencia"], ["A_I_F_RESOLUCION", "Fecha de resolución"]],
        texts: [["A_I_MAT_NECESARIO", "Material necesario"], ["A_I_DESCRIPCION", "Descripción"], ["M_F_OBSERVACIONES", "Observaciones"]]
      }
    ];
    const html = apartados.map(function (apartado) { return printApartadoHtml(apartado, attrs); }).join("");
    return '<div class="print-apartados">' + (html || '<p class="print-empty">Esta actuación no tiene apartados con datos.</p>') + "</div>";
  }

  async function printOne() {
    const row = activeActuacion;
    if (!row) return;
    const attrs = row.attributes;
    const parent = row.parent || (selectedFeature && selectedFeature.attributes);
    const reportTitle = "Actuación " + actuacionCode(row.kind, attrs.OBJECTID);
    let photosPages = "";
    try {
      const infos = await fetchActuacionAttachments(row.kind, attrs.OBJECTID);
      photosPages = printPhotosPagesHtml(infos, reportTitle);
    } catch (err) {
      photosPages = '<div class="print-page print-page-photos">' + printHeaderHtml(reportTitle) +
        '<h2 class="print-section">Fotografías</h2><p class="print-empty">No se han podido cargar las fotografías.</p></div>';
    }
    await printDocument(reportTitle,
      '<div class="print-grid"><div><strong>Ámbito:</strong> ' + esc(TARGETS[row.kind].label) + "</div>" +
      "<div><strong>Código:</strong> " + esc(attrs[TARGETS[row.kind].relField] || "") + "</div>" +
      "<div><strong>Elemento:</strong> " + esc(parentName(row.kind, parent)) + "</div>" +
      "<div><strong>Tipo:</strong> " + esc((parent && parent.TIPO) || "") + "</div>" +
      "<div><strong>Fecha de incidencia:</strong> " + esc(displayValue("A_I_F_INCIDENCIA", attrs.A_I_F_INCIDENCIA)) + "</div>" +
      "<div><strong>Registrada:</strong> " + esc(formatDateTime(attrs.CREATED_DATE)) + "</div>" +
      "<div><strong>Usuario:</strong> " + esc(attrs.CREATED_USER || "") + "</div></div>" +
      printApartadosHtml(attrs),
      photosPages,
      "print-report");
  }

  $("togglePass").addEventListener("click", function () {
    const input = $("loginPass");
    const visible = input.type === "password";
    input.type = visible ? "text" : "password";
    this.setAttribute("aria-pressed", visible ? "true" : "false");
    this.setAttribute("aria-label", visible ? "Ocultar contraseña" : "Mostrar contraseña");
    this.querySelector("i").className = visible ? "fa-regular fa-eye-slash" : "fa-regular fa-eye";
    input.focus();
  });

  $("loginForm").addEventListener("submit", async function (event) {
    event.preventDefault();
    const button = $("loginSubmit");
    button.disabled = true;
    $("loginError").textContent = "";
    try {
      await login($("loginUser").value.trim(), $("loginPass").value);
      $("loginPass").value = "";
      boot();
    } catch (err) {
      $("loginError").textContent = err.message || "No se ha podido iniciar sesión.";
    } finally {
      button.disabled = false;
    }
  });

  $("btnLogout").addEventListener("click", function () {
    stopActuacionesPolling();
    clearSession();
    location.reload();
  });

  document.addEventListener("visibilitychange", function () {
    if (document.hidden || !tableLayers.area) return;
    syncActuacionesViews({
      reloadHistory: !!(selectedFeature && $("ficha") && !$("ficha").hidden),
      reloadResults: resultsPanelVisible()
    }).catch(function () {});
  });

  $("btnBuscar").addEventListener("click", function () {
    searchActuaciones().catch(function (err) {
      setStatus($("resultStatus"), err.message || "No se ha podido consultar.", true);
    });
  });

  $("btnToggleResults").addEventListener("click", function () {
    const dock = document.querySelector(".results-dock");
    if (!dock || dock.hidden) return;
    const collapsed = dock.classList.toggle("is-collapsed");
    this.textContent = collapsed ? "Mostrar tabla" : "Ocultar tabla";
    this.setAttribute("aria-expanded", collapsed ? "false" : "true");
  });

  $("dashPie").addEventListener("click", function (event) {
    if (event.target.closest("#dashPieTotal")) return;
    const slice = pieSlice(event);
    if (slice) showFocusedElements(slice, "halo");
  });
  document.querySelectorAll(".pie-legend").forEach(function (button) {
    button.addEventListener("click", function () {
      showFocusedElements(button.dataset.focus, "halo");
    });
  });
  document.querySelectorAll(".kpi[data-focus]").forEach(function (button) {
    button.addEventListener("click", function () {
      showFocusedElements(button.dataset.focus, "only");
    });
  });
  $("btnMapAll").addEventListener("click", showAllElements);

  $("fCodigo").addEventListener("keydown", function (event) {
    if (event.key === "Enter") {
      event.preventDefault();
      $("btnBuscar").click();
    }
  });

  $("btnLimpiar").addEventListener("click", function () {
    $("fCodigo").value = "";
    $("fAmbito").value = "todas";
    const todas = document.querySelector('input[name="fEstado"][value="todas"]');
    if (todas) todas.checked = true;
    setDefaultDates();
    currentRows = [];
    $("resultList").innerHTML = "";
    $("btnPrintList").disabled = true;
    setStatus($("resultStatus"), "", false);
    refreshDashboard();
  });

  ["fDesde", "fHasta", "fAmbito"].forEach(function (id) {
    $(id).addEventListener("change", scheduleDashboard);
  });
  document.querySelectorAll('input[name="fEstado"]').forEach(function (input) {
    input.addEventListener("change", scheduleDashboard);
  });
  $("fCodigo").addEventListener("input", scheduleDashboard);

  function placeBasemapMenu() {
    const button = $("btnBasemap");
    const menu = $("basemapMenu");
    const wrap = document.querySelector(".map-wrap");
    if (!button || !menu || !wrap) return;
    const wrapBox = wrap.getBoundingClientRect();
    const box = button.getBoundingClientRect();
    menu.style.left = (box.right - wrapBox.left + 8) + "px";
    menu.style.top = (box.top - wrapBox.top) + "px";
    menu.style.right = "auto";
  }

  $("btnBasemap").addEventListener("click", function (event) {
    event.stopPropagation();
    const menu = $("basemapMenu");
    const open = menu.hidden;
    if (open) placeBasemapMenu();
    menu.hidden = !open;
    $("btnBasemap").setAttribute("aria-expanded", open ? "true" : "false");
  });

  $("basemapMenu").addEventListener("click", function (event) {
    const option = event.target.closest(".basemap-option");
    if (!option) return;
    event.stopPropagation();
    if (view && view.map) view.map.basemap = option.dataset.basemap;
    $("basemapMenu").querySelectorAll(".basemap-option").forEach(function (item) {
      item.classList.toggle("active", item === option);
    });
    closeBasemapMenu();
  });

  document.addEventListener("click", closeBasemapMenu);

  $("btnNew").addEventListener("click", resetForm);
  $("btnDelete").addEventListener("click", function () {
    deleteActuacion().catch(function (err) {
      setStatus($("formStatus"), err.message || "No se ha podido eliminar.", true);
    });
  });
  $("actuacionForm").addEventListener("submit", saveActuacion);
  $("btnPrintList").addEventListener("click", function () {
    printList().catch(function (err) {
      setStatus($("formStatus"), err.message || "No se ha podido imprimir.", true);
    });
  });
  $("btnPrintOne").addEventListener("click", function () {
    printOne().catch(function (err) {
      setStatus($("formStatus"), err.message || "No se ha podido imprimir la actuación.", true);
    });
  });

  buildForm();
  setDefaultDates();
  session = readSession();
  if (session) {
    assertFeatureAccess(session.token).then(function () {
      boot();
    }).catch(function (err) {
      clearSession();
      $("loginError").textContent = err.message || "Tu usuario no pertenece al grupo con acceso a este visor.";
    });
  }
})();
