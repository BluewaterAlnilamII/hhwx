import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import * as jose from "jose";
import * as s3 from "@aws-sdk/client-s3";
import * as presigner from "@aws-sdk/s3-request-presigner";
import * as contracts from "../src/lib/api-contracts.ts";
import * as responses from "../src/lib/api-response.ts";
import * as images from "../src/lib/chat/chat-image-contract.ts";
import { createChatClipboardPng, inspectChatImage, prepareChatImage } from "../src/lib/chat/chat-image-processing.ts";
import { ChatSession, ChatRequestError } from "../src/lib/chat/chat-session.ts";

const actor="c0000000-0000-4000-8000-000000000001", requestId="c0000000-0000-4000-8000-000000000002";
const metadata={width:100,height:200,bytes:5,contentType:"image/png",hash:"a".repeat(64)};
const image={...metadata,key:`user/images/temporary/${actor}/${requestId}/${metadata.hash}.png`};
const message={id:requestId,clientRequestId:requestId,content:"",image,createdAt:new Date().toISOString(),
  author:{userId:actor,username:"image sender",publicUid:1,avatarCardId:1,avatarCardServer:null,avatarCardTrainType:"normal"}};
const result={messageId:requestId,clientRequestId:requestId,message,deleted:false,nextSendAt:null};

test("attachment drafts reuse prepared previews and release URLs/workers with their account owner", () => {
  const slots = [], workers = [], revoked = [], created = [];
  let cursor = 0, effects = [];
  const react = {
    useState(initial) {
      const i = cursor++; slots[i] ??= { value: initial };
      return [slots[i].value, value => { slots[i].value = typeof value === "function" ? value(slots[i].value) : value; }];
    },
    useRef(current) { const i = cursor++; return slots[i] ??= { current }; },
    useEffect(run, deps) {
      const i = cursor++, previous = slots[i];
      if (!previous || deps.some((v, index) => v !== previous.deps[index])) effects.push(() => {
        previous?.cleanup?.(); slots[i] = { deps, cleanup: run() };
      });
    },
  };
  class PreviewURL extends URL {
    static createObjectURL(blob) { const url = `blob:preview-${created.length}`; created.push({ blob, url }); return url; }
    static revokeObjectURL(url) { revoked.push(url); }
  }
  const exports = {}, source = readFileSync(new URL("../src/components/chat/ChatComposer.tsx", import.meta.url), "utf8")
    .replaceAll("import.meta.url", JSON.stringify("http://localhost/ChatComposer.tsx"));
  runInNewContext(ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022,
  } }).outputText, { exports, crypto, URL: PreviewURL,
    Worker: class { constructor() { workers.push(this); } postMessage(file) { this.file = file; } terminate() { this.terminated = true; } },
    require: id => id === "react" ? react : id === "next/dynamic" ? { __esModule: true, default: () => () => null }
      : id === "@/lib/chat/chat-image-contract" ? images : {},
  });
  const render = () => { cursor = 0; effects = []; const draft = exports.useChatAttachments(); effects.forEach(run => run()); return draft; };
  let draft = render(); draft.addFiles([{ name: "ready.png" }, { name: "processing.png" }]); draft = render();
  const blob = new Blob(["image"]); workers[0].onmessage({ data: { image: { ...metadata, blob } } }); draft = render();
  const first = draft.attachments.items[0]; assert.equal(first.image.blob, blob);
  draft = render(); assert.equal(draft.attachments.items[0].image.url, first.image.url); assert.equal(workers.length, 2);
  draft.removeImage(first.id); draft = render(); assert.deepEqual(revoked, [first.image.url]);
  workers[1].onmessage({ data: { image: { ...metadata, blob } } }); draft = render();
  const second = draft.attachments.items[0];
  for (const slot of slots) slot?.cleanup?.();
  assert.deepEqual(revoked, [first.image.url, second.image.url]); assert.ok(workers.every(worker => worker.terminated));
  workers[1].onmessage({ data: { image: { ...metadata, blob } } }); assert.equal(created.length, 2, "late completion cannot recreate a disposed preview");
});

test("20 MiB, total-pixel and side-length boundaries; only supported formats and fixed CDN object keys",()=>{
  assert.ok(images.isChatImage(image));
  const url = new URL(images.chatImageUrl(image));
  assert.equal(url.pathname, `/${image.key}`, "cache migration preserves the stored object key");
  assert.equal(url.searchParams.get("cors"), "1");
  assert.equal(images.chatImageUrl(image), url.href, "the cache version stays fixed across reads");
  assert.ok(images.isChatImageMetadata({...metadata,bytes:20*1024*1024,width:4096}));
  for(const patch of [{bytes:20*1024*1024+1},{height:16384},{width:4096,height:4097},{bytes:-1},{width:NaN},{width:1.5},{contentType:"image/svg+xml"},{hash:"bad"}])
    assert.equal(images.isChatImageMetadata({...metadata,...patch}),false);
  assert.equal(images.isChatImage({...image,key:"https://untrusted.test/image.png"}),false);
});

test("container recognition preserves GIF, animated WebP and APNG; no extension assumptions",()=>{
  assert.equal(inspectChatImage(Buffer.from("GIF89a123456")).animated,true);
  const webp=Buffer.alloc(30);webp.write("RIFF");webp.writeUInt32LE(22,4);webp.write("WEBPVP8X",8);webp.writeUInt32LE(10,16);webp[20]=2;
  assert.deepEqual(inspectChatImage(webp),{contentType:"image/webp",animated:true});
  webp[20]=0;assert.equal(inspectChatImage(webp).animated,false);
  const png=Buffer.alloc(53);Buffer.from([137,80,78,71,13,10,26,10]).copy(png);png.writeUInt32BE(13,8);png.write("IHDR",12);
  png.writeUInt32BE(8,33);png.write("acTL",37);
  assert.deepEqual(inspectChatImage(png),{contentType:"image/apng",animated:true});
  png.write("IDAT",37);assert.equal(inspectChatImage(png).animated,false);
  png.writeUInt32BE(999,33);assert.throws(()=>inspectChatImage(png),/CHAT_IMAGE_INVALID/);
  assert.throws(()=>inspectChatImage(Buffer.from("<svg>")),/CHAT_IMAGE_FORMAT/);
});

test("ordinary animation bytes stay unchanged; oversize animations never enter a static encoder",async()=>{
  const prior=globalThis.createImageBitmap;
  let closed=0;
  globalThis.createImageBitmap=async()=>({width:100,height:100,close(){closed++;}});
  try {
    const blob=new Blob(["GIF89a123456"]);
    const processed=await prepareChatImage(blob);
    assert.deepEqual(Buffer.from(await processed.blob.arrayBuffer()),Buffer.from(await blob.arrayBuffer()));
    assert.equal(processed.contentType,"image/gif");assert.equal(closed,1);
    globalThis.createImageBitmap=async()=>({width:16384,height:100,close(){closed++;}});
    await assert.rejects(prepareChatImage(blob),/CHAT_IMAGE_ANIMATED_LIMIT/);
    assert.equal(closed,2);
  } finally {globalThis.createImageBitmap=prior;}
});

function serverHarness(){
  const env={CHAT_R2_ENDPOINT:"https://account.r2.cloudflarestorage.com",CHAT_R2_ACCESS_KEY_ID:"test",CHAT_R2_SECRET_ACCESS_KEY:"test-secret",CHAT_TOKEN_SECRET:"x".repeat(32)};
  let head={ContentLength:5,ContentType:"image/png",CacheControl:"public, max-age=31536000, immutable",LastModified:new Date()};
  const calls=[];
  class Client extends s3.S3Client {async send(command){calls.push(command);return head;}}
  const dependencies={"server-only":{},"@aws-sdk/client-s3":{...s3,S3Client:Client},"@aws-sdk/s3-request-presigner":presigner,
    jose,"@/lib/api-contracts":contracts,"./chat-image-contract":images,"./chat-server":{chatRpc:async(name,args)=>{calls.push({name,args});}}};
  const exports={};
  const source=readFileSync(new URL("../src/lib/chat/chat-image-server.ts",import.meta.url),"utf8");
  runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,
    {exports,TextEncoder,Date,Set,AbortSignal,process:{env},require(id){assert.ok(dependencies[id],id);return dependencies[id];}});
  return {server:exports,calls,env,setHead(v){head=v;}};
}

test("clipboard PNG bypasses encoding; JPEG and animated sources get an image representation without changing the source",async()=>{
  const priorBitmap=globalThis.createImageBitmap,priorCanvas=globalThis.OffscreenCanvas;
  const png=Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLttAAAAABJRU5ErkJggg==","base64");
  let decoded=0,closed=0,fail=false;
  const bitmap={width:120,height:80,close(){closed++;}};
  globalThis.createImageBitmap=async()=>{decoded++;return bitmap;};
  globalThis.OffscreenCanvas=class {
    constructor(width,height){assert.equal(width,120);assert.equal(height,80);}
    getContext(){return {drawImage(value){assert.equal(value,bitmap);}};}
    async convertToBlob({type}){assert.equal(type,"image/png");if(fail)throw new Error("encoder failure");return new Blob([png],{type});}
  };
  try {
    const copied=await createChatClipboardPng(new Blob([png]));
    assert.equal(copied.type,"image/png");assert.deepEqual(Buffer.from(await copied.arrayBuffer()),png);assert.equal(decoded,0);
    for(const bytes of [Buffer.from([255,216,255,0]),Buffer.from("GIF89a123456")]) {
      const original=new Blob([bytes]);assert.equal((await createChatClipboardPng(original)).type,"image/png");
      assert.deepEqual(Buffer.from(await original.arrayBuffer()),bytes);
    }
    assert.equal(decoded,2);assert.equal(closed,2);
    fail=true;await assert.rejects(createChatClipboardPng(new Blob(["GIF89a123456"])),/encoder failure/);assert.equal(closed,3);
  } finally {globalThis.createImageBitmap=priorBitmap;globalThis.OffscreenCanvas=priorCanvas;}
});

test("image copy starts the clipboard write within the click and releases its worker on success or denial",async()=>{
  const source=readFileSync(new URL("../src/lib/chat/chat-clipboard.ts",import.meta.url),"utf8").replace("import.meta.url",'"https://app.test/chat-clipboard.ts"');
  const exports={},workers=[],writes=[];let deny=false;
  class Worker {
    constructor(){this.terminated=false;workers.push(this);}
    postMessage(value){this.request=value;}
    terminate(){this.terminated=true;}
  }
  class ClipboardItem {constructor(data){this.data=data;}}
  runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,
    {exports,URL,Worker,ClipboardItem,navigator:{clipboard:{async write(items){writes.push(items);if(deny)throw new Error("permission denied");await items[0].data["image/png"];}}}});
  const copy=exports.copyChatImage("blob:https://app.test/local");
  assert.equal(writes.length,1,"write starts before awaiting pixels, preserving user activation");
  assert.deepEqual(Object.keys(writes[0][0].data),["image/png"]);
  assert.equal(workers[0].request.clipboardSource,"blob:https://app.test/local");
  const png=new Blob(["pixels"],{type:"image/png"});workers[0].onmessage({data:{blob:png}});
  await copy;assert.equal(workers[0].terminated,true);assert.equal(await writes[0][0].data["image/png"],png);
  deny=true;await assert.rejects(exports.copyChatImage("blob:https://app.test/local"),/permission denied/);
  assert.equal(workers[1].terminated,true);
});
function downloadHarness(){
  const source=readFileSync(new URL("../src/lib/chat/chat-image-download.ts",import.meta.url),"utf8");
  const exports={},reads=[],downloads=[],blobs=[],revoked=[],timers=[],previews=[],navigator={},window={matchMedia:()=>({matches:false})};let ok=true;
  const original=new Blob(["GIF89a-original-animation"],{type:"image/gif"});
  runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,
    {exports,window,navigator,File,DOMException,AbortSignal,async fetch(source,options){reads.push({source,...options});return {ok,async blob(){return original;}};},
      document:{body:{append(){}},createElement(){return {click(){downloads.push({href:this.href,name:this.download});},remove(){}};}},
      URL:{createObjectURL(blob){blobs.push(blob);return "blob:download";},revokeObjectURL(url){revoked.push(url);}},
      setTimeout(fn){timers.push(fn);}});
  return {save:(source,type)=>exports.saveChatImage(source,type,()=>previews.push(source)),window,navigator,previews,reads,downloads,blobs,revoked,timers,original,fail(){ok=false;}};
}

test("touch devices hand the unchanged original file to the native image share sheet",async()=>{
  const h=downloadHarness(),shared=[];h.window.matchMedia=()=>({matches:true});
  h.navigator.canShare=({files})=>files.length===1&&files[0].type==="image/gif";
  h.navigator.share=async data=>shared.push(data);
  await h.save("https://cdn.test/image.gif","image/gif");
  assert.equal(shared.length,1);assert.equal(shared[0].files[0].name,"image.gif");
  assert.deepEqual(await shared[0].files[0].arrayBuffer(),await h.original.arrayBuffer());
  assert.equal(h.downloads.length,0);assert.equal(h.blobs.length,0);assert.equal(h.previews.length,0);
});

test("unsupported or activation-expired mobile saving opens the original preview; cancellation does nothing",async()=>{
  const h=downloadHarness();h.window.matchMedia=()=>({matches:true});
  await h.save("blob:pending","image/gif");assert.deepEqual(h.previews,["blob:pending"]);assert.equal(h.reads.length,0);
  h.navigator.canShare=()=>false;h.navigator.share=async()=>{throw new Error("must not share");};
  await h.save("blob:pending","image/gif");assert.equal(h.previews.length,2);
  h.navigator.canShare=()=>true;h.navigator.share=async()=>{throw new DOMException("expired activation","NotAllowedError");};
  await h.save("blob:pending","image/gif");assert.equal(h.previews.length,3);
  h.navigator.share=async()=>{throw new DOMException("cancelled","AbortError");};
  await h.save("blob:pending","image/gif");assert.equal(h.previews.length,3);assert.equal(h.downloads.length,0);
});

test("download fallback hands original CDN bytes to the browser, with no encoding or empty-file download on failure",async()=>{
  const h=downloadHarness();await h.save("https://cdn.test/image.gif","image/gif");
  assert.deepEqual(h.downloads,[{href:"blob:download",name:"image.gif"}]);
  assert.equal(h.blobs[0],h.original);assert.equal(h.reads.length,1);assert.equal(h.reads[0].credentials,"omit");
  assert.equal(h.revoked.length,0);h.timers[0]();assert.deepEqual(h.revoked,["blob:download"]);
  h.fail();await assert.rejects(h.save("https://cdn.test/missing.gif","image/gif"),/Image download unavailable/);
  assert.equal(h.downloads.length,1);assert.equal(h.blobs.length,1);
});

test("download fallback reuses a failed message's local URL without fetching or revoking it; file extensions retain the format",async()=>{
  const h=downloadHarness();
  for(const [type,extension] of [["image/gif","gif"],["image/webp","webp"],["image/apng","png"],["image/jpeg","jpg"],["image/png","png"]]){
    await h.save("blob:pending",type);assert.deepEqual(h.downloads.at(-1),{href:"blob:pending",name:`image.${extension}`});
  }
  assert.equal(h.reads.length,0);assert.equal(h.blobs.length,0);assert.equal(h.timers.length,0);assert.equal(h.revoked.length,0);
});

test("Save as opens the system picker before reading and writes unchanged bytes only to the chosen file",async()=>{
  for(const source of ["https://cdn.test/image.gif","blob:pending"]){
    const h=downloadHarness(),events=[];
    h.window.showSaveFilePicker=function(options){
      assert.equal(this,h.window);assert.equal(h.reads.length,0);
      assert.equal(options.suggestedName,"image.gif");assert.equal(options.types[0].accept["image/gif"][0],".gif");events.push("picker");
      return Promise.resolve({async createWritable(){events.push("open");return {
        async write(blob){assert.equal(blob,h.original);events.push("write");},async close(){events.push("close");},async abort(){events.push("abort");}
      };}});
    };
    const saving=h.save(source,"image/gif");assert.deepEqual(events,["picker"],"picker opens synchronously during the click");await saving;
    assert.deepEqual(events,["picker","open","write","close"]);assert.equal(h.reads[0].source,source);
    assert.equal(h.downloads.length,0);assert.equal(h.blobs.length,0);assert.equal(h.revoked.length,0);
  }
});

test("picker cancellation and rejection never fall through to downloading; failed reads never open a writable file",async()=>{
  const h=downloadHarness();
  h.window.showSaveFilePicker=async()=>{throw new DOMException("cancelled","AbortError");};
  await h.save("https://cdn.test/image.gif","image/gif");assert.equal(h.reads.length,0);
  h.window.showSaveFilePicker=async()=>{throw new DOMException("blocked","SecurityError");};
  await assert.rejects(h.save("https://cdn.test/image.gif","image/gif"),{name:"SecurityError"});assert.equal(h.reads.length,0);
  let opens=0;h.window.showSaveFilePicker=async()=>({async createWritable(){opens++;}});
  h.fail();await assert.rejects(h.save("https://cdn.test/image.gif","image/gif"),/Image download unavailable/);
  assert.equal(opens,0);assert.equal(h.downloads.length,0);assert.equal(h.blobs.length,0);
});

test("failed writes abort the chosen file without a second download",async()=>{
  const h=downloadHarness();let aborted=0,closed=0;
  h.window.showSaveFilePicker=async()=>({async createWritable(){return {
    async write(){throw new Error("disk unavailable");},async close(){closed++;},async abort(){aborted++;}
  };}});
  await assert.rejects(h.save("blob:pending","image/gif"),/disk unavailable/);
  assert.equal(aborted,1);assert.equal(closed,0);assert.equal(h.downloads.length,0);
});

test("upload authorization signs length/type/cache/conditional PUT without R2 calls; receipt binds owner and request",async()=>{
  const h=serverHarness();const upload=await h.server.issueChatImageUpload(actor,requestId,metadata);
  assert.equal(h.calls.length,1);assert.equal(h.calls[0].name,"authorize_chat_image_upload");
  const url=new URL(upload.url),signed=url.searchParams.get("X-Amz-SignedHeaders");
  for(const header of ["content-length","content-type","cache-control","if-none-match"])assert.ok(signed.split(";").includes(header),signed);
  assert.equal(upload.headers["If-None-Match"],"*");assert.equal(url.searchParams.get("X-Amz-Expires"),"3600");
  const verified=await h.server.verifyChatImageUpload(actor,requestId,upload.receipt);
  assert.equal(verified.key,image.key);assert.equal(h.calls.length,2);assert.ok(h.calls[1] instanceof s3.HeadObjectCommand);
  await assert.rejects(h.server.verifyChatImageUpload(requestId,requestId,upload.receipt),{code:"CHAT_IMAGE_EXPIRED"});
  await assert.rejects(h.server.verifyChatImageUpload(actor,actor,upload.receipt),{code:"CHAT_IMAGE_EXPIRED"});
  assert.equal(h.calls.length,2,"invalid receipts never reach R2");
  h.setHead({ContentLength:5000,ContentType:"image/png",LastModified:new Date()});
  await assert.rejects(h.server.verifyChatImageUpload(actor,requestId,upload.receipt),{code:"CHAT_IMAGE_INVALID"});
});

test("image completion retries never re-upload; slow images do not block text; disposal frees local jobs",async()=>{
  let finishUpload;const uploading=new Promise(r=>{finishUpload=r;});
  let puts=0,commits=0,authorizations=0,texts=0,imageId;
  const session=new ChatSession(actor,{
    transport(){throw new Error("not needed");},
    async uploadImage(){puts++;await uploading;},
    async request(path,init){
      const body=JSON.parse(init.body);
      if(path.endsWith("/upload")){authorizations++;imageId=body.clientRequestId;return {receipt:"receipt",url:"https://upload.test",headers:{},expiresAt:Date.now()+3600000};}
      if(path==="/api/chat/images"){
        commits++;assert.equal(body.clientRequestId,imageId);
        if(commits===1)throw new ChatRequestError("CHAT_UNAVAILABLE");
        return {...result,clientRequestId:imageId,message:{...message,clientRequestId:imageId}};
      }
      texts++;return {...result,message:{...message,content:body.content,image:null,clientRequestId:body.clientRequestId}};
    },
  });
  const sent=session.send([{...metadata,blob:new Blob(["image"])}]);
  await new Promise(r=>setImmediate(r));
  session.setDraft("still works");await session.send();assert.equal(texts,1);
  finishUpload();await sent;assert.equal(session.getSnapshot().pending[0].status,"failed");
  await session.retry(imageId);
  assert.equal(puts,1);assert.equal(commits,2);assert.equal(authorizations,1);assert.equal(session.getSnapshot().pending.length,0);
  session.dispose();assert.equal(session.getSnapshot().messages.length,0);
});

test("older image acknowledgement cannot clear a newer text quota; logout aborts an in-flight upload",async()=>{
  let finish,seenSignal;const gate=new Promise(r=>{finish=r;});
  const deadline=new Date(Date.now()+60000).toISOString();let postedId;
  const session=new ChatSession(actor,{transport(){throw new Error("unused");},
    async uploadImage(_upload,_blob,signal){seenSignal=signal;await gate;},
    async request(path,init){const body=JSON.parse(init.body);
      if(path.endsWith('/upload')){postedId=body.clientRequestId;return {url:'test',receipt:'test',expiresAt:Date.now()+3600000,headers:{}};}
      if(path==='/api/chat/messages')return {...result,nextSendAt:deadline,message:{...message,image:null,content:body.content,clientRequestId:body.clientRequestId}};
      return {...result,nextSendAt:null,message:{...message,clientRequestId:postedId}};
    }});
  const sent=session.send([{...metadata,blob:new Blob(['image'])}]);await new Promise(r=>setImmediate(r));
  session.setDraft('twentieth');await session.send();finish();await sent;
  assert.equal(session.getSnapshot().viewer.nextSendAt,deadline);
  assert.equal(seenSignal.aborted,true,'completed job releases its resources');session.dispose();
  let afterLogout=0;
  const other=new ChatSession(actor,{transport(){throw new Error('unused');},
    async request(){afterLogout++;return {url:'test',receipt:'test',expiresAt:Date.now()+3600000,headers:{}};},
    async uploadImage(_u,_b,signal){seenSignal=signal;await new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>reject(new Error('aborted')),{once:true}));}});
  const pending=other.send([{...metadata,blob:new Blob(['image'])}]);await new Promise(r=>setImmediate(r));other.dispose();await pending;
  assert.equal(seenSignal.aborted,true);assert.equal(afterLogout,1);assert.equal(other.getSnapshot().pending.length,0);
});

function batchHarness() {
  const calls=[],saved=[],uploads=new Map(); let failCommit=0,holdUpload=null,echo=null,quotaAt=0;
  let readHistory=async()=>({messages:[...saved],nextCursor:null});
  let number=0;
  const session=new ChatSession(actor,{
    transport(){return {connect(){},disconnect(){}};},
    async uploadImage(upload){calls.push({kind:'put',id:upload.receipt});if(holdUpload)await holdUpload;},
    async request(path,init){
      if(path==='/api/chat/connection')return {token:'test',url:'ws://local',viewer:{userId:actor,canModerate:false,mutedUntil:null,nextSendAt:null}};
      if(!init.method)return readHistory();
      const body=JSON.parse(init.body),id=body.clientRequestId;
      if(path.endsWith('/upload')){
        calls.push({kind:'authorize',id});uploads.set(id,{...body.image,key:`user/images/temporary/${actor}/${id}/${body.image.hash}.png`});
        return {url:'https://upload.test',receipt:id,headers:{},expiresAt:Date.now()+3600000};
      }
      const kind=path==='/api/chat/images'?'image':'text';calls.push({kind,id});
      const current={...message,id,clientRequestId:id,createdAt:new Date(Date.now()+number++).toISOString(),content:body.content??'',image:kind==='image'?uploads.get(id):null};
      if(kind==='image'&&failCommit>0&&calls.filter(c=>c.kind==='image').length===failCommit){failCommit=0;throw new ChatRequestError('CHAT_UNAVAILABLE');}
      saved.push(current);
      if(echo&&kind==='image') {echo({type:'message.created',message:current});throw new ChatRequestError('CHAT_UNAVAILABLE');}
      return {...result,messageId:id,clientRequestId:id,message:current,nextSendAt:saved.length===quotaAt?new Date(Date.now()+60000).toISOString():null};
    }
  });
  return {session,calls,saved,setFailure(n){failCommit=n;},exhaustQuotaAfter(n){quotaAt=n;},hold(promise){holdUpload=promise;},readWith(fn){readHistory=fn;},confirmByEcho(){echo=session.receive;}};
}
const prepared=()=>({...metadata,blob:new Blob(['image'])});

test('confirmation keeps the displayed local image and atomically replaces the pending row',async(t)=>{
  const revoked=[];t.mock.method(URL,'revokeObjectURL',url=>revoked.push(url));
  const h=batchHarness();await h.session.activate();let release;h.hold(new Promise(resolve=>{release=resolve;}));
  const sending=h.session.send([prepared()]);
  const pending=h.session.getSnapshot().pending[0],url=pending.image.url;
  const states=[];const unsubscribe=h.session.subscribe(()=>{
    const snapshot=h.session.getSnapshot();
    states.push({pending:snapshot.pending.some(p=>p.clientRequestId===pending.clientRequestId),
      saved:snapshot.messages.some(m=>m.clientRequestId===pending.clientRequestId)});
  });
  release();await sending;
  assert.ok(states.every(s=>s.pending!==s.saved),'every notification has exactly one pending or confirmed row');
  assert.equal(h.session.getImagePreview(h.saved[0].id),url,'confirmation reuses the original object URL');
  assert.deepEqual(revoked,[],'the displayed image is not released on confirmation');
  unsubscribe();h.session.pause(true);
  assert.deepEqual(revoked,[url],'closing the panel releases confirmed previews');
  assert.equal(h.session.getSnapshot().messages[0].id,h.saved[0].id,'closing retains the record without its local image file');
  assert.equal(h.session.getImagePreview(h.saved[0].id),undefined);h.session.dispose();
  assert.deepEqual(revoked,[url],'each preview is released once');
});

test('echoes, reconnects and duplicate replies preserve previews; deletion and reconciliation release them',async(t)=>{
  const revoked=[];t.mock.method(URL,'revokeObjectURL',url=>revoked.push(url));
  const h=batchHarness();await h.session.activate();h.confirmByEcho();
  await h.session.send([prepared()]);
  const saved=h.saved[0],url=h.session.getImagePreview(saved.id);assert.ok(url);
  await h.session.syncLatest();h.session.receive({type:'message.created',message:saved});
  assert.equal(h.session.getImagePreview(saved.id),url);assert.deepEqual(revoked,[]);
  h.session.receive({type:'message.deleted',messageId:saved.id,deletedAt:new Date().toISOString()});
  assert.equal(h.session.getImagePreview(saved.id),undefined);assert.deepEqual(revoked,[url]);
  h.session.receive({type:'message.created',message:saved});
  assert.equal(h.session.getSnapshot().messages.length,0,'a late acknowledgement cannot restore a deleted image');

  await h.session.send([prepared()]);const next=h.saved.at(-1),nextUrl=h.session.getImagePreview(next.id);assert.ok(nextUrl);
  h.saved.splice(0);h.session.pause(true);await h.session.activate();await h.session.syncLatest();
  assert.equal(h.session.getImagePreview(next.id),undefined);assert.deepEqual(revoked,[url,nextUrl]);
  h.session.dispose();assert.deepEqual(revoked,[url,nextUrl]);
});

test('an older history response cannot release a just-confirmed preview; closed panels do not retain completed uploads',async(t)=>{
  const revoked=[];t.mock.method(URL,'revokeObjectURL',url=>revoked.push(url));
  const h=batchHarness();await h.session.activate();let finishHistory;
  h.readWith(()=>new Promise(resolve=>{finishHistory=resolve;}));
  const syncing=h.session.syncLatest();await h.session.send([prepared()]);
  const saved=h.saved[0],url=h.session.getImagePreview(saved.id);assert.ok(url);
  finishHistory({messages:[],nextCursor:null});await syncing;
  assert.equal(h.session.getImagePreview(saved.id),url);assert.deepEqual(revoked,[]);
  assert.equal(h.session.getSnapshot().messages[0].id,saved.id);
  h.session.pause(true);assert.deepEqual(revoked,[url]);

  await h.session.activate();let finishUpload;h.hold(new Promise(resolve=>{finishUpload=resolve;}));
  const sending=h.session.send([prepared()]),pending=h.session.getSnapshot().pending[0];
  h.session.pause(true);finishUpload();await sending;
  assert.equal(h.session.getImagePreview(h.saved.at(-1).id),undefined);
  assert.deepEqual(revoked,[url,pending.image.url]);h.session.dispose();
});

test('confirmed previews remain available beyond 500 visible and unseen messages until closure',async(t)=>{
  let created=0;const revoked=[];
  t.mock.method(URL,'createObjectURL',()=>`blob:window-${created++}`);
  t.mock.method(URL,'revokeObjectURL',url=>revoked.push(url));
  const h=batchHarness();await h.session.activate();await h.session.syncLatest();
  for(let i=0;i<601;i++)await h.session.send([prepared()]);
  assert.equal(h.session.getSnapshot().messages.length,601);
  assert.equal(created-revoked.length,601);assert.ok(h.session.getImagePreview(h.saved[0].id));
  h.session.setFollowing(false);
  for(let i=0;i<601;i++)await h.session.send([prepared()]);
  assert.equal(created-revoked.length,1202);
  assert.ok(h.session.getImagePreview(h.saved[601].id));
  h.session.pause(true);
  assert.equal(h.session.getSnapshot().messages.length,50,'closed-panel cleanup still applies');
  h.session.dispose();assert.equal(created,revoked.length);assert.equal(new Set(revoked).size,created);
});

test('a submission saves images in order then its text, while a later text remains independent',async()=>{
  const h=batchHarness();let release;h.hold(new Promise(resolve=>{release=resolve;}));
  h.session.setDraft('caption');const sending=h.session.send([prepared(),prepared()]);
  const ids=h.session.getSnapshot().pending.map(p=>p.clientRequestId);
  assert.equal(h.session.getSnapshot().draft,'');assert.equal(ids.length,3);
  assert.deepEqual(h.session.getSnapshot().pending.map(p=>p.status),['uploading','queued','queued']);
  h.session.setDraft('independent text');await h.session.send();
  assert.deepEqual(h.saved.map(m=>m.content),['independent text']);
  h.session.setDraft('next draft');release();await sending;
  assert.deepEqual(h.saved.slice(1).map(m=>m.clientRequestId),ids);
  assert.equal(h.saved.at(-1).content,'caption');assert.equal(h.session.getSnapshot().draft,'next draft');
  assert.equal(h.session.getSnapshot().pending.length,0);h.session.dispose();
});

test('failed batch keeps unattempted items; retry and discard affect only the chosen message',async()=>{
  const h=batchHarness();h.setFailure(2);h.session.setDraft('caption');
  const sending=h.session.send([prepared(),prepared(),prepared()]);
  const ids=h.session.getSnapshot().pending.map(p=>p.clientRequestId);await sending;
  assert.equal(h.saved.length,1);assert.equal(h.saved[0].clientRequestId,ids[0]);
  assert.deepEqual(h.session.getSnapshot().pending.map(p=>[p.clientRequestId,p.status,p.error]),[
    [ids[1],'failed','CHAT_UNAVAILABLE'],[ids[2],'failed','CHAT_NOT_SENT'],[ids[3],'failed','CHAT_NOT_SENT']]);
  await h.session.retry(ids[3]);
  assert.equal(h.saved.at(-1).content,'caption');assert.equal(h.session.getSnapshot().pending.length,2);
  const puts=h.calls.filter(c=>c.kind==='put').length;
  await h.session.retry(ids[1]);assert.equal(h.calls.filter(c=>c.kind==='put').length,puts);
  assert.equal(h.session.getSnapshot().pending.length,1);
  assert.equal(h.calls.filter(c=>c.id===ids[2]).length,0,'unattempted image has no network calls');
  h.session.discard(ids[2]);assert.equal(h.session.getSnapshot().pending.length,0);
  h.session.dispose();
});

test('ten images plus text are accepted; an oversized submission preserves the draft without requests',async()=>{
  const h=batchHarness();h.session.setDraft('keep');assert.equal(h.session.send(Array.from({length:11},prepared)),null);
  assert.equal(h.session.getSnapshot().draft,'keep');assert.equal(h.calls.length,0);
  await h.session.send(Array.from({length:images.CHAT_IMAGE_MAX_ATTACHMENTS},prepared));
  assert.equal(h.saved.length,11);assert.equal(h.saved.at(-1).content,'keep');h.session.dispose();
});

test('quota learned during a batch retains remaining images and text without additional requests',async()=>{
  const h=batchHarness();h.exhaustQuotaAfter(1);h.session.setDraft('not sent caption');
  await h.session.send([prepared(),prepared()]);
  assert.equal(h.saved.length,1);assert.deepEqual(h.calls.map(c=>c.kind),['authorize','put','image']);
  const pending=h.session.getSnapshot().pending;
  assert.deepEqual(pending.map(p=>p.status),['failed','failed']);assert.equal(pending[1].content,'not sent caption');
  h.session.setDraft('next draft');assert.equal(h.session.send([prepared()]),null);
  assert.equal(h.session.getSnapshot().draft,'next draft');assert.equal(h.session.getSnapshot().pending.length,2);
  h.session.discard(pending[1].clientRequestId);assert.equal(h.session.getSnapshot().pending.length,1);h.session.dispose();
});

test('a confirmed image with a lost HTTP response does not strand the rest of its batch',async()=>{
  const h=batchHarness();await h.session.activate();h.confirmByEcho();h.session.setDraft('caption');
  await h.session.send([prepared(),prepared()]);
  assert.deepEqual(h.saved.map(m=>m.content),['','','caption']);assert.equal(h.session.getSnapshot().pending.length,0);h.session.dispose();
});

test("image completion authorizes before HEAD and only broadcasts saved messages",async()=>{
  const calls=[];let unauthorized=false,deleted=false,storageFailed=false;
  const scheduled=[];
  const dependencies={'next/server':{after:callback=>scheduled.push(callback)},'@/lib/api-response':responses,'@/lib/chat/chat-server':{
    chatHeaders:()=>new Headers({'Cache-Control':'no-store'}),requireChatRoom:()=> 'main',
    requireChatIdentity:async(_request,verify)=>{calls.push('auth');assert.equal(verify,true);if(unauthorized)throw new contracts.ApiRouteError(401,'UNAUTHENTICATED','login');return {userId:actor};},
    readChatBody:async request=>request.json(),parseChatId:value=>value,
    chatRpc:async(name,args)=>{calls.push('rpc');assert.equal(name,'send_chat_image');assert.equal(args.p_actor,actor);assert.equal(args.p_room_id,'main');return {...result,deleted};},
    publishChatEvent:async()=>{calls.push('publish');},
  },'@/lib/chat/chat-image-server':{verifyChatImageUpload:async()=>{calls.push('head');if(storageFailed)throw new contracts.ApiRouteError(503,'CHAT_IMAGE_UPLOAD','retry');return image;}}};
  const exports={};runInNewContext(ts.transpileModule(readFileSync(new URL('../src/app/api/chat/images/route.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,require:id=>dependencies[id]});
  const request=()=>new Request('http://localhost/api/chat/images',{method:'POST',body:JSON.stringify({clientRequestId:requestId,receipt:'receipt'})});
  assert.equal((await exports.POST(request())).status,200);assert.deepEqual(calls,['auth','head','rpc']);
  assert.equal(scheduled.length,1);await scheduled.shift()();assert.deepEqual(calls,['auth','head','rpc','publish']);
  calls.length=0;unauthorized=true;assert.equal((await exports.POST(request())).status,401);assert.deepEqual(calls,['auth']);
  calls.length=0;unauthorized=false;storageFailed=true;assert.equal((await exports.POST(request())).status,503);assert.deepEqual(calls,['auth','head']);
  calls.length=0;storageFailed=false;deleted=true;assert.equal((await exports.POST(request())).status,200);assert.deepEqual(calls,['auth','head','rpc']);
  assert.equal(scheduled.length,0,'rejected and deleted messages schedule no publication');
});

test('static rescaling obeys both pixel limits and preserves ordinary long images', async () => {
  let size = [1000, 12000], closes = 0, canvases = [];
  const previousBitmap = globalThis.createImageBitmap;
  globalThis.createImageBitmap = async () => ({width: size[0], height: size[1], close(){closes++;}});
  const previous = globalThis.OffscreenCanvas;
  globalThis.OffscreenCanvas = class {
    constructor(w,h){canvases.push([w,h]);}
    getContext(){return {drawImage(){}};}
    async convertToBlob(){return new Blob(['encoded'], {type:'image/webp'});}
  };
  try {
    const original = new Blob([new Uint8Array([255,216,255,1])]);
    const long = await prepareChatImage(original);
    assert.deepEqual([long.width,long.height],size);
    assert.deepEqual(await long.blob.arrayBuffer(),await original.arrayBuffer());
    assert.equal(canvases.length,0);
    for(size of [[8192,4096],[1000,20000],[4096,4097],[1,20000]]) {
      const output = await prepareChatImage(original);
      assert.ok(images.isChatImageMetadata(output));
      assert.ok(output.width * output.height <= 16777216);
      assert.ok(Math.max(output.width,output.height) <= 16383);
    }
    assert.equal(closes,5); assert.equal(canvases.length,4);
    assert.ok(images.isChatImageMetadata({...metadata,width:4096,height:4096}));
    assert.ok(images.isChatImageMetadata({...metadata,width:1,height:16383}));
  } finally {globalThis.OffscreenCanvas = previous; globalThis.createImageBitmap = previousBitmap;}
});
