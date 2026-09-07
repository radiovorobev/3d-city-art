import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const CENTER = { lat: 59.9599303, lon: 30.3171886 };
const BBOX = { south: 59.9587, west: 30.3150, north: 59.9614, east: 30.3196 };
const bbox = `${BBOX.south},${BBOX.west},${BBOX.north},${BBOX.east}`;
const query = `[out:json][timeout:40];
(
  way[building](${bbox});
  relation[building](${bbox});
  way["building:part"](${bbox});
  way[highway](${bbox});
  way[place=square](${bbox});
  node[natural=tree](${bbox});
);
out body geom;`;

const response = await fetch('https://overpass-api.de/api/interpreter', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
    'User-Agent': 'mira-street-model/0.1 (local architectural prototype)',
  },
  body: new URLSearchParams({ data: query }),
});

if (!response.ok) throw new Error(`Overpass returned ${response.status} ${response.statusText}`);
const raw = await response.json();

const metersPerLat = 111_132;
const metersPerLon = 111_320 * Math.cos(CENTER.lat * Math.PI / 180);
const project = ({ lat, lon }) => [
  Number(((lon - CENTER.lon) * metersPerLon).toFixed(3)),
  Number((-(lat - CENTER.lat) * metersPerLat).toFixed(3)),
];

function cleanRing(geometry = []) {
  const points = geometry.map(project);
  if (points.length > 2) {
    const [ax,az] = points[0];
    const [bx,bz] = points.at(-1);
    if (Math.hypot(ax-bx,az-bz) < .05) points.pop();
  }
  return points;
}

function samePoint(a, b) {
  return a && b && Math.abs(a.lat-b.lat) < 1e-8 && Math.abs(a.lon-b.lon) < 1e-8;
}

function stitchMembers(members) {
  const remaining = members.filter(m => m.geometry?.length > 1).map(m => [...m.geometry]);
  const rings = [];
  while (remaining.length) {
    const ring = remaining.shift();
    let changed = true;
    while (changed && remaining.length) {
      changed = false;
      for (let i=0; i<remaining.length; i++) {
        const segment = remaining[i];
        if (samePoint(ring.at(-1), segment[0])) ring.push(...segment.slice(1));
        else if (samePoint(ring.at(-1), segment.at(-1))) ring.push(...segment.reverse().slice(1));
        else if (samePoint(ring[0], segment.at(-1))) ring.unshift(...segment.slice(0,-1));
        else if (samePoint(ring[0], segment[0])) ring.unshift(...segment.reverse().slice(0,-1));
        else continue;
        remaining.splice(i,1); changed=true; break;
      }
    }
    if (ring.length > 3) rings.push(cleanRing(ring));
  }
  return rings;
}

function numberValue(value) {
  if (value == null) return null;
  const parsed = Number(String(value).replace(',', '.').match(/[\d.]+/)?.[0]);
  return Number.isFinite(parsed) ? parsed : null;
}

function buildingFromElement(element) {
  const tags = element.tags || {};
  const polygons = element.type === 'way'
    ? [cleanRing(element.geometry)]
    : stitchMembers((element.members || []).filter(member => member.role === 'outer'));
  return {
    osmType: element.type,
    osmId: element.id,
    address: tags['addr:housenumber'] || null,
    street: tags['addr:street'] || null,
    name: tags.name || null,
    levels: numberValue(tags['building:levels']),
    height: numberValue(tags.height),
    minHeight: numberValue(tags.min_height),
    building: tags.building || tags['building:part'] || 'yes',
    isPart: Boolean(tags['building:part']),
    polygons: polygons.filter(polygon => polygon.length > 2),
  };
}

const buildings = raw.elements
  .filter(element => element.tags?.building || element.tags?.['building:part'])
  .map(buildingFromElement)
  .filter(building => building.polygons.length);

const highwayWidths = { primary:18, secondary:14, tertiary:11, residential:7, service:4, footway:2, pedestrian:5 };
const roads = raw.elements
  .filter(element => element.type === 'way' && element.tags?.highway && element.geometry?.length > 1)
  .map(element => ({
    osmId: element.id,
    name: element.tags.name || null,
    highway: element.tags.highway,
    width: numberValue(element.tags.width) || highwayWidths[element.tags.highway] || 4,
    points: element.geometry.map(project),
  }));

const squares = raw.elements
  .filter(element => element.type === 'way' && element.tags?.place === 'square' && element.geometry?.length > 2)
  .map(element => ({ osmId:element.id, name:element.tags.name || null, polygon:cleanRing(element.geometry) }));

const trees = raw.elements
  .filter(element => element.type === 'node' && element.tags?.natural === 'tree' && element.lat && element.lon)
  .map(element => ({ osmId:element.id, point:project(element), genus:element.tags.genus || null }));

const output = {
  meta: {
    source: 'OpenStreetMap via Overpass API',
    attribution: '© OpenStreetMap contributors, ODbL 1.0',
    fetchedAt: new Date().toISOString(),
    center: CENTER,
    bbox: BBOX,
    projection: 'Local equirectangular coordinates in metres; +x east, +z south',
  },
  buildings,
  roads,
  squares,
  trees,
};

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputDir = path.join(root, 'public', 'data');
await mkdir(outputDir, { recursive: true });
await writeFile(path.join(outputDir, 'mira-overpass.raw.json'), `${JSON.stringify(raw)}\n`);
await writeFile(path.join(outputDir, 'mira-osm.json'), `${JSON.stringify(output, null, 2)}\n`);

const selected = buildings.filter(item =>
  ['8','10','12','14'].includes(item.address) &&
  (!item.street || item.street === 'улица Мира')
);
console.log(`Saved ${buildings.length} buildings, ${roads.length} roads, ${squares.length} squares and ${trees.length} trees.`);
console.log('Candidate houses:', selected.map(item => `${item.address} (${item.osmType}/${item.osmId}, ${item.levels ?? '?'} levels)`).join(', '));
