"""物理位置回答“属于哪件事”；用途和格式作为标签独立保存。"""
import os
import re
from pathlib import Path

PURPOSES = {
    "模板": ("复用模板", "空白模板", "模板", "各项目复用"),
    "报销": ("报销", "差旅费"),
    "参考资料": ("操作手册", "使用说明", "参考手册", "参考指南"),
    "合同": ("合同", "协议", "甲方"),
    "会议纪要": ("周会", "会议纪要", "参会人"),
    "预算": ("预算", "费用项"),
    "宣传素材": ("海报", "宣传图"),
}
DEFAULTS = {"模板":"模板", "报销":"财务票据", "参考资料":"参考资料"}
GENERIC = {"客户项目","项目","资料","工作","客户","项目资料","通用资料","待分类","待确认","模板","报销","参考资料"}


def inventory(root):
    paths = []
    for base, dirs, _ in os.walk(root):
        dirs[:] = sorted(n for n in dirs if not n.startswith(".") and (Path(base)/n).resolve() == Path(base)/n)
        paths.extend((Path(base)/n).relative_to(root).as_posix() for n in dirs)
    return paths


def matches(term, text):
    """逐处检查，避免把“与青禾书展无关”当成正面证据。"""
    for m in re.finditer(re.escape(term),text,re.I):
        before, after = text[max(0,m.start()-12):m.start()], text[m.end():m.end()+12]
        if re.search(r"(?:不属于|不涉及|无关项目[:：]?|排除|不是|非)\s*$",before) or re.match(r"\s*(?:项目)?(?:无关|无关联|无关系|除外)",after):
            continue
        return True
    return False


def choose(src, body, folders, aliases, default, plan, generic):
    text = src.stem+"\n"+body
    tags = [k for k,words in PURPOSES.items() if any(word in text for word in words)]
    tags += [t for t in plan.get("tags",[]) if isinstance(t,str) and 1<len(t)<=18]
    tags = list(dict.fromkeys(tags+[src.suffix[1:].upper() or "文件"]))[:9]
    for purpose,dest in DEFAULTS.items():
        if purpose in tags[:1] and any(word in text for word in PURPOSES[purpose]):
            existing = [p for p in folders if Path(p).name in (purpose,dest)]
            if len(existing)>1:
                return "待确认",tags,"存在多个同名用途目录",False
            return (existing or [dest])[0],tags,"文件用途："+purpose,False
    evidence = {}
    for folder in folders:
        leaf=Path(folder).name
        terms=[alias for alias,target in aliases if target==folder]
        if len(leaf)>=2 and leaf not in generic|GENERIC:
            terms.append(leaf)
        for term in terms:
            if matches(term,text):
                evidence[folder]=term
                break
    # 同时命中父目录与具体子项目时选子项目；不同分支的冲突留给人判断。
    leaves=[p for p in evidence if not any(q.startswith(p+"/") for q in evidence)]
    if len(leaves)==1:
        dest=leaves[0]
        return dest,tags,"匹配项目名称或已确认别名："+evidence[dest],True
    if len(leaves)>1:
        return "待确认",tags,"同时涉及多个项目："+ "、".join(leaves[:3]),False
    if default=="财务票据":
        return default,tags,"独立财务凭证",False
    return "待确认",tags,"缺少可唯一确认的项目或用途",False


def semantic_route(text,plan,candidates,previous_reason):
    """模型提出归属；用两侧原文验证证据，弱线索降级成一键建议。"""
    folder=plan["folder"]
    profiles={p["folder"]:p["folder"]+" "+" ".join(p["examples"]) for p in candidates}
    if folder not in profiles or plan.get("decision") not in ("file","suggest"):
        return "待确认",previous_reason,""
    refs=plan.get("anchors")
    if not isinstance(refs,list):
        return "待确认",previous_reason,""
    common={"合同","发票","预算","会议","会议纪要","项目","采购合同","供应商","联系人","合同编号","付款","验收","报销","客户","资料","人员安排"}
    valid=[]
    for ref in refs:
        if not isinstance(ref,str):continue
        ref=ref.strip()
        if not 2<=len(ref)<=64 or ref in common or ref.isdigit():continue
        if matches(ref,text) and ref.casefold() in profiles[folder].casefold() and not any(ref in other or other in ref for other in valid):
            valid.append(ref)
    if not valid:return "待确认",previous_reason,""
    distinct=[v for v in valid if all(v.casefold() not in profile.casefold() for key,profile in profiles.items() if key!=folder)]
    code=any(re.fullmatch(r"(?=.*[A-Za-z])(?=.*\d)[A-Za-z\d-]{5,}",v) for v in distinct)
    why="DeepSeek 对照库内资料："+ "、".join(valid[:4])
    if plan["decision"]=="file" and distinct and (code or len(valid)>=2):
        return folder,why,""
    return "待确认",why+"；需要确认",folder

# 同义的用途落在一个稳定的目录，未知的新主题仍允许模型自行命名。
FAMILIES = {
    "往来沟通": ("联系记录","来电","回电","沟通记录","联系沟通","往来函件","通话记录","往来沟通"),
    "宣传素材": ("海报","宣传图","宣传素材","推广素材"),
    "说明与备忘": ("补充说明","备忘","情况说明","事项说明","说明与备忘"),
    "预算与报价": ("预算","报价"),
    "会议记录": ("会议纪要","会议记录","周会"),
    "合同协议": ("合同","协议"),
}


def purpose_folder(src,body,plan,folders,default,root):
    text=(src.stem+" "+body[:4000]).casefold()
    proposed=plan.get("collection")
    if not isinstance(proposed,str):
        proposed=""
    proposed=proposed.strip()
    safe=bool(re.fullmatch(r"[一-龥A-Za-z][一-龥A-Za-z0-9 _-]{1,19}",proposed)) and not (root/proposed).is_reserved()
    if proposed in {"待确认","待分类","其他","杂项","未知","临时","未分类","其他资料"}:safe=False
    for canonical,words in FAMILIES.items():
        if any(word in src.stem or word in proposed for word in words):
            equivalents=[p for p in folders if "/" not in p and (p==canonical or p in words)]
            return (canonical if canonical in equivalents else next(iter(equivalents),canonical)), "按资料用途："+canonical
    if safe:
        return next((p for p in folders if p.casefold()==proposed.casefold()),proposed),"DeepSeek 按资料用途归档："+proposed
    for canonical,words in FAMILIES.items():
        if any(word in text for word in words):
            return canonical,"按内容归档："+canonical
    if default not in ("待分类","待确认"):
        return default,"按文件内容或格式归档："+default
    ext=src.suffix[1:].upper()
    return (ext+" 文件" if re.fullmatch(r"[A-Z0-9]{1,10}",ext) else "无扩展名文件" if not ext else "数据文件"),"内容线索不足，按文件格式归档"
