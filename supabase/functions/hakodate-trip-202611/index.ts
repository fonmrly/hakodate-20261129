import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const PASS=Deno.env.get("HAKODATE_TRIP_PASSPHRASE") ?? "";
const TOKEN=Deno.env.get("HAKODATE_TRIP_SESSION_TOKEN") ?? "";
const BUCKET="hakodate-trip-202611";
const url=Deno.env.get("SUPABASE_URL")!;
const key=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const sb=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"content-type,x-trip-token","Access-Control-Allow-Methods":"POST,OPTIONS","Cache-Control":"no-store"};

function json(body:unknown,status=200){return new Response(JSON.stringify(body),{status,headers:{...cors,"Content-Type":"application/json; charset=utf-8"}})}
function authed(req:Request){return req.headers.get("x-trip-token")===TOKEN}
function decodeDataUrl(s:string){
  const m=/^data:(image\/(?:jpeg|png|webp));base64,(.+)$/.exec(s||"");
  if(!m) throw new Error("unsupported_image");
  const bin=atob(m[2]); const bytes=new Uint8Array(bin.length);
  for(let i=0;i<bin.length;i++)bytes[i]=bin.charCodeAt(i);
  return {mime:m[1],bytes};
}
function ext(mime:string){return mime==="image/png"?"png":mime==="image/webp"?"webp":"jpg"}

Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS")return new Response(null,{status:204,headers:cors});
  if(req.method!=="POST")return json({ok:true,name:"hakodate-trip-202611"});
  let body:any={};try{body=await req.json()}catch{return json({ok:false,error:"bad_request"},400)}
  const action=String(body?.action||"");
  if(action==="login"){
    if(String(body?.passphrase||"").trim()!==PASS)return json({ok:false,error:"wrong_passphrase"},401);
    return json({ok:true,token:TOKEN});
  }
  if(!authed(req))return json({ok:false,error:"unauthorized"},401);

  if(action==="get_state"){
    const {data,error}=await sb.rpc("hakodate_trip_202611_get_state");
    if(error)return json({ok:false,error:error.message},500);
    const row=Array.isArray(data)?data[0]:data;
    return json({ok:true,state:row?.data||null,updated_at:row?.updated_at||null});
  }
  if(action==="save_state"){
    const {data,error}=await sb.rpc("hakodate_trip_202611_save_state",{p_data:body.state||{}});
    if(error)return json({ok:false,error:error.message},500);
    return json({ok:true,updated_at:data});
  }
  if(action==="list_photos"){
    const {data,error}=await sb.rpc("hakodate_trip_202611_list_photos");
    if(error)return json({ok:false,error:error.message},500);
    const rows=Array.isArray(data)?data:[];
    const out=[];
    for(const p of rows){
      const {data:signed,error:se}=await sb.storage.from(BUCKET).createSignedUrl(p.path,3600);
      if(se)continue;
      out.push({id:p.id,day:p.day,caption:p.caption||"",data:signed.signedUrl,created:Date.parse(p.created_at)||0});
    }
    return json({ok:true,photos:out});
  }
  if(action==="upload_photo"){
    try{
      const id=String(body.id||"").slice(0,100),day=String(body.day||"");
      if(!id||!["1128","1129","1130"].includes(day))return json({ok:false,error:"invalid_photo"},400);
      const {mime,bytes}=decodeDataUrl(String(body.data||""));
      if(bytes.byteLength>5*1024*1024)return json({ok:false,error:"image_too_large"},413);
      const path=day+"/"+id+"."+ext(mime);
      const {error:upErr}=await sb.storage.from(BUCKET).upload(path,bytes,{contentType:mime,upsert:true});
      if(upErr)return json({ok:false,error:upErr.message},500);
      const {error:metaErr}=await sb.rpc("hakodate_trip_202611_add_photo",{p_id:id,p_day_id:day,p_caption:String(body.caption||"").slice(0,200),p_path:path});
      if(metaErr)return json({ok:false,error:metaErr.message},500);
      const {data:signed,error:signErr}=await sb.storage.from(BUCKET).createSignedUrl(path,3600);
      if(signErr)return json({ok:false,error:signErr.message},500);
      return json({ok:true,photo:{id,day,caption:String(body.caption||"").slice(0,200),data:signed.signedUrl,created:Date.now()}});
    }catch(e){return json({ok:false,error:String(e?.message||e)},400)}
  }
  if(action==="update_photo_caption"){
    const {error}=await sb.rpc("hakodate_trip_202611_update_photo_caption",{p_id:String(body.id||""),p_caption:String(body.caption||"").slice(0,200)});
    return error?json({ok:false,error:error.message},500):json({ok:true});
  }
  if(action==="delete_photo"){
    const {data:path,error}=await sb.rpc("hakodate_trip_202611_delete_photo",{p_id:String(body.id||"")});
    if(error)return json({ok:false,error:error.message},500);
    if(path)await sb.storage.from(BUCKET).remove([path]);
    return json({ok:true});
  }
  return json({ok:false,error:"unknown_action"},400);
});