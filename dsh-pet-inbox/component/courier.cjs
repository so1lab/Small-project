const {BrowserWindow, dialog, ipcMain, Menu, shell} = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const {spawn} = require('node:child_process');

module.exports = function attachCourier({pets,config,save,queue,settingsMenu}) {
  ipcMain.on('inbox:carry',(event,received)=>{
    const pet = BrowserWindow.fromWebContents(event.sender);
    if(!pet || !Array.from(pets.values()).includes(pet) || event.senderFrame !== event.sender.mainFrame) return;
    if(!Array.isArray(received) || !received.length || !received.every(p=>typeof p==='string' && path.isAbsolute(p))) return;
    // 接住文件时只记录来源。用户选好动作后才修改磁盘，Esc 可安全取消。
    const paths=[...new Set(received)];
    const notify=(message,delivered=false,bin=false)=>{
      if(!pet.isDestroyed()) pet.webContents.send('inbox:parcel',{message,delivered,bin,reduced:config.reduced});
    };
    const title=paths.length===1 ? path.basename(paths[0]) : paths.length+' 个文件';
    notify('已接住 · '+title);
    async function deliver(folder) {
      if(!folder) return notify('已取消 · 文件仍在原处');
      config.places=[folder,...(config.places || []).filter(p=>p!==folder)].slice(0,4);
      save();
      notify('正在送往 '+path.basename(folder));
      const result=await queue({action:'deliver',paths,folder});
      if(!result) return notify('搬运失败 · 请查看收纳记录');
      if(result.success>0 && !config.reduced) {
        try { await require('./push.cjs')(pet,folder,result.success===1 && paths.length===1?path.basename(paths[0]):result.success+' 个文件'); }
        catch(e) { console.warn('[dsh-pet-inbox] 搬运动画未播放',e.message); }
      }
      notify(result.message);
      if(pet.isDestroyed()) return;
      Menu.buildFromTemplate([
        {label:result.message,enabled:false},
        {label:'打开目标文件夹',click:()=>shell.openPath(folder)},
        {label:'撤销这次搬运',enabled:result.success>0,click:()=>queue({action:'undo',batch:result.batch})},
        {label:'查看记录',click:()=>queue({action:'history'})}
      ]).popup({window:pet});
    }
    async function recycle() {
      const choice=await dialog.showMessageBox(pet,{buttons:['取消','移入回收站'],defaultId:0,cancelId:0,
        message:'将 '+title+' 移入 Windows 回收站？',detail:paths.slice(0,6).join('\n')+(paths.length>6?'\n…':'')});
      if(choice.response!==1) return notify('已取消 · 文件仍在原处');
      const failed=[];
      for(const p of paths) {
        try {
          const stat=await fs.lstat(p);
          if(!stat.isFile() || stat.isSymbolicLink()) throw Error('仅支持普通文件');
          await shell.trashItem(p);
        } catch(e) {failed.push(p+' — '+e.message);}
      }
      const ok=paths.length-failed.length;
      notify('已回收 '+ok+' 项 · 失败 '+failed.length+' 项',ok>0,true);
      if(pet.isDestroyed()) return;
      const r=await dialog.showMessageBox(pet,{message:'已移入回收站 '+ok+' 项',detail:failed.join('\n') || '可在 Windows 回收站选择“还原”。',
        buttons:['完成','打开回收站'],cancelId:0});
      if(r.response===1) spawn('explorer.exe',['shell:RecycleBinFolder'],{windowsHide:true}).on('error',e=>notify(e.message));
    }
    let selected=false;
    const action=fn=>()=>{selected=true;Promise.resolve().then(fn).catch(e=>notify('操作失败 · '+e.message));};
    Menu.buildFromTemplate([
      {label:'搬运 · '+title,enabled:false},
      {label:'自动分类到收纳目录',click:action(()=>queue({action:'drop',paths}))},
      {label:'收纳选项',submenu:settingsMenu(pet)},
      {label:'送到文件夹…',click:action(async()=>{
        const r=await dialog.showOpenDialog(pet,{properties:['openDirectory','createDirectory']});
        await deliver(r.canceled?null:r.filePaths[0]);
      })},
      ...(config.places || []).map(p=>({label:'送到 '+p,click:action(()=>deliver(p))})),
      {type:'separator'},{label:'送进回收站…',click:action(recycle)},
      {label:'取消',click:action(()=>notify('已取消 · 文件仍在原处'))}
    ]).popup({window:pet,callback:()=>setTimeout(()=>{if(!selected) notify('已取消 · 文件仍在原处');},50)});
  });
};


