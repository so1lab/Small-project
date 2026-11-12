# dsh-pet 收纳与搬运 0.3.1

基于 [PC2005-cloud/dsh-pet](https://github.com/PC2005-cloud/dsh-pet)，组件采用 MIT 许可证。桌宠是唯一的常驻投放入口。

把文件拖到宠物身上，选择自动分类、送到指定目录或送进回收站。在同一菜单的「收纳选项」中可以打开收纳目录、更改位置、查看记录、撤销及切换精简动画。指定目录搬运成功后播放推文件动画。按 Esc 可取消尚未执行的投放。

需要 Windows、Python 3.10+ 和已解包的 dsh-pet 桌面 helper。退出桌宠，在本包目录运行：

    python install.py "你的 dsh-pet 插件目录"

完成后重启桌宠。卸载使用同一命令并追加 --uninstall。

## 开发者入口

文件拖到宠物后，`component/pet-hook.js` 从系统投放事件取得路径。`courier.cjs` 显示动作菜单，`main.cjs` 将归档、搬运和撤销放入串行队列。`worker.py` 在本地完成分类与文件移动，并把每项结果记入 SQLite。普通移动成功后，`push.cjs` 使用宿主已安装的透明视频，在目标资源管理器窗口方向播放搬运动画。

此版本以 Windows 上的 dsh-pet 0.4.7 和 Python 3.10+ 为目标。PDF 正文识别可选装 `pypdf`。发布内容仅包括 MIT 许可的组件代码；桌宠形象和动画由用户已有的上游安装提供。

在组件根目录执行 `python tests/test_worker.py`。测试仅使用临时目录，覆盖批量归类、重名、未知格式、目录跳过与撤销冲突。
