import os
import runpy
import sys
import tempfile
from pathlib import Path

workspace = Path(r"D:\DU-AN-PHAN-MEM\PHUBAI-MES\phubai-mes")
tmp = workspace / "tmp-render"
tmp.mkdir(exist_ok=True)

for key in [
    "TMP",
    "TEMP",
    "TMPDIR",
    "HOME",
    "USERPROFILE",
    "XDG_CONFIG_HOME",
    "XDG_CACHE_HOME",
    "XDG_DATA_HOME",
]:
    os.environ[key] = str(tmp / key.lower())
    Path(os.environ[key]).mkdir(exist_ok=True)

tempfile.tempdir = str(tmp)

sys.argv = [
    "render_docx.py",
    str(workspace / "PHUBAI-MES-Quy-trinh-xay-dung-va-deploy.docx"),
    "--output_dir",
    str(workspace / "docx_render_check"),
    "--emit_pdf",
]

runpy.run_path(
    r"C:\Users\nguye\.codex\plugins\cache\openai-primary-runtime\documents\26.623.12021\skills\documents\render_docx.py",
    run_name="__main__",
)
