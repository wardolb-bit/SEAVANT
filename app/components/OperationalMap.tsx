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

export default function OperationalMap({vessel,route,diagnostics,nextWaypoint}:OperationalMapProps){
 const containerRef=useRef<HTMLDivElement|null>(null),mapRef=useRef<MapLibreMap|null>(null),markerRef=useRef<Marker|null>(null),routeMarkersRef=useRef<Marker[]>([]),hasCenteredOnLivePosition=useRef(false),lastRouteKey=useRef<string|null>(null); const[loaded,setLoaded]=useState(false);
 useEffect(()=>{if(!containerRef.current||mapRef.current)return;const map=new maplibregl.Map({container:containerRef.current,center:DEFAULT_CENTER,zoom:6,attributionControl:false,style:{version:8,sources:{osm:{type:"raster",tiles:["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],tileSize:256,attribution:"© OpenStreetMap contributors"}},layers:[{id:"osm",type:"raster",source:"osm"}]}});map.addControl(new maplibregl.NavigationControl({showCompass:true}),"top-right");map.addControl(new maplibregl.AttributionControl({compact:true}),"bottom-right");map.on("load",()=>setLoaded(true));mapRef.current=map;return()=>{markerRef.current?.remove();routeMarkersRef.current.forEach(m=>m.remove());map.remove();mapRef.current=null;markerRef.current=null;};},[]);
 useEffect(()=>{const map=mapRef.current;if(!map||!Number.isFinite(vessel.position.lat)||!Number.isFinite(vessel.position.lon))return;const lngLat:[number,number]=[vessel.position.lon,vessel.position.lat];if(!markerRef.current){const element=document.createElement("div");element.className="ownShipMarker";element.style.width="22px";element.style.height="30px";element.style.position="relative";element.style.filter="drop-shadow(0 0 2px rgba(127,211,221,.7))";element.innerHTML="<svg viewBox='0 0 22 30' width='22' height='30' aria-hidden='true'><line x1='11' y1='0' x2='11' y2='8' stroke='#7fd3dd' stroke-width='1'/><path d='M11 7 L18 23 L11 20 L4 23 Z' fill='rgba(5,11,14,.78)' stroke='#9ce7ef' stroke-width='1.6' stroke-linejoin='round'/><circle cx='11' cy='18.5' r='1.6' fill='#f3ffff' stroke='#7fd3dd' stroke-width='.7'/></svg>";markerRef.current=new maplibregl.Marker({element,rotationAlignment:"map"}).setLngLat(lngLat).addTo(map);}else markerRef.current.setLngLat(lngLat);const rotation=Number.isFinite(vessel.heading)?vessel.heading:vessel.cog;markerRef.current.setRotation(rotation||0);if(vessel.source==="live"&&!hasCenteredOnLivePosition.current&&!route){map.easeTo({center:lngLat,zoom:Math.max(map.getZoom(),7),duration:900});hasCenteredOnLivePosition.current=true;}},[vessel,route]);
 useEffect(()=>{const map=mapRef.current;if(!map||!loaded)return;routeMarkersRef.current.forEach(m=>m.remove());routeMarkersRef.current=[];if(map.getLayer(ROUTE_LAYER))map.removeLayer(ROUTE_LAYER);if(map.getSource(ROUTE_SOURCE))map.removeSource(ROUTE_SOURCE);if(!route){lastRouteKey.current=null;return;}
 const points=[{name:route.departure,position:route.departurePosition},...route.waypoints,{name:route.destination,position:route.destinationPosition}];
 const raw=points.map(p=>[p.position.lon,p.position.lat] as [number,number]); const coordinates=unwrapLongitudes(raw);
 const activeIndex=findActiveLegIndex(points,diagnostics);
 const features=coordinates.slice(0,-1).map((from,index)=>({type:"Feature" as const,properties:{state:index<activeIndex?"past":index===activeIndex?"active":"future",index},geometry:{type:"LineString" as const,coordinates:[from,coordinates[index+1]]}}));
 map.addSource(ROUTE_SOURCE,{type:"geojson",data:{type:"FeatureCollection",features}});
 map.addLayer({id:ROUTE_LAYER,type:"line",source:ROUTE_SOURCE,layout:{"line-cap":"round","line-join":"round"},paint:{
   "line-color":["match",["get","state"],"active","#7fd3dd","past","#6d7f83","#c8a85a"],
   "line-width":["match",["get","state"],"active",5,"past",2,3],
   "line-opacity":["match",["get","state"],"active",1,"past",.28,.78]
 }});
 points.forEach((point,index)=>{const el=document.createElement("div");const isPast=activeIndex>=0&&index<=activeIndex;const isNext=activeIndex>=0&&index===activeIndex+1;const isEndpoint=index===0||index===points.length-1;el.title=point.name;el.style.position="relative";el.style.width=isNext?"16px":isEndpoint?"12px":"9px";el.style.height=el.style.width;el.style.borderRadius="50%";el.style.background=isNext?"#7fd3dd":isPast?"#66787c":"#c8a85a";el.style.border="2px solid #071014";el.style.opacity=isPast&&!isNext?".42":"1";el.style.boxShadow=isNext?"0 0 0 2px rgba(127,211,221,.45),0 0 16px rgba(127,211,221,.75)":isEndpoint?"0 0 0 1px rgba(200,168,90,.7)":"0 0 0 1px rgba(200,168,90,.5)";
   if(isNext){const label=document.createElement("div");label.textContent=`NEXT · ${point.name}`;label.style.position="absolute";label.style.left="20px";label.style.top="-7px";label.style.whiteSpace="nowrap";label.style.padding="5px 7px";label.style.borderRadius="7px";label.style.background="rgba(5,11,14,.9)";label.style.border="1px solid rgba(127,211,221,.34)";label.style.color="#dffcff";label.style.font="700 9px/1 ui-sans-serif,system-ui";label.style.letterSpacing=".12em";label.style.pointerEvents="none";el.appendChild(label);}
   routeMarkersRef.current.push(new maplibregl.Marker({element:el}).setLngLat(coordinates[index]).addTo(map));});
 const routeKey=coordinates.map(p=>p.join(",")).join("|");if(lastRouteKey.current!==routeKey){const bounds=coordinates.reduce((b,p)=>b.extend(p),new LngLatBounds(coordinates[0],coordinates[0]));map.fitBounds(bounds,{padding:60,maxZoom:8,duration:700});lastRouteKey.current=routeKey;}},[loaded,route,diagnostics]);
 const recenter=()=>mapRef.current?.easeTo({center:[vessel.position.lon,vessel.position.lat],zoom:Math.max(mapRef.current.getZoom(),7),duration:600});
 const xte=diagnostics?`${diagnostics.crossTrackErrorNm.toFixed(2)} NM ${diagnostics.crossTrackSide}`:"--";
 return <div className="operationalMapWrap"><div ref={containerRef} className="operationalMap"/>{route&&diagnostics&&<div className="activeLegOverlay"><span>ACTIVE LEG</span><strong>{diagnostics.activeLeg.from} → {diagnostics.activeLeg.to}</strong><div><b>NEXT</b> {nextWaypoint?.name??diagnostics.activeLeg.to} · <b>DTG</b> {nextWaypoint?`${nextWaypoint.distanceNm.toFixed(1)} NM`:"--"} · <b>XTE</b> {xte}</div></div>}<div className="mapStatus">{loaded?route?"ACTIVE ROUTE":"MAP READY":"LOADING MAP"}</div><button className="recenterButton" type="button" onClick={recenter}>RECENTER</button></div>;
}

function findActiveLegIndex(points:{name:string}[],diagnostics?:RouteDiagnostics|null){if(!diagnostics)return-1;return points.findIndex((point,index)=>index<points.length-1&&point.name===diagnostics.activeLeg.from&&points[index+1].name===diagnostics.activeLeg.to);}
function unwrapLongitudes(points:[number,number][]):[number,number][]{if(!points.length)return points;const out:[number,number][]=[points[0]];for(let i=1;i<points.length;i++){let lon=points[i][0];const prev=out[i-1][0];while(lon-prev>180)lon-=360;while(lon-prev<-180)lon+=360;out.push([lon,points[i][1]]);}return out;}
