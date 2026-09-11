/* Main Application JavaScript - Inventario de Juegos Infantiles Rivas Vaciamadrid */

require([
  "esri/config",
  "esri/Map",
  "esri/views/MapView",
  "esri/views/SceneView",
  "esri/layers/FeatureLayer",
  "esri/layers/SceneLayer",
  "esri/layers/GraphicsLayer",
  "esri/Graphic",
  "esri/geometry/Point",
  "esri/geometry/Circle",
  "esri/geometry/geometryEngine",
  "esri/renderers/SimpleRenderer",
  "esri/renderers/UniqueValueRenderer",
  "esri/symbols/PictureMarkerSymbol",
  "esri/symbols/PictureFillSymbol",
  "esri/symbols/ObjectSymbol3DLayer",
  "esri/symbols/IconSymbol3DLayer",
  "esri/symbols/PointSymbol3D",
  "esri/symbols/WebStyleSymbol",
  "esri/symbols/SimpleFillSymbol",
  "esri/symbols/SimpleMarkerSymbol",
  "esri/widgets/Daylight",
  "esri/views/3d/environment/SunLighting"
], function(
  esriConfig,
  Map,
  MapView,
  SceneView,
  FeatureLayer,
  SceneLayer,
  GraphicsLayer,
  Graphic,
  Point,
  Circle,
  geometryEngine,
  SimpleRenderer,
  UniqueValueRenderer,
  PictureMarkerSymbol,
  PictureFillSymbol,
  ObjectSymbol3DLayer,
  IconSymbol3DLayer,
  PointSymbol3D,
  WebStyleSymbol,
  SimpleFillSymbol,
  SimpleMarkerSymbol,
  Daylight,
  SunLighting
) {

  // Feature services (consulta pública)
  const SERVER_URL = "https://sit.rivasciudad.es/server/rest/services/AREA_JUEGO_VISUALIZACION/FeatureServer";
  const BUILDINGS_3D_URL = "https://basemaps3d.arcgis.com/arcgis/rest/services/OpenStreetMap3D_Buildings_v1/SceneServer";
  const ARBOLADO_V3_URL = "https://sit.rivasciudad.es/server/rest/services/ARBOLADO_VISOR_AREAS/FeatureServer/0"; // Item: 80098958485d465e9e61623d49e5edf3
  const TERMINO_MUNICIPAL_URL = "https://sit.rivasciudad.es/server/rest/services/Termino_municipal_actual/FeatureServer/0"; // Item: 6586b7e8e95c446698bfa8c65d7ed97c
  const VIEW_CENTER = [-3.518, 40.353];
  const VIEW_ZOOM = 13;
  const VIEW_CENTER_MOBILE = [-3.536, 40.350];
  const VIEW_ZOOM_MOBILE = 12.4;

  function getHomeView() {
    const mobile = perfProfile.isMobile || window.innerWidth < 900;
    return mobile
      ? { center: VIEW_CENTER_MOBILE, zoom: VIEW_ZOOM_MOBILE }
      : { center: VIEW_CENTER, zoom: VIEW_ZOOM };
  }

  const perfProfile = (function detectPerformanceProfile() {
    const ua = navigator.userAgent || "";
    const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(ua)
      || ((navigator.maxTouchPoints || 0) > 1 && window.innerWidth < 900);
    const cores = navigator.hardwareConcurrency || 8;
    const memory = navigator.deviceMemory || 8;
    const saveData = !!(navigator.connection && navigator.connection.saveData);
    const isLowPower = isMobile || saveData || cores <= 4 || memory <= 4;
    return {
      isMobile,
      isLowPower,
      qualityProfile: isLowPower ? "low" : "medium",
      realisticTrees: !isLowPower,
      treeMinScale: isLowPower ? 3500 : 7000,
      osmBuildings: !isMobile,
      atmosphere: !isLowPower,
      iconSize: isLowPower ? 22 : 28,
      zoneIconSize: isLowPower ? 30 : 36,
      playIconSize: isLowPower ? 14 : 16,
      areaDetailScale: isLowPower ? 2800 : 3500,
      playElementScale: isLowPower ? 2800 : 3500,
      areaIconMaxScale: isLowPower ? 2800 : 3500
    };
  })();

  let map2D, map3D;
  let view2D = null, view3D = null, currentView = null;
  let is3DMode = false;
  let daylightWidget = null;
  let buildings3DLayer = null;
  let arboladoLayer3D = null;
  
  // Layer definitions mapping with 2D icons and 3D perspective icons
  const GAME_LAYERS_CONFIG = [
    { id: 9, key: "areas", name: "Área infantil", icon2D: "parque-de-atracciones.png", isPolygon: true },
    { id: 0, key: "trepar", name: "Juego de trepar", icon2D: "Iconos 2D/trepar.png", color: "#A16207", primitive: "sphere" },
    { id: 1, key: "tirolina", name: "Tirolina", icon2D: "Iconos 2D/tirolina.png", color: "#0891B2", primitive: "cylinder" },
    { id: 4, key: "biosaludable", name: "Biosaludable", icon2D: "Iconos 2D/Biosaludable.png", color: "#16A34A", primitive: "cylinder", isAdultEquipment: true },
    { id: 5, key: "columpio", name: "Columpio", icon2D: "Iconos 2D/columpio.png", color: "#2563EB", primitive: "cylinder" },
    { id: 6, key: "carrusel", name: "Carrusel", icon2D: "Iconos 2D/carrusel.png", color: "#9333EA", primitive: "cylinder" },
    { id: 7, key: "balancin", name: "Balancín", icon2D: "Iconos 2D/balancin.png", color: "#D97706", primitive: "cylinder" },
    { id: 8, key: "calistenia", name: "Calistenia", icon2D: "Iconos 2D/Calistemia.png", color: "#059669", primitive: "cube", isAdultEquipment: true },
    { id: 13, key: "tobogan", name: "Tobogán", icon2D: "Iconos 2D/tobogan.png", color: "#EA580C", primitive: "cone" },
    { id: 14, key: "sindatos", name: "Sin datos", icon2D: "Iconos 2D/casa.png", color: "#6B7280", primitive: "cube" },
    { id: 16, key: "compactos", name: "Multijuego / Compactos", icon2D: "Iconos 2D/Multijuego.png", color: "#E11D48", primitive: "cube" },
    { id: 17, key: "elemento", name: "Elemento de juego", icon2D: "Iconos 2D/Elemento_juego.png", color: "#0D9488", primitive: "sphere" },
    { id: 18, key: "red", name: "Red de trepa", icon2D: "Iconos 2D/Red.png", color: "#4F46E5", primitive: "cone" },
    { id: 20, key: "pingpong", name: "Mesas de pingpong", icon2D: "Iconos 2D/ping-pong.png", color: "#0284C7", primitive: "cube", isAdultEquipment: true }
  ];

  // Catalog age labels in the inventory, mapped to numeric ranges for overlap matching
  const AGE_CATALOG_RANGES = [
    { codes: ["1-6"], min: 1, max: 6 },
    { codes: ["3-6"], min: 3, max: 6 },
    { codes: ["1-12"], min: 1, max: 12 },
    { codes: ["3-12"], min: 3, max: 12 },
    { codes: ["5-12"], min: 5, max: 12 },
    { codes: ["6-12"], min: 6, max: 12 },
    { codes: ["+14", "14+", "12+", "+12"], min: 14, max: 99 }
  ];

  function getAgeCatalogCodesForBand(bandKey) {
    const matchesBand = {
      small: (range) => range.min < 6 && range.max >= 1,
      school: (range) => range.min <= 12 && range.max > 6,
      adult: (range) => range.min >= 12
    }[bandKey];

    if (!matchesBand) return [];
    return AGE_CATALOG_RANGES.filter(matchesBand).flatMap((range) => range.codes);
  }

  function buildAgeWhereClause(availableFields) {
    const codes = getAgeCatalogCodesForBand(activeAgeFilter);
    if (!codes.length) return null;

    const inList = codes.map((code) => `'${code}'`).join(", ");
    const fieldClauses = [];
    if (availableFields.includes("EDAD")) fieldClauses.push(`EDAD IN (${inList})`);
    if (availableFields.includes("EDAD_G")) fieldClauses.push(`EDAD_G IN (${inList})`);
    return fieldClauses.length ? `(${fieldClauses.join(" OR ")})` : null;
  }

  // Playground surface textures by TIPOSUELO (domain codes + label variants in the inventory)
  const SOIL_STYLE_MAP = [
    { values: ["Arena"], file: "arena.png", color: [212, 184, 130], label: "Arena", pattern: "horizontal" },
    { values: ["Arena rio", "Arena río"], file: "arena-rio.png", color: [186, 158, 108], label: "Arena de río", pattern: "backward-diagonal" },
    { values: ["Terreno natural"], file: "terreno-natural.png", color: [106, 148, 72], label: "Terreno natural", pattern: "forward-diagonal" },
    { values: ["Hormigon", "Hormigón"], file: "hormigon.png", color: [168, 168, 166], label: "Hormigón", pattern: "cross" },
    { values: ["Caucho continuo"], file: "caucho.png", color: [176, 58, 46], label: "Caucho continuo", pattern: "diagonal-cross" },
    { values: ["Caucho arena rio", "Caucho y arena de río", "Caucho y arena de rio"], file: "caucho-arena.png", color: [176, 118, 78], label: "Caucho y arena", pattern: "diagonal-cross" },
    { values: ["Loseta caucho"], file: "loseta-caucho.png", color: [92, 68, 66], label: "Loseta de caucho", pattern: "cross" },
    { values: ["Loseta caucho y C continuo", "Loseta caucho y C. continuo"], file: "loseta-mixto.png", color: [128, 78, 70], label: "Loseta y caucho continuo", pattern: "diagonal-cross" },
    { values: ["Corcho"], file: "corcho.png", color: [176, 132, 76], label: "Corcho", pattern: "horizontal" },
    { values: ["-"], file: "suelo-default.png", color: [88, 140, 92], label: "Sin tipo de suelo", pattern: "solid" },
    { values: ["PISCINA"], file: "piscina.png", color: [43, 164, 217], label: "Piscina", pattern: "vertical" }
  ];

  const AREA_INFANTIL_WHERE = "TIPO = 'AREA INFANTIL'";
  const AREA_OVERVIEW_ICON = "parque-de-atracciones.png";
  const DEFAULT_SELECTED_GAME_ID = 9;
  const AREA_SURFACE_EXPRESSION = `
    IIF(Upper(DefaultValue($feature.USO, '')) == 'PISCINA', 'PISCINA', DefaultValue($feature.TIPOSUELO, ''))
  `;

  function soilTextureUrl(fileName) {
    return new URL(`texturas/${fileName}`, window.location.href).href;
  }

  function createSoilPictureFill(fileName, tilePx) {
    const size = tilePx || 56;
    return new PictureFillSymbol({
      url: soilTextureUrl(fileName),
      width: size,
      height: size,
      outline: { color: [36, 36, 36, 0.9], width: 1.25 }
    });
  }

  function createSoilPolygon3DFill(color) {
    return {
      type: "polygon-3d",
      symbolLayers: [
        {
          type: "fill",
          material: { color: [color[0], color[1], color[2], 0.48] },
          outline: { color: [36, 36, 36, 0.8], size: 1.15 }
        }
      ]
    };
  }

  function getAreaPolygonRenderer(for3D, tilePx) {
    const uniqueValueInfos = [];
    SOIL_STYLE_MAP.forEach((style) => {
      const symbol = for3D
        ? createSoilPolygon3DFill(style.color)
        : createSoilPictureFill(style.file, tilePx);
      style.values.forEach((value) => {
        uniqueValueInfos.push({ value, symbol, label: style.label });
      });
    });

    const defaultSymbol = for3D
      ? createSoilPolygon3DFill([88, 140, 92])
      : createSoilPictureFill("suelo-default.png", tilePx);

    return new UniqueValueRenderer({
      valueExpression: AREA_SURFACE_EXPRESSION,
      valueExpressionTitle: "Superficie",
      defaultSymbol,
      defaultLabel: "Sin tipo de suelo",
      uniqueValueInfos
    });
  }

  function getAreaSoilLabelingInfo(for3D) {
    const expression = `
      var uso = Upper(DefaultValue($feature.USO, ''));
      if (uso == 'PISCINA') return 'Piscina';
      var s = DefaultValue($feature.TIPOSUELO, '');
      if (s == 'Arena rio') return 'Arena de río';
      if (s == 'Arena') return 'Arena';
      if (s == 'Terreno natural') return 'Terreno natural';
      if (s == 'Hormigon') return 'Hormigón';
      if (s == 'Caucho continuo') return 'Caucho continuo';
      if (s == 'Caucho arena rio') return 'Caucho y arena';
      if (s == 'Loseta caucho') return 'Loseta de caucho';
      if (s == 'Loseta caucho y C continuo' || s == 'Loseta caucho y C. continuo') return 'Loseta y caucho continuo';
      if (s == 'Corcho') return 'Corcho';
      if (s == '-' || s == '') return '';
      return s;
    `;
    if (for3D) {
      return [{
        labelExpressionInfo: { expression },
        deconflictionStrategy: "none",
        minScale: perfProfile.areaDetailScale,
        symbol: {
          type: "label-3d",
          symbolLayers: [{
            type: "text",
            material: { color: [40, 40, 40] },
            halo: { color: [255, 255, 255, 0.92], size: 0.8 },
            size: 6,
            font: { family: "Arial", weight: "bold" }
          }]
        }
      }];
    }
    return [{
      labelExpressionInfo: { expression },
      labelPlacement: "always-horizontal",
      deconflictionStrategy: "none",
      minScale: perfProfile.areaDetailScale,
      symbol: {
        type: "text",
        color: [36, 36, 36, 255],
        haloColor: [255, 255, 255, 235],
        haloSize: 1.4,
        font: { family: "Arial", size: 8, weight: "bold" }
      }
    }];
  }

  // Active feature layers instances with schema info
  const activeLayers2D = [];
  const activeLayers3D = [];
  
  // Graphics layer for Near Me pin and buffer radius
  let nearMeGraphicsLayer = new GraphicsLayer({ title: "Búsqueda Cerca de mí" });
  let nearMeSelectLayer2D = new GraphicsLayer({ title: "Selección Cerca de mí", listMode: "hide" });
  let nearMeSelectLayer3D = new GraphicsLayer({ title: "Selección Cerca de mí", listMode: "hide" });
  let userLocationPoint = null;

  // Filter States
  let activeSelectedGameId = DEFAULT_SELECTED_GAME_ID;
  let activeAgeFilter = "";
  let activeAccessibleFilter = "";
  let activeBasemap = "topo-vector";

  // Initialize App Authentication and Maps
  async function initApp() {
    try {
      setupMapsAndViews();
      setupUIInteractions();
      renderGameTypeListUI();
      applyCombinedFilters();

    } catch (err) {
      console.error("Initialization Error:", err);
      document.getElementById("loadingOverlay").innerHTML = `
        <div style="color:#DC2626; text-align:center; padding:2rem;">
          <i class="fa-solid fa-triangle-exclamation" style="font-size:3rem; margin-bottom:1rem;"></i>
          <h3>Error al conectar con SIT Rivas</h3>
          <p>${err.message || "Compruebe su conexión a la red municipal."}</p>
        </div>
      `;
    }
  }

  const POPUP_FIELD_LABELS = {
    NOMBRE: "Nombre",
    TIPO: "Tipo",
    ELEMENTO: "Elemento",
    USO: "Uso",
    TIPOSUELO: "Tipo de suelo",
    TIPO_DE_SUELO: "Tipo de suelo",
    EDAD: "Edad recomendada",
    EDAD_G: "Edad recomendada",
    UBICACION: "Ubicación",
    FUENTE: "Fuente de agua",
    NAME: "Nombre"
  };

  const POPUP_CITIZEN_FIELDS = [
    "NOMBRE", "NAME", "ELEMENTO", "TIPO", "USO", "TIPOSUELO", "TIPO_DE_SUELO",
    "EDAD", "EDAD_G", "UBICACION", "FUENTE"
  ];

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function popupHasValue(val) {
    if (val === null || val === undefined) return false;
    const text = String(val).trim();
    return text !== "" && text !== "-" && !/^(n\/a|null|undefined)$/i.test(text);
  }

  function popupSameText(a, b) {
    return popupHasValue(a) && popupHasValue(b)
      && String(a).trim().toUpperCase() === String(b).trim().toUpperCase();
  }

  function getPopupGraphic(input) {
    if (!input) return null;
    if (input.graphic) return input.graphic;
    if (input.attributes) return input;
    return null;
  }

  function getPlayPopupTitle(attrs, layerConfig) {
    const nombre = attrs.NOMBRE || attrs.UBICACION || "";
    const elemento = attrs.ELEMENTO || attrs.Elemento || attrs.NAME || "";
    const tipo = attrs.TIPO || attrs.Tipo || "";
    if (layerConfig.isPolygon && popupHasValue(nombre)) return nombre;
    if (popupHasValue(elemento)) return elemento;
    if (popupHasValue(nombre)) return nombre;
    if (popupHasValue(tipo)) return tipo;
    return layerConfig.name;
  }

  function applyPlayPopupTemplate(layer, layerConfig) {
    if (!layer) return;
    try {
      layer.popupEnabled = true;
      layer.popupTemplate = {
        title: layerConfig.name,
        lastEditInfoEnabled: false,
        content: [
          {
            type: "custom",
            creator: function(input) {
              const graphic = getPopupGraphic(input);
              const attrs = graphic ? (graphic.attributes || {}) : {};
              const adaptado = attrs.ADAPTADO || attrs.Adaptado || "";
              const inclusivo = attrs.INCLUSIVO || attrs.Inclusivo || "";
              const accessible = popupHasValue(adaptado) ? adaptado : inclusivo;
              const heading = getPlayPopupTitle(attrs, layerConfig);
              const shownLabels = {};
              const citizenFields = layerConfig.isPolygon
                ? POPUP_CITIZEN_FIELDS.filter((fieldName) => fieldName !== "USO")
                : POPUP_CITIZEN_FIELDS;

              let lat = 40.352;
              let lon = -3.528;
              if (graphic && graphic.geometry) {
                if (graphic.geometry.type === "point") {
                  lat = graphic.geometry.latitude || lat;
                  lon = graphic.geometry.longitude || lon;
                } else if (graphic.geometry.extent) {
                  const center = graphic.geometry.extent.center;
                  lat = center.latitude || lat;
                  lon = center.longitude || lon;
                }
              }

              const navUrl = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lon}`;
              let rowsHtml = "";
              citizenFields.forEach((fieldName) => {
                const val = attrs[fieldName];
                if (!popupHasValue(val)) return;
                if (popupSameText(val, heading)) return;
                const label = POPUP_FIELD_LABELS[fieldName] || fieldName;
                if (shownLabels[label]) return;
                shownLabels[label] = true;
                rowsHtml += `<div class="popup-detail-row"><strong>${escapeHtml(label)}:</strong> <span>${escapeHtml(val)}</span></div>`;
              });

              let tagsHtml = "";
              if (popupHasValue(accessible)) {
                const isSi = String(accessible).toUpperCase() === "SI";
                tagsHtml = `<div class="popup-tags">
                  <span class="popup-tag ${isSi ? "adapted" : "not-adapted"}"><i class="fa-solid fa-wheelchair"></i> Adaptado / inclusivo: ${escapeHtml(accessible)}</span>
                </div>`;
              }

              const container = document.createElement("div");
              container.className = "popup-custom-card";
              container.innerHTML = `
                <div class="popup-lead">${escapeHtml(heading)}</div>
                <div class="popup-details-list">${rowsHtml}</div>
                ${tagsHtml}
                <a href="${navUrl}" target="_blank" rel="noopener" class="btn-route popup-btn-route">
                  <i class="fa-solid fa-diamond-turn-right"></i> Cómo llegar (GPS Navegador)
                </a>
              `;
              return container;
            }
          },
          {
            type: "attachments"
          }
        ]
      };
    } catch (err) {
      console.warn("No se pudo aplicar el popup:", layerConfig && layerConfig.name, err);
    }
  }

  function getScaleSizeVariable(baseSize) {
    return {
      type: "size",
      valueExpression: "$view.scale",
      stops: [
        { value: 80000, size: Math.round(baseSize * 0.7) },
        { value: 20000, size: baseSize },
        { value: 4000, size: Math.round(baseSize * 1.35) }
      ]
    };
  }

  function getPlayElementSizeVariable(baseSize) {
    return {
      type: "size",
      valueExpression: "$view.scale",
      stops: [
        { value: 4000, size: baseSize },
        { value: 2000, size: Math.round(baseSize * 1.35) },
        { value: 800, size: Math.round(baseSize * 1.75) }
      ]
    };
  }

  function getAdultZoneSizeVariable() {
    const zone = perfProfile.zoneIconSize;
    const play = perfProfile.playIconSize;
    const swap = perfProfile.areaIconMaxScale;
    return {
      type: "size",
      valueExpression: "$view.scale",
      stops: [
        { value: 80000, size: Math.round(zone * 0.7) },
        { value: 20000, size: zone },
        { value: Math.round(swap * 1.2), size: zone },
        { value: swap, size: play },
        { value: 2000, size: Math.round(play * 1.35) },
        { value: 800, size: Math.round(play * 1.75) }
      ]
    };
  }

  function getPointIconSize(config) {
    return config.isAdultEquipment ? perfProfile.zoneIconSize : perfProfile.playIconSize;
  }

  function getPointSizeVariable(config) {
    const size = getPointIconSize(config);
    return config.isAdultEquipment ? getAdultZoneSizeVariable() : getPlayElementSizeVariable(size);
  }

  // Helper renderer for 2D symbols
  function get2DRenderer(config) {
    if (config.isPolygon) {
      return getAreaPolygonRenderer(false);
    }

    const size = getPointIconSize(config);
    return new SimpleRenderer({
      symbol: new PictureMarkerSymbol({
        url: config.icon2D,
        width: `${size}px`,
        height: `${size}px`
      }),
      visualVariables: [getPointSizeVariable(config)]
    });
  }

  // Helper renderer for 3D Perspective Billboard Icons planted on the ground
  function get3DRenderer(config) {
    if (config.isPolygon) {
      return getAreaPolygonRenderer(true);
    }

    const absIconUrl = new URL(config.icon2D, window.location.href).href;
    const size = getPointIconSize(config);
    return new SimpleRenderer({
      symbol: new PointSymbol3D({
        symbolLayers: [
          new IconSymbol3DLayer({
            resource: { href: absIconUrl },
            size,
            anchor: "bottom"
          })
        ]
      }),
      visualVariables: [getPointSizeVariable(config)]
    });
  }

  function isPlayElementConfig(config) {
    return !!(config && !config.isPolygon && !config.isAdultEquipment);
  }

  function getSelectedGameId() {
    return activeSelectedGameId == null ? DEFAULT_SELECTED_GAME_ID : activeSelectedGameId;
  }

  function getLayerMinScale(config) {
    if (config.isPolygon) return perfProfile.areaDetailScale;
    if (getSelectedGameId() === config.id) return 0;
    return perfProfile.areaIconMaxScale;
  }

  function getAreaOverviewRenderer(for3D) {
    const iconUrl = new URL(AREA_OVERVIEW_ICON, window.location.href).href;
    const size = perfProfile.zoneIconSize;
    if (for3D) {
      return new SimpleRenderer({
        symbol: new PointSymbol3D({
          symbolLayers: [
            new IconSymbol3DLayer({
              resource: { href: iconUrl },
              size,
              anchor: "center"
            })
          ]
        }),
        visualVariables: [getScaleSizeVariable(size)]
      });
    }
    return new SimpleRenderer({
      symbol: new PictureMarkerSymbol({
        url: AREA_OVERVIEW_ICON,
        width: `${size}px`,
        height: `${size}px`
      }),
      visualVariables: [getScaleSizeVariable(size)]
    });
  }

  // Helper renderer for Photorealistic 3D WebStyle Tree Symbol scaling by field ALTURA
  const TREE_HEIGHT_ARCADE = `
    var h = DefaultValue($feature.ALTURA, 8);
    if (h > 120) { h = h / 100; }
    return IIF(h < 3, 3, IIF(h > 22, 22, h));
  `;

  function get3DTreeRenderer() {
    if (!perfProfile.realisticTrees) {
      return new SimpleRenderer({
        symbol: {
          type: "point-3d",
          symbolLayers: [
            {
              type: "object",
              resource: { primitive: "cone" },
              material: { color: [46, 120, 52] },
              width: 2.4,
              depth: 2.4,
              height: 8,
              anchor: "bottom"
            }
          ]
        },
        visualVariables: [
          {
            type: "size",
            axis: "height",
            valueExpression: TREE_HEIGHT_ARCADE,
            valueUnit: "meters"
          }
        ]
      });
    }

    const treeSymbol = new WebStyleSymbol({
      name: "Acer",
      styleName: "EsriRealisticTreesStyle"
    });

    return new SimpleRenderer({
      symbol: treeSymbol,
      visualVariables: [
        {
          type: "size",
          axis: "height",
          valueExpression: TREE_HEIGHT_ARCADE,
          valueUnit: "meters"
        }
      ]
    });
  }

  // Setup Maps & Views
  function setupMapsAndViews() {
    map2D = new Map({ basemap: activeBasemap });
    map3D = new Map({ basemap: activeBasemap, ground: "world-elevation" });

    // Add 3D OpenStreetMap Buildings Layer (public)
    try {
      buildings3DLayer = new SceneLayer({
        url: BUILDINGS_3D_URL,
        title: "Edificios 3D OSM",
        popupEnabled: false,
        visible: perfProfile.osmBuildings,
        minScale: 8000,
        opacity: 0.55,
        renderer: new SimpleRenderer({
          symbol: {
            type: "mesh-3d",
            symbolLayers: [
              {
                type: "fill",
                material: {
                  color: [176, 180, 186, 0.9],
                  colorMixMode: "replace"
                }
              }
            ]
          }
        })
      });
      map3D.add(buildings3DLayer);
    } catch (e) {
      console.warn("3D Buildings load warning:", e);
    }

    try {
      const terminoRenderer = new SimpleRenderer({
        symbol: new SimpleFillSymbol({
          color: [0, 0, 0, 0],
          outline: {
            color: [28, 28, 28, 1],
            width: 1.15,
            style: "dash"
          }
        })
      });

      const termino2D = new FeatureLayer({
        url: TERMINO_MUNICIPAL_URL,
        title: "Término municipal",
        popupEnabled: false,
        legendEnabled: false,
        labelingInfo: null,
        renderer: terminoRenderer
      });
      const termino3D = new FeatureLayer({
        url: TERMINO_MUNICIPAL_URL,
        title: "Término municipal",
        popupEnabled: false,
        legendEnabled: false,
        labelingInfo: null,
        elevationInfo: { mode: "on-the-ground" },
        renderer: terminoRenderer
      });
      map2D.add(termino2D);
      map3D.add(termino3D);
    } catch (e) {
      console.warn("Término municipal:", e);
    }

    // Create 2D & 3D Feature Layers (Ensure polygon layers are added FIRST so they sit at the bottom of the map)
    const sortedConfigs = [...GAME_LAYERS_CONFIG].sort((a, b) => (b.isPolygon ? 1 : 0) - (a.isPolygon ? 1 : 0));

    sortedConfigs.forEach(cfg => {
      const url = `${SERVER_URL}/${cfg.id}`;
      const infantWhere = cfg.isPolygon ? AREA_INFANTIL_WHERE : "1=1";
      
      const layer2D = new FeatureLayer({
        url: url,
        title: cfg.name,
        outFields: ["*"],
        popupEnabled: true,
        definitionExpression: infantWhere,
        visible: cfg.id === DEFAULT_SELECTED_GAME_ID,
        minScale: getLayerMinScale(cfg),
        labelsVisible: !!cfg.isPolygon,
        labelingInfo: cfg.isPolygon ? getAreaSoilLabelingInfo(false) : null,
        renderer: get2DRenderer(cfg)
      });

      const layer3D = new FeatureLayer({
        url: url,
        title: cfg.name,
        outFields: ["*"],
        popupEnabled: true,
        definitionExpression: infantWhere,
        visible: cfg.id === DEFAULT_SELECTED_GAME_ID,
        minScale: getLayerMinScale(cfg),
        labelsVisible: !!cfg.isPolygon,
        labelingInfo: cfg.isPolygon ? getAreaSoilLabelingInfo(true) : null,
        opacity: cfg.isPolygon ? 0.7 : 1,
        elevationInfo: cfg.isPolygon
          ? { mode: "on-the-ground" }
          : { mode: "relative-to-ground", offset: 0.55 },
        renderer: get3DRenderer(cfg)
      });

      let areaCatcher3D = null;
      let overview2D = null;
      let overview3D = null;
      if (cfg.isPolygon) {
        areaCatcher3D = new FeatureLayer({
          url: url,
          title: `${cfg.name} sombra`,
          outFields: ["*"],
          legendEnabled: false,
          listMode: "hide",
          popupEnabled: true,
          labelsVisible: false,
          labelingInfo: null,
          definitionExpression: AREA_INFANTIL_WHERE,
          minScale: perfProfile.areaDetailScale,
          opacity: 0.28,
          elevationInfo: { mode: "on-the-ground" },
          renderer: getAreaPolygonRenderer(true)
        });
        map3D.add(areaCatcher3D);

        overview2D = new FeatureLayer({
          url: url,
          title: "Áreas de juego (vista general)",
          outFields: ["*"],
          popupEnabled: true,
          legendEnabled: false,
          listMode: "hide",
          definitionExpression: AREA_INFANTIL_WHERE,
          minScale: 0,
          maxScale: perfProfile.areaIconMaxScale,
          labelsVisible: false,
          renderer: getAreaOverviewRenderer(false)
        });
        overview3D = new FeatureLayer({
          url: url,
          title: "Áreas de juego (vista general)",
          outFields: ["*"],
          popupEnabled: true,
          legendEnabled: false,
          listMode: "hide",
          definitionExpression: AREA_INFANTIL_WHERE,
          minScale: 0,
          maxScale: perfProfile.areaIconMaxScale,
          labelsVisible: false,
          elevationInfo: { mode: "relative-to-ground", offset: 1.2 },
          renderer: getAreaOverviewRenderer(true)
        });
        map2D.add(overview2D);
        map3D.add(overview3D);
        overview2D.when(() => applyPlayPopupTemplate(overview2D, cfg));
        overview3D.when(() => applyPlayPopupTemplate(overview3D, cfg));
      }

      activeLayers2D.push({ config: cfg, layer: layer2D, overview: overview2D, fields: [] });
      activeLayers3D.push({ config: cfg, layer: layer3D, catcher: areaCatcher3D, overview: overview3D, fields: [] });

      map2D.add(layer2D);
      map3D.add(layer3D);

      layer2D.when(() => {
        const item2D = activeLayers2D.find(x => x.config.id === cfg.id);
        const item3D = activeLayers3D.find(x => x.config.id === cfg.id);
        if (layer2D.fields) {
          const names = layer2D.fields.map(f => f.name.toUpperCase());
          if (item2D) item2D.fields = names;
          if (item3D) item3D.fields = names;
        }
        applyPlayPopupTemplate(layer2D, cfg);
      });
      layer3D.when(() => {
        applyPlayPopupTemplate(layer3D, cfg);
        if (areaCatcher3D) applyPlayPopupTemplate(areaCatcher3D, cfg);
      });
    });

    // Add GraphicsLayer for Near Me search on top of feature layers in 2D
    map2D.add(nearMeGraphicsLayer);
    map2D.add(nearMeSelectLayer2D);
    map3D.add(nearMeSelectLayer3D);

    // Initialize 2D View on container #viewDiv
    view2D = new MapView({
      container: "viewDiv",
      map: map2D,
      center: getHomeView().center,
      zoom: getHomeView().zoom,
      padding: (perfProfile.isMobile || window.innerWidth < 900)
        ? { top: 6, right: 8, bottom: 20, left: 6 }
        : { top: 0, right: 0, bottom: 0, left: 0 }
    });
    try {
      if (view2D.popup) {
        view2D.popup.autoNavigateEnabled = false;
        view2D.popup.dockEnabled = true;
        view2D.popup.dockOptions = {
          buttonEnabled: false,
          breakpoint: false,
          position: perfProfile.isMobile ? "bottom-center" : "top-center"
        };
        view2D.popup.goToOverride = function() {
          return Promise.resolve();
        };
      }
    } catch (popupErr) {
      console.warn("Popup 2D config:", popupErr);
    }

    currentView = view2D;

    // View Ready Handler
    view2D.when(() => {
      document.getElementById("loadingOverlay").style.display = "none";
      applyCombinedFilters();
    });

    // Map click handler for Near Me (only when "Cerca de mí" tab is active)
    view2D.on("click", (evt) => {
      if (isNearMeTabActive() && evt.mapPoint) {
        setUserNearMePoint(evt.mapPoint);
      }
    });
  }

  function ensureArboladoLayer() {
    if (arboladoLayer3D) return;
    try {
      arboladoLayer3D = new FeatureLayer({
        url: ARBOLADO_V3_URL,
        title: "Todos los Árboles (Arbolado 3D)",
        outFields: ["ALTURA"],
        labelsVisible: false,
        labelingInfo: null,
        minScale: perfProfile.treeMinScale,
        definitionExpression: "ALTURA >= 3 AND ALTURA <= 40",
        elevationInfo: { mode: "relative-to-ground", offset: 0.15 },
        renderer: get3DTreeRenderer()
      });
      map3D.add(arboladoLayer3D);
    } catch (e) {
      console.warn("Arbolado 3D layer error:", e);
    }
  }

  // Switch between 2D and 3D views using clean container swap
  function switchTo3DMode() {
    if (perfProfile.isMobile || is3DMode) return;
    is3DMode = true;

    document.getElementById("btn3D").classList.add("active");
    document.getElementById("btn2D").classList.remove("active");

    // Detach 2D view from container
    view2D.container = null;

    if (!view3D) {
      // Lazy initialize 3D view directly on container #viewDiv with high overview camera of municipality
      view3D = new SceneView({
        container: "viewDiv",
        map: map3D,
        qualityProfile: perfProfile.qualityProfile,
        center: getHomeView().center,
        zoom: getHomeView().zoom,
        timeZone: "Europe/Madrid",
        environment: {
          lighting: new SunLighting({
            directShadowsEnabled: false,
            displayUTCOffset: 2,
            date: new Date(2026, 7, 10, 12, 0, 0)
          }),
          atmosphereEnabled: perfProfile.atmosphere,
          starsEnabled: false,
          weather: {
            type: "sunny"
          }
        }
      });
      view3D.when(() => {
        view3D.goTo({
          center: getHomeView().center,
          zoom: getHomeView().zoom,
          heading: 0,
          tilt: 10
        }, { animate: false });
      });
      if (view3D.popup) {
        view3D.popup.autoNavigateEnabled = false;
        view3D.popup.dockEnabled = true;
        view3D.popup.dockOptions = {
          buttonEnabled: false,
          breakpoint: false,
          position: "top-center"
        };
        view3D.popup.goToOverride = function() {
          return Promise.resolve();
        };
      }

      view3D.on("click", async (evt) => {
        if (isNearMeTabActive() && evt.mapPoint) {
          setUserNearMePoint(evt.mapPoint);
          return;
        }
        try {
          const hit = await view3D.hitTest(evt);
          const clickedPoint = hit.results.some((result) => {
            const layer = result.graphic && result.graphic.layer;
            return activeLayers3D.some((item) => item.layer === layer && !item.config.isPolygon);
          });
          if (clickedPoint) return;

          const areaLayers = activeLayers3D
            .filter((item) => item.config.isPolygon)
            .flatMap((item) => [item.catcher, item.layer].filter(Boolean));
          if (!areaLayers.length) return;

          const areaHit = await view3D.hitTest(evt, { include: areaLayers });
          const graphic = areaHit.results[0] && areaHit.results[0].graphic;
          if (graphic && view3D.popup) {
            view3D.popup.open({
              features: [graphic],
              location: evt.mapPoint
            });
          }
        } catch (err) {
          console.warn("Popup zona 3D:", err);
        }
      });
    } else {
      // Attach existing 3D view to container
      view3D.container = "viewDiv";
    }

    currentView = view3D;

    const treeToggle = document.getElementById("treeLayerToggle");
    if (treeToggle && treeToggle.checked) {
      ensureArboladoLayer();
    }
  }

  function switchTo2DMode() {
    if (!is3DMode) return;
    is3DMode = false;

    document.getElementById("btn2D").classList.add("active");
    document.getElementById("btn3D").classList.remove("active");

    const centerPoint = (view3D && view3D.center) ? [view3D.center.longitude, view3D.center.latitude] : [-3.528, 40.352];

    // Detach 3D view cleanly from container
    if (view3D) {
      view3D.container = null;
    }

    // Attach 2D view back to container
    view2D.container = "viewDiv";
    view2D.goTo({
      center: centerPoint,
      zoom: 15
    });

    currentView = view2D;
    document.getElementById("daylightWidgetContainer").classList.remove("active");
  }

  function createGameTypeItem(cfg) {
    const item = document.createElement("div");
    item.className = "game-type-item";
    item.dataset.id = cfg.id;

    item.innerHTML = `
      <div class="type-info">
        <img src="${cfg.icon2D}" alt="${cfg.name}" class="type-icon">
        <span class="type-name">${cfg.name}</span>
      </div>
      <span class="type-count" id="count-${cfg.id}">0</span>
    `;
    item.addEventListener("click", () => selectGameType(cfg.id, item));
    return item;
  }

  function createListSection(title, iconClass) {
    const header = document.createElement("div");
    header.className = "game-list-section";
    header.innerHTML = `<i class="${iconClass}"></i><span>${title}</span>`;
    return header;
  }

  function createAccordionSection(title, iconClass, expanded) {
    const wrap = document.createElement("div");
    wrap.className = "game-accordion" + (expanded ? " open" : "");
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "game-list-section game-accordion-toggle";
    btn.innerHTML = `<i class="${iconClass}"></i><span>${title}</span><i class="fa-solid fa-chevron-down accordion-chevron"></i>`;
    const body = document.createElement("div");
    body.className = "game-accordion-body";
    btn.addEventListener("click", () => wrap.classList.toggle("open"));
    wrap.appendChild(btn);
    wrap.appendChild(body);
    return { wrap, body };
  }

  // Populate Sidebar List of Game Types
  function renderGameTypeListUI() {
    const container = document.getElementById("gameTypeList");
    container.innerHTML = "";

    container.appendChild(createListSection("Zonas", "fa-solid fa-map-location-dot"));
    GAME_LAYERS_CONFIG.filter(cfg => cfg.isPolygon || cfg.isAdultEquipment).forEach(cfg => {
      container.appendChild(createGameTypeItem(cfg));
    });

    const elementsAcc = createAccordionSection("Elementos", "fa-solid fa-shapes", false);
    GAME_LAYERS_CONFIG.filter(cfg => !cfg.isPolygon && !cfg.isAdultEquipment).forEach(cfg => {
      elementsAcc.body.appendChild(createGameTypeItem(cfg));
    });
    container.appendChild(elementsAcc.wrap);

    const defaultItem = container.querySelector(`.game-type-item[data-id="${DEFAULT_SELECTED_GAME_ID}"]`);
    if (defaultItem) defaultItem.classList.add("active");
  }

  // Select Game Type Filter
  function selectGameType(gameId, targetEl) {
    activeSelectedGameId = gameId;

    document.querySelectorAll(".game-type-item").forEach(el => el.classList.remove("active"));
    if (targetEl) {
      targetEl.classList.add("active");
      const accordion = targetEl.closest(".game-accordion");
      if (accordion) accordion.classList.add("open");
    }

    applyCombinedFilters();
    closeMobileSidebar();
  }

  function layerMatchesCurrentSelection(item) {
    const selectedId = getSelectedGameId();
    if (item.config.id === selectedId) return true;
    if (selectedId === DEFAULT_SELECTED_GAME_ID && (isPlayElementConfig(item.config) || item.config.isAdultEquipment)) return true;
    return false;
  }

  function buildAttributeWhereClauses(item) {
    if (item.config.isPolygon) return [AREA_INFANTIL_WHERE];

    const availableFields = item.fields || [];
    const hasEdad = availableFields.includes("EDAD") || availableFields.includes("EDAD_G");
    const hasAccessible = availableFields.includes("ADAPTADO") || availableFields.includes("INCLUSIVO");
    const isAdultEquipment = !!item.config.isAdultEquipment;
    const skipAgeConstraint = activeAgeFilter === "adult" && isAdultEquipment;

    if (activeAgeFilter && !hasEdad && !skipAgeConstraint) return null;
    if (activeAccessibleFilter && !hasAccessible) return null;

    const whereClauses = [];

    if (activeAgeFilter && hasEdad && !skipAgeConstraint) {
      const ageClause = buildAgeWhereClause(availableFields);
      if (ageClause) whereClauses.push(ageClause);
    }

    if (activeAccessibleFilter && hasAccessible) {
      const accessParts = [];
      if (availableFields.includes("ADAPTADO")) {
        accessParts.push(`ADAPTADO = '${activeAccessibleFilter}'`);
      }
      if (availableFields.includes("INCLUSIVO")) {
        accessParts.push(`INCLUSIVO = '${activeAccessibleFilter}'`);
      }
      if (accessParts.length === 1) {
        whereClauses.push(accessParts[0]);
      } else if (accessParts.length > 1) {
        whereClauses.push(`(${accessParts.join(" OR ")})`);
      }
    }

    return whereClauses;
  }

  function applyFiltersToLayerSet(layerSet) {
    layerSet.forEach(item => {
      const syncExtras = (visible, whereExpr) => {
        if (item.catcher) {
          item.catcher.visible = visible;
          if (whereExpr !== undefined) item.catcher.definitionExpression = whereExpr;
        }
        if (item.overview) {
          item.overview.visible = visible;
          item.overview.maxScale = perfProfile.areaIconMaxScale;
          if (whereExpr !== undefined) item.overview.definitionExpression = whereExpr;
        }
      };

      if (!layerMatchesCurrentSelection(item)) {
        item.layer.visible = false;
        syncExtras(false);
        return;
      }

      const whereClauses = buildAttributeWhereClauses(item);
      if (whereClauses === null) {
        item.layer.visible = false;
        syncExtras(false);
        return;
      }

      const whereExpr = whereClauses.length > 0 ? whereClauses.join(" AND ") : "1=1";
      item.layer.definitionExpression = whereExpr;
      item.layer.minScale = getLayerMinScale(item.config);
      item.layer.visible = true;
      syncExtras(true, whereExpr);
    });
  }

  // Apply Combined Filter safely checking fields for each sublayer
  function applyCombinedFilters() {
    applyFiltersToLayerSet(activeLayers2D);
    applyFiltersToLayerSet(activeLayers3D);
    updateFeatureCounts();
  }

  function updateHeaderLegend(name, iconSrc, count, unitLabel) {
    const nameEl = document.getElementById("headerLegendName");
    const countEl = document.getElementById("headerLegendCount");
    const imgEl = document.getElementById("headerLegendIcon");
    const faEl = document.getElementById("headerLegendFa");
    if (!nameEl || !countEl) return;

    nameEl.textContent = name;
    const n = Number.isFinite(count) ? count : 0;
    countEl.textContent = `${n} ${unitLabel}`;

    if (iconSrc && imgEl && faEl) {
      imgEl.src = iconSrc;
      imgEl.alt = name;
      imgEl.hidden = false;
      faEl.hidden = true;
    } else if (imgEl && faEl) {
      imgEl.hidden = true;
      faEl.hidden = false;
    }
  }

  // Update dynamic feature counts
  async function updateFeatureCounts() {
    let selectedCount = 0;
    const selectedCfg = GAME_LAYERS_CONFIG.find(cfg => cfg.id === getSelectedGameId()) || null;

    for (const item of activeLayers2D) {
      const countBadge = document.getElementById(`count-${item.config.id}`);

      if (!item.layer.visible) {
        if (countBadge) countBadge.textContent = "0";
        continue;
      }

      try {
        const count = await item.layer.queryFeatureCount({ where: item.layer.definitionExpression || "1=1" });
        if (countBadge) countBadge.textContent = count;
        if (selectedCfg && item.config.id === selectedCfg.id) selectedCount = count;
      } catch (e) {
        if (countBadge) countBadge.textContent = "0";
      }
    }

    const grandTotal = selectedCount;
    const countAll = document.getElementById("count-all");
    if (countAll) countAll.textContent = grandTotal;
    const totalVisible = document.getElementById("totalVisibleCount");
    if (totalVisible) totalVisible.textContent = `${grandTotal} elementos`;
    const filterBadge = document.getElementById("filteredResultsBadge");
    if (filterBadge) filterBadge.textContent = `${grandTotal} visibles`;

    if (selectedCfg) {
      const unit = selectedCfg.isPolygon ? (selectedCount === 1 ? "área" : "áreas") : (selectedCount === 1 ? "elemento" : "elementos");
      updateHeaderLegend(selectedCfg.name, selectedCfg.icon2D, selectedCount, unit);
    } else {
      const areasCfg = GAME_LAYERS_CONFIG.find(cfg => cfg.id === DEFAULT_SELECTED_GAME_ID);
      updateHeaderLegend(areasCfg.name, areasCfg.icon2D, 0, "áreas");
    }
  }

  // Near Me Functionality
  function isNearMeTabActive() {
    const nearPane = document.getElementById("tab-near");
    return nearPane && nearPane.classList.contains("active");
  }

  function getNearMeHighlightSymbol() {
    return new SimpleMarkerSymbol({
      style: "circle",
      color: [0, 122, 61, 0.18],
      size: 36,
      outline: { color: [0, 122, 61, 1], width: 3 }
    });
  }

  function clearNearMeSelection() {
    nearMeSelectLayer2D.removeAll();
    nearMeSelectLayer3D.removeAll();
    document.querySelectorAll(".near-item-card.selected").forEach((el) => el.classList.remove("selected"));
  }

  function highlightNearMePoint(point) {
    const symbol = getNearMeHighlightSymbol();
    nearMeSelectLayer2D.removeAll();
    nearMeSelectLayer3D.removeAll();
    nearMeSelectLayer2D.add(new Graphic({ geometry: point, symbol }));
    nearMeSelectLayer3D.add(new Graphic({ geometry: point, symbol }));
  }

  async function focusNearMeFeature(feature, point, cardEl, fitGeometry) {
    if (!currentView || !point) return;

    document.querySelectorAll(".near-item-card.selected").forEach((el) => el.classList.remove("selected"));
    if (cardEl) cardEl.classList.add("selected");
    highlightNearMePoint(point);

    const geom = feature && feature.geometry;
    const useGeom = !!(fitGeometry && geom && geom.type !== "point");
    const target = useGeom ? geom : point;
    const farZoom = currentView.zoom == null || currentView.zoom < 16;
    const goToParams = useGeom
      ? { target }
      : (farZoom ? { target: point, zoom: 17 } : { target: point });

    if (is3DMode && view3D && view3D.camera) {
      goToParams.tilt = view3D.camera.tilt;
      goToParams.heading = view3D.camera.heading;
    }

    try {
      await currentView.goTo(goToParams, { duration: 700 });
    } catch (err) {
      console.warn("Cerca de mí, desplazamiento:", err);
    }

    if (currentView.popup) {
      currentView.popup.open({
        features: [feature],
        location: point
      });
    }
  }

  function clearNearMeSearch() {
    nearMeGraphicsLayer.removeAll();
    clearNearMeSelection();
    userLocationPoint = null;
    const btnClear = document.getElementById("btnClearNearMe");
    if (btnClear) btnClear.style.display = "none";

    const emptyHtml = `
      <div class="near-empty-hint">
        <i class="fa-solid fa-location-dot"></i>
        Pulsa en "Usar mi ubicación" o toca el mapa en esta pestaña para buscar zonas cercanas.
      </div>
    `;
    const resultsContainer = document.getElementById("nearMeResultsList");
    if (resultsContainer) resultsContainer.innerHTML = emptyHtml;
    const sheetList = document.getElementById("nearMeSheetList");
    if (sheetList) sheetList.innerHTML = emptyHtml;
    const countBadge = document.getElementById("nearResultsCount");
    if (countBadge) countBadge.textContent = "0 zonas";
    const sheetCount = document.getElementById("nearMeSheetCount");
    if (sheetCount) sheetCount.textContent = "0 zonas";
    setNearMeSheetOpen(false);
  }

  function setUserNearMePoint(point) {
    userLocationPoint = point;
    nearMeGraphicsLayer.removeAll();

    const btnClear = document.getElementById("btnClearNearMe");
    if (btnClear) btnClear.style.display = "flex";

    // User marker
    const userMarker = new Graphic({
      geometry: point,
      symbol: new SimpleMarkerSymbol({
        style: "circle",
        color: [217, 119, 6, 0.9],
        size: "16px",
        outline: { color: [255, 255, 255], width: 3 }
      })
    });

    const radiusMeters = parseInt(document.getElementById("radiusRange").value) || 500;

    // Buffer Circle
    const circleGeometry = new Circle({
      center: point,
      radius: radiusMeters,
      radiusUnit: "meters"
    });

    const circleGraphic = new Graphic({
      geometry: circleGeometry,
      symbol: new SimpleFillSymbol({
        color: [217, 119, 6, 0.15],
        outline: { color: [217, 119, 6, 0.8], width: 2, style: "dash" }
      })
    });

    nearMeGraphicsLayer.addMany([circleGraphic, userMarker]);

    queryNearMeResults(circleGeometry, point);
  }

  function syncMobilePopupDock() {
    if (!view2D || !view2D.popup) return;
    const sheet = document.getElementById("nearMeSheet");
    const sheetOpen = !!(sheet && sheet.classList.contains("open") && !sheet.hidden);
    view2D.popup.dockOptions = {
      buttonEnabled: false,
      breakpoint: false,
      position: isMobileLayout() && !sheetOpen ? "bottom-center" : "top-center"
    };
  }

  function setNearMeSheetOpen(open, minimized) {
    const sheet = document.getElementById("nearMeSheet");
    if (!sheet) return;
    const show = !!(open && isMobileLayout());
    sheet.hidden = !show;
    sheet.classList.toggle("open", show);
    sheet.classList.toggle("minimized", !!(show && minimized));
    syncMobilePopupDock();
  }

  function getNearMePoint(geom) {
    if (!geom) return null;
    if (geom.type === "point") return geom;
    if (geom.centroid) return geom.centroid;
    if (geom.extent) return geom.extent.center;
    return null;
  }

  function nearMeAttr(attrs, keys, fallback) {
    if (!attrs) return fallback;
    for (const key of keys) {
      if (attrs[key] !== undefined && attrs[key] !== null && String(attrs[key]).trim() !== "") {
        return attrs[key];
      }
    }
    return fallback;
  }

  function pingPongPlaceName(name) {
    let text = String(name || "");
    text = text.replace(/^\d+\.\s*/, "");
    text = text.replace(/^MESAS?\s+DE\s+PIN\s*PON\s*/i, "");
    text = text.replace(/\s*\(\d+\)\s*$/, "");
    return text.trim() || "Mesas de ping pong";
  }

  async function queryLayerInBuffer(layer, geometry, whereExpr) {
    if (!layer) return [];
    const query = layer.createQuery();
    query.geometry = geometry;
    query.spatialRelationship = "intersects";
    query.outFields = ["*"];
    query.returnGeometry = true;
    query.where = whereExpr || "1=1";
    try {
      const res = await layer.queryFeatures(query);
      return res.features || [];
    } catch (err) {
      console.warn("Cerca de mí, consulta:", err);
      return [];
    }
  }

  function toNearMeItem(feature, layerConfig, userPoint) {
    const point = getNearMePoint(feature.geometry);
    if (!point) return null;
    const distMeters = geometryEngine.distance(userPoint, point, "meters");
    return {
      feature,
      layerConfig,
      distance: Math.round(distMeters),
      point
    };
  }

  function assignPlayElementsToAreas(areas, elements) {
    const byCode = {};
    areas.forEach((area) => {
      const code = String(nearMeAttr(area.feature.attributes, ["COD_AREA"], "")).trim();
      if (code) byCode[code] = area;
      area.elements = area.elements || [];
    });

    const leftover = [];
    elements.forEach((el) => {
      const code = String(nearMeAttr(el.feature.attributes, ["COD_AREA_ORI"], "")).trim();
      if (code && byCode[code]) {
        byCode[code].elements.push(el);
      } else {
        leftover.push(el);
      }
    });

    leftover.forEach((el) => {
      const match = areas.find((area) => {
        try {
          return !!(area.feature.geometry && el.point && geometryEngine.contains(area.feature.geometry, el.point));
        } catch (err) {
          return false;
        }
      });
      if (match) match.elements.push(el);
    });

    areas.forEach((area) => {
      area.elements.sort((a, b) => a.distance - b.distance);
    });
  }

  function groupNearMeZones(items, keyFn, nameFn, layerConfig) {
    const groups = {};
    items.forEach((item) => {
      const key = keyFn(item) || "zona";
      if (!groups[key]) {
        groups[key] = {
          layerConfig,
          name: nameFn(item, key),
          items: [],
          distance: item.distance,
          point: item.point,
          feature: item.feature
        };
      }
      groups[key].items.push(item);
      if (item.distance < groups[key].distance) {
        groups[key].distance = item.distance;
        groups[key].point = item.point;
        groups[key].feature = item.feature;
      }
    });
    return Object.keys(groups).map((key) => {
      const group = groups[key];
      group.elements = group.items;
      return group;
    }).sort((a, b) => a.distance - b.distance);
  }

  function makeNearMeRouteUrl(point) {
    const lat = (point && point.latitude) || 40.352;
    const lon = (point && point.longitude) || -3.528;
    return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lon}`;
  }

  function fillNearMeResultsList(resultsContainer, zoneGroups) {
    if (!resultsContainer) return;

    const totalZones = zoneGroups.reduce((sum, group) => sum + group.zones.length, 0);
    if (totalZones === 0) {
      resultsContainer.innerHTML = `
        <div class="near-empty-hint">
          No se encontraron zonas de juego cerca. Pruebe a aumentar el radio.
        </div>
      `;
      return;
    }

    resultsContainer.innerHTML = "";

    zoneGroups.forEach((group) => {
      if (!group.zones.length) return;

      const groupSection = document.createElement("div");
      groupSection.className = "near-group-section";

      const groupHeader = document.createElement("div");
      groupHeader.className = "near-group-header";
      groupHeader.innerHTML = `
        <div class="near-group-title">
          <img src="${group.icon}" alt="${group.title}" class="near-group-icon">
          <span>${group.title}</span>
        </div>
        <span class="near-group-badge">${group.zones.length} ${group.zones.length === 1 ? "zona" : "zonas"}</span>
      `;
      groupSection.appendChild(groupHeader);

      group.zones.forEach((zone) => {
        const attrs = (zone.feature && zone.feature.attributes) || {};
        const title = zone.name || nearMeAttr(attrs, ["NOMBRE", "NAME", "UBICACION"], group.title);
        const adaptado = nearMeAttr(attrs, ["ADAPTADO", "INCLUSIVO"], "");
        const childCount = (zone.elements || []).length;
        const navUrl = makeNearMeRouteUrl(zone.point);

        const card = document.createElement("div");
        card.className = "near-item-card near-zone-card";
        if (group.expandable) card.classList.add("is-expandable");

        let extra = "";
        if (group.expandable) {
          extra = `<span class="near-detail-chip">${childCount} ${childCount === 1 ? "juego" : "juegos"}</span>`;
        } else if (group.key === "mesas" && childCount > 1) {
          extra = `<span class="near-detail-chip">${childCount} mesas</span>`;
        } else if (group.key === "calistenia" && childCount > 1) {
          extra = `<span class="near-detail-chip">${childCount} aparatos</span>`;
        }

        card.innerHTML = `
          <div class="near-item-header">
            <span class="near-item-title">${group.expandable ? `<i class="fa-solid fa-chevron-down near-zone-chevron"></i>` : ""}${title}</span>
            <span class="near-item-dist">${zone.distance} m</span>
          </div>
          <div class="near-item-details">
            ${adaptado ? `<span class="near-detail-chip ${String(adaptado).toUpperCase() === "SI" ? "is-adapted" : ""}"><i class="fa-solid fa-wheelchair"></i> Adaptado: ${adaptado}</span>` : ""}
            ${extra}
          </div>
          <a href="${navUrl}" target="_blank" rel="noopener" class="btn-route">
            <i class="fa-solid fa-diamond-turn-right"></i> Cómo llegar
          </a>
        `;

        if (group.expandable) {
          const nested = document.createElement("div");
          nested.className = "near-zone-elements";
          if (!childCount) {
            nested.innerHTML = `<p class="near-empty-hint" style="padding:8px 0;">No hay juegos inventariados en esta área.</p>`;
          } else {
            zone.elements.forEach((el) => {
              const elAttrs = el.feature.attributes || {};
              const elName = nearMeAttr(elAttrs, ["ELEMENTO", "TIPO"], el.layerConfig.name);
              const edad = nearMeAttr(elAttrs, ["EDAD", "EDAD_G"], "Todas");
              const elAdapt = nearMeAttr(elAttrs, ["ADAPTADO", "INCLUSIVO"], "NO");
              const row = document.createElement("div");
              row.className = "near-item-card near-nested-card";
              row.innerHTML = `
                <div class="near-item-header">
                  <span class="near-item-title"><img src="${el.layerConfig.icon2D}" alt="" class="near-group-icon"> ${elName}</span>
                </div>
                <div class="near-item-details">
                  <span class="near-detail-chip"><i class="fa-solid fa-child"></i> Edad: ${edad}</span>
                  <span class="near-detail-chip ${String(elAdapt).toUpperCase() === "SI" ? "is-adapted" : ""}">
                    <i class="fa-solid fa-wheelchair"></i> ${elAdapt}
                  </span>
                </div>
              `;
              row.addEventListener("click", (e) => {
                e.stopPropagation();
                if (isMobileLayout()) setNearMeSheetOpen(true, true);
                focusNearMeFeature(el.feature, el.point, row);
              });
              nested.appendChild(row);
            });
          }
          card.appendChild(nested);
        }

        card.addEventListener("click", (e) => {
          if (e.target.closest(".btn-route") || e.target.closest(".near-nested-card")) return;
          if (group.expandable) {
            card.classList.toggle("open");
          } else if (isMobileLayout()) {
            setNearMeSheetOpen(true, true);
          }
          focusNearMeFeature(zone.feature, zone.point, card, true);
        });

        groupSection.appendChild(card);
      });

      resultsContainer.appendChild(groupSection);
    });
  }

  // Query nearby zones (areas and adult equipment), then attach play elements to infant areas
  async function queryNearMeResults(geometry, userPoint) {
    const loadingHtml = '<div style="text-align:center; padding:1rem; color:var(--text-muted);">Buscando zonas cercanas...</div>';
    const resultsContainer = document.getElementById("nearMeResultsList");
    const sheetList = document.getElementById("nearMeSheetList");
    if (resultsContainer) resultsContainer.innerHTML = loadingHtml;
    if (sheetList) sheetList.innerHTML = loadingHtml;

    const findCfg = (pred) => activeLayers2D.find((item) => pred(item.config));
    const areaLayer = findCfg((cfg) => cfg.isPolygon);
    const bioLayer = findCfg((cfg) => cfg.key === "biosaludable");
    const calLayer = findCfg((cfg) => cfg.key === "calistenia");
    const pingLayer = findCfg((cfg) => cfg.key === "pingpong");
    const playLayers = activeLayers2D.filter((item) => !item.config.isPolygon && !item.config.isAdultEquipment);

    const [areaFeats, bioFeats, calFeats, pingFeats] = await Promise.all([
      queryLayerInBuffer(areaLayer && areaLayer.layer, geometry, AREA_INFANTIL_WHERE),
      queryLayerInBuffer(bioLayer && bioLayer.layer, geometry, "1=1"),
      queryLayerInBuffer(calLayer && calLayer.layer, geometry, "1=1"),
      queryLayerInBuffer(pingLayer && pingLayer.layer, geometry, "1=1")
    ]);

    const infantiles = areaFeats
      .map((feat) => toNearMeItem(feat, areaLayer && areaLayer.config, userPoint))
      .filter(Boolean)
      .sort((a, b) => a.distance - b.distance);

    const playElements = [];
    for (const item of playLayers) {
      const feats = await queryLayerInBuffer(item.layer, geometry, "1=1");
      feats.forEach((feat) => {
        const rec = toNearMeItem(feat, item.config, userPoint);
        if (rec) playElements.push(rec);
      });
    }
    assignPlayElementsToAreas(infantiles, playElements);

    const biosaludable = bioFeats
      .map((feat) => {
        const rec = toNearMeItem(feat, bioLayer.config, userPoint);
        if (!rec) return null;
        rec.name = nearMeAttr(feat.attributes, ["NAME", "NOMBRE", "ELEMENTO"], "Biosaludable");
        rec.elements = [];
        return rec;
      })
      .filter(Boolean)
      .sort((a, b) => a.distance - b.distance);

    const calItems = calFeats
      .map((feat) => toNearMeItem(feat, calLayer.config, userPoint))
      .filter(Boolean);
    const calistenia = groupNearMeZones(
      calItems,
      (item) => String(nearMeAttr(item.feature.attributes, ["CODIGO"], item.distance)),
      () => "Zona de calistenia",
      calLayer && calLayer.config
    );

    const pingItems = pingFeats
      .map((feat) => toNearMeItem(feat, pingLayer.config, userPoint))
      .filter(Boolean);
    const mesas = groupNearMeZones(
      pingItems,
      (item) => pingPongPlaceName(nearMeAttr(item.feature.attributes, ["NAME", "NOMBRE"], "")),
      (item, key) => key,
      pingLayer && pingLayer.config
    );

    const zoneGroups = [
      { key: "infantiles", title: "Áreas infantiles", icon: (areaLayer && areaLayer.config.icon2D) || AREA_OVERVIEW_ICON, expandable: true, zones: infantiles },
      { key: "biosaludable", title: "Biosaludable", icon: bioLayer ? bioLayer.config.icon2D : "", expandable: false, zones: biosaludable },
      { key: "calistenia", title: "Calistenia", icon: calLayer ? calLayer.config.icon2D : "", expandable: false, zones: calistenia },
      { key: "mesas", title: "Mesas de ping pong", icon: pingLayer ? pingLayer.config.icon2D : "", expandable: false, zones: mesas }
    ];

    const totalZones = zoneGroups.reduce((sum, group) => sum + group.zones.length, 0);
    const countText = `${totalZones} ${totalZones === 1 ? "zona" : "zonas"}`;
    const countBadge = document.getElementById("nearResultsCount");
    if (countBadge) countBadge.textContent = countText;
    const sheetCount = document.getElementById("nearMeSheetCount");
    if (sheetCount) sheetCount.textContent = countText;

    fillNearMeResultsList(resultsContainer, zoneGroups);
    fillNearMeResultsList(sheetList, zoneGroups);

    if (isMobileLayout()) {
      closeMobileSidebar();
      setNearMeSheetOpen(true, false);
    }
  }

  const WELCOME_STORAGE_KEY = "rivasJuegosHideWelcome";

  function isMobileLayout() {
    return perfProfile.isMobile || window.matchMedia("(max-width: 900px)").matches;
  }

  function setMobileSidebarOpen(open) {
    const sidebar = document.getElementById("sidebar");
    const backdrop = document.getElementById("sidebarBackdrop");
    if (!sidebar) return;
    sidebar.classList.toggle("open", open);
    if (backdrop) {
      backdrop.hidden = !open;
      backdrop.classList.toggle("visible", open);
    }
  }

  function closeMobileSidebar() {
    if (isMobileLayout()) setMobileSidebarOpen(false);
  }

  function hideWelcome(persist) {
    document.documentElement.classList.remove("show-welcome");
    if (persist) {
      try { localStorage.setItem(WELCOME_STORAGE_KEY, "1"); } catch (e) {}
    }
  }

  function showWelcome() {
    const box = document.getElementById("welcomeDontShow");
    if (box) box.checked = false;
    document.documentElement.classList.add("show-welcome");
  }

  function setupWelcome() {
    const startBtn = document.getElementById("welcomeStartBtn");
    const helpBtn = document.getElementById("btnWelcomeHelp");
    if (startBtn) {
      startBtn.addEventListener("click", () => {
        const persist = !!(document.getElementById("welcomeDontShow") || {}).checked;
        hideWelcome(persist);
      });
    }
    if (helpBtn) {
      helpBtn.addEventListener("click", showWelcome);
    }
    setupReportIssue();
  }

  const REPORT_EMAIL = "oficinainformacionterritorial@rivasciudad.es";

  function setReportOpen(open) {
    const overlay = document.getElementById("reportOverlay");
    if (!overlay) return;
    overlay.classList.toggle("is-open", open);
    overlay.hidden = !open;
  }

  function setupReportIssue() {
    const openBtn = document.getElementById("btnReportIssue");
    const closeBtn = document.getElementById("reportCloseBtn");
    const overlay = document.getElementById("reportOverlay");
    const form = document.getElementById("reportForm");
    const statusEl = document.getElementById("reportStatus");

    if (openBtn) openBtn.addEventListener("click", () => {
      if (statusEl) {
        statusEl.hidden = true;
        statusEl.textContent = "";
        statusEl.className = "report-status";
      }
      setReportOpen(true);
    });
    if (closeBtn) closeBtn.addEventListener("click", () => setReportOpen(false));
    if (overlay) {
      overlay.addEventListener("click", (e) => {
        if (e.target === overlay) setReportOpen(false);
      });
    }
    function getReportDraft() {
      const nombre = String((document.getElementById("reportName") || {}).value || "").trim();
      const correo = String((document.getElementById("reportEmail") || {}).value || "").trim();
      const mensaje = String((document.getElementById("reportMessage") || {}).value || "").trim();
      const subject = "Aviso Áreas de juego";
      const body = [
        "Aviso sobre el mapa Áreas de juego",
        "",
        "Nombre: " + (nombre || "No indicado"),
        "Correo: " + (correo || "No indicado"),
        "Fecha: " + new Date().toLocaleString("es-ES"),
        "",
        "Descripción:",
        mensaje
      ].join("\n");
      return { mensaje, subject, body };
    }

    function showReportStatus(ok, text) {
      if (!statusEl) return;
      statusEl.hidden = false;
      statusEl.className = "report-status " + (ok ? "is-ok" : "is-error");
      statusEl.textContent = text;
    }

    function openGmailDraft(draft) {
      const gmailUrl = "https://mail.google.com/mail/?view=cm&fs=1&tf=1"
        + "&to=" + encodeURIComponent(REPORT_EMAIL)
        + "&su=" + encodeURIComponent(draft.subject)
        + "&body=" + encodeURIComponent(draft.body);
      window.open(gmailUrl, "_blank", "noopener");
    }

    if (form) {
      form.addEventListener("submit", (e) => {
        e.preventDefault();
        const draft = getReportDraft();
        if (!draft.mensaje) {
          showReportStatus(false, "Escriba qué ha ocurrido antes de enviar.");
          return;
        }

        const mailto = "mailto:" + REPORT_EMAIL
          + "?subject=" + encodeURIComponent(draft.subject)
          + "&body=" + encodeURIComponent(draft.body.replace(/\n/g, "\r\n"));

        let leftForMailApp = false;
        const onBlur = () => { leftForMailApp = true; };
        window.addEventListener("blur", onBlur, { once: true });

        window.location.href = mailto;
        showReportStatus(true, "Elija su correo y pulse enviar. Si abre el navegador, se preparará Gmail con el aviso.");

        window.setTimeout(() => {
          window.removeEventListener("blur", onBlur);
          if (!leftForMailApp && document.hasFocus()) {
            openGmailDraft(draft);
            showReportStatus(true, "Se ha abierto Gmail con el aviso. Revíselo y púlselo enviar.");
          }
        }, 2200);
      });
    }
  }

  // Setup UI Controls & Event Listeners
  function setupUIInteractions() {
    if (perfProfile.isMobile || window.matchMedia("(max-width: 900px)").matches) {
      document.body.classList.add("mobile-2d-only");
    }

    setupWelcome();

    // 2D / 3D Mode Toggle Buttons
    document.getElementById("btn2D").addEventListener("click", () => {
      switchTo2DMode();
    });

    document.getElementById("btn3D").addEventListener("click", () => {
      switchTo3DMode();
    });

    // Basemap Selector Dropdowns (Header & Floating)
    const btnBasemapMenu = document.getElementById("btnBasemapMenu");
    const btnBasemapFloating = document.getElementById("btnBasemapFloating");
    const basemapMenu = document.getElementById("basemapMenu");
    const currentBasemapName = document.getElementById("currentBasemapName");

    function toggleBasemapMenu(e) {
      e.stopPropagation();
      basemapMenu.classList.toggle("open");
    }

    btnBasemapMenu.addEventListener("click", toggleBasemapMenu);
    btnBasemapFloating.addEventListener("click", toggleBasemapMenu);

    document.addEventListener("click", () => {
      basemapMenu.classList.remove("open");
    });

    document.querySelectorAll(".basemap-option").forEach(opt => {
      opt.addEventListener("click", (e) => {
        e.stopPropagation();
        const selectedBasemap = opt.dataset.basemap;
        activeBasemap = selectedBasemap;

        document.querySelectorAll(".basemap-option").forEach(o => o.classList.remove("active"));
        opt.classList.add("active");
        currentBasemapName.textContent = opt.innerText.trim();

        if (map2D) map2D.basemap = selectedBasemap;
        if (map3D) map3D.basemap = selectedBasemap;

        basemapMenu.classList.remove("open");
      });
    });

    // Sidebar Tab Navigation
    document.querySelectorAll(".tab-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        const tabId = btn.dataset.tab;
        document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
        document.querySelectorAll(".tab-pane").forEach(p => p.classList.remove("active"));

        btn.classList.add("active");
        document.getElementById(tabId).classList.add("active");

        // Clear Near Me radius search when leaving "Cerca de mí" tab
        if (tabId !== "tab-near") {
          clearNearMeSearch();
        }
      });
    });

    // Mobile Sidebar Drawer Toggle
    const mobileMenuBtn = document.getElementById("mobileMenuBtn");
    const sidebar = document.getElementById("sidebar");
    const sidebarBackdrop = document.getElementById("sidebarBackdrop");
    if (mobileMenuBtn && sidebar) {
      mobileMenuBtn.addEventListener("click", () => {
        setMobileSidebarOpen(!sidebar.classList.contains("open"));
      });
    }
    if (sidebarBackdrop) {
      sidebarBackdrop.addEventListener("click", () => setMobileSidebarOpen(false));
    }

    const nearMeSheetClose = document.getElementById("nearMeSheetClose");
    const nearMeSheetHandle = document.getElementById("nearMeSheetHandle");
    const nearMeSheet = document.getElementById("nearMeSheet");
    if (nearMeSheetClose) {
      nearMeSheetClose.addEventListener("click", () => setNearMeSheetOpen(false));
    }
    if (nearMeSheetHandle && nearMeSheet) {
      nearMeSheetHandle.addEventListener("click", () => {
        if (!nearMeSheet.classList.contains("open")) return;
        setNearMeSheetOpen(true, !nearMeSheet.classList.contains("minimized"));
      });
    }

    // Chips for recommended age stage
    document.querySelectorAll("#ageChips .chip-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        document.querySelectorAll("#ageChips .chip-btn").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        activeAgeFilter = btn.dataset.value;
        applyCombinedFilters();
      });
    });

    // Chips for Adapted
    document.querySelectorAll("#accessibleChips .chip-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        document.querySelectorAll("#accessibleChips .chip-btn").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        activeAccessibleFilter = btn.dataset.value;
        applyCombinedFilters();
      });
    });

    // Reset Filters Button
    document.getElementById("resetFiltersBtn").addEventListener("click", () => {
      activeSelectedGameId = null;
      activeAgeFilter = "";
      activeAccessibleFilter = "";

      document.querySelectorAll(".chip-btn").forEach(b => b.classList.remove("active"));
      document.querySelectorAll("#ageChips .chip-btn")[0].classList.add("active");
      document.querySelectorAll("#accessibleChips .chip-btn")[0].classList.add("active");

      const defaultItem = document.querySelector(`.game-type-item[data-id="${DEFAULT_SELECTED_GAME_ID}"]`);
      selectGameType(DEFAULT_SELECTED_GAME_ID, defaultItem);
    });

    // Near Me Radius Slider Display
    const radiusRange = document.getElementById("radiusRange");
    const radiusDisplay = document.getElementById("radiusValDisplay");
    radiusRange.addEventListener("input", (e) => {
      const val = e.target.value;
      radiusDisplay.textContent = val >= 1000 ? `${(val/1000).toFixed(1)} km` : `${val} m`;

      if (userLocationPoint) {
        setUserNearMePoint(userLocationPoint);
      }
    });

    // GPS Locate Button
    document.getElementById("btnLocateMe").addEventListener("click", () => {
      if ("geolocation" in navigator) {
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            const pt = new Point({
              longitude: pos.coords.longitude,
              latitude: pos.coords.latitude
            });
            setUserNearMePoint(pt);
          },
          (err) => {
            alert("No se pudo obtener su ubicación GPS. Por favor, haga clic directamente en el mapa.");
          }
        );
      }
    });

    document.getElementById("btnLocateFloating").addEventListener("click", () => {
      const nearTabBtn = document.querySelector('.tab-btn[data-tab="tab-near"]');
      if (nearTabBtn) nearTabBtn.click();
      document.getElementById("btnLocateMe").click();
    });

    // Clear Near Me Search Button
    const btnClearNearMe = document.getElementById("btnClearNearMe");
    if (btnClearNearMe) {
      btnClearNearMe.addEventListener("click", () => {
        clearNearMeSearch();
      });
    }

    // Reset View Button
    document.getElementById("btnResetView").addEventListener("click", () => {
      if (currentView) {
        if (is3DMode && view3D) {
          const home = getHomeView();
          view3D.goTo({
            center: home.center,
            zoom: home.zoom,
            heading: 0,
            tilt: 10
          });
        } else if (view2D) {
          view2D.goTo(getHomeView());
        }
      }
    });

    // 3D Tree Layer Toggle Switch
    const treeToggle = document.getElementById("treeLayerToggle");
    if (treeToggle) {
      treeToggle.checked = !perfProfile.isLowPower;
      treeToggle.addEventListener("change", (e) => {
        if (e.target.checked) {
          ensureArboladoLayer();
        }
        if (arboladoLayer3D) {
          arboladoLayer3D.visible = e.target.checked;
        }
      });
    }

    // Daylight / Sun Widget toggle button (Mutually exclusive with Weather widget to prevent overlap)
    document.getElementById("btnOpenDaylight").addEventListener("click", () => {
      if (!is3DMode) {
        switchTo3DMode();
      }

      const daylightContainer = document.getElementById("daylightWidgetContainer");
      daylightContainer.classList.toggle("active");

      if (daylightContainer.classList.contains("active") && view3D) {
        if (view3D.environment && view3D.environment.lighting) {
          view3D.environment.lighting.directShadowsEnabled = true;
        }
        if (!perfProfile.isLowPower) {
          view3D.qualityProfile = "high";
        }
        if (!daylightWidget) {
          daylightWidget = new Daylight({
            view: view3D,
            container: daylightContainer
          });
        }
      }
    });
  }

  // Initialize App on DOM Load
  initApp();

});
