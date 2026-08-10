/* Main Application JavaScript - Inventario de Juegos Infantiles Rivas Vaciamadrid */

require([
  "esri/config",
  "esri/identity/IdentityManager",
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
  "esri/symbols/PictureMarkerSymbol",
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
  IdentityManager,
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
  PictureMarkerSymbol,
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

  // Portal Configuration & Token Authentication
  const PORTAL_URL = "https://sit.rivasciudad.es/portal";
  const SERVER_URL = "https://sit.rivasciudad.es/server/rest/services/AREA_JUEGO_VISUALIZACION/FeatureServer";
  const BUILDINGS_3D_URL = "https://basemaps3d.arcgis.com/arcgis/rest/services/OpenStreetMap3D_Buildings_v1/SceneServer";
  const ARBOLADO_V3_URL = "https://sit.rivasciudad.es/server/rest/services/Visualizacion_arbolado_Rivamadrid_V3/FeatureServer/11"; // Item: ce35426da80045328ece3d2b87fbc948
  
  let portalToken = null;
  let map2D, map3D;
  let view2D = null, view3D = null, currentView = null;
  let is3DMode = false;
  let daylightWidget = null;
  let weatherWidget = null;
  let buildings3DLayer = null;
  let arboladoLayer3D = null;
  
  // Layer definitions mapping with 2D icons and 3D perspective icons
  const GAME_LAYERS_CONFIG = [
    { id: 0, key: "trepar", name: "Juego de trepar", icon2D: "Iconos 2D/trepar.png", color: "#A16207", primitive: "sphere" },
    { id: 1, key: "tirolina", name: "Tirolina", icon2D: "Iconos 2D/tirolina.png", color: "#0891B2", primitive: "cylinder" },
    { id: 4, key: "biosaludable", name: "Biosaludable", icon2D: "Iconos 2D/Biosaludable.png", color: "#16A34A", primitive: "cylinder" },
    { id: 5, key: "columpio", name: "Columpio", icon2D: "Iconos 2D/columpio.png", color: "#2563EB", primitive: "cylinder" },
    { id: 6, key: "carrusel", name: "Carrusel", icon2D: "Iconos 2D/carrusel.png", color: "#9333EA", primitive: "cylinder" },
    { id: 7, key: "balancin", name: "Balancín", icon2D: "Iconos 2D/balancin.png", color: "#D97706", primitive: "cylinder" },
    { id: 8, key: "calistenia", name: "Calistenia", icon2D: "Iconos 2D/Calistemia.png", color: "#059669", primitive: "cube" },
    { id: 9, key: "areas", name: "Áreas de juego (Zonas)", icon2D: "Iconos 2D/patio-de-juegos.png", isPolygon: true },
    { id: 13, key: "tobogan", name: "Tobogán", icon2D: "Iconos 2D/tobogan.png", color: "#EA580C", primitive: "cone" },
    { id: 14, key: "sindatos", name: "Sin datos", icon2D: "Iconos 2D/casa.png", color: "#6B7280", primitive: "cube" },
    { id: 16, key: "compactos", name: "Multijuego / Compactos", icon2D: "Iconos 2D/Multijuego.png", color: "#E11D48", primitive: "cube" },
    { id: 17, key: "elemento", name: "Elemento de juego", icon2D: "Iconos 2D/Elemento_juego.png", color: "#0D9488", primitive: "sphere" },
    { id: 18, key: "red", name: "Red de trepa", icon2D: "Iconos 2D/Red.png", color: "#4F46E5", primitive: "cone" },
    { id: 20, key: "pingpong", name: "Ping pong", icon2D: "Iconos 2D/ping-pong.png", color: "#0284C7", primitive: "cube" }
  ];

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
      // 1. Obtain Token from SIT Portal
      await fetchPortalToken();

      // 2. Build 2D and 3D Maps & Views
      setupMapsAndViews();

      // 3. Setup UI Controls & Listeners
      setupUIInteractions();

      // 4. Populate Game Types List in Sidebar
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

  // Token authentication
  async function fetchPortalToken() {
    const tokenUrl = `${PORTAL_URL}/sharing/rest/generateToken`;
    const formData = new URLSearchParams();
    formData.append("username", "jmrojas");
    formData.append("password", "Password.361790");
    formData.append("referer", window.location.origin);
    formData.append("f", "json");

    const response = await fetch(tokenUrl, {
      method: "POST",
      body: formData
    });

    const data = await response.json();
    if (data && data.token) {
      portalToken = data.token;
      IdentityManager.registerToken({
        server: "https://sit.rivasciudad.es",
        token: portalToken
      });
    } else {
      throw new Error("No se pudo obtener el token de acceso al Portal.");
    }
  }

  // Create Custom Popup Template for Play Elements with Photo Attachments
  function createPlayElementPopupTemplate(layerConfig) {
    return {
      title: "{ELEMENTO} - {TIPO}",
      content: [
        {
          type: "custom",
          creator: function(target) {
            const attrs = target.graphic.attributes;
            const edad = attrs.EDAD || attrs.EDAD_G || "Todas";
            const adaptado = attrs.ADAPTADO || "NO";
            const inclusivo = attrs.INCLUSIVO || "NO";
            const suelo = attrs.TIPOSUELO || attrs.TIPO_DE_SUELO || "N/A";
            const codigo = attrs.CODIGO || attrs.CODIGO_AREA || "N/A";
            
            let lat = 40.352, lon = -3.528;
            if (target.graphic.geometry) {
              if (target.graphic.geometry.type === "point") {
                lat = target.graphic.geometry.latitude || 40.352;
                lon = target.graphic.geometry.longitude || -3.528;
              } else if (target.graphic.geometry.extent) {
                const center = target.graphic.geometry.extent.center;
                lat = center.latitude || 40.352;
                lon = center.longitude || -3.528;
              }
            }

            const navUrl = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lon}`;

            const container = document.createElement("div");
            container.className = "popup-custom-card";
            container.innerHTML = `
              <div class="popup-tags">
                <span class="popup-tag"><i class="fa-solid fa-child"></i> Edad: ${edad}</span>
                <span class="popup-tag adapted"><i class="fa-solid fa-wheelchair"></i> Adaptado: ${adaptado}</span>
                <span class="popup-tag inclusive"><i class="fa-solid fa-hands-holding-child"></i> Inclusivo: ${inclusivo}</span>
              </div>

              <div style="margin-top: 8px; font-size: 0.82rem; color: #475569;">
                <strong>Cód. Área:</strong> ${codigo}<br>
                <strong>Tipo de Suelo:</strong> ${suelo}
              </div>

              <a href="${navUrl}" target="_blank" rel="noopener" class="btn-route popup-btn-route">
                <i class="fa-solid fa-diamond-turn-right"></i> Cómo llegar (GPS Navegador)
              </a>
            `;
            return container;
          }
        },
        {
          type: "attachments" // Native ArcGIS attachment gallery/photos
        }
      ]
    };
  }

  // Helper renderer for 2D symbols
  function get2DRenderer(config) {
    if (config.isPolygon) {
      return new SimpleRenderer({
        symbol: new SimpleFillSymbol({
          color: [0, 122, 61, 0.25],
          outline: { color: [0, 122, 61, 0.9], width: 2 }
        })
      });
    }

    return new SimpleRenderer({
      symbol: new PictureMarkerSymbol({
        url: config.icon2D,
        width: "28px",
        height: "28px"
      })
    });
  }

  // Helper renderer for 3D Perspective Billboard Icons
  function get3DRenderer(config) {
    if (config.isPolygon) {
      return new SimpleRenderer({
        symbol: new SimpleFillSymbol({
          color: [0, 122, 61, 0.35],
          outline: { color: [0, 122, 61, 1], width: 2 }
        })
      });
    }

    const absIconUrl = new URL(config.icon2D, window.location.href).href;
    return new SimpleRenderer({
      symbol: new PointSymbol3D({
        symbolLayers: [
          new IconSymbol3DLayer({
            resource: { href: absIconUrl },
            size: 32
          })
        ]
      })
    });
  }

  // Helper renderer for Photorealistic 3D WebStyle Tree Symbol scaling by field ALTURA
  function get3DTreeRenderer() {
    const treeSymbol = new WebStyleSymbol({
      name: "Acer",
      styleName: "EsriRealisticTreesStyle"
    });

    return new SimpleRenderer({
      symbol: treeSymbol,
      visualVariables: [
        {
          type: "size",
          field: "ALTURA",
          axis: "height",
          valueUnit: "meters"
        },
        {
          type: "size",
          field: "ALTURA",
          axis: "width-and-depth",
          expression: "IIF($feature.ALTURA > 0, $feature.ALTURA * 0.75, 4.5)",
          valueUnit: "meters"
        }
      ]
    });
  }

  // Setup Maps & Views
  function setupMapsAndViews() {
    map2D = new Map({ basemap: activeBasemap });
    map3D = new Map({ basemap: activeBasemap, ground: "world-topobathymetry" });

    map2D.add(nearMeGraphicsLayer);

    // Add 3D OpenStreetMap Buildings Layer
    try {
      buildings3DLayer = new SceneLayer({
        url: BUILDINGS_3D_URL,
        title: "Edificios 3D Municipal",
        popupEnabled: false
      });
      map3D.add(buildings3DLayer);
    } catch (e) {
      console.warn("3D Buildings load warning:", e);
    }

    // Add Photorealistic 3D Tree Layer (Visualizacion_arbolado_Rivamadrid_V3 - ID: ce35426da80045328ece3d2b87fbc948)
    try {
      arboladoLayer3D = new FeatureLayer({
        url: `${ARBOLADO_V3_URL}?token=${portalToken}`,
        title: "Todos los Árboles (Arbolado 3D)",
        outFields: ["*"],
        labelsVisible: false,
        labelingInfo: null,
        elevationInfo: { mode: "on-the-ground" },
        renderer: get3DTreeRenderer()
      });
      map3D.add(arboladoLayer3D);
    } catch (e) {
      console.warn("Arbolado 3D layer error:", e);
    }

    // Create 2D & 3D Feature Layers
    GAME_LAYERS_CONFIG.forEach(cfg => {
      const url = `${SERVER_URL}/${cfg.id}?token=${portalToken}`;
      
      const layer2D = new FeatureLayer({
        url: url,
        title: cfg.name,
        outFields: ["*"],
        labelsVisible: false,
        labelingInfo: null,
        renderer: get2DRenderer(cfg),
        popupTemplate: createPlayElementPopupTemplate(cfg)
      });

      const layer3D = new FeatureLayer({
        url: url,
        title: cfg.name,
        outFields: ["*"],
        labelsVisible: false,
        labelingInfo: null,
        elevationInfo: { mode: "relative-to-ground", offset: cfg.isPolygon ? 0 : 2 },
        renderer: get3DRenderer(cfg),
        popupTemplate: createPlayElementPopupTemplate(cfg)
      });

      activeLayers2D.push({ config: cfg, layer: layer2D, fields: [] });
      activeLayers3D.push({ config: cfg, layer: layer3D, fields: [] });

      map2D.add(layer2D);
      map3D.add(layer3D);

      // Inspect layer schema to know available fields
      layer2D.when(() => {
        const item2D = activeLayers2D.find(x => x.config.id === cfg.id);
        const item3D = activeLayers3D.find(x => x.config.id === cfg.id);
        if (layer2D.fields) {
          const names = layer2D.fields.map(f => f.name.toUpperCase());
          if (item2D) item2D.fields = names;
          if (item3D) item3D.fields = names;
        }
      });
    });

    // Initialize 2D View on container #viewDiv
    view2D = new MapView({
      container: "viewDiv",
      map: map2D,
      center: [-3.528, 40.352],
      zoom: 15
    });

    currentView = view2D;

    // View Ready Handler
    view2D.when(() => {
      document.getElementById("loadingOverlay").style.display = "none";
      updateFeatureCounts();
    });

    // Map click handler for Near Me
    view2D.on("click", (evt) => {
      if (evt.mapPoint) setUserNearMePoint(evt.mapPoint);
    });
  }

  // Switch between 2D and 3D views using clean container swap
  function switchTo3DMode() {
    if (is3DMode) return;
    is3DMode = true;

    document.getElementById("btn3D").classList.add("active");
    document.getElementById("btn2D").classList.remove("active");

    const centerPoint = view2D.center ? [view2D.center.longitude, view2D.center.latitude] : [-3.528, 40.352];

    // Detach 2D view from container
    view2D.container = null;

    if (!view3D) {
      // Lazy initialize 3D view directly on container #viewDiv
      view3D = new SceneView({
        container: "viewDiv",
        map: map3D,
        camera: {
          position: { longitude: centerPoint[0], latitude: centerPoint[1] - 0.006, z: 450 },
          heading: 0,
          tilt: 52
        },
        timeZone: "Europe/Madrid",
        environment: {
          lighting: new SunLighting({
            directShadowsEnabled: true,
            displayUTCOffset: 2, // UTC+2 (España Horario de Verano CEST)
            date: new Date(2026, 7, 10, 12, 0, 0)
          }),
          weather: {
            type: "sunny"
          }
        }
      });

      view3D.on("click", (evt) => {
        if (evt.mapPoint) setUserNearMePoint(evt.mapPoint);
      });
    } else {
      // Attach existing 3D view to container
      view3D.container = "viewDiv";
      view3D.goTo({
        center: centerPoint,
        zoom: 16,
        tilt: 52
      });
    }

    currentView = view3D;
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

  // Populate Sidebar List of Game Types
  function renderGameTypeListUI() {
    const container = document.getElementById("gameTypeList");
    container.innerHTML = "";

    // "Todos" item
    const allItem = document.createElement("div");
    allItem.className = "game-type-item active";
    allItem.dataset.id = "all";
    allItem.innerHTML = `
      <div class="type-info">
        <i class="fa-solid fa-border-all" style="font-size:1.4rem; color: var(--primary);"></i>
        <span class="type-name">Todos los elementos</span>
      </div>
      <span class="type-count" id="count-all">...</span>
    `;
    allItem.addEventListener("click", () => selectGameType(null, allItem));
    container.appendChild(allItem);

    // List individual game types
    GAME_LAYERS_CONFIG.forEach(cfg => {
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
      container.appendChild(item);
    });
  }

  // Select Game Type Filter
  function selectGameType(gameId, targetEl) {
    activeSelectedGameId = gameId;

    document.querySelectorAll(".game-type-item").forEach(el => el.classList.remove("active"));
    if (targetEl) targetEl.classList.add("active");

    applyCombinedFilters();
  }

  // Apply Combined Filter safely checking fields for each sublayer
  function applyCombinedFilters() {
    // Process 2D Layers
    activeLayers2D.forEach(item => {
      const matchesGame = (activeSelectedGameId === null || item.config.id === activeSelectedGameId);
      
      if (!matchesGame) {
        item.layer.visible = false;
        return;
      }

      const availableFields = item.fields || [];
      const hasEdad = availableFields.includes("EDAD") || availableFields.includes("EDAD_G");
      const hasAdaptado = availableFields.includes("ADAPTADO");
      const hasInclusivo = availableFields.includes("INCLUSIVO");

      if (activeAgeFilter && !hasEdad) {
        item.layer.visible = false;
        return;
      }
      if (activeAdaptedFilter && !hasAdaptado) {
        item.layer.visible = false;
        return;
      }
      if (activeInclusiveFilter && !hasInclusivo) {
        item.layer.visible = false;
        return;
      }

      const whereClauses = [];

      if (activeAgeFilter && hasEdad) {
        if (availableFields.includes("EDAD_G")) {
          whereClauses.push(`(EDAD = '${activeAgeFilter}' OR EDAD_G = '${activeAgeFilter}')`);
        } else {
          whereClauses.push(`EDAD = '${activeAgeFilter}'`);
        }
      }

      if (activeAdaptedFilter && hasAdaptado) {
        whereClauses.push(`ADAPTADO = '${activeAdaptedFilter}'`);
      }

      if (activeInclusiveFilter && hasInclusivo) {
        whereClauses.push(`INCLUSIVO = '${activeInclusiveFilter}'`);
      }

      const sqlExpr = whereClauses.length > 0 ? whereClauses.join(" AND ") : "1=1";
      item.layer.definitionExpression = sqlExpr;
      item.layer.visible = true;
    });

    // Process 3D Layers
    activeLayers3D.forEach(item => {
      const matchesGame = (activeSelectedGameId === null || item.config.id === activeSelectedGameId);

      if (!matchesGame) {
        item.layer.visible = false;
        return;
      }

      const availableFields = item.fields || [];
      const hasEdad = availableFields.includes("EDAD") || availableFields.includes("EDAD_G");
      const hasAdaptado = availableFields.includes("ADAPTADO");
      const hasInclusivo = availableFields.includes("INCLUSIVO");

      if (activeAgeFilter && !hasEdad) {
        item.layer.visible = false;
        return;
      }
      if (activeAdaptedFilter && !hasAdaptado) {
        item.layer.visible = false;
        return;
      }
      if (activeInclusiveFilter && !hasInclusivo) {
        item.layer.visible = false;
        return;
      }

      const whereClauses = [];

      if (activeAgeFilter && hasEdad) {
        if (availableFields.includes("EDAD_G")) {
          whereClauses.push(`(EDAD = '${activeAgeFilter}' OR EDAD_G = '${activeAgeFilter}')`);
        } else {
          whereClauses.push(`EDAD = '${activeAgeFilter}'`);
        }
      }

      if (activeAdaptedFilter && hasAdaptado) {
        whereClauses.push(`ADAPTADO = '${activeAdaptedFilter}'`);
      }

      if (activeInclusiveFilter && hasInclusivo) {
        whereClauses.push(`INCLUSIVO = '${activeInclusiveFilter}'`);
      }

      const sqlExpr = whereClauses.length > 0 ? whereClauses.join(" AND ") : "1=1";
      item.layer.definitionExpression = sqlExpr;
      item.layer.visible = true;
    });

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
  function setUserNearMePoint(point) {
    userLocationPoint = point;
    nearMeGraphicsLayer.removeAll();

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

    if (currentView) {
      currentView.goTo({ target: circleGeometry.extent.expand(1.2) });
    }

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
    nearbyFeatures.slice(0, 20).forEach(item => {
      const attrs = item.feature.attributes;
      const nombre = attrs.ELEMENTO || attrs.TIPO || item.layerConfig.name;
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
        <div class="near-item-meta">
          <i class="fa-solid fa-layer-group"></i> ${item.layerConfig.name} | Adaptado: ${attrs.ADAPTADO || 'NO'}
        </div>
        <a href="${navUrl}" target="_blank" rel="noopener" class="btn-route">
          <i class="fa-solid fa-diamond-turn-right"></i> Cómo llegar (GPS)
        </a>
      `;
      resultsContainer.appendChild(card);
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
      });
    });

    // Mobile Sidebar Drawer Toggle
    const mobileMenuBtn = document.getElementById("mobileMenuBtn");
    const sidebar = document.getElementById("sidebar");
    mobileMenuBtn.addEventListener("click", () => {
      sidebar.classList.toggle("open");
    });

    // Filter Controls Handlers
    document.getElementById("ageFilterSelect").addEventListener("change", (e) => {
      activeAgeFilter = e.target.value;
      applyCombinedFilters();
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

      document.getElementById("ageFilterSelect").value = "";
      document.querySelectorAll(".chip-btn").forEach(b => b.classList.remove("active"));
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
      document.getElementById("btnLocateMe").click();
    });

    // Reset View Button
    document.getElementById("btnResetView").addEventListener("click", () => {
      if (currentView) {
        currentView.goTo({
          center: [-3.528, 40.352],
          zoom: 15
        });
      }
    });

    // 3D Tree Layer Toggle Switch
    const treeToggle = document.getElementById("treeLayerToggle");
    if (treeToggle) {
      treeToggle.addEventListener("change", (e) => {
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

      if (daylightContainer.classList.contains("active") && !daylightWidget && view3D) {
        daylightWidget = new Daylight({
          view: view3D,
          container: daylightContainer
        });
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
