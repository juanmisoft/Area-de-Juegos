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
  "esri/widgets/Weather",
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
  Weather,
  SunLighting
) {

  // Feature services (consulta pública)
  const SERVER_URL = "https://sit.rivasciudad.es/server/rest/services/AREA_JUEGO_VISUALIZACION/FeatureServer";
  const BUILDINGS_3D_URL = "https://basemaps3d.arcgis.com/arcgis/rest/services/OpenStreetMap3D_Buildings_v1/SceneServer";
  const ARBOLADO_V3_URL = "https://sit.rivasciudad.es/server/rest/services/ARBOLADO_VISOR_AREAS/FeatureServer/0"; // Item: 80098958485d465e9e61623d49e5edf3

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
      iconSize: isLowPower ? 22 : 28
    };
  })();

  let map2D, map3D;
  let view2D = null, view3D = null, currentView = null;
  let is3DMode = false;
  let daylightWidget = null;
  let weatherWidget = null;
  let buildings3DLayer = null;
  let arboladoLayer3D = null;
  
  // Layer definitions mapping with 2D icons and 3D perspective icons
  const GAME_LAYERS_CONFIG = [
    { id: 9, key: "areas", name: "Áreas de juego (Zonas)", icon2D: "Iconos 2D/patio-de-juegos.png", isPolygon: true },
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
    { values: ["Arena"], file: "arena.png", color: [212, 184, 130], label: "Arena" },
    { values: ["Arena rio", "Arena río"], file: "arena-rio.png", color: [186, 158, 108], label: "Arena de río" },
    { values: ["Terreno natural"], file: "terreno-natural.png", color: [106, 148, 72], label: "Terreno natural" },
    { values: ["Hormigon", "Hormigón"], file: "hormigon.png", color: [168, 168, 166], label: "Hormigón" },
    { values: ["Caucho continuo"], file: "caucho.png", color: [176, 58, 46], label: "Caucho continuo" },
    { values: ["Caucho arena rio", "Caucho y arena de río", "Caucho y arena de rio"], file: "caucho-arena.png", color: [176, 118, 78], label: "Caucho y arena" },
    { values: ["Loseta caucho"], file: "loseta-caucho.png", color: [92, 68, 66], label: "Loseta de caucho" },
    { values: ["Loseta caucho y C continuo", "Loseta caucho y C. continuo"], file: "loseta-mixto.png", color: [128, 78, 70], label: "Loseta y caucho continuo" },
    { values: ["Corcho"], file: "corcho.png", color: [176, 132, 76], label: "Corcho" },
    { values: ["-"], file: "suelo-default.png", color: [88, 140, 92], label: "Sin tipo de suelo" },
    { values: ["PISCINA"], file: "piscina.png", color: [43, 164, 217], label: "Piscina" }
  ];

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
    const r = Math.min(255, Math.round(color[0] * 0.88 + 36));
    const g = Math.min(255, Math.round(color[1] * 0.88 + 32));
    const b = Math.min(255, Math.round(color[2] * 0.88 + 24));
    return {
      type: "polygon-3d",
      symbolLayers: [
        {
          type: "fill",
          material: { color: [r, g, b, 0.5] },
          outline: { color: [32, 32, 32, 0.95], size: 1.45 }
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

  // Active feature layers instances with schema info
  const activeLayers2D = [];
  const activeLayers3D = [];
  
  // Graphics layer for Near Me pin and buffer radius
  let nearMeGraphicsLayer = new GraphicsLayer({ title: "Búsqueda Cerca de mí" });
  let userLocationPoint = null;

  // Filter States
  let activeSelectedGameId = null; // null = all
  let activeAgeFilter = "";
  let activeAdaptedFilter = "";
  let activeInclusiveFilter = "";
  let activeBasemap = "topo-vector";

  // Initialize App Authentication and Maps
  async function initApp() {
    try {
      setupMapsAndViews();
      setupUIInteractions();
      renderGameTypeListUI();

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
              const heading = getPlayPopupTitle(attrs, layerConfig);
              const shownLabels = {};

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
              POPUP_CITIZEN_FIELDS.forEach((fieldName) => {
                const val = attrs[fieldName];
                if (!popupHasValue(val)) return;
                if (popupSameText(val, heading)) return;
                const label = POPUP_FIELD_LABELS[fieldName] || fieldName;
                if (shownLabels[label]) return;
                shownLabels[label] = true;
                rowsHtml += `<div class="popup-detail-row"><strong>${escapeHtml(label)}:</strong> <span>${escapeHtml(val)}</span></div>`;
              });

              let tagsHtml = "";
              if (popupHasValue(adaptado) || popupHasValue(inclusivo)) {
                tagsHtml = `<div class="popup-tags">`;
                if (popupHasValue(adaptado)) {
                  const isSi = String(adaptado).toUpperCase() === "SI";
                  tagsHtml += `<span class="popup-tag ${isSi ? "adapted" : "not-adapted"}"><i class="fa-solid fa-wheelchair"></i> Adaptado: ${escapeHtml(adaptado)}</span>`;
                }
                if (popupHasValue(inclusivo)) {
                  const isSi = String(inclusivo).toUpperCase() === "SI";
                  tagsHtml += `<span class="popup-tag ${isSi ? "inclusive" : "not-inclusive"}"><i class="fa-solid fa-hands-holding-child"></i> Inclusivo: ${escapeHtml(inclusivo)}</span>`;
                }
                tagsHtml += `</div>`;
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

  // Helper renderer for 2D symbols
  function get2DRenderer(config) {
    if (config.isPolygon) {
      return getAreaPolygonRenderer(false);
    }

    return new SimpleRenderer({
      symbol: new PictureMarkerSymbol({
        url: config.icon2D,
        width: "28px",
        height: "28px"
      })
    });
  }

  // Helper renderer for 3D Perspective Billboard Icons planted on the ground
  function get3DRenderer(config) {
    if (config.isPolygon) {
      return getAreaPolygonRenderer(false, 36);
    }

    const absIconUrl = new URL(config.icon2D, window.location.href).href;
    return new SimpleRenderer({
      symbol: new PointSymbol3D({
        symbolLayers: [
          new IconSymbol3DLayer({
            resource: { href: absIconUrl },
            size: perfProfile.iconSize,
            anchor: "bottom"
          })
        ]
      })
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

    // Create 2D & 3D Feature Layers (Ensure polygon layers are added FIRST so they sit at the bottom of the map)
    const sortedConfigs = [...GAME_LAYERS_CONFIG].sort((a, b) => (b.isPolygon ? 1 : 0) - (a.isPolygon ? 1 : 0));

    sortedConfigs.forEach(cfg => {
      const url = `${SERVER_URL}/${cfg.id}`;
      
      const layer2D = new FeatureLayer({
        url: url,
        title: cfg.name,
        outFields: ["*"],
        labelsVisible: false,
        labelingInfo: null,
        renderer: get2DRenderer(cfg)
      });

      const layer3D = new FeatureLayer({
        url: url,
        title: cfg.name,
        outFields: ["*"],
        labelsVisible: false,
        labelingInfo: null,
        opacity: cfg.isPolygon ? 0.82 : 1,
        elevationInfo: cfg.isPolygon
          ? { mode: "on-the-ground" }
          : { mode: "relative-to-ground", offset: 0.55 },
        renderer: get3DRenderer(cfg)
      });

      let areaCatcher3D = null;
      if (cfg.isPolygon) {
        areaCatcher3D = new FeatureLayer({
          url: url,
          title: `${cfg.name} sombra`,
          outFields: ["*"],
          legendEnabled: false,
          listMode: "hide",
          popupEnabled: true,
          labelsVisible: false,
          elevationInfo: { mode: "on-the-ground" },
          renderer: getAreaPolygonRenderer(true)
        });
        map3D.add(areaCatcher3D);
      }

      activeLayers2D.push({ config: cfg, layer: layer2D, fields: [] });
      activeLayers3D.push({ config: cfg, layer: layer3D, catcher: areaCatcher3D, fields: [] });

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

    // Initialize 2D View on container #viewDiv
    view2D = new MapView({
      container: "viewDiv",
      map: map2D,
      center: [-3.528, 40.352],
      zoom: 13
    });
    try {
      if (view2D.popup) {
        view2D.popup.autoNavigateEnabled = false;
        view2D.popup.dockEnabled = true;
        view2D.popup.dockOptions = {
          buttonEnabled: false,
          breakpoint: false,
          position: "top-center"
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
      updateFeatureCounts();
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
    if (is3DMode) return;
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
        camera: {
          position: { longitude: -3.528, latitude: 40.320, z: 7500 },
          heading: 0,
          tilt: 20
        },
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
    document.getElementById("weatherWidgetContainer").classList.remove("active");
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

  // Populate Sidebar List of Game Types
  function renderGameTypeListUI() {
    const container = document.getElementById("gameTypeList");
    container.innerHTML = "";

    const allItem = document.createElement("div");
    allItem.className = "game-type-item active";
    allItem.dataset.id = "all";
    allItem.innerHTML = `
      <div class="type-info">
        <i class="fa-solid fa-border-all" style="font-size:1.4rem; color: var(--primary);"></i>
        <span class="type-name">Todo el inventario</span>
      </div>
      <span class="type-count" id="count-all">...</span>
    `;
    allItem.addEventListener("click", () => selectGameType(null, allItem));
    container.appendChild(allItem);

    container.appendChild(createListSection("Elementos", "fa-solid fa-shapes"));
    GAME_LAYERS_CONFIG.filter(cfg => !cfg.isPolygon).forEach(cfg => {
      container.appendChild(createGameTypeItem(cfg));
    });

    container.appendChild(createListSection("Zonas", "fa-solid fa-draw-polygon"));
    GAME_LAYERS_CONFIG.filter(cfg => cfg.isPolygon).forEach(cfg => {
      container.appendChild(createGameTypeItem(cfg));
    });
  }

  // Select Game Type Filter
  function selectGameType(gameId, targetEl) {
    activeSelectedGameId = gameId;

    document.querySelectorAll(".game-type-item").forEach(el => el.classList.remove("active"));
    if (targetEl) targetEl.classList.add("active");

    applyCombinedFilters();
  }

  function layerMatchesCurrentSelection(item) {
    return activeSelectedGameId === null || item.config.id === activeSelectedGameId;
  }

  function buildAttributeWhereClauses(item) {
    if (item.config.isPolygon) return [];

    const availableFields = item.fields || [];
    const hasEdad = availableFields.includes("EDAD") || availableFields.includes("EDAD_G");
    const hasAdaptado = availableFields.includes("ADAPTADO");
    const hasInclusivo = availableFields.includes("INCLUSIVO");
    const isAdultEquipment = !!item.config.isAdultEquipment;
    const skipAgeConstraint = activeAgeFilter === "adult" && isAdultEquipment;

    if (activeAgeFilter && !hasEdad && !skipAgeConstraint) return null;
    if (activeAdaptedFilter && !hasAdaptado) return null;
    if (activeInclusiveFilter && !hasInclusivo) return null;

    const whereClauses = [];

    if (activeAgeFilter && hasEdad && !skipAgeConstraint) {
      const ageClause = buildAgeWhereClause(availableFields);
      if (ageClause) whereClauses.push(ageClause);
    }

    if (activeAdaptedFilter && hasAdaptado) {
      whereClauses.push(`ADAPTADO = '${activeAdaptedFilter}'`);
    }

    if (activeInclusiveFilter && hasInclusivo) {
      whereClauses.push(`INCLUSIVO = '${activeInclusiveFilter}'`);
    }

    return whereClauses;
  }

  function applyFiltersToLayerSet(layerSet) {
    layerSet.forEach(item => {
      const syncCatcher = (visible, whereExpr) => {
        if (!item.catcher) return;
        item.catcher.visible = visible;
        if (whereExpr !== undefined) item.catcher.definitionExpression = whereExpr;
      };

      if (!layerMatchesCurrentSelection(item)) {
        item.layer.visible = false;
        syncCatcher(false);
        return;
      }

      const whereClauses = buildAttributeWhereClauses(item);
      if (whereClauses === null) {
        item.layer.visible = false;
        syncCatcher(false);
        return;
      }

      const whereExpr = whereClauses.length > 0 ? whereClauses.join(" AND ") : "1=1";
      item.layer.definitionExpression = whereExpr;
      item.layer.visible = true;
      syncCatcher(true, whereExpr);
    });
  }

  // Apply Combined Filter safely checking fields for each sublayer
  function applyCombinedFilters() {
    applyFiltersToLayerSet(activeLayers2D);
    applyFiltersToLayerSet(activeLayers3D);
    updateFeatureCounts();
  }

  // Update dynamic feature counts
  async function updateFeatureCounts() {
    let grandTotal = 0;

    for (const item of activeLayers2D) {
      const countBadge = document.getElementById(`count-${item.config.id}`);

      if (!item.layer.visible) {
        if (countBadge) countBadge.textContent = "0";
        continue;
      }

      try {
        const count = await item.layer.queryFeatureCount({ where: item.layer.definitionExpression || "1=1" });
        grandTotal += count;
        if (countBadge) countBadge.textContent = count;
      } catch (e) {
        if (countBadge) countBadge.textContent = "0";
      }
    }

    document.getElementById("count-all").textContent = grandTotal;
    document.getElementById("totalVisibleCount").textContent = `${grandTotal} elementos`;
    document.getElementById("filteredResultsBadge").textContent = `${grandTotal} visibles`;
  }

  // Near Me Functionality
  function isNearMeTabActive() {
    const nearPane = document.getElementById("tab-near");
    return nearPane && nearPane.classList.contains("active");
  }

  function clearNearMeSearch() {
    nearMeGraphicsLayer.removeAll();
    userLocationPoint = null;
    const btnClear = document.getElementById("btnClearNearMe");
    if (btnClear) btnClear.style.display = "none";

    const resultsContainer = document.getElementById("nearMeResultsList");
    if (resultsContainer) {
      resultsContainer.innerHTML = `
        <div style="font-size: 0.85rem; color: var(--text-muted); text-align: center; padding: 1.5rem;">
          <i class="fa-solid fa-location-dot" style="font-size: 2rem; margin-bottom: 8px; color: #CBD5E1;"></i><br>
          Pulsa en "Usar mi ubicación" o haz clic en el mapa estando en esta pestaña para buscar elementos infantiles cercanos.
        </div>
      `;
    }
    const countBadge = document.getElementById("nearResultsCount");
    if (countBadge) countBadge.textContent = "0 elementos";
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

  // Query features inside Near Me buffer
  async function queryNearMeResults(geometry, userPoint) {
    const resultsContainer = document.getElementById("nearMeResultsList");
    resultsContainer.innerHTML = '<div style="text-align:center; padding:1rem; color:var(--text-muted);">Buscando juegos cercanos...</div>';

    const nearbyFeatures = [];

    for (const item of activeLayers2D) {
      if (!item.layer.visible) continue;

      const query = item.layer.createQuery();
      query.geometry = geometry;
      query.spatialRelationship = "intersects";
      query.outFields = ["*"];
      query.returnGeometry = true;

      try {
        const res = await item.layer.queryFeatures(query);
        res.features.forEach(feat => {
          let featPoint = feat.geometry;
          if (featPoint.type !== "point" && featPoint.extent) {
            featPoint = featPoint.extent.center;
          }

          if (featPoint) {
            const distMeters = geometryEngine.distance(userPoint, featPoint, "meters");
            nearbyFeatures.push({
              feature: feat,
              layerConfig: item.config,
              distance: Math.round(distMeters),
              point: featPoint
            });
          }
        });
      } catch (err) {
        console.warn("Near Me query error:", err);
      }
    }

    nearbyFeatures.sort((a, b) => a.distance - b.distance);

    document.getElementById("nearResultsCount").textContent = `${nearbyFeatures.length} elementos`;

    if (nearbyFeatures.length === 0) {
      resultsContainer.innerHTML = `
        <div style="font-size:0.85rem; color:var(--text-muted); text-align:center; padding:1.5rem;">
          No se encontraron juegos infantiles dentro del radio seleccionado. Pruebe a aumentar el radio.
        </div>
      `;
      return;
    }

    resultsContainer.innerHTML = "";

    // Group nearby features by element type (Layer Config Name / Tipo)
    const groups = {};
    nearbyFeatures.forEach(item => {
      const typeKey = item.layerConfig.name;
      if (!groups[typeKey]) {
        groups[typeKey] = {
          config: item.layerConfig,
          items: []
        };
      }
      groups[typeKey].items.push(item);
    });

    // Render each group section with group label header
    Object.keys(groups).forEach(typeKey => {
      const group = groups[typeKey];
      
      const groupSection = document.createElement("div");
      groupSection.className = "near-group-section";

      const groupHeader = document.createElement("div");
      groupHeader.className = "near-group-header";
      groupHeader.innerHTML = `
        <div class="near-group-title">
          <img src="${group.config.icon2D}" alt="${typeKey}" class="near-group-icon">
          <span>${typeKey}</span>
        </div>
        <span class="near-group-badge">${group.items.length} ${group.items.length === 1 ? 'elemento' : 'elementos'}</span>
      `;
      groupSection.appendChild(groupHeader);

      group.items.forEach(item => {
        const attrs = item.feature.attributes || {};
        const nombre = attrs.ELEMENTO || attrs.Elemento || attrs.TIPO || item.layerConfig.name;
        const adaptado = attrs.ADAPTADO || attrs.Adaptado || 'NO';
        const edad = attrs.EDAD || attrs.EDAD_G || 'Todas';
        const lat = item.point.latitude || 40.352;
        const lon = item.point.longitude || -3.528;
        const navUrl = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lon}`;

        const card = document.createElement("div");
        card.className = "near-item-card";
        card.innerHTML = `
          <div class="near-item-header">
            <span class="near-item-title">${nombre}</span>
            <span class="near-item-dist">${item.distance} m</span>
          </div>
          <div class="near-item-details">
            <span class="near-detail-chip"><i class="fa-solid fa-child"></i> Edad: ${edad}</span>
            <span class="near-detail-chip ${adaptado === 'SI' ? 'is-adapted' : ''}">
              <i class="fa-solid fa-wheelchair"></i> Adaptado: ${adaptado}
            </span>
          </div>
          <a href="${navUrl}" target="_blank" rel="noopener" class="btn-route">
            <i class="fa-solid fa-diamond-turn-right"></i> Cómo llegar (GPS)
          </a>
        `;

        // Selecting card opens popup on current map view without altering zoom
        card.addEventListener("click", (e) => {
          if (e.target.closest(".btn-route")) return;
          if (currentView) {
            currentView.popup.open({
              features: [item.feature],
              location: item.point
            });
          }
        });

        groupSection.appendChild(card);
      });

      resultsContainer.appendChild(groupSection);
    });
  }

  // Set weather condition in 3D scene
  function setSceneWeather(weatherType) {
    if (!is3DMode) {
      switchTo3DMode();
    }

    if (!view3D) return;

    if (weatherType === "sunny") {
      view3D.environment.weather = { type: "sunny" };
    } else if (weatherType === "cloudy") {
      view3D.environment.weather = { type: "cloudy", cloudCover: 0.7 };
    } else if (weatherType === "rainy") {
      view3D.environment.weather = { type: "rainy", precipitation: 0.6, cloudCover: 0.8 };
    } else if (weatherType === "snowy") {
      view3D.environment.weather = { type: "snowy", precipitation: 0.6, cloudCover: 0.8, snowCover: "enabled" };
    } else if (weatherType === "foggy") {
      view3D.environment.weather = { type: "foggy", fogStrength: 0.6 };
    }
  }

  // Setup UI Controls & Event Listeners
  function setupUIInteractions() {
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

        map2D.basemap = selectedBasemap;
        map3D.basemap = selectedBasemap;

        basemapMenu.classList.remove("open");
      });
    });

    // Weather Buttons Handler
    document.querySelectorAll(".weather-btn[data-weather]").forEach(btn => {
      btn.addEventListener("click", () => {
        document.querySelectorAll(".weather-btn[data-weather]").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        setSceneWeather(btn.dataset.weather);
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
    mobileMenuBtn.addEventListener("click", () => {
      sidebar.classList.toggle("open");
    });

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
    document.querySelectorAll("#adaptedChips .chip-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        document.querySelectorAll("#adaptedChips .chip-btn").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        activeAdaptedFilter = btn.dataset.value;
        applyCombinedFilters();
      });
    });

    // Chips for Inclusive
    document.querySelectorAll("#inclusiveChips .chip-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        document.querySelectorAll("#inclusiveChips .chip-btn").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        activeInclusiveFilter = btn.dataset.value;
        applyCombinedFilters();
      });
    });

    // Reset Filters Button
    document.getElementById("resetFiltersBtn").addEventListener("click", () => {
      activeSelectedGameId = null;
      activeAgeFilter = "";
      activeAdaptedFilter = "";
      activeInclusiveFilter = "";

      document.querySelectorAll(".chip-btn").forEach(b => b.classList.remove("active"));
      document.querySelectorAll("#ageChips .chip-btn")[0].classList.add("active");
      document.querySelectorAll("#adaptedChips .chip-btn")[0].classList.add("active");
      document.querySelectorAll("#inclusiveChips .chip-btn")[0].classList.add("active");

      selectGameType(null, document.querySelector('.game-type-item[data-id="all"]'));
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
          view3D.goTo({
            position: { longitude: -3.528, latitude: 40.320, z: 7500 },
            heading: 0,
            tilt: 20
          });
        } else if (view2D) {
          view2D.goTo({
            center: [-3.528, 40.352],
            zoom: 13
          });
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
      const weatherContainer = document.getElementById("weatherWidgetContainer");

      // Hide weather widget card to prevent visual overlap
      weatherContainer.classList.remove("active");

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

    // Native Weather Widget Toggle (Mutually exclusive with Daylight widget to prevent overlap)
    document.getElementById("btnOpenWeatherWidget").addEventListener("click", () => {
      if (!is3DMode) {
        switchTo3DMode();
      }

      const daylightContainer = document.getElementById("daylightWidgetContainer");
      const weatherContainer = document.getElementById("weatherWidgetContainer");

      // Hide daylight widget card to prevent visual overlap
      daylightContainer.classList.remove("active");

      weatherContainer.classList.toggle("active");

      if (weatherContainer.classList.contains("active") && !weatherWidget && view3D) {
        weatherWidget = new Weather({
          view: view3D,
          container: weatherContainer
        });
      }
    });
  }

  // Initialize App on DOM Load
  initApp();

});
