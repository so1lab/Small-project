"""用独立资料库验证项目归属、同批建议、人工确认及别名。"""
import json
import subprocess
import sys
import tempfile
from pathlib import Path

worker=Path(__file__).resolve().parents[1]/"component"/"worker.py"
with tempfile.TemporaryDirectory() as tmp:
    base=Path(tmp)
    root=base/"库"
    project=root/"客户项目"/"青禾书展"
    project.mkdir(parents=True)
    def call(action,**data):
        result=subprocess.run([sys.executable,"-X","utf8",str(worker),str(root),str(base/"db")],
                              input=json.dumps(dict(action=action,**data)),encoding="utf8",capture_output=True,check=True)
        return json.loads(result.stdout.splitlines()[-1])
    examples={"附件.txt":"青禾书展会场搭建合同","周会.txt":"青禾书展筹备周会","预算.csv":"青禾书展,灯光租赁,4800",
              "海报定稿.png":"","模板.txt":"活动场地租赁合同模板。各项目复用。","报销.txt":"个人出差报销，与青禾书展无关。"}
    for name,text in examples.items():
        (base/name).write_text(text,encoding="utf8")
    call("drop",paths=[str(base/name) for name in examples])
    rows={r["name"]:r for r in call("catalog")["entries"]}
    assert all(Path(rows[n]["path"]).parent==project for n in list(examples)[:3])
    assert rows["模板.txt"]["category"]=="模板" and rows["报销.txt"]["category"]=="财务票据"
    poster=rows["海报定稿.png"]
    assert poster["category"]=="宣传素材" and not poster["suggestion"]
    call("adjust",id=poster["id"],folder=str(project))
    call("alias",id=poster["id"],term="青禾秋展")
    follow=base/"补充资料.txt"
    follow.write_text("青禾秋展供应商交接",encoding="utf8")
    call("drop",paths=[str(follow)])
    assert (project/follow.name).is_file()
    print("PASS: 六份样本、嵌套项目、否定表述、同批建议、确认与别名复用")
