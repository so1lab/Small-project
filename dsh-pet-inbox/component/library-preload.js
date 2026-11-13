const {ipcRenderer,contextBridge}=require('electron');
contextBridge.exposeInMainWorld('library',{
  openRoot:()=>ipcRenderer.invoke('inbox:root'),
  adjust:id=>ipcRenderer.invoke('inbox:adjust',id),
  newProject:id=>ipcRenderer.invoke('inbox:new-project',id),
  confirm:id=>ipcRenderer.invoke('inbox:confirm',id),
  alias:(id,term)=>ipcRenderer.invoke('inbox:alias',id,term),
  read:()=>ipcRenderer.invoke('inbox:entries'),
  locate:id=>ipcRenderer.invoke('inbox:locate',id),
  onChange:cb=>ipcRenderer.on('inbox:refresh',()=>cb())
});
