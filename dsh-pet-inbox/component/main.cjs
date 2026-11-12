const { app, shell, dialog } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { spawn } = require('node:child_process');
const readline = require('node:readline');

module.exports = function startInbox(pets) {
  const data = path.join(app.getPath('userData'), 'file-inbox');
  fs.mkdirSync(data, { recursive: true });
  const settings = path.join(data, 'settings.json');
  let config = {};
  try { config = JSON.parse(fs.readFileSync(settings, 'utf8')); } catch {}
  const save = () => fs.writeFileSync(settings, JSON.stringify(config));
  const root = () => config.root || path.join(app.getPath('documents'), '桌宠收纳箱');
  function say(message) {
    for (const pet of pets.values()) {
      if (!pet.isDestroyed()) pet.webContents.send('inbox:parcel',{message});
    }
  }
  // 所有移动和撤销按投放顺序执行，防止两个批次同时占用同一目标文件名。
  let tail = Promise.resolve();
  let pending = 0;
  function worker(req, target) {
    return new Promise((resolve,reject) => {
      const python = JSON.parse(fs.readFileSync(path.join(__dirname,'runtime.json'))).python;
      const child = spawn(python,['-X','utf8',path.join(__dirname,'worker.py'),target,path.join(data,'history.sqlite')],
        {windowsHide:true,stdio:['pipe','pipe','pipe']});
      let result, errorText = '';
      child.on('error',reject);
      child.stdin.on('error',reject);
      child.stderr.on('data', d => {errorText = (errorText + d).slice(-400);});
      readline.createInterface({input:child.stdout}).on('line', line => {
        try {const event=JSON.parse(line); if(event.progress) say(event.progress); else result=event;} catch {}
      });
      child.on('close',code => code === 0 && result ? resolve(result) : reject(Error(errorText || 'Python 工作进程未完成')));
      child.stdin.end(JSON.stringify(req));
    });
  }
  function queue(req) {
    const target = root();
    pending++;
    if(pending > 1) say('已排队 · ' + pending + ' 项任务');
    tail = tail.then(async () => {
      const result = await worker(req,target);
      if (result.rows) {
        const content = result.rows.map(([src,dst,status,reason]) => [status,src,dst,reason].filter(Boolean).join('\n')).join('\n\n');
        const file = path.join(data,'最近收纳记录.txt');
        fs.writeFileSync(file,'\ufeff'+(content || '还没有投放记录。'));
        const err = await shell.openPath(file); if(err) throw Error(err);
      } else say(result.message);
      return result;
    }).catch(e => {say('操作失败 · 请查看提示'); dialog.showErrorBox('桌宠收纳箱',e.message);})
      .finally(() => {pending--;});
    return tail;
  }
  async function openRoot() {
    try { fs.mkdirSync(root(),{recursive:true}); const err=await shell.openPath(root()); if(err) throw Error(err); }
    catch(e) { dialog.showErrorBox('打开收纳目录失败',e.message); }
  }
  const settingsMenu = win => [
    {label:'打开收纳目录',click:openRoot},
    {label:'精简搬运动画',type:'checkbox',checked:!!config.reduced,click:item=>{config.reduced=item.checked;save();}},
    {label:'最近收纳记录',click:()=>queue({action:'history'})},
    {label:'撤销最近一批',enabled:pending===0,click:()=>queue({action:'undo'})},
    {type:'separator'},
    {label:'更改收纳位置…',enabled:pending===0,click:async () => {
      const r=await dialog.showOpenDialog(win,{properties:['openDirectory','createDirectory']});
      if(!r.canceled){config.root=r.filePaths[0];save();say('新投放将使用所选目录');}
    }}
  ];
  require('./courier.cjs')({pets,config,save,queue,settingsMenu});
};
