// Keine Import-Anweisungen erforderlich, da die Bibliotheken über <script>-Tags geladen werden.

// Auswahl des Lade-Overlay-Elements
const loadingOverlay = document.getElementById('loadingOverlay');

// Funktion zum Anzeigen des Lade-Overlays
function showLoading() {
  loadingOverlay.style.display = 'flex';
}

// Funktion zum Ausblenden des Lade-Overlays
function hideLoading() {
  loadingOverlay.style.display = 'none';
}

// Initialisierung der Karte
const map = L.map('map').setView([48.7758, 9.1829], 13); // Startposition Stuttgart

// Hinzufügen der OSM Tile Layer
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  attribution:
    '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
}).addTo(map);

// FeatureGroup zum Speichern der gezeichneten Fences
const drawnItems = new L.FeatureGroup();
map.addLayer(drawnItems);

// Initialisiere die Zeichenkontrollen
const drawControl = new L.Control.Draw({
  draw: {
    polygon: {
      allowIntersection: false,
      showArea: true,
      drawError: {
        color: '#e1e100',
        message: '<strong>Polygon darf sich nicht selbst überschneiden!</strong>',
      },
      shapeOptions: {
        color: '#97009c',
      },
    },
    polyline: false,
    rectangle: false,
    circle: false,
    circlemarker: false,
    marker: false,
  },
  edit: {
    featureGroup: drawnItems,
    remove: false,
    edit: false,
  },
});
map.addControl(drawControl);

// Arrays zum Speichern der hinzugefügten Layer
let coverageLayers = []; // Abdeckungsbereiche
let routeLayer; // Polyline für die Route

// Event-Handler, wenn ein neues Polygon gezeichnet wird
map.on('draw:created', function (e) {
  const type = e.layerType;
  const layer = e.layer;

  if (type === 'polygon') {
    // Zeige das Lade-Overlay an
    showLoading();

    // Entferne vorhandene Fences und Layer
    drawnItems.clearLayers();
    if (coverageLayers.length > 0) {
      coverageLayers.forEach((layer) => map.removeLayer(layer));
      coverageLayers = [];
    }
    if (routeLayer) {
      map.removeLayer(routeLayer);
      routeLayer = null;
    }

    // Füge das neue Polygon hinzu
    drawnItems.addLayer(layer);

    // Hole die GeoJSON-Daten des Polygons
    const polygon = layer.toGeoJSON();

    // Verarbeite die gezeichnete Fence
    processFence(polygon);
  }
});

// Funktion zur Verarbeitung der gezeichneten Fence
function processFence(polygon) {
  fetchSpawnPointsWithinFence(polygon, (points) => {
    if (points.length === 0) {
      alert('Keine Spawnpunkte innerhalb der ausgewählten Fläche gefunden.');
      // Blende das Lade-Overlay aus
      hideLoading();
      return;
    }

    // Implementiere den Greedy Set-Cover Algorithmus
    const { selectedPositions, uncoveredPoints } = greedySetCover(points);

    // Prüfe, ob die maximale Anzahl an Positionen erreicht wurde
    if (selectedPositions.length >= 200) {
      alert(
        `Die maximale Anzahl von 200 Positionen wurde erreicht. Es konnten ${
          points.length - uncoveredPoints.length
        } von ${points.length} Spawnpunkten abgedeckt werden.`
      );
    } else if (uncoveredPoints.length > 0) {
      alert(
        `Es konnten nicht alle Spawnpunkte abgedeckt werden. ${uncoveredPoints.length} von ${points.length} Spawnpunkten sind nicht abgedeckt.`
      );
    } else {
      alert('Alle Spawnpunkte wurden erfolgreich abgedeckt!');
    }

    // Route innerhalb der Fence erstellen
    createRouteWithinFence(selectedPositions);

    // Blende das Lade-Overlay aus
    hideLoading();
  }, () => {
    // Fehler beim Abrufen der Spawnpunkte
    hideLoading();
  });
}

// Funktion zum Abrufen von Spawnpunkten innerhalb einer Fence
function fetchSpawnPointsWithinFence(polygon, callback, errorCallback) {
  // Berechne die Bounding Box des Polygons
  const bbox = turf.bbox(polygon);
  const [minLng, minLat, maxLng, maxLat] = bbox;

  fetch(
    `/api/spawnpoints?north=${maxLat}&south=${minLat}&east=${maxLng}&west=${minLng}`
  )
    .then((response) => response.json())
    .then((data) => {
      // Filtere die Punkte, die innerhalb des Polygons liegen
      const points = data.filter((point) => {
        const pt = turf.point([point.lon, point.lat]);
        return turf.booleanPointInPolygon(pt, polygon);
      });
      callback(points);
    })
    .catch((error) => {
      console.error('Fehler beim Abrufen der Spawnpunkte:', error);
      alert('Fehler beim Abrufen der Spawnpunkte.');
      if (errorCallback) errorCallback();
    });
}

// Implementierung des Greedy Set-Cover Algorithmus
function greedySetCover(points) {
  const maxPositions = 200;
  const radius = 0.07; // 70 Meter in Kilometern
  const allPoints = points.map((p) => ({
    ...p,
    covered: false,
  }));

  const selectedPositions = [];
  let uncoveredPoints = allPoints.filter((p) => !p.covered);

  while (uncoveredPoints.length > 0 && selectedPositions.length < maxPositions) {
    let bestCandidate = null;
    let bestCandidateCover = [];

    // Versuche jeden Spawnpunkt als möglichen Kandidaten
    for (const candidate of uncoveredPoints) {
      const candidatePoint = turf.point([candidate.lon, candidate.lat]);
      const circle = turf.circle([candidate.lon, candidate.lat], radius, {
        units: 'kilometers',
      });

      // Finde alle noch nicht abgedeckten Punkte innerhalb des Kreises
      const coveredPoints = uncoveredPoints.filter((pt) => {
        const ptPoint = turf.point([pt.lon, pt.lat]);
        return turf.booleanPointInPolygon(ptPoint, circle);
      });

      if (coveredPoints.length > bestCandidateCover.length) {
        bestCandidate = candidate;
        bestCandidateCover = coveredPoints;
      }
    }

    if (bestCandidate) {
      // Markiere die abgedeckten Punkte als abgedeckt
      bestCandidateCover.forEach((pt) => {
        pt.covered = true;
      });

      // Füge den Kandidaten zur Liste der Positionen hinzu
      selectedPositions.push(bestCandidate);

      // Aktualisiere die Liste der nicht abgedeckten Punkte
      uncoveredPoints = allPoints.filter((p) => !p.covered);
    } else {
      // Keine Verbesserung möglich
      break;
    }
  }

  return { selectedPositions, uncoveredPoints };
}

// Funktion zum Erstellen der Route innerhalb der Fence
function createRouteWithinFence(selectedPositions) {
  // Erstelle GeoJSON-Features für die ausgewählten Positionen
  const features = selectedPositions.map((pt) =>
    turf.point([pt.lon, pt.lat])
  );

  // Erstellen der Route (Nearest Neighbor Heuristik)
  const points = [...features];
  const route = [];
  let currentPoint = points.shift(); // Startpunkt
  route.push(currentPoint);

  while (points.length > 0) {
    let nearestDistance = Infinity;
    let nearestIndex = -1;

    points.forEach((pt, index) => {
      const distance = turf.distance(currentPoint, pt, { units: 'kilometers' });
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestIndex = index;
      }
    });

    if (nearestIndex !== -1) {
      currentPoint = points.splice(nearestIndex, 1)[0];
      route.push(currentPoint);
    } else {
      break;
    }
  }

  // Zeichne die Route und die Abdeckungsbereiche
  drawRouteAndCoverage(route);
}

// Funktion zum Zeichnen der Route und der Abdeckungsbereiche
function drawRouteAndCoverage(route) {
  // Zeichne die Abdeckungsbereiche (70m Radius)
  route.forEach((point) => {
    const circle = L.circle(
      [point.geometry.coordinates[1], point.geometry.coordinates[0]],
      {
        radius: 70, // 70 Meter
        color: 'blue',
        fillOpacity: 0.2,
      }
    ).addTo(map);
    coverageLayers.push(circle);
  });

  // Zeichne die Route
  const latLngs = route.map((point) => [
    point.geometry.coordinates[1],
    point.geometry.coordinates[0],
  ]);

  routeLayer = L.polyline(latLngs, { color: 'green' }).addTo(map);

  // Optional: Zoom auf die Route
  map.fitBounds(routeLayer.getBounds());
}

// Initialisierung
function initialize() {
  // Setze die Kartenansicht auf die aktuelle GPS-Position
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        map.setView([latitude, longitude], 13);
        L.marker([latitude, longitude])
          .addTo(map)
          .bindPopup('Du bist hier')
          .openPopup();
      },
      (error) => {
        console.error('Fehler beim Abrufen der GPS-Position:', error);
        alert('GPS-Position konnte nicht abgerufen werden.');
      }
    );
  } else {
    alert('Geolocation ist nicht verfügbar.');
  }
}

initialize();
