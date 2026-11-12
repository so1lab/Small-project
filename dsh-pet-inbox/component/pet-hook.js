// Installed inside the upstream sandboxed preload. File paths come only from trusted OS drops.
{
  const {ipcRenderer: courier, webUtils} = require('electron');
  let parcel;
  let timer;
  function badge(message) {
    clearTimeout(timer);
    if (!parcel) {
      parcel = document.createElement('div');
      Object.assign(parcel.style, {position:'fixed',zIndex:'2147483647',pointerEvents:'none',
        color:'white',background:'#164539',borderRadius:'12px',padding:'3px 9px',font:'12px sans-serif'});
      document.body.append(parcel);
    }
    const bounds = document.querySelector('.pet-hit')?.getBoundingClientRect();
    parcel.style.left = Math.max(0,Math.min(innerWidth-118,bounds?.left || 0))+'px';
    parcel.style.top = Math.max(0,(bounds?.top || 25)-23)+'px';
    parcel.hidden=false;
    parcel.textContent=message;
    timer=setTimeout(()=>{parcel.hidden=true;},3500);
  }
  // 只接管宠物身体上的系统文件投放；按住 Shift 时保留上游的图片聊天。
  function isFileDrag(e) {
    return e.isTrusted && !e.shiftKey && e.target.closest?.('.pet-hit') && Array.from(e.dataTransfer.types).includes('Files');
  }
  window.addEventListener('dragover',e=>{
    if(!isFileDrag(e)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect='copy';
    badge('松手交给桌宠');
  },true);
  window.addEventListener('drop',e=>{
    if(!isFileDrag(e)) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    const files=Array.from(e.dataTransfer.files, f=>webUtils.getPathForFile(f)).filter(Boolean);
    if(files.length) courier.send('inbox:carry',files);
  },true);
  courier.on('inbox:parcel',(_,state)=>{
    badge(state.message);
    if(state.delivered && !state.reduced) {
      const chip=document.createElement('span');
      const target=document.createElement('span');
      chip.textContent='📦';
      target.textContent=state.bin?'🗑️':'📁';
      const box=parcel.getBoundingClientRect();
      for(const [el,offset] of [[chip,0],[target,42]]) {
        Object.assign(el.style,{position:'fixed',pointerEvents:'none',zIndex:'2147483647',
          left:Math.max(0,Math.min(innerWidth-72,box.left))+offset+'px',
          top:Math.max(0,Math.min(innerHeight-26,box.bottom))+'px',fontSize:'20px'});
        document.body.append(el);
      }
      const motion=chip.animate([{transform:'translate(0,0)'},
        {transform:state.bin?'translate(22px,-14px) rotate(15deg)':'translate(22px,0)'},
        {transform:'translate(42px,2px) scale(.5)',opacity:0}],{duration:560,easing:'ease-out'});
      motion.onfinish=()=>{chip.remove();target.remove();};
    }
  });
}

