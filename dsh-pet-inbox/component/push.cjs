const {BrowserWindow,screen,shell}=require('electron');
const {execFile}=require('node:child_process');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));

async function explorerPoint(folder) {
  if(await shell.openPath(folder)) return null;
  return new Promise(resolve=>execFile('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',
    path.join(__dirname,'explorer-point.ps1'),folder],{timeout:4500,windowsHide:true},(error,out)=>{
      try {resolve(error?null:screen.screenToDipPoint(JSON.parse(out.trim())));} catch {resolve(null);}
    }));
}

module.exports=async function push(pet,folder,label) {
  if(pet.isDestroyed()) return;
  // Explorer 返回物理像素，Electron 使用 DIP。定位失败时在宠物所在屏幕演示。
  const endpoint=await explorerPoint(folder);
  if(pet.isDestroyed() || !pet.isVisible()) return;
  const bounds=pet.getContentBounds();
  const start={x:bounds.x+bounds.width/2,y:bounds.y+bounds.height/2};
  const area=screen.getDisplayNearestPoint(start).workArea;
  const fallback={x:area.x+area.width*.5,y:area.y+area.height*.56};
  const end=endpoint || fallback;
  const left=end.x<start.x;
  const win=new BrowserWindow({width:224,height:134,show:false,transparent:true,frame:false,
    focusable:false,skipTaskbar:true,resizable:false,alwaysOnTop:true,hasShadow:false,
    webPreferences:{sandbox:true,nodeIntegration:false,contextIsolation:true}});
  win.setIgnoreMouseEvents(true);
  let hidden=false;
  try {
    await win.loadFile(path.join(__dirname,'push.html'));
    const movie=pathToFileURL(path.resolve(__dirname,'../../../assets/webm/侧身急躁跑.webm')).href;
    await win.webContents.executeJavaScript(`(async()=>{
      document.body.classList.toggle('left',${left});
      const v=document.querySelector('video');v.src=${JSON.stringify(movie)};
      document.querySelector('#file').textContent=${JSON.stringify('📄 '+label)};
      document.querySelector('#target').textContent=${JSON.stringify('📁 '+path.basename(folder))};
      await v.play();
    })()`);
    if(pet.isDestroyed()) return;
    win.setPosition(Math.round(start.x-112),Math.round(start.y-67),false);
    pet.hide();hidden=true;win.showInactive();
    const began=Date.now(),duration=1650;
    while(!win.isDestroyed()){
      const t=Math.min(1,(Date.now()-began)/duration);
      const s=t*t*(3-2*t);
      win.setPosition(Math.round(start.x+(end.x-start.x)*s-112),Math.round(start.y+(end.y-start.y)*s-67),false);
      if(t===1) break;
      await delay(17);
    }
    await win.webContents.executeJavaScript(`document.querySelector('#target').hidden=false;
      document.querySelector('#file').animate([{opacity:1},{transform:'translateY(25px) scale(.25)',opacity:0}],{duration:350,fill:'forwards'});`);
    await delay(500);
  }finally{
    if(!win.isDestroyed())win.destroy();
    if(hidden && !pet.isDestroyed())pet.showInactive();
  }
};
