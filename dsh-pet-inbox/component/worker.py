import argparse
import contextlib
import json
import os
import re
import shutil
import sqlite3
import sys
import tempfile
import uuid
from pathlib import Path
from zipfile import ZipFile
from xml.etree import ElementTree

CATEGORIES = [
    ("财务票据", ("发票", "价税合计", "invoice", "收据", "报销")),
    ("合同协议", ("合同", "协议", "甲方", "agreement", "contract")),
    ("会议记录", ("会议纪要", "参会人", "周会", "会议记录", "meeting minutes")),
]
TYPES = {"图片素材": "png jpg jpeg gif webp svg bmp heic", "影音": "mp3 mp4 mov wav mkv flac",
         "压缩包": "zip rar 7z gz tar", "表格": "xlsx xls csv", "演示文稿": "ppt pptx"}


def classify(path):
    ext = path.suffix.lower()
    body = ""
    try:
        if ext in (".txt", ".md", ".csv"):
            with path.open("rb") as f:
                raw = f.read(32768)
            try:
                body = raw.decode("utf-8-sig")
            except UnicodeError:
                body = raw.decode("gb18030", errors="replace")
        elif ext == ".docx":
            with ZipFile(path) as archive:
                item = archive.getinfo("word/document.xml")
                if item.file_size <= 2_000_000:
                    root = ElementTree.fromstring(archive.read(item))
                    body = " ".join(n.text or "" for n in root.iter() if n.tag.endswith("}t"))
        elif ext == ".pdf" and path.stat().st_size < 12_000_000:
            from pypdf import PdfReader
            reader = PdfReader(path)
            body = " ".join((p.extract_text() or "")[:5000] for p in reader.pages[:2])
    except Exception:
        pass
    sample = (path.stem + " " + body[:32000]).casefold()
    hits = [(cat, word) for cat, words in CATEGORIES for word in words if word in sample]
    if len({cat for cat, _ in hits}) == 1:
        return hits[0]
    if not hits:
        for cat, extensions in TYPES.items():
            if ext.lstrip(".") in extensions.split():
                return cat, ext
    return "待分类", "线索不足或有歧义"


# 保存文件身份、大小与修改时间；撤销前用它识别被替换或编辑过的文件。
def identity(path):
    s = path.stat()
    return json.dumps([s.st_dev, s.st_ino, s.st_size, s.st_mtime_ns])


def install_file(source, target):
    # Windows rename fails if destination exists. Never use replace().
    if os.name == "nt":
        os.rename(source, target)
    else:
        os.link(source, target)
        source.unlink()


def move(source, dest, expected):
    if identity(source) != expected:
        raise ValueError("文件已发生变化")
    if source.stat().st_dev == dest.parent.stat().st_dev:
        install_file(source, dest)
        return
    with tempfile.NamedTemporaryFile(dir=dest.parent, prefix=".inbox-", delete=False) as f:
        temp = Path(f.name)
    try:
        shutil.copy2(source, temp)
        if identity(source) != expected or temp.stat().st_size != source.stat().st_size:
            raise ValueError("复制期间文件发生变化")
        install_file(temp, dest)
        source.unlink()
    finally:
        temp.unlink(missing_ok=True)


def run(req, db, root):
    action = req["action"]
    if action == "history":
        rows = db.execute("select src,dst,status,reason from items order by rowid desc limit 80")
        return {"rows": list(rows)}
    if action == "undo":
        batch = db.execute("select batch from items where status='已收纳' order by rowid desc limit 1").fetchone()
        if req.get("batch"):
            batch = (req["batch"],)
        count = conflicts = 0
        for row, src, dst, sig in list(db.execute("select rowid,src,dst,sig from items where batch=? and status='已收纳'", batch or ("",))):
            try:
                if Path(src).exists() or not Path(src).parent.is_dir():
                    raise ValueError("原位置已占用或目录已移走")
                db.execute("update items set status='撤销中' where rowid=?", (row,))
                db.commit()
                move(Path(dst), Path(src), sig)
                status, reason = "已撤销", ""
                count += 1
            except (ValueError, OSError) as e:
                status, reason = "需核对", str(e)
                conflicts += 1
            db.execute("update items set status=?,reason=? where rowid=?", (status, reason, row))
            db.commit()
        return {"message": f"已撤销 {count} 个，需核对 {conflicts} 个"}
    if action not in ("drop", "deliver"):
        raise ValueError("未知操作")
    batch = uuid.uuid4().hex
    counts = [0, 0, 0]
    paths = list(dict.fromkeys(req["paths"]))
    for index, raw in enumerate(paths, 1):
        src = Path(raw)
        dest = None
        row = None
        try:
            if not src.is_absolute() or src.is_symlink() or not src.is_file() or (action == "drop" and src.resolve().is_relative_to(root)):
                raise ValueError("仅接收收纳箱之外的普通文件")
            sig = identity(src)
            if action == "deliver":
                folder = Path(req["folder"])
                cat, reason = "", "指定目录搬运"
                if not folder.is_absolute() or not folder.is_dir():
                    raise ValueError("目标目录不可用")
                if folder.samefile(src.parent):
                    raise ValueError("文件已在目标目录")
            else:
                cat, reason = classify(src)
                folder = root / cat
                folder.mkdir(exist_ok=True)
                if folder.resolve().parent != root:
                    raise ValueError("分类目录位置已改变")
            dest = folder / src.name
            n = 2
            while dest.exists():
                dest = folder / f"{src.stem} ({n}){src.suffix}"
                n += 1
            row = db.execute("insert into items values(?,?,?,?,?,?)", (batch,str(src),str(dest),"移动中",reason,sig)).lastrowid
            db.commit()
            move(src, dest, sig)
            db.execute("update items set status='已收纳',sig=? where rowid=?", (identity(dest),row))
            counts[int(cat == "待分类")] += 1
        except (ValueError, OSError) as e:
            if row is None:
                db.execute("insert into items values(?,?,?,?,?,?)", (batch,str(src),"","已跳过",str(e),""))
            else:
                db.execute("update items set status='需核对',reason=? where rowid=?", (str(e),row))
            counts[2] += 1
        db.commit()
        print(json.dumps({"progress": f"正在收纳 {index}/{len(paths)}"}), flush=True)
    if action == "deliver":
        return {"success": counts[0], "batch": batch, "message": f"已送达 {counts[0]} 项 · 跳过或需核对 {counts[2]} 项"}
    return {"message": f"已归类 {counts[0]} · 待分类 {counts[1]} · 跳过或需核对 {counts[2]}"}


if __name__ == "__main__":
    root = Path(sys.argv[1]).resolve()
    root.mkdir(parents=True, exist_ok=True)
    with contextlib.closing(sqlite3.connect(sys.argv[2])) as db:
        db.execute("create table if not exists items(batch,src,dst,status,reason,sig)")
        db.execute("update items set status='需核对',reason='上次中断，请核对原位置与目标位置' where status in ('移动中','撤销中')")
        db.commit()
        print(json.dumps(run(json.load(sys.stdin), db, root)), flush=True)
