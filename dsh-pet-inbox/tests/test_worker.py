import tempfile, subprocess, json, sys
from pathlib import Path
worker=Path(__file__).resolve().parents[1] / "component" / "worker.py"
with tempfile.TemporaryDirectory() as t:
    base=Path(t)
    def call(**req):
        r=subprocess.run([sys.executable,"-X","utf8",str(worker),str(base/"box"),str(base/"log")], input=json.dumps(req),capture_output=True,text=True,encoding="utf8",check=True)
        return json.loads(r.stdout.splitlines()[-1])
    files=[]
    for i in range(2):
        d=base/str(i)
        d.mkdir()
        f=d/"sample.txt"
        f.write_text("invoice",encoding="utf8")
        files.append(f)
    f=base/"unknown.bin"
    f.touch()
    files.append(f)
    call(action="drop",paths=[str(p) for p in files+[base]])
    rows=call(action="history")["rows"]
    assert len(rows)==4 and sum(r[2]=="已收纳" for r in rows)==3
    assert (base/"box/财务票据/sample (2).txt").exists() and (base/"box/BIN 文件/unknown.bin").exists()
    files[0].write_text("existing")
    call(action="undo")
    assert files[0].read_text()=="existing" and files[1].read_text()=="invoice" and files[2].exists()
    print("PASS: batch, content, duplicate names, fallback, directory skip, undo conflict")



