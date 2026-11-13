"""本地提取式摘要：用原文标题和关键句描述文件，未读取到正文时明确说明。"""
import re
from zipfile import ZipFile
from xml.etree import ElementTree


def sample_text(path):
    ext = path.suffix.lower()
    if ext in (".txt", ".md", ".csv", ".tsv", ".log", ".json", ".py", ".js"):
        with path.open("rb") as f:
            raw = f.read(32768)
        try:
            return raw.decode("utf-8-sig")
        except UnicodeError:
            return raw.decode("gb18030", errors="replace")
    if ext == ".pdf" and path.stat().st_size < 12_000_000:
        try:
            from pypdf import PdfReader
        except ImportError:
            import fitz
            with fitz.open(path) as pdf:
                return "\n".join(pdf[i].get_text()[:6000] for i in range(min(2,len(pdf))))
        return "\n".join((p.extract_text() or "")[:6000] for p in PdfReader(path).pages[:2])
    if ext in (".docx", ".xlsx", ".pptx"):
        with ZipFile(path) as archive:
            names = {"docx":["word/document.xml"], "xlsx":["xl/workbook.xml","xl/sharedStrings.xml","xl/worksheets/sheet1.xml"],
                     "pptx":[f"ppt/slides/slide{i}.xml" for i in range(1,4)]}[ext[1:]]
            parts = []
            for name in names:
                if name not in archive.namelist() or archive.getinfo(name).file_size > 2_000_000:
                    continue
                for node in ElementTree.fromstring(archive.read(name)).iter():
                    tag = node.tag.split("}")[-1]
                    if tag == "sheet":
                        parts.append(node.get("name",""))
                    if tag == "t" and node.text:
                        parts.append(node.text)
            return " ".join(parts)[:32768]
    return ""


def describe(path, category, body):
    kind = (path.suffix[1:].upper() or "未知格式") + "文件"
    if not body.strip():
        return f"{kind}，归入「{category}」。仅依据名称和格式识别，未提取到正文。"
    lines = [s.strip() for s in re.split(r"[。！？\n]+", body) if s.strip()]
    excerpt = "；".join(dict.fromkeys(lines[:3]))
    return f"{kind}，归入「{category}」。内容摘录：{excerpt[:180]}"


def records(db):
    # 台账使用操作日志的 rowid，撤销后改查原位置。相同路径多次投放只显示最新记录。
    import json
    from pathlib import Path
    rows = db.execute("""select i.rowid,i.src,i.dst,i.status,i.sig,c.category,c.summary,c.added,c.search_text,f.tags,f.why,f.suggestion,p.proposed
                         from items i left join catalog c on c.item=i.rowid left join filing f on f.item=i.rowid left join proposals p on p.item=i.rowid
                         where i.status in ('已收纳','已撤销','需核对') order by i.rowid desc""")
    seen = set()
    result = []
    for rid,src,dst,status,sig,cat,summary,added,search_text,tags,why,suggestion,proposed in rows:
        path = Path(src if status == "已撤销" else dst)
        if path in seen:
            continue
        seen.add(path)
        try:
            stat = path.stat()
            present = status != "需核对" and [stat.st_dev,stat.st_ino] == json.loads(sig)[:2]
        except (OSError,ValueError,TypeError):
            present = False
        result.append(dict(id=rid,name=path.name,category=cat or "历史文件",summary=summary or "旧版本记录，未生成摘要。",
                           tags=json.loads(tags or "[]"),why=why or "",proposed=proposed or "",suggestion=suggestion or "",search_text=search_text or "",path=str(path),added=added or "",status=status if present else "位置待核对",available=present))
    return result
