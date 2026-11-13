"""检索同库案例。只把相关目录和少量已收纳资料片段提供给模型。"""
import re
from pathlib import Path
from collections import Counter


def terms(text):
    words=re.findall(r'[a-z0-9][a-z0-9-]+|[一-龥]+',text.casefold())
    return {t for word in words for t in ([word] if word.isascii() else [word[i:i+2] for i in range(len(word)-1)])}


def shortlist(db,root,folders,text):
    query=terms(text)
    profiles={folder:[] for folder in folders if Path(folder).name not in ('待确认','待分类')}
    for dst,summary,body in db.execute("""select i.dst,c.summary,c.search_text from items i join catalog c on c.item=i.rowid
                where i.status='已收纳' order by i.rowid desc"""):
        try:
            p=Path(dst)
            folder=p.parent.relative_to(root).as_posix()
        except ValueError:
            continue
        if folder not in profiles or not p.is_file():continue
        sample=(p.name+" "+(summary or "")+" "+(body or "")[:480])[:620]
        overlap=len(query & terms(sample))
        examples=profiles[folder]
        examples.append((overlap,sample))
        examples.sort(key=lambda entry:-entry[0])
        del examples[2:]
    scored=[]
    counts=Counter(term for folder,examples in profiles.items() for term in (terms(folder+" "+" ".join(s for _,s in examples)) & query))
    for folder,examples in profiles.items():
        words=terms(folder+" "+" ".join(s for _,s in examples)) & query
        score=sum(1/counts[w] for w in words)
        scored.append((score,folder,examples))
    # 限制历史正文预算；目录名和明确关联过的材料提供可核对的判断依据。
    return [dict(folder=f,examples=[s[:360] for _,s in ex]) for _,f,ex in sorted(scored,key=lambda row:-row[0])[:8]]
