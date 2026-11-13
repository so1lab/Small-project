const path=require('node:path');
module.exports=async function analyze(req,root,worker,host){
  const plans=Object.create(null);
  for(const file of [...new Set(req.paths)]){
    const sample=await worker({action:'sample',file},root);
    if(!sample.sig)continue;
    try{
      const response=await host('POST','/dsh-pet-7340/inbox-analyze',JSON.stringify({
        name:path.basename(file),excerpt:sample.body, candidates:sample.candidates, existingCollections:sample.categories.filter(c=>!c.includes("/") && !["待确认","待分类"].includes(c)).slice(0,80)
      }));
      const reply=JSON.parse(response.body);
      if(!reply.ok)continue;
      const clean=reply.text.trim().replace(/^```(?:json)?\s*|\s*```$/gi,'');
      const plan=JSON.parse(clean);
      if(typeof plan.summary==='string' && plan.summary.trim())
        plans[file]={sig:sample.sig,collection:plan.collection,project:plan.project,decision:plan.decision,folder:plan.folder,anchors:plan.anchors,reason:plan.reason,tags:Array.isArray(plan.tags)?plan.tags.slice(0,5):[],summary:plan.summary.trim().slice(0,48)};
    }catch{/* 离线或返回格式错误时，仍在同一资料库完成归档。 */}
  }
  return plans;
};
