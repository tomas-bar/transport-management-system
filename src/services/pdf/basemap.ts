import type {jsPDF} from 'jspdf';
import type {Trip} from '../../domain/models.ts';
import {routeVisits} from '../../domain/route-plan.ts';
import type {RoadRoute} from '../maps.ts';
export interface PrintBasemap {
 countries:{name:string;iso:string;label:[number,number];geometry:{type:'Polygon'|'MultiPolygon';coordinates:number[][][]|number[][][][]}}[];
 cities:{name:string;coordinates:[number,number];population:number}[];
}
let basemapPromise:Promise<PrintBasemap>|undefined;
export function loadPrintBasemap() {
 if(!basemapPromise)basemapPromise=fetch('/maps/world.json').then(response=>{if(!response.ok)throw new Error('Nepavyko įkelti žemėlapio pagrindo.');return response.json() as Promise<PrintBasemap>;}).catch(error=>{basemapPromise=undefined;throw error;});
 return basemapPromise;
}
export const projectMapPoint=([lng,lat]:number[])=>[lng,Math.log(Math.tan(Math.PI/4+Math.max(-85,Math.min(85,lat))*Math.PI/360))*180/Math.PI];
export function mapViewport(route:RoadRoute,width:number,height:number) {
 const points=route.coordinates.map(([lat,lng])=>projectMapPoint([lng,lat]));
 if(!points.length)throw new Error('Kelių maršrutas nerastas.');
 const bounds=points.reduce((b,p)=>({minX:Math.min(b.minX,p[0]),maxX:Math.max(b.maxX,p[0]),minY:Math.min(b.minY,p[1]),maxY:Math.max(b.maxY,p[1])}),{minX:Infinity,maxX:-Infinity,minY:Infinity,maxY:-Infinity});
 const cx=(bounds.minX+bounds.maxX)/2,cy=(bounds.minY+bounds.maxY)/2;
 let spanX=Math.max((bounds.maxX-bounds.minX)*1.4,2.4),spanY=Math.max((bounds.maxY-bounds.minY)*1.5,2.1);
 if(spanX/spanY<width/height)spanX=spanY*width/height;else spanY=spanX*height/width;
 const minX=cx-spanX/2,maxX=cx+spanX/2,minY=cy-spanY/2,maxY=cy+spanY/2;
 return {minX,maxX,minY,maxY,project:(lngLat:number[])=>{const p=projectMapPoint(lngLat);return [(p[0]-minX)/spanX*width,(maxY-p[1])/spanY*height];}};
}
const cityNames:Record<string,string>={Warsaw:'Varšuva',Berlin:'Berlynas',Hamburg:'Hamburgas',Hannover:'Hanoveris',Riga:'Ryga',Dresden:'Dresdenas',Leipzig:'Leipcigas',Poznan:'Poznanė',Wroclaw:'Vroclavas',Kaliningrad:'Kaliningradas'};
export function drawPrintMap(doc:jsPDF,trip:Trip,route:RoadRoute,data:PrintBasemap,x:number,y:number,width:number,height:number,color:boolean) {
 const viewport=mapViewport(route,width,height);
 const project=(point:number[])=>{const p=viewport.project(point);return [x+p[0],y+p[1]];};
 const inside=(p:number[],margin=3)=>p[0]>x+margin&&p[0]<x+width-margin&&p[1]>y+margin&&p[1]<y+height-margin;
 doc.saveGraphicsState();doc.rect(x,y,width,height,null);doc.clip();doc.discardPath();
 doc.setFillColor(...(color?[232,240,245]:[239,239,239]) as [number,number,number]);doc.rect(x,y,width,height,'F');
 const countries:PrintBasemap['countries']=[];
 for(const country of data.countries) {
  const polygons=country.geometry.type==='Polygon'?[country.geometry.coordinates as number[][][]]:country.geometry.coordinates as number[][][][];
  const visible=polygons.filter(polygon=>{const ring=polygon[0].map(projectMapPoint);const b=ring.reduce((b,p)=>[Math.min(b[0],p[0]),Math.max(b[1],p[0]),Math.min(b[2],p[1]),Math.max(b[3],p[1])],[Infinity,-Infinity,Infinity,-Infinity]);return b[1]>=viewport.minX&&b[0]<=viewport.maxX&&b[3]>=viewport.minY&&b[2]<=viewport.maxY;});
  if(!visible.length)continue;countries.push(country);
  const operations:{op:string;c:number[]}[]=[];
  for(const polygon of visible)for(const ring of polygon){ring.forEach((point,index)=>operations.push({op:index?'l':'m',c:project(point)}));operations.push({op:'h',c:[]});}
  doc.setFillColor(...(color?[250,249,244]:[253,253,253]) as [number,number,number]);doc.setDrawColor(...(color?[190,199,196]:[199,199,199]) as [number,number,number]);doc.setLineWidth(.18);doc.path(operations);doc.fillStrokeEvenOdd();
 }
 const displayNames=new Intl.DisplayNames(['lt'],{type:'region'});
 doc.setFont('Krypta','normal');doc.setTextColor(155,155,155);doc.setFontSize(8.5);
 for(const country of countries)if(country.label.every(v=>typeof v==='number')){
  const original=project(country.label);const p=[Math.max(x+12,Math.min(x+width-12,original[0])),Math.max(y+8,Math.min(y+height-8,original[1]))];
  const worldX=viewport.minX+(p[0]-x)/width*(viewport.maxX-viewport.minX),worldY=viewport.maxY-(p[1]-y)/height*(viewport.maxY-viewport.minY);
  const lngLat=[worldX,(Math.atan(Math.exp(worldY*Math.PI/180))*4-Math.PI)*90/Math.PI];
  const ringContains=(ring:number[][])=>{let hit=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const a=ring[i],b=ring[j];if((a[1]>lngLat[1])!==(b[1]>lngLat[1])&&lngLat[0]<(b[0]-a[0])*(lngLat[1]-a[1])/(b[1]-a[1])+a[0])hit=!hit;}return hit;};
  const polygons=country.geometry.type==='Polygon'?[country.geometry.coordinates as number[][][]]:country.geometry.coordinates as number[][][][];
  if(inside(original,6)||polygons.some(polygon=>ringContains(polygon[0])&&!polygon.slice(1).some(ringContains))){const name=/^[A-Z]{2}$/.test(country.iso)?displayNames.of(country.iso):country.name;doc.text(name??country.name,p[0],p[1],{align:'center'});}
 }
 const visits=routeVisits(trip.stops);
 const stops=visits.map(visit=>({visit,point:project([visit.place.lng,visit.place.lat])}));
 const occupied:{x:number;y:number;w:number;h:number}[]=stops.map(({point})=>({x:point[0]-4,y:point[1]-4,w:8,h:8}));
 const intersects=(a:{x:number;y:number;w:number;h:number})=>occupied.some(b=>a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y);
 const cities=data.cities.map(city=>({...city,p:project(city.coordinates)})).filter(city=>inside(city.p,8)&&!stops.some(({point})=>Math.hypot(point[0]-city.p[0],point[1]-city.p[1])<9)).sort((a,b)=>b.population-a.population).slice(0,28);
 doc.setFontSize(6.5);doc.setFont('Krypta','normal');
 for(const city of cities){const text=cityNames[city.name]??city.name;const box={x:city.p[0]+1.3,y:city.p[1]-2,w:doc.getTextWidth(text)+1.5,h:3.5};if(intersects(box)||box.x+box.w>x+width-2)continue;occupied.push(box);doc.setFillColor(145,145,145);doc.circle(city.p[0],city.p[1],.4,'F');doc.setTextColor(115,115,115);doc.text(text,box.x,city.p[1]+.6);}
 const routeColor:[number,number,number]=color?[40,101,167]:[55,55,55];
 doc.setDrawColor(255,255,255);doc.setLineWidth(1.25);
 const drawRoute=()=>{for(let i=1;i<route.coordinates.length;i++){const a=project([route.coordinates[i-1][1],route.coordinates[i-1][0]]),b=project([route.coordinates[i][1],route.coordinates[i][0]]);doc.line(a[0],a[1],b[0],b[1]);}};
 drawRoute();doc.setDrawColor(...routeColor);doc.setLineWidth(.5);drawRoute();
 doc.setFont('Krypta','bold');doc.setFontSize(7);
 for(const {visit,point:p} of stops){doc.setDrawColor(...routeColor);doc.setLineWidth(.25);doc.setFillColor(255,255,255);doc.circle(p[0],p[1],2.4,'FD');doc.setTextColor(...routeColor);doc.text(String(visit.number),p[0],p[1]+.9,{align:'center'});
  const text=visit.place.name;const tw=doc.getTextWidth(text);let chosen:{x:number;y:number;w:number;h:number}|null=null;
  for(const [dx,dy] of [[5,-1],[5,5],[-tw-5,-1],[-tw-5,5],[5,-6],[-tw-5,-6]]){const box={x:p[0]+dx,y:p[1]+dy-2.6,w:tw+1,h:3.7};if(inside([box.x,box.y],1)&&inside([box.x+box.w,box.y+box.h],1)&&!intersects(box)){chosen=box;break;}}
  if(chosen){occupied.push(chosen);doc.setFillColor(255,255,255);doc.roundedRect(chosen.x-.5,chosen.y,chosen.w+1,chosen.h,.5,.5,'F');doc.setTextColor(...routeColor);doc.text(text,chosen.x,chosen.y+2.7);}
 }
 doc.restoreGraphicsState();doc.setDrawColor(214,214,214);doc.setLineWidth(.2);doc.rect(x,y,width,height);
}
