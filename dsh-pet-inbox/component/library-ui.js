const input=document.querySelector('#query'),feedback=document.querySelector('#feedback'),body=document.querySelector('tbody');
let entries=[];
document.querySelector('#root').onclick=()=>library.openRoot();
function rank(row,query){
  const q=query.toLowerCase().replace(/请问|大肥鱼|帮我|找一下|找找|上次|那个|那份|写了|关于|文件在哪[里儿]?|文件|在哪里|在哪|有没有|的|[？?，。]/g,' ').trim();
  const text=[row.name,row.category,row.summary,row.search_text,...row.tags,row.path].join(' ').toLowerCase();
  let score=0;
  for(const part of q.split(/\s+/).filter(Boolean)){
    if(text.includes(part)) score+=10+part.length;
    for(let i=0;i<part.length-1;i++)if(/[\u3400-\u9fff]{2}/.test(part.slice(i,i+2)) && text.includes(part.slice(i,i+2))) score++;
  }
  return score;
}
function render(){
  const q=input.value.trim();
  const pool=document.querySelector("#pending").checked?entries.filter(r=>r.category==="待确认" && r.status==="已收纳"):entries;
  const rows=q?pool.map(row=>({row,score:rank(row,q)})).filter(hit=>hit.score>0).sort((a,b)=>b.score-a.score).map(hit=>hit.row):pool;
  feedback.textContent=q?(rows.length?'找到 '+rows.length+' 条相关记录，最匹配的是「'+rows[0].name+'」。':'没有找到匹配项。可以换用项目名、文件类型或正文里的词。'):
    (rows.length?'共 '+rows.length+' 条记录':'还没有记录。把文件拖给大肥鱼即可收纳。');
  body.replaceChildren();
  for(const row of rows){
    const tr=body.insertRow(),name=tr.insertCell();
    name.textContent=row.name;
    const detail=document.createElement('small');detail.textContent=[row.path,row.added,row.status].filter(Boolean).join(' · ');name.append(detail);
    const location=tr.insertCell();location.textContent=row.category;
    const tags=document.createElement('small');tags.textContent=row.tags.join(' · ');location.append(tags);
    if(row.why){const reason=document.createElement('details'),title=document.createElement('summary');title.textContent='归档依据';reason.append(title,document.createTextNode(row.why));location.append(reason);}
    tr.insertCell().textContent=row.summary;
    const b=document.createElement('button');b.textContent=row.available?'显示位置':'位置待核对';b.disabled=!row.available;
    b.onclick=async()=>{if(!await library.locate(row.id))await refresh();};const actions=tr.insertCell();actions.append(b);
    if(row.available && row.status==='已收纳' && row.category==='待确认' && row.proposed){
      const create=document.createElement('button');create.textContent='新建项目：'+row.proposed;
      create.onclick=()=>library.newProject(row.id);actions.append(create);
    }
    if(row.available && row.status==='已收纳' && row.suggestion && row.category==='待确认'){
      const accept=document.createElement('button');accept.textContent='归入 '+row.suggestion;
      accept.onclick=()=>library.confirm(row.id);actions.append(accept);
    }
    if(row.available && row.status==='已收纳' && !['待确认','待分类'].includes(row.category)){
      const form=document.createElement('details'),title=document.createElement('summary');
      title.textContent='记住项目别名';const term=document.createElement('input');term.placeholder='如：青禾秋展';term.maxLength=40;
      const save=document.createElement('button');save.textContent='关联到此目录';
      save.onclick=async()=>{if(await library.alias(row.id,term.value))feedback.textContent='已记住别名：'+term.value;};
      form.append(title,term,save);actions.append(form);
    }
    if(row.available && row.status==="已收纳"){const edit=document.createElement("button");edit.textContent="调整分类";edit.onclick=()=>library.adjust(row.id);actions.append(edit);}
  }
}
async function refresh(){try{entries=await library.read();render();}catch{feedback.textContent='读取总览失败，请重新打开窗口。';}}
document.querySelector("#pending").onchange=render;input.oninput=render;library.onChange(refresh);window.addEventListener('focus',refresh);refresh();
