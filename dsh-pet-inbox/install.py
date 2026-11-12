"""Install, upgrade, or remove the unpacked dsh-pet Windows helper extension."""
import argparse
import json
import os
import shutil
import sys
import tempfile
from pathlib import Path

SOURCE = Path(__file__).resolve().parent / "component"
HOOK = "  linuxPointer?.start();\n  petWindows.create();"
OLD = HOOK + "\n  // dsh-pet-inbox v1\n  require('./dsh-pet-inbox/main.cjs')();"
NEW = HOOK + "\n  // dsh-pet-inbox v2\n  require('./dsh-pet-inbox-v2/main.cjs')(petWindows.state.windows);"
INPUT = "    if (!S.dragHasFiles(e)) return;"
PAUSE = INPUT + "\n    if (!e.shiftKey) { this.stopMove(); this.stopThrow(); } // dsh-pet-inbox v2"
START = "\n// BEGIN dsh-pet-inbox-v2\n"
END = "// END dsh-pet-inbox-v2\n"


def atomic_write(path, data):
    with tempfile.NamedTemporaryFile(dir=path.parent, delete=False) as f:
        f.write(data)
    try:
        os.replace(f.name, path)
    finally:
        Path(f.name).unlink(missing_ok=True)


def install(opts):
    base = next((p for p in (opts.location, opts.location/"runtime/electron-helper",
                opts.location/"dsh-pet/runtime/electron-helper") if (p/"sprite/input.js").is_file()), None)
    if base is None:
        raise ValueError("未找到完整的 electron-helper。")
    main, preload, controls = [base/p for p in ("main.js","preload.js","sprite/input.js")]
    dest = base/"dsh-pet-inbox-v2"
    changes = {}
    original = {}
    for p in [main, preload, controls]:
        original[p] = p.read_bytes()
        changes[p] = original[p].decode("utf-8").replace("\r\n","\n")
    code = changes[main]
    if opts.uninstall:
        if NEW not in code or PAUSE not in changes[controls] or changes[preload].count(START)!=1:
            raise ValueError("组件入口不完整。")
        head, tail = changes[preload].split(START)
        if END not in tail:
            raise ValueError("preload 标记缺失。")
        changes[preload] = head + tail.split(END,1)[1]
        changes[main] = code.replace(NEW,HOOK)
        changes[controls] = changes[controls].replace(PAUSE,INPUT)
    else:
        if NEW in code:
            for item in SOURCE.iterdir():
                if item.is_file():
                    atomic_write(dest/item.name,item.read_bytes())
            print("0.3.1 已更新，请重启桌宠。")
            return
        if dest.exists() or START in changes[preload] or changes[controls].count(INPUT)!=1 or code.count(HOOK)!=1:
            raise ValueError("上游版本或组件目录不匹配。")
        changes[main] = code.replace(OLD if OLD in code else HOOK,NEW)
        changes[controls] = changes[controls].replace(INPUT,PAUSE)
        changes[preload] += START + (SOURCE/"pet-hook.js").read_text("utf-8-sig").rstrip() + "\n" + END
        with tempfile.TemporaryDirectory(dir=base) as tmp:
            stage = Path(tmp)/"component"
            shutil.copytree(SOURCE,stage)
            (stage/"runtime.json").write_text(json.dumps({"python":sys.executable}),encoding="utf8")
            stage.rename(dest)
    completed = []
    try:
        for p in [preload,controls,main]:
            updated = changes[p]
            if b"\r\n" in original[p]:
                updated = updated.replace("\n","\r\n")
            atomic_write(p,updated.encode())
            completed.append(p)
    except Exception:
        for p in reversed(completed):
            atomic_write(p,original[p])
        if not opts.uninstall:
            shutil.rmtree(dest)
        raise
    if opts.uninstall and dest.is_dir():
        for name in [p.name for p in SOURCE.iterdir()] + ["runtime.json"]:
            (dest/name).unlink(missing_ok=True)
        if not any(dest.iterdir()):
            dest.rmdir()
    print("已卸载。" if opts.uninstall else "已安装，请重启桌面宠物。")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("location",type=Path)
    parser.add_argument("--uninstall",action="store_true")
    try:
        install(parser.parse_args())
    except (ValueError,OSError) as e:
        parser.exit(1,str(e)+"\n")

