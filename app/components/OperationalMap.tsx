"use client";

import { useEffect, useRef, useState } from "react";
import maplibregl, { LngLatBounds, Map as MapLibreMap, Marker } from "maplibre-gl";
import type { VesselState } from "@/lib/seavant-state";
import type { RouteDiagnostics, VoyagePlan } from "@/lib/voyage-engine";

interface OperationalMapProps {
  vessel: VesselState;
  route?: VoyagePlan | null;
  diagnostics?: RouteDiagnostics | null;
  nextWaypoint?: { name: string; distanceNm: number; eta: string } | null;
}

const DEFAULT_CENTER:[number,number]=[145.3467,12.0617];
const ROUTE_SOURCE="seavant-route";
const ROUTE_LAYER="seavant-route-line";
const WAYPOINT_LAYER="seavant-route-points";
const NEXT_LABEL_LAYER="seavant-next-waypoint-label";

export default function OperationalMap({vessel,route,diagnostics,nextWaypoint}:OperationalMapProps){
 const containerRef=useRef<HTMLDivElement|null>(null),mapRef=useRef<MapLibreMap|null>(null),markerRef=useRef<Marker|null>(null),hasCenteredOnLivePosition=useRef(false),lastRouteKey=useRef<string|null>(null); const[loaded,setLoaded]=useState(false);
 useEffect(()=>{if(!containerRef.current||mapRef.current)return;const map=new maplibregl.Map({container:containerRef.current,center:DEFAULT_CENTER,zoom:6,attributionControl:false,style:{version:8,sources:{osm:{type:"raster",tiles:["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],tileSize:256,attribution:"© OpenStreetMap contributors"}},layers:[{id:"osm",type:"raster",source:"osm"}]}});map.addControl(new maplibregl.NavigationControl({showCompass:true}),"top-right");map.addControl(new maplibregl.AttributionControl({compact:true}),"bottom-right");map.on("load",()=>setLoaded(true));mapRef.current=map;return()=>{markerRef.current?.remove();map.remove();mapRef.current=null;markerRef.current=null;};},[]);
 useEffect(()=>{const map=mapRef.current;if(!map||!Number.isFinite(vessel.position.lat)||!Number.isFinite(vessel.position.lon))return;const displayLon=route?alignLongitudeToRoute(vessel.position.lon,route):vessel.position.lon;const lngLat:[number,number]=[displayLon,vessel.position.lat];if(!markerRef.current){const element=document.createElement("div");element.className="ownShipMarker";element.style.width="22px";element.style.height="30px";element.style.position="relative";element.style.filter="drop-shadow(0 0 2px rgba(127,211,221,.7))";element.innerHTML="<svg viewBox='0 0 22 30' width='22' height='30' aria-hidden='true'><line x1='11' y1='0' x2='11' y2='8' stroke='#7fd3dd' stroke-width='1'/><path d='M11 7 L18 23 L11 20 L4 23 Z' fill='rgba(5,11,14,.78)' stroke='#9ce7ef' stroke-width='1.6' stroke-linejoin='round'/><circle cx='11' cy='18.5' r='1.6' fill='#f3ffff' stroke='#7fd3dd' stroke-width='.7'/></svg>";markerRef.current=new maplibregl.Marker({element,rotationAlignment:"map"}).setLngLat(lngLat).addTo(map);}else markerRef.current.setLngLat(lngLat);const rotation=Number.isFinite(vessel.heading)?vessel.heading:vessel.cog;markerRef.current.setRotation(rotation||0);if(vessel.source==="live"&&!hasCenteredOnLivePosition.current&&!route){map.easeTo({center:lngLat,zoom:Math.max(map.getZoom(),7),duration:900});hasCenteredOnLivePosition.current=true;}},[vessel,route]);
 useEffect(()=>{const map=mapRef.current;if(!map||!loaded)return;removeRouteLayers(map);if(!route){lastRouteKey.current=null;return;}
 const points=[{name:route.departure,position:route.departurePosition},...route.waypoints,{name:route.destination,position:route.destinationPosition}];
 const raw=points.map(p=>[p.position.lon,p.position.lat] as [number,number]);
 const coordinates=unwrapLongitudes(raw);
 const activeIndex=findActiveLegIndex(points,diagnostics);
 const lineFeatures=coordinates.slice(0,-1).map((from,index)=>({type:"Feature" as const,properties:{kind:"leg",state:index<activeIndex?"past":index===activeIndex?"active":"future",index},geometry:{type:"LineString" as const,coordinates:[from,coordinates[index+1]]}}));
 const pointFeatures=coordinates.map((coordinate,index)=>({type:"Feature" as const,properties:{kind:"waypoint",name:points[index].name,state:activeIndex>=0&&index<=activeIndex?"past":activeIndex>=0&&index===activeIndex+1?"next":"future",endpoint:index===0||index===coordinates.length-1},geometry:{type:"Point" as const,coordinates:coordinate}}));
 map.addSource(ROUTE_SOURCE,{type:"geojson",data:{type:"FeatureCollection",features:[...lineFeatures,...pointFeatures]}});
 map.addLayer({id:ROUTE_LAYER,type:"line",source:ROUTE_SOURCE,filter:["==",["get","kind"],"leg"],layout:{"line-cap":"round","line-join":"round"},paint:{"line-color":["match",["get","state"],"active","#7fd3dd","past","#6d7f83","#c8a85a"],"line-width":["match",["get","state"],"active",5,"past",2,3],"line-opacity":["match",["get","state"],"active",1,"past",.25,.76]}});
 map.addLayer({id:WAYPOINT_LAYER,type:"circle",source:ROUTE_SOURCE,filter:["==",["get","kind"],"waypoint"],paint:{"circle-radius":["match",["get","state"],"next",6,"past",3,4],"circle-color":["match",["get","state"],"next","#7fd3dd","past","#66787c","#c8a85a"],"circle-opacity":["match",["get","state"],"past",.38,1],"circle-stroke-width":["match",["get","state"],"next",2,1.5],"circle-stroke-color":"#071014"}});
 map.addLayer({id:NEXT_LABEL_LAYER,type:"symbol",source:ROUTE_SOURCE,filter:["all",["==",["get","kind"],"waypoint"],["==",["get","state"],"next"]],layout:{"text-field":["get","name"],"text-size":11,"text-font":["Open Sans Bold"],"text-offset":[1.1,0],"text-anchor":"left","text-allow-overlap":true,"text-ignore-placement":true},paint:{"text-color":"#dffcff","text-halo-color":"#071014","text-halo-width":2}});
 const routeKey=coordinates.map(p=>p.join(",")).join("|");if(lastRouteKey.current!==routeKey){const bounds=coordinates.reduce((b,p)=>b.extend(p),new LngLatBounds(coordinates[0],coordinates[0]));map.fitBounds(bounds,{padding:60,maxZoom:8,duration:700});lastRouteKey.current=routeKey;}},[loaded,route,diagnostics]);
 const recenter=()=>{const map=mapRef.current;if(!map)return;const lon=route?alignLongitudeToRoute(vessel.position.lon,route):vessel.position.lon;map.easeTo({center:[lon,vessel.position.lat],zoom:Math.max(map.getZoom(),7),duration:600});};
 const xte=diagnostics?`${diagnostics.crossTrackErrorNm.toFixed(2)} NM ${diagnostics.crossTrackSide}`:"--";
 return <div className="operationalMapWrap"><div ref={containerRef} className="operationalMap"/>{route&&diagnostics&&<div className="activeLegOverlay"><span>ACTIVE LEG</span><strong>{diagnostics.activeLeg.from} → {diagnostics.activeLeg.to}</strong><div><b>NEXT</b> {nextWaypoint?.name??diagnostics.activeLeg.to} · <b>DTG</b> {nextWaypoint?`${nextWaypoint.distanceNm.toFixed(1)} NM`:"--"} · <b>XTE</b> {xte}</div></div>}<div className="mapStatus">{loaded?route?"ACTIVE ROUTE":"MAP READY":"LOADING MAP"}</div><button className="recenterButton" type="button" onClick={recenter}>RECENTER</button></div>;
}

function removeRouteLayers(map:MapLibreMap){if(map.getLayer(NEXT_LABEL_LAYER))map.removeLayer(NEXT_LABEL_LAYER);if(map.getLayer(WAYPOINT_LAYER))map.removeLayer(WAYPOINT_LAYER);if(map.getLayer(ROUTE_LAYER))map.removeLayer(ROUTE_LAYER);if(map.getSource(ROUTE_SOURCE))map.removeSource(ROUTE_SOURCE);}
function findActiveLegIndex(points:{name:string}[],diagnostics?:RouteDiagnostics|null){if(!diagnostics)return-1;return points.findIndex((point,index)=>index<points.length-1&&point.name===diagnostics.activeLeg.from&&points[index+1].name===diagnostics.activeLeg.to);}
function routeWorldReference(route:VoyagePlan){const pts=[[route.departurePosition.lon,route.departurePosition.lat] as [number,number],...route.waypoints.map(w=>[w.position.lon,w.position.lat] as [number,number]),[route.destinationPosition.lon,route.destinationPosition.lat] as [number,number]];const unwrapped=unwrapLongitudes(pts);return unwrapped[Math.floor(unwrapped.length/2)]?.[0]??route.departurePosition.lon;}
function alignLongitudeToRoute(lon:number,route:VoyagePlan){const reference=routeWorldReference(route);let aligned=lon;while(aligned-reference>180)aligned-=360;while(aligned-reference<-180)aligned+=360;return aligned;}
function unwrapLongitudes(points:[number,number][]):[number,number][]{if(!points.length)return points;const out:[number,number][]=[points[0]];for(let i=1;i<points.length;i++){let lon=points[i][0];const prev=out[i-1][0];while(lon-prev>180)lon-=360;while(lon-prev<-180)lon+=360;out.push([lon,points[i][1]]);}return out;}
