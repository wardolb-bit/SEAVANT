"use client";

import { useEffect, useRef, useState } from "react";
import maplibregl, { LngLatBounds, Map as MapLibreMap, Marker } from "maplibre-gl";
import type { VesselState } from "@/lib/seavant-state";
import type { VoyagePlan } from "@/lib/voyage-engine";

interface OperationalMapProps { vessel: VesselState; route?: VoyagePlan | null; }
const DEFAULT_CENTER:[number,number]=[145.3467,12.0617]; const ROUTE_SOURCE="seavant-route"; const ROUTE_LAYER="seavant-route-line";

export default function OperationalMap({vessel,route}:OperationalMapProps){
 const containerRef=useRef<HTMLDivElement|null>(null),mapRef=useRef<MapLibreMap|null>(null),markerRef=useRef<Marker|null>(null),routeMarkersRef=useRef<Marker[]>([]),hasCenteredOnLivePosition=useRef(false),lastRouteKey=useRef<string|null>(null); const[loaded,setLoaded]=useState(false);
 useEffect(()=>{if(!containerRef.current||mapRef.current)return;const map=new maplibregl.Map({container:containerRef.current,center:DEFAULT_CENTER,zoom:6,attributionControl:false,style:{version:8,sources:{osm:{type:"raster",tiles:["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],tileSize:256,attribution:"© OpenStreetMap contributors"}},layers:[{id:"osm",type:"raster",source:"osm"}]}});map.addControl(new maplibregl.NavigationControl({showCompass:true}),"top-right");map.addControl(new maplibregl.AttributionControl({compact:true}),"bottom-right");map.on("load",()=>setLoaded(true));mapRef.current=map;return()=>{markerRef.current?.remove();routeMarkersRef.current.forEach(m=>m.remove());map.remove();mapRef.current=null;markerRef.current=null;};},[]);
 useEffect(()=>{const map=mapRef.current;if(!map||!Number.isFinite(vessel.position.lat)||!Number.isFinite(vessel.position.lon))return;const lngLat:[number,number]=[vessel.position.lon,vessel.position.lat];if(!markerRef.current){const element=document.createElement("div");element.className="ownShipMarker";element.style.width="46px";element.style.height="46px";element.style.display="grid";element.style.placeItems="center";element.style.borderRadius="50%";element.style.background="rgba(5,11,14,.78)";element.style.border="2px solid #7fd3dd";element.style.boxShadow="0 0 0 4px rgba(127,211,221,.18),0 0 20px rgba(127,211,221,.95)";element.innerHTML="<span style='display:block;color:#e9ffff;font-size:34px;line-height:1;text-shadow:0 0 10px #7fd3dd'>▲</span>";markerRef.current=new maplibregl.Marker({element,rotationAlignment:"map"}).setLngLat(lngLat).addTo(map);}else markerRef.current.setLngLat(lngLat);const rotation=Number.isFinite(vessel.heading)?vessel.heading:vessel.cog;markerRef.current.setRotation(rotation||0);if(vessel.source==="live"&&!hasCenteredOnLivePosition.current&&!route){map.easeTo({center:lngLat,zoom:Math.max(map.getZoom(),7),duration:900});hasCenteredOnLivePosition.current=true;}},[vessel,route]);
 useEffect(()=>{const map=mapRef.current;if(!map||!loaded)return;routeMarkersRef.current.forEach(m=>m.remove());routeMarkersRef.current=[];if(map.getLayer(ROUTE_LAYER))map.removeLayer(ROUTE_LAYER);if(map.getSource(ROUTE_SOURCE))map.removeSource(ROUTE_SOURCE);if(!route){lastRouteKey.current=null;return;}
 const points=[{name:route.departure,position:route.departurePosition},...route.waypoints,{name:route.destination,position:route.destinationPosition}];
 const raw=points.map(p=>[p.position.lon,p.position.lat] as [number,number]); const coordinates=unwrapLongitudes(raw);
 map.addSource(ROUTE_SOURCE,{type:"geojson",data:{type:"Feature",properties:{},geometry:{type:"LineString",coordinates}}});map.addLayer({id:ROUTE_LAYER,type:"line",source:ROUTE_SOURCE,paint:{"line-color":"#c8a85a","line-width":3,"line-opacity":.9}});
 points.forEach((point,index)=>{const el=document.createElement("div");el.className=index===0||index===points.length-1?"routePoint endpoint":"routePoint";el.title=point.name;routeMarkersRef.current.push(new maplibregl.Marker({element:el}).setLngLat(coordinates[index]).addTo(map));});
 const routeKey=coordinates.map(p=>p.join(",")).join("|");if(lastRouteKey.current!==routeKey){const bounds=coordinates.reduce((b,p)=>b.extend(p),new LngLatBounds(coordinates[0],coordinates[0]));map.fitBounds(bounds,{padding:60,maxZoom:8,duration:700});lastRouteKey.current=routeKey;}},[loaded,route]);
 const recenter=()=>mapRef.current?.easeTo({center:[vessel.position.lon,vessel.position.lat],zoom:Math.max(mapRef.current.getZoom(),7),duration:600});
 return <div className="operationalMapWrap"><div ref={containerRef} className="operationalMap"/><div className="mapStatus">{loaded?route?"ACTIVE ROUTE":"MAP READY":"LOADING MAP"}</div><button className="recenterButton" type="button" onClick={recenter}>RECENTER</button></div>;
}

function unwrapLongitudes(points:[number,number][]):[number,number][]{if(!points.length)return points;const out:[number,number][]=[points[0]];for(let i=1;i<points.length;i++){let lon=points[i][0];const prev=out[i-1][0];while(lon-prev>180)lon-=360;while(lon-prev<-180)lon+=360;out.push([lon,points[i][1]]);}return out;}
