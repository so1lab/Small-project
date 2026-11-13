const {BrowserWindow,ipcMain,shell,dialog}=require('electron');
const path=require('node:path');

module.exports=function library({pets,worker,root,queue}) {
  let panel;
  const fromPet=e=>e.senderFrame===e.sender.mainFrame && Array.from(pets.values()).some(p=>!p.isDestroyed() && p.webContents===e.sender);
  const fromPanel=e=>panel && !panel.isDestroyed() && panel.webContents===e.sender && e.senderFrame===e.sender.mainFrame;
  const entries=async()=>(await worker({action:'catalog'},root())).entries;
  function show(){
    if(panel && !panel.isDestroyed()){panel.show();panel.focus();return;}
    panel=new BrowserWindow({width:960,height:590,minWidth:620,minHeight:380,title:'大肥鱼的文件总览',autoHideMenuBar:true,
      webPreferences:{preload:path.join(__dirname,'library-preload.js'),contextIsolation:true,sandbox:true,nodeIntegration:false}});
    panel.on('closed',()=>{panel=null;});
    panel.loadFile(path.join(__dirname,'library.html'));
  }
  ipcMain.on('inbox:library',e=>{if(fromPet(e))show();});
  ipcMain.on('inbox:auto',(e,paths)=>{
    if(fromPet(e) && Array.isArray(paths) && paths.length && paths.every(p=>typeof p==='string' && path.isAbsolute(p)))
      queue({action:'drop',paths},BrowserWindow.fromWebContents(e.sender));
  });
  ipcMain.handle('inbox:entries',e=>{if(fromPanel(e))return entries();});
  ipcMain.handle('inbox:adjust',async(e,id)=>{
    if(!fromPanel(e))return;
    const picked=await dialog.showOpenDialog(panel,{title:'选择或新建资料库内的分类目录',defaultPath:root(),properties:['openDirectory','createDirectory']});
    if(!picked.canceled)await queue({action:'adjust',id,folder:picked.filePaths[0]});
  });
  ipcMain.handle('inbox:new-project',async(e,id)=>{
    if(!fromPanel(e))return;
    const picked=await dialog.showOpenDialog(panel,{title:'选择新项目的上级目录',defaultPath:root(),properties:['openDirectory']});
    if(!picked.canceled)await queue({action:'create_project',id,parent:picked.filePaths[0]});
  });
  ipcMain.handle('inbox:confirm',async(e,id)=>{
    if(!fromPanel(e))return;
    const row=(await entries()).find(x=>x.id===id && x.available && x.status==='已收纳' && x.category==='待确认');
    if(row?.suggestion)await queue({action:'adjust',id,folder:path.join(root(),row.suggestion)});
  });
  ipcMain.handle('inbox:alias',async(e,id,term)=>{
    if(fromPanel(e) && typeof term==='string')return !!await queue({action:'alias',id,term});
  });
  ipcMain.handle('inbox:root',async e=>{if(fromPanel(e))await shell.openPath(root());});
  ipcMain.handle('inbox:locate',async(e,id)=>{
    if(!fromPanel(e))return false;
    const row=(await entries()).find(x=>x.id===id && x.available);
    if(row)shell.showItemInFolder(row.path);
    return !!row;
  });
  return {show,refresh(){if(panel && !panel.isDestroyed())panel.webContents.send('inbox:refresh');}};
};
