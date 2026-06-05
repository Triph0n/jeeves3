import json
import os
import signal
import subprocess
import sys
import time
from urllib.request import urlopen
from pathlib import Path

from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from baxter.api import app


client = TestClient(app)
ROOT = Path(__file__).resolve().parent.parent


def main() -> None:
    if "--start-server" in sys.argv:
        start_server()
        return
    if "--restart-server" in sys.argv:
        stop_server()
        time.sleep(1)
        start_server()
        return
    if "--probe-server" in sys.argv:
        probe_server()
        return
    if "--inspect-signature" in sys.argv:
        inspect_signature()
        return
    if "--fix-signature-alpha" in sys.argv:
        fix_signature_alpha()
        return
    if "--git-status" in sys.argv:
        git_status()
        return
    if "--git-init" in sys.argv:
        git_init()
        return
    if "--git-commit" in sys.argv:
        message = " ".join(sys.argv[sys.argv.index("--git-commit") + 1:]).strip()
        git_commit(message or "Implement Baxter local agent")
        return
    if "--git-push" in sys.argv:
        git_push()
        return
    if "--gh-version" in sys.argv:
        print_completed(run_command("gh", "--version"))
        return
    if "--gh-auth-status" in sys.argv:
        print_completed(run_command("gh", "auth", "status"))
        return
    if "--gh-create-repo" in sys.argv:
        repo_name = sys.argv[sys.argv.index("--gh-create-repo") + 1]
        create_repo(repo_name)
        return
    if "--gh-view-repo" in sys.argv:
        repo_name = sys.argv[sys.argv.index("--gh-view-repo") + 1]
        print_completed(run_command("gh", "repo", "view", repo_name, "--json", "nameWithOwner,url,visibility,defaultBranchRef"))
        return

    health = client.get("/api/health")
    assert health.status_code == 200, health.text
    assert health.json()["status"] == "ok", health.text

    status = client.get("/api/status")
    assert status.status_code == 200, status.text
    payload = status.json()
    assert "folders" in payload, status.text
    assert "signature" in payload, status.text

    dashboard = client.get("/")
    assert dashboard.status_code == 200, dashboard.text[:500]
    assert "Baxter" in dashboard.text, dashboard.text[:500]

    print("Baxter smoke test OK")
    print(status.json())
    config_dir = Path(r"C:\Users\Vladimir\Desktop\Baxter\Config")
    if config_dir.exists():
        print("Config files:", [path.name for path in config_dir.iterdir()])


def start_server() -> None:
    log_dir = ROOT / "logs"
    log_dir.mkdir(exist_ok=True)
    log_file = log_dir / "baxter_server.log"
    command = [
        sys.executable,
        "-m",
        "uvicorn",
        "app:app",
        "--host",
        "127.0.0.1",
        "--port",
        "8765",
    ]
    with log_file.open("ab") as handle:
        process = subprocess.Popen(
            command,
            cwd=ROOT,
            stdout=handle,
            stderr=subprocess.STDOUT,
            creationflags=getattr(subprocess, "DETACHED_PROCESS", 0),
        )
    print(f"Baxter server started with PID {process.pid}")
    print("URL: http://127.0.0.1:8765")
    print(f"Log: {log_file}")


def stop_server() -> None:
    completed = subprocess.run(
        ["netstat", "-ano"],
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
    )
    pids = set()
    for line in completed.stdout.splitlines():
        if "127.0.0.1:8765" in line and "LISTENING" in line:
            parts = line.split()
            if parts and parts[-1].isdigit():
                pids.add(int(parts[-1]))
    for pid in pids:
        try:
            os.kill(pid, signal.SIGTERM)
            print(f"Stopped Baxter server PID {pid}")
        except OSError as exc:
            print(f"Could not stop PID {pid}: {exc}")
    if not pids:
        print("No Baxter server found on port 8765")


def probe_server() -> None:
    with urlopen("http://127.0.0.1:8765/api/status", timeout=10) as response:
        data = json.loads(response.read().decode("utf-8"))
    print("Baxter live server OK")
    print(data)


def signature_file() -> Path:
    config_dir = Path(r"C:\Users\Vladimir\Desktop\Baxter\Config")
    preferred = config_dir / "signature.png"
    if preferred.exists():
        return preferred
    candidates = sorted(config_dir.glob("*.png"), key=lambda path: path.name.casefold())
    if not candidates:
        raise FileNotFoundError("No PNG signature file found")
    return candidates[0]


def inspect_signature() -> None:
    from PIL import Image

    path = signature_file()
    with Image.open(path) as image:
        converted = image.convert("RGBA")
        alpha = converted.getchannel("A")
        total = image.width * image.height
        transparent = sum(1 for value in alpha.getdata() if value == 0)
        partial = sum(1 for value in alpha.getdata() if 0 < value < 255)
        opaque = total - transparent - partial
        print({
            "path": str(path),
            "mode": image.mode,
            "size": image.size,
            "transparent_pixels": transparent,
            "partial_alpha_pixels": partial,
            "opaque_pixels": opaque,
            "transparent_percent": round(transparent / total * 100, 2),
        })


def fix_signature_alpha() -> None:
    from PIL import Image

    path = signature_file()
    backup = path.with_name(f"{path.stem}_original{path.suffix}")
    if not backup.exists():
        backup.write_bytes(path.read_bytes())

    with Image.open(path) as image:
        rgba = image.convert("RGBA")
        pixels = []
        for red, green, blue, alpha in rgba.getdata():
            # Treat near-white paper/background as transparent, keep dark ink opaque.
            brightness = (red + green + blue) / 3
            if red > 238 and green > 238 and blue > 238:
                pixels.append((red, green, blue, 0))
            elif brightness > 225:
                new_alpha = max(0, min(alpha, int((255 - brightness) * 4)))
                pixels.append((red, green, blue, new_alpha))
            else:
                pixels.append((red, green, blue, alpha))
        rgba.putdata(pixels)
        rgba.save(path)

    print(f"Updated transparency: {path}")
    print(f"Backup: {backup}")


def run_git(*args: str) -> subprocess.CompletedProcess[str]:
    return run_command("git", *args)


def run_command(*args: str) -> subprocess.CompletedProcess[str]:
    completed = subprocess.run(
        list(args),
        cwd=ROOT,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
    )
    return completed


def print_completed(completed: subprocess.CompletedProcess[str]) -> None:
    if completed.stdout:
        print(completed.stdout.encode("ascii", errors="replace").decode("ascii"))
    if completed.stderr:
        print(completed.stderr.encode("ascii", errors="replace").decode("ascii"))
    if completed.returncode != 0:
        raise SystemExit(completed.returncode)


def git_status() -> None:
    for args in (
        ("branch", "--show-current"),
        ("remote", "-v"),
        ("status", "--short"),
    ):
        print(f"$ git {' '.join(args)}")
        print_completed(run_git(*args))


def git_init() -> None:
    if not (ROOT / ".git").exists():
        print_completed(run_git("init"))
    print_completed(run_git("branch", "-M", "main"))


def git_commit(message: str) -> None:
    print_completed(run_git("add", "."))
    status = run_git("status", "--short")
    print(status.stdout)
    if not status.stdout.strip():
        print("No changes to commit")
        return
    print_completed(run_git("commit", "-m", message))


def git_push() -> None:
    branch = run_git("branch", "--show-current")
    print_completed(branch)
    current = branch.stdout.strip()
    upstream = run_git("rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}")
    if upstream.returncode == 0:
        print_completed(run_git("push"))
    else:
        print_completed(run_git("push", "-u", "origin", current))


def create_repo(repo_name: str) -> None:
    completed = run_command(
        "gh",
        "repo",
        "create",
        repo_name,
        "--private",
        "--source",
        str(ROOT),
        "--remote",
        "origin",
    )
    print_completed(completed)


if __name__ == "__main__":
    main()
