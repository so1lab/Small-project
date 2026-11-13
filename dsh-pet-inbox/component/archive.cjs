const {screen,shell}=require('electron');
const {execFile}=require('node:child_process');
const path=require('node:path');
const actions=require('./actions.json');
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));

function query(folder,pet,options=[]){
  const handle=pet.getNativeWindowHandle().readUInt32LE(0);
  const args=['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',path.join(__dirname,'locate-target.ps1'),folder,'-PetHwnd',String(handle),...options];
  return new Promise(resolve=>execFile('powershell.exe',args,{windowsHide:true,timeout:5500},(error,out)=>{
    if(error)return resolve(null);
    try{resolve(JSON.parse(out));}
    catch{resolve(null);}
  }));
}
async function locate(folder,pet,options=[]){
  const r=await query(folder,pet,options);
  return r?{...screen.screenToDipPoint({x:r.x,y:r.y}),kind:r.kind,hwnd:r.hwnd}:null;
}
async function reveal(folder,pet,opened){
  const before=await query(folder,pet,['-Snapshot']);
  execFile('explorer.exe',['/select,',folder],{windowsHide:false},()=>{});
  for(let i=0;i<3;i++){
    const p=await locate(folder,pet,['-NoGateway','-Reveal']);
    if(p){
      if(p.hwnd && Array.isArray(before) && !before.includes(p.hwnd))opened.add(p.hwnd);
      return p;
    }
    await wait(220);
  }
  return null;
}

// 执行脚本全部是组件自身代码。用户文件名只通过 JSON 字符串和 textContent 进入界面。
const evaluate=(pet,fn,...args)=>pet.webContents.executeJavaScript('('+fn.toString()+')('+args.map(a=>JSON.stringify(a)).join(',')+')');
function spriteGeometry(){
  const s=sprites[0],r=s.hit.getBoundingClientRect();
  if(!r.width || s.dragState.active)throw Error('桌宠正在拖动或尚未就绪');
  return {x:r.x+r.width/2,y:r.y+r.height/2,w:r.width};
}
async function geometry(pet){
  const r=await evaluate(pet,spriteGeometry),b=pet.getContentBounds(),z=pet.webContents.getZoomFactor();
  return {x:b.x+r.x*z,y:b.y+r.y*z,w:r.w*z,z};
}
function perform(clip,direction){
  const s=sprites[0];s.stopMove();s.stopThrow();
  if(direction)s.facing=direction;s.playOnce(clip);
}
function travel(dx,dy,duration){
  const s=sprites[0];
  s.moveToCenter((s.pos.x+s.halfW+dx)/VIEW.w,(s.pos.y+s.halfH+dy)/VIEW.h,'line',duration);
}
function attach(label){
  document.getElementById('inbox-parcel-card')?.remove();
  const card=document.createElement('span');card.id='inbox-parcel-card';card.textContent=label;
  Object.assign(card.style,{position:'fixed',zIndex:'10000',pointerEvents:'none',padding:'4px 8px',maxWidth:'100px',
    whiteSpace:'nowrap',textOverflow:'ellipsis',overflow:'hidden',font:'12px Microsoft YaHei UI,sans-serif',borderRadius:'3px 8px 4px 4px',
    color:'#3e493f',background:'linear-gradient(135deg,#fffdf5,#f5e7c7)',border:'1px solid #baa478',boxShadow:'0 2px 4px #42371e30'});
  document.body.append(card);
  const follow=()=>{
    if(!card.isConnected || card.dataset.release)return;
    const s=sprites[0],r=s.hit.getBoundingClientRect(),right=s.facing==='right';
    card.style.left=(right?r.right-10:r.left-card.offsetWidth+10)+'px';
    card.style.top=(r.y+r.height*.58)+'px';
    requestAnimationFrame(follow);
  };follow();
}
async function release(x,y,duration){
  const card=document.getElementById('inbox-parcel-card');
  if(!card)return;
  card.dataset.release='1';
  const r=card.getBoundingClientRect(),dx=x-r.x-r.width/2,dy=y-r.y-r.height/2;
  await card.animate([{transform:'translate(0,0)'},{transform:'translate('+dx*.45+'px,'+(dy*.45-6)+'px) scale(.85)',offset:.45},
    {transform:'translate('+dx+'px,'+dy+'px) scale(.12)',opacity:0}],{duration,fill:'forwards',easing:'ease-in'}).finished;
  card.remove();
}
async function approach(pet,point){
  const g=await geometry(pet),area=screen.getDisplayNearestPoint(point).workArea;
  const gap=g.w/2+25;
  let side=g.x<point.x?-1:1;
  if(point.x+side*(gap+g.w/2)<area.x || point.x+side*(gap+g.w/2)>area.x+area.width)side=-side;
  const dx=point.x+side*gap-g.x,dy=point.y-g.w*.09-g.y;
  const duration=Math.max(240,Math.hypot(dx,dy)/actions.walk.pixelsPerSecond*1000);
  await evaluate(pet,perform,actions.walk.clip,side<0?'right':'left');
  await evaluate(pet,travel,dx/g.z,dy/g.z,duration);
  await wait(duration+100);
}
module.exports=async function archive(pet,groups){
  if(!pet || pet.isDestroyed() || !pet.isVisible())return;
  const origin=await geometry(pet);
  for(const group of groups){
    const opened=new Set();
    const name=group.count===1?group.name:group.count+' 个文件';
    try{
      await evaluate(pet,perform,actions.receive.clip,null);
      await wait(actions.receive.attachMs);
      await evaluate(pet,attach,name);
      let p=await locate(group.folder,pet);
      if(p?.kind==='gateway'){await approach(pet,p);p=null;}
      if(!p)p=await reveal(group.folder,pet,opened);
      if(!p)throw Error('未找到可见的文件夹图标');
      let aligned=false;
      for(let i=0;i<3;i++){
        await approach(pet,p);
        const check=await locate(group.folder,pet,['-NoGateway']);
        if(check && Math.hypot(check.x-p.x,check.y-p.y)<6){p=check;aligned=true;break;}
        p=check || await reveal(group.folder,pet,opened);
        if(!p)break;
      }
      if(!aligned)throw Error('目标文件夹的位置已变化');
      await evaluate(pet,perform,actions.place.clip,null);
      await wait(actions.place.releaseMs);
      const b=pet.getContentBounds(),z=pet.webContents.getZoomFactor();
      await evaluate(pet,release,(p.x-b.x)/z,(p.y-b.y)/z,actions.place.flightMs);
      await evaluate(pet,perform,actions.idle.clip,null);
      await wait(actions.pauseAfterDeliveryMs);
    }catch(e){
      if(!pet.isDestroyed())pet.webContents.send('inbox:parcel',{message:'已归档到 '+path.basename(group.folder)+' · 未完成送达动画'});
      console.warn('[inbox] 文件已归档，送达演出中断',e.message);
    }finally{
      if(!pet.isDestroyed()){
        for(const hwnd of opened)await query(group.folder,pet,['-CloseHwnd',String(hwnd)]);
        await evaluate(pet,()=>document.getElementById('inbox-parcel-card')?.remove());
        await evaluate(pet,perform,actions.idle.clip,null);
      }
    }
  }
  if(!pet.isDestroyed() && pet.isVisible()){
    const here=await geometry(pet);
    const dx=origin.x-here.x,dy=origin.y-here.y;
    if(Math.hypot(dx,dy)>3){
      const duration=Math.max(240,Math.hypot(dx,dy)/actions.walk.pixelsPerSecond*1000);
      await evaluate(pet,perform,actions.walk.clip,dx<0?'left':'right');
      await evaluate(pet,travel,dx/here.z,dy/here.z,duration);
      await wait(duration+100);
      if(!pet.isDestroyed())await evaluate(pet,perform,actions.idle.clip,null);
    }
  }
};

