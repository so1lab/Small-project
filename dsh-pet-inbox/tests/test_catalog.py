import json
from pathlib import Path
import subprocess
import sys
import tempfile

worker = Path(__file__).resolve().parents[1] / "component" / "worker.py"
with tempfile.TemporaryDirectory() as workspace:
    base = Path(workspace)
    def call(action, **fields):
        proc = subprocess.run([sys.executable, "-X", "utf8", str(worker), str(base/"归档"), str(base/"db")],
            input=json.dumps(dict(action=action, **fields)), capture_output=True, text=True, encoding="utf8", check=True)
        return json.loads(proc.stdout.splitlines()[-1])

    doc = base / "附件.txt"
    doc.write_text("春季发布会周会纪要。讨论舞台预算和人员安排。", encoding="utf8")
    topic = base/"归档"/"春季发布会"
    topic.mkdir(parents=True)
    sample = call("sample",file=str(doc))
    assert topic.name in sample["categories"]
    plan = dict(sig=sample["sig"], category=topic.name, summary="春季发布会舞台预算与人员分工")
    assert "春季发布会" in call("drop", paths=[str(doc)],plans={str(doc):plan})["message"]
    record, = call("catalog")["entries"]
    assert record["category"] == topic.name and record["available"] and Path(record["path"]).exists()
    assert "舞台预算" in record["summary"]
    adjusted = base/"归档"/"活动预算"
    adjusted.mkdir()
    call("adjust",id=record["id"],folder=str(adjusted))
    record, = call("catalog")["entries"]
    assert record["category"] == adjusted.name and Path(record["path"]).parent == adjusted
    call("undo")
    record, = call("catalog")["entries"]
    assert record["path"] == str(doc) and record["available"]
    doc.unlink()
    assert not call("catalog")["entries"][0]["available"]
    print("PASS: 摘要、分类、台账、撤销定位、文件移走后禁用定位")

