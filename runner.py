#!/usr/bin/env python3
import os
import platform
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent


def run(cmd, check=True):
  print(f"> {' '.join(cmd)}")
  return subprocess.run(cmd, check=check)


def confirm(question):
  answer = input(f"{question} [y/N]: ").strip().lower()
  return answer in {"y", "yes", "да", "д"}


def detect_os():
  name = platform.system().lower()
  if "linux" in name:
    return "linux"
  if "darwin" in name:
    return "macos"
  if "windows" in name:
    return "windows"
  return "unknown"


def choose_os():
  print("Выберите ОС для установки зависимостей:")
  print("1) Автоопределение")
  print("2) Linux")
  print("3) macOS")
  print("4) Windows")
  choice = input("> ").strip()
  if choice == "2":
    return "linux"
  if choice == "3":
    return "macos"
  if choice == "4":
    return "windows"
  return detect_os()


def ensure_node_linux():
  if shutil.which("node") and shutil.which("npm"):
    return True

  package_managers = [
    ("apt-get", ["sudo", "apt-get", "update"], ["sudo", "apt-get", "install", "-y", "nodejs", "npm"]),
    ("dnf", ["sudo", "dnf", "install", "-y", "nodejs", "npm"], None),
    ("pacman", ["sudo", "pacman", "-Sy", "--noconfirm", "nodejs", "npm"], None),
    ("zypper", ["sudo", "zypper", "install", "-y", "nodejs", "npm"], None),
    ("apk", ["sudo", "apk", "add", "nodejs", "npm"], None),
  ]

  for manager, install_cmd, second_cmd in package_managers:
    if shutil.which(manager):
      print(f"Найден пакетный менеджер: {manager}")
      if not confirm("Установить Node.js и npm?"):
        return False
      run(install_cmd)
      if second_cmd:
        run(second_cmd)
      return shutil.which("node") and shutil.which("npm")

  print("Не найден пакетный менеджер для автоустановки Node.js.")
  print("Установите Node.js и npm вручную, затем перезапустите runner.")
  return False


def ensure_node_macos():
  if shutil.which("node") and shutil.which("npm"):
    return True
  if not shutil.which("brew"):
    print("Homebrew не найден. Установите Homebrew и повторите запуск.")
    return False
  if not confirm("Установить Node.js через Homebrew?"):
    return False
  run(["brew", "install", "node"])
  return shutil.which("node") and shutil.which("npm")


def ensure_node_windows():
  if shutil.which("node") and shutil.which("npm"):
    return True
  if shutil.which("winget"):
    if not confirm("Установить Node.js (LTS) через winget?"):
      return False
    run(["winget", "install", "-e", "--id", "OpenJS.NodeJS.LTS"])
    return shutil.which("node") and shutil.which("npm")
  if shutil.which("choco"):
    if not confirm("Установить Node.js (LTS) через Chocolatey?"):
      return False
    run(["choco", "install", "-y", "nodejs-lts"])
    return shutil.which("node") and shutil.which("npm")

  print("Не найден winget/choco. Установите Node.js вручную и повторите запуск.")
  return False


def install_npm_dependencies():
  package_json = ROOT / "package.json"
  if not package_json.exists():
    print("package.json не найден. Убедитесь, что runner запущен в папке Ghosty.")
    return False
  run(["npm", "install"], check=True)
  return True


def main():
  os_choice = choose_os()
  print(f"Выбрана ОС: {os_choice}")

  ok = False
  if os_choice == "linux":
    ok = ensure_node_linux()
  elif os_choice == "macos":
    ok = ensure_node_macos()
  elif os_choice == "windows":
    ok = ensure_node_windows()
  else:
    print("Не удалось определить ОС. Выберите вручную и повторите запуск.")
    sys.exit(1)

  if not ok:
    print("Node.js/npm не установлены. Остановлено.")
    sys.exit(1)

  os.chdir(ROOT)
  if install_npm_dependencies():
    print("Готово! Теперь можно запускать: npm run start")


if __name__ == "__main__":
  main()
