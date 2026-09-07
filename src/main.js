import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import './style.css';

const container = document.querySelector('#scene');
const labelsLayer = document.querySelector('#labels');
const card = document.querySelector('#building-card');
const intro = document.querySelector('#intro');
const stage = document.querySelector('.stage');
const artworkViewer = document.querySelector('#artwork-viewer');
const assetUrl = path => `${import.meta.env.BASE_URL}${path.replace(/^\//,'')}`;

const osmData = await fetch(assetUrl('data/mira-osm.json')).then(response => {
  if (!response.ok) throw new Error(`Не удалось загрузить OSM-данные: ${response.status}`);
  return response.json();
});

const MAP_SCALE = .34;
const mapPoint = ([x,z]) => [x * MAP_SCALE, z * MAP_SCALE];
const centroid = polygons => {
  const points = polygons.flat();
  return points.reduce((sum,[x,z]) => [sum[0]+x/points.length,sum[1]+z/points.length],[0,0]);
};

const buildingInfo = [
  { id:'8', osmIds:[52104056,52104057], type:'Жилой дом', accent:'#a8644b', artwork:assetUrl('artworks/mira-8.webp'), description:'Контур главного дома и дворового корпуса выгружен из OpenStreetMap. Высота основного объёма рассчитана по трём отмеченным этажам.' },
  { id:'10', osmIds:[52104048], type:'Доходный дом', accent:'#8f6d55', artwork:assetUrl('artworks/mira-10.jpg'), description:'Реальный сложный контур углового дома получен из OpenStreetMap. Пять этажей формируют западную сторону Австрийской площади.' },
  { id:'12', osmIds:[27046419], type:'Доходный дом', accent:'#b14d37', artwork:assetUrl('artworks/mira-12.jpg'), description:'В OSM этот угловой корпус хранится по основному адресу «Каменноостровский проспект, 15 лит. А»; в ансамбле площади он соответствует дому 12 по улице Мира.' },
  { id:'14', osmIds:[26980664], type:'Общественное здание', accent:'#7f725d', artwork:assetUrl('artworks/mira-14.jpg'), description:'Фактический контур корпуса НИИ Пастера и шесть отмеченных в OSM этажей. Дом расположен северо-восточнее площади по улице Мира.' },
];

const buildings = buildingInfo.map(info => {
  const sources=osmData.buildings.filter(item=>info.osmIds.includes(item.osmId));
  const parts=sources.flatMap(item=>item.polygons).map(polygon=>polygon.map(mapPoint));
  const floors=sources.find(item=>item.levels)?.levels || 4;
  return { ...info, name:`Мира, ${info.id}`, floors, parts, label:centroid(parts), meta:`Данные OSM · ${floors} этажей`, source:sources[0] };
});

const scene = new THREE.Scene();
scene.background = new THREE.Color('#ebe7dd');
scene.fog = new THREE.FogExp2('#ebe7dd', 0.006);

const camera = new THREE.OrthographicCamera(-36, 36, 25, -25, 0.1, 300);
camera.position.set(28, 88, 86);
camera.lookAt(0, 0, 0);

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(container.clientWidth, container.clientHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;
container.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = .07;
controls.enablePan = true;
controls.screenSpacePanning = true;
controls.mouseButtons.LEFT = THREE.MOUSE.ROTATE;
controls.mouseButtons.RIGHT = THREE.MOUSE.PAN;
controls.touches.ONE = THREE.TOUCH.ROTATE;
controls.touches.TWO = THREE.TOUCH.DOLLY_PAN;
controls.minZoom = .72;
controls.maxZoom = 2.1;
controls.minPolarAngle = .38;
controls.maxPolarAngle = 1.28;
controls.target.set(0, 2, 1);
camera.zoom = .77;
camera.updateProjectionMatrix();

const targetBounds={minX:-48,maxX:48,minY:0,maxY:8,minZ:-48,maxZ:48};
const clampedTarget=new THREE.Vector3();
const targetCorrection=new THREE.Vector3();
controls.addEventListener('change',()=>{
  clampedTarget.copy(controls.target);
  clampedTarget.x=THREE.MathUtils.clamp(clampedTarget.x,targetBounds.minX,targetBounds.maxX);
  clampedTarget.y=THREE.MathUtils.clamp(clampedTarget.y,targetBounds.minY,targetBounds.maxY);
  clampedTarget.z=THREE.MathUtils.clamp(clampedTarget.z,targetBounds.minZ,targetBounds.maxZ);
  targetCorrection.subVectors(clampedTarget,controls.target);
  if(targetCorrection.lengthSq()>.000001){
    controls.target.copy(clampedTarget);
    camera.position.add(targetCorrection);
  }
});

document.querySelectorAll('[data-nav-mode]').forEach(btn=>btn.addEventListener('click',()=>{
  const isPan=btn.dataset.navMode==='pan';
  controls.touches.ONE=isPan?THREE.TOUCH.PAN:THREE.TOUCH.ROTATE;
  document.querySelectorAll('[data-nav-mode]').forEach(option=>{
    const active=option===btn;
    option.classList.toggle('is-active',active);
    option.setAttribute('aria-pressed',String(active));
  });
}));

scene.add(new THREE.HemisphereLight('#fffaf0', '#afa896', 2.4));
const sun = new THREE.DirectionalLight('#fff6df', 3.2);
sun.position.set(-34, 65, 30);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -70; sun.shadow.camera.right = 70; sun.shadow.camera.top = 70; sun.shadow.camera.bottom = -70;
scene.add(sun);

const world = new THREE.Group();
world.rotation.y = -.02;
scene.add(world);

const ground = new THREE.Mesh(new THREE.PlaneGeometry(190, 170), new THREE.MeshStandardMaterial({ color: '#e6e1d6', roughness: 1 }));
ground.rotation.x = -Math.PI / 2; ground.position.y = -.12; ground.receiveShadow = true; world.add(ground);

function shapeGeometry(points) {
  const shape = new THREE.Shape();
  points.forEach(([x,z],i) => i ? shape.lineTo(x,-z) : shape.moveTo(x,-z));
  shape.closePath();
  const geometry = new THREE.ShapeGeometry(shape);
  geometry.rotateX(-Math.PI / 2);
  return geometry;
}

function addFlatShape(points, color, y=.01, opacity=1) {
  const material = new THREE.MeshStandardMaterial({ color, roughness:1, transparent:opacity<1, opacity });
  const mesh = new THREE.Mesh(shapeGeometry(points), material);
  mesh.position.y=y; mesh.receiveShadow=true; world.add(mesh); return mesh;
}

function stripPoints(a,b,width){
  const dx=b[0]-a[0],dz=b[1]-a[1],len=Math.hypot(dx,dz),px=-dz/len*width/2,pz=dx/len*width/2;
  return [[a[0]+px,a[1]+pz],[b[0]+px,b[1]+pz],[b[0]-px,b[1]-pz],[a[0]-px,a[1]-pz]];
}

function addRoad(points,width,color,y){
  for(let i=0;i<points.length-1;i++) addFlatShape(stripPoints(points[i],points[i+1],width),color,y);
}

// Road centrelines and widths come directly from OSM. Minor service roads and
// footpaths are deliberately quieter so the main intersection remains legible.
osmData.roads.forEach(road=>{
  const points=road.points.map(mapPoint);
  const isMain=['улица Мира','Каменноостровский проспект','Австрийская площадь'].includes(road.name);
  const isFoot=['footway','steps','pedestrian'].includes(road.highway);
  if(!isMain && !isFoot && road.highway!=='service') return;
  const width=Math.max((isMain?road.width:Math.min(road.width,2.6))*MAP_SCALE,isMain?2.4:.45);
  addRoad(points,width,isMain?'#aaa9a7':isFoot?'#d4d0c7':'#ccc8bf',isMain ? .035 : .015);
});

const osmSquare=osmData.squares.find(square=>square.name==='Австрийская площадь') || osmData.squares[0];
if(osmSquare) addFlatShape(osmSquare.polygon.map(mapPoint),'#aaa9a7',.05);

const roadMarkMat=new THREE.LineBasicMaterial({color:'#f1ede4',transparent:true,opacity:.76});
osmData.roads.filter(road=>['улица Мира','Каменноостровский проспект'].includes(road.name)).forEach(road=>{
  const points=road.points.map(mapPoint);
  for(let i=0;i<points.length-1;i+=2){
    const [a,b]=[points[i],points[Math.min(i+1,points.length-1)]];
    const g=new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(a[0],.09,a[1]),new THREE.Vector3(b[0],.09,b[1])]);
    world.add(new THREE.Line(g,roadMarkMat));
  }
});

const interactive = [];
const labelEntries = [];
function extrudeFootprint(points,height,color='#ddd6c9',opacity=1) {
  const shape=new THREE.Shape(); points.forEach(([x,z],i)=>i?shape.lineTo(x,-z):shape.moveTo(x,-z)); shape.closePath();
  const geometry=new THREE.ExtrudeGeometry(shape,{depth:height,bevelEnabled:false}); geometry.rotateX(-Math.PI/2);
  const material=new THREE.MeshStandardMaterial({color,roughness:.94,transparent:opacity<1,opacity,polygonOffset:true,polygonOffsetFactor:1,polygonOffsetUnits:1});
  const mesh=new THREE.Mesh(geometry,material); mesh.castShadow=true;mesh.receiveShadow=true;world.add(mesh);
  const edges=new THREE.LineSegments(new THREE.EdgesGeometry(geometry,25),new THREE.LineBasicMaterial({color:'#5e5c55',transparent:true,opacity:.42}));world.add(edges);
  return mesh;
}

function makeBuilding(data) {
  const h=data.floors*2.05;
  data.meshes=[];
  data.parts.forEach(part=>{
    const spec=Array.isArray(part)?{points:part}:part;
    const mesh=extrudeFootprint(spec.points,spec.height||h);
    mesh.userData=data; data.meshes.push(mesh); interactive.push(mesh);
  });
  const el=document.createElement('div');
  el.className='map-label building-map-label';
  el.innerHTML=`<span class="artwork-marker"><img src="${assetUrl(`artworks/thumbs/mira-${data.id}.jpg`)}" alt=""></span><span class="building-label-text">Мира, ${data.id}</span>`;
  labelsLayer.appendChild(el);
  labelEntries.push({el,position:new THREE.Vector3(data.label[0],h+1.3,data.label[1]),data});
}
buildings.forEach(makeBuilding);

const plazaLabel = document.createElement('div');
plazaLabel.className = 'map-label plaza-map-label';
plazaLabel.textContent = 'Австрийская площадь';
labelsLayer.appendChild(plazaLabel);
labelEntries.push({ el: plazaLabel, position: new THREE.Vector3(1, .2, 1), data: { id: 'square' } });

function addStreetLabel(text,roadName,preferredPoint,className='street-map-label'){
  let selectedSegment=null;
  let selectedDistance=Infinity;
  osmData.roads.filter(road=>road.name===roadName).forEach(road=>{
    for(let i=0;i<road.points.length-1;i++){
      const start=road.points[i],end=road.points[i+1];
      const middle=[(start[0]+end[0])/2,(start[1]+end[1])/2];
      const distance=Math.hypot(middle[0]-preferredPoint[0],middle[1]-preferredPoint[1]);
      if(distance<selectedDistance){selectedDistance=distance;selectedSegment={start:mapPoint(start),end:mapPoint(end)}}
    }
  });
  if(!selectedSegment)return;
  const position=[(selectedSegment.start[0]+selectedSegment.end[0])/2,(selectedSegment.start[1]+selectedSegment.end[1])/2];
  const el=document.createElement('div');el.className=`map-label ${className}`;el.textContent=text;labelsLayer.appendChild(el);
  labelEntries.push({
    el,
    position:new THREE.Vector3(position[0],.2,position[1]),
    angleTo:new THREE.Vector3(selectedSegment.end[0],.2,selectedSegment.end[1]),
    data:{id:text},
  });
}
addStreetLabel('ул. Мира','улица Мира',[-32,8]);
addStreetLabel('Каменноостровский проспект','Каменноостровский проспект',[30,65]);

const selectedOsmIds=new Set(buildingInfo.flatMap(info=>info.osmIds));
osmData.buildings
  .filter(item=>{
    if(selectedOsmIds.has(item.osmId) || item.isPart) return false;
    const center=centroid(item.polygons);
    return Math.hypot(center[0],center[1]) < 112;
  })
  .forEach(item=>{
    const height=item.height ? item.height*.52 : (item.levels || 3)*1.72;
    item.polygons.forEach(polygon=>extrudeFootprint(polygon.map(mapPoint),height,'#d4cfc5'));
  });

function addTree(x,z,s=1){
  const trunk=new THREE.Mesh(new THREE.CylinderGeometry(.16,.22,1.8,6),new THREE.MeshStandardMaterial({color:'#756b5c'}));trunk.position.set(x,.9,z);world.add(trunk);
  const crown=new THREE.Mesh(new THREE.IcosahedronGeometry(1.25*s,1),new THREE.MeshStandardMaterial({color:'#75836c',roughness:1,flatShading:true}));crown.position.set(x,2.5*s,z);crown.castShadow=true;world.add(crown);
}
(osmData.trees || []).forEach((tree,i)=>{
  const [x,z]=mapPoint(tree.point);
  addTree(x,z,.62+(i%3)*.06);
});

const raycaster=new THREE.Raycaster(); const pointer=new THREE.Vector2(); let hovered=null; let selected=null;
let pointerStart=null; let pointerTravelled=false; let suppressNextClick=false; let activePointerCount=0;
function pickBuilding(clientX,clientY){
  const rect=renderer.domElement.getBoundingClientRect();
  pointer.x=((clientX-rect.left)/rect.width)*2-1;
  pointer.y=-((clientY-rect.top)/rect.height)*2+1;
  raycaster.setFromCamera(pointer,camera);
  return raycaster.intersectObjects(interactive,false)[0]?.object||null;
}
function paintBuilding(data,color,emissive='#000000'){
  data?.meshes?.forEach(mesh=>{mesh.material.color.set(color);mesh.material.emissive.set(emissive)});
}
function setHovered(mesh){
  if(hovered===mesh)return;
  if(hovered && hovered.userData!==selected)paintBuilding(hovered.userData,'#ddd6c9');
  hovered=mesh;
  labelEntries.forEach(l=>l.el.classList.toggle('is-hovered',!!mesh&&l.data.id===mesh.userData.id));
  if(mesh){paintBuilding(mesh.userData,mesh.userData.accent,'#2b100b');renderer.domElement.style.cursor='pointer'}else renderer.domElement.style.cursor='grab';
}
function openCard(data){
  selected=data; buildings.forEach(item=>paintBuilding(item,item===selected?data.accent:'#ddd6c9',item===selected?'#2b100b':'#000000'));
  const artworkIndex=buildings.findIndex(b=>b.id===data.id);
  document.querySelector('#card-index').textContent=String(artworkIndex+1).padStart(2,'0');
  document.querySelector('#card-type').textContent=data.type;document.querySelector('#card-title').textContent=data.name;document.querySelector('#card-meta').textContent='Художественная работа · дом на карте';document.querySelector('#card-description').textContent=data.description;
  const gallery=document.querySelector('#gallery');
  gallery.classList.add('is-single');
  gallery.innerHTML=`<figure><img src="${data.artwork}" alt="Художественная работа, посвящённая дому ${data.name}"><figcaption>Работа художника · ${data.name}</figcaption></figure>`;
  document.querySelector('#gallery-count').textContent=`Работа ${artworkIndex+1} из ${buildings.length}`;
  if(artworkViewer.classList.contains('is-open'))updateArtworkViewer(data,artworkIndex);
  card.classList.add('is-open');card.setAttribute('aria-hidden','false');intro.classList.add('is-hidden');stage.classList.add('artwork-open');
}
function closeCard(){closeArtworkViewer();card.classList.remove('is-open');card.setAttribute('aria-hidden','true');intro.classList.remove('is-hidden');stage.classList.remove('artwork-open');if(selected)paintBuilding(selected,'#ddd6c9');selected=null}
function showAdjacentArtwork(direction){
  const currentIndex=Math.max(0,buildings.indexOf(selected));
  openCard(buildings[(currentIndex+direction+buildings.length)%buildings.length]);
}
function updateArtworkViewer(data,index){
  const image=document.querySelector('#viewer-image');
  const viewerCanvas=document.querySelector('.viewer-canvas');
  const centerNativeImage=()=>requestAnimationFrame(()=>{
    viewerCanvas.scrollLeft=Math.max(0,(viewerCanvas.scrollWidth-viewerCanvas.clientWidth)/2);
    viewerCanvas.scrollTop=0;
  });
  image.onload=centerNativeImage;
  image.src=data.artwork;
  image.alt=`Художественная работа, посвящённая дому ${data.name}`;
  document.querySelector('#viewer-title').textContent=data.name;
  document.querySelector('#viewer-count').textContent=`Работа ${index+1} из ${buildings.length} · масштаб 100%`;
  if(image.complete)centerNativeImage();
}
function openArtworkViewer(){
  if(!selected)return;
  updateArtworkViewer(selected,buildings.indexOf(selected));
  artworkViewer.classList.add('is-open');
  artworkViewer.setAttribute('aria-hidden','false');
  document.querySelector('#viewer-back').focus();
}
function closeArtworkViewer(){
  artworkViewer.classList.remove('is-open');
  artworkViewer.setAttribute('aria-hidden','true');
}
renderer.domElement.addEventListener('pointermove',e=>{
  if(e.isPrimary&&pointerStart&&Math.hypot(e.clientX-pointerStart.x,e.clientY-pointerStart.y)>8)pointerTravelled=true;
  if(e.pointerType!=='touch')setHovered(pickBuilding(e.clientX,e.clientY));
});
renderer.domElement.addEventListener('pointerdown',e=>{
  activePointerCount+=1;
  if(e.isPrimary){pointerStart={x:e.clientX,y:e.clientY};pointerTravelled=false}
  if(activePointerCount>1)pointerTravelled=true;
});
renderer.domElement.addEventListener('pointerup',e=>{
  activePointerCount=Math.max(0,activePointerCount-1);
  if(!e.isPrimary||!pointerStart)return;
  suppressNextClick=pointerTravelled||Math.hypot(e.clientX-pointerStart.x,e.clientY-pointerStart.y)>8;
  pointerStart=null;
  if(e.pointerType==='touch'&&!suppressNextClick){
    const picked=pickBuilding(e.clientX,e.clientY);
    if(picked){setHovered(picked);openCard(picked.userData);suppressNextClick=true}
  }
});
renderer.domElement.addEventListener('pointercancel',()=>{activePointerCount=0;pointerStart=null;suppressNextClick=true});
renderer.domElement.addEventListener('click',e=>{
  if(suppressNextClick){suppressNextClick=false;return}
  const picked=pickBuilding(e.clientX,e.clientY);
  if(picked){setHovered(picked);openCard(picked.userData)}
});
renderer.domElement.addEventListener('pointerleave',()=>setHovered(null));
document.querySelector('.card-close').addEventListener('click',closeCard);
document.querySelector('#previous-artwork').addEventListener('click',()=>showAdjacentArtwork(-1));
document.querySelector('#next-artwork').addEventListener('click',()=>showAdjacentArtwork(1));
document.querySelector('#artwork-full').addEventListener('click',openArtworkViewer);
document.querySelector('#viewer-back').addEventListener('click',closeArtworkViewer);
document.querySelector('#viewer-previous').addEventListener('click',()=>showAdjacentArtwork(-1));
document.querySelector('#viewer-next').addEventListener('click',()=>showAdjacentArtwork(1));
stage.addEventListener('click',e=>{if(e.target===stage&&card.classList.contains('is-open'))closeCard()});
document.addEventListener('keydown',e=>{
  if(e.key==='Escape'&&artworkViewer.classList.contains('is-open')){closeArtworkViewer();return}
  if(e.key==='Escape'){closeCard();closeAbout()}
  if(card.classList.contains('is-open')&&e.key==='ArrowLeft')showAdjacentArtwork(-1);
  if(card.classList.contains('is-open')&&e.key==='ArrowRight')showAdjacentArtwork(1);
});

function setZoom(mult){camera.zoom=THREE.MathUtils.clamp(camera.zoom*mult,controls.minZoom,controls.maxZoom);camera.updateProjectionMatrix()}
document.querySelector('#zoom-in').addEventListener('click',()=>setZoom(1.16));document.querySelector('#zoom-out').addEventListener('click',()=>setZoom(.86));
const home={pos:new THREE.Vector3(28,88,86),target:new THREE.Vector3(0,2,1),zoom:.77};
function resetView(){camera.position.copy(home.pos);controls.target.copy(home.target);camera.zoom=home.zoom;camera.updateProjectionMatrix();controls.update()}
document.querySelector('#reset-view').addEventListener('click',resetView);
document.querySelectorAll('[data-camera]').forEach(btn=>btn.addEventListener('click',()=>{document.querySelectorAll('[data-camera]').forEach(b=>b.classList.toggle('is-active',b===btn));if(btn.dataset.camera==='top'){camera.position.set(0,110,.01);controls.target.set(0,0,0);camera.zoom=.72}else resetView();camera.updateProjectionMatrix();controls.update()}));

const about=document.querySelector('#about-panel');
function closeAbout(){about.classList.remove('is-open');about.setAttribute('aria-hidden','true');document.querySelectorAll('.nav-link').forEach((n,i)=>n.classList.toggle('is-active',i===0))}
document.querySelector('[data-view="about"]').addEventListener('click',()=>{closeCard();about.classList.add('is-open');about.setAttribute('aria-hidden','false');document.querySelectorAll('.nav-link').forEach(n=>n.classList.toggle('is-active',n.dataset.view==='about'))});
document.querySelector('[data-view="model"]').addEventListener('click',closeAbout);document.querySelector('.about-close').addEventListener('click',closeAbout);

const labelProjection=new THREE.Vector3();
const labelAngleProjection=new THREE.Vector3();
function updateLabels(){
  world.updateMatrixWorld();
  const labelPixelRatio=Math.min(window.devicePixelRatio || 1,2);
  labelEntries.forEach(entry=>{
    const {el,position}=entry;
    labelProjection.copy(position).applyMatrix4(world.matrixWorld).project(camera);
    const x=Math.round((labelProjection.x*.5+.5)*labelsLayer.clientWidth*labelPixelRatio)/labelPixelRatio;
    const y=Math.round((-labelProjection.y*.5+.5)*labelsLayer.clientHeight*labelPixelRatio)/labelPixelRatio;
    let angle=0;
    if(entry.angleTo){
      labelAngleProjection.copy(entry.angleTo).applyMatrix4(world.matrixWorld).project(camera);
      const angleX=(labelAngleProjection.x-labelProjection.x)*labelsLayer.clientWidth;
      const angleY=-(labelAngleProjection.y-labelProjection.y)*labelsLayer.clientHeight;
      angle=THREE.MathUtils.radToDeg(Math.atan2(angleY,angleX));
      if(angle>90)angle-=180;
      if(angle<-90)angle+=180;
      angle=Math.round(angle*10)/10;
    }
    if(x!==entry.screenX || y!==entry.screenY || angle!==entry.screenAngle){
      el.style.transform=`translate3d(${x}px,${y}px,0) translate(-50%,-50%) rotate(${angle}deg)`;
      entry.screenX=x;entry.screenY=y;entry.screenAngle=angle;
    }
    el.style.opacity=labelProjection.z<1?'.9':'0';
  });
}
function resize(){const w=container.clientWidth,h=container.clientHeight;renderer.setSize(w,h);const aspect=w/h;const size=32;camera.left=-size*aspect;camera.right=size*aspect;camera.top=size;camera.bottom=-size;camera.updateProjectionMatrix()}
window.addEventListener('resize',resize);resize();
function animate(){requestAnimationFrame(animate);controls.update();updateLabels();renderer.render(scene,camera)}animate();
