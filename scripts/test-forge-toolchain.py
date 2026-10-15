#!/usr/bin/env python3
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

SCRIPT = Path(__file__).with_name("update-forge-toolchain.py")
spec = importlib.util.spec_from_file_location("toolchain_updater", SCRIPT)
updater = importlib.util.module_from_spec(spec)
spec.loader.exec_module(updater)


class ToolchainTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.sources = self.root / "repos"
        self.bundle = self.root / "app/toolchain"
        revisions = {}
        for name in ("forge-runtime", "forge-stdlib", "forge"):
            repo = self.sources / name
            repo.mkdir(parents=True)
            self.git(repo, "init", "-q")
            (repo / "CMakeLists.txt").write_text("cmake_minimum_required(VERSION 3.16)\n")
            (repo / "committed.txt").write_text(name)
            if name == "forge-stdlib":
                (repo / "cmake").mkdir()
                (repo / "cmake/dependencies.cmake").write_text(
                    f'set(FORGE_RUNTIME_REVISION "{revisions["forge-runtime"]}")\n')
            if name == "forge":
                (repo / "cmake").mkdir()
                (repo / "cmake/Dependencies.cmake").write_text(
                    f'set(FORGE_RUNTIME_REVISION "{revisions["forge-runtime"]}")\n'
                    f'set(FORGE_STDLIB_REVISION "{revisions["forge-stdlib"]}")\n')
            self.git(repo, "add", ".")
            self.git(repo, "-c", "user.name=Test", "-c", "user.email=test@example.invalid",
                     "commit", "-qm", "Fixture")
            revisions[name] = self.git(repo, "rev-parse", "HEAD").strip()
        self.revision = revisions["forge"]

    def git(self, root, *args):
        return subprocess.check_output(["git", "-C", str(root), *args], text=True,
                                       env={**os.environ, "GIT_MASTER": "1"})

    def run_update(self, revision=None, check=False):
        command = [sys.executable, str(SCRIPT), "--toolchain", str(self.bundle)]
        command += ["--check"] if check else ["--revision", revision or self.revision,
                                             "--source-root", str(self.sources)]
        return subprocess.run(command, capture_output=True, text=True)

    def test_committed_sources_and_repeatable_lock(self):
        (self.sources / "forge/committed.txt").write_text("uncommitted modification")
        self.assertEqual(self.run_update().returncode, 0)
        self.assertEqual((self.bundle / "sources/forge/committed.txt").read_text(), "forge")
        first = (self.bundle / "lock.json").read_bytes()
        self.assertEqual(self.run_update().returncode, 0)
        self.assertEqual((self.bundle / "lock.json").read_bytes(), first)
        self.assertEqual(self.run_update(check=True).returncode, 0)

    def test_source_tamper_and_extra_file_fail_closed(self):
        self.assertEqual(self.run_update().returncode, 0)
        source = self.bundle / "sources/forge/committed.txt"
        source.write_text("tampered")
        self.assertNotEqual(self.run_update(check=True).returncode, 0)
        self.assertEqual(self.run_update().returncode, 0)
        (self.bundle / "sources/forge/extra.c").write_text("extra")
        self.assertNotEqual(self.run_update(check=True).returncode, 0)

    def test_missing_dependency_preserves_previous_bundle_and_lock(self):
        self.assertEqual(self.run_update().returncode, 0)
        previous = updater.tree_hash(self.bundle)
        repo = self.sources / "forge"
        path = repo / "cmake/Dependencies.cmake"
        path.write_text(path.read_text().replace(
            json.loads((self.bundle / "lock.json").read_text())["components"]["forge-runtime"]["revision"],
            "f" * 40))
        self.git(repo, "add", ".")
        self.git(repo, "-c", "user.name=Test", "-c", "user.email=test@example.invalid",
                 "commit", "-qm", "Unavailable runtime")
        self.assertNotEqual(self.run_update(self.git(repo, "rev-parse", "HEAD").strip()).returncode, 0)
        self.assertEqual(updater.tree_hash(self.bundle), previous)
        self.assertEqual(self.run_update(check=True).returncode, 0)

    def test_upstream_symlink_is_rejected_without_replacing_bundle(self):
        self.assertEqual(self.run_update().returncode, 0)
        previous = updater.tree_hash(self.bundle)
        repo = self.sources / "forge"
        (repo / "escape").symlink_to("/etc/passwd")
        self.git(repo, "add", "escape")
        self.git(repo, "-c", "user.name=Test", "-c", "user.email=test@example.invalid",
                 "commit", "-qm", "Unsafe archive member")
        revision = self.git(repo, "rev-parse", "HEAD").strip()
        self.assertNotEqual(self.run_update(revision).returncode, 0)
        self.assertEqual(updater.tree_hash(self.bundle), previous)

    def test_another_writer_cannot_replace_the_bundle(self):
        self.assertEqual(self.run_update().returncode, 0)
        previous = updater.tree_hash(self.bundle)
        lock = self.bundle.parent / ".forge-toolchain-update.lock"
        lock.mkdir()
        try:
            self.assertNotEqual(self.run_update().returncode, 0)
            self.assertEqual(updater.tree_hash(self.bundle), previous)
        finally:
            lock.rmdir()

    def test_windows_path_separators_are_rejected(self):
        self.assertEqual(self.run_update().returncode, 0)
        previous = updater.tree_hash(self.bundle)
        repo = self.sources / "forge"
        (repo / "nested\\..\\escape").write_text("unsafe path")
        self.git(repo, "add", ".")
        self.git(repo, "-c", "user.name=Test", "-c", "user.email=test@example.invalid",
                 "commit", "-qm", "Unsafe Windows path")
        revision = self.git(repo, "rev-parse", "HEAD").strip()
        self.assertNotEqual(self.run_update(revision).returncode, 0)
        self.assertEqual(updater.tree_hash(self.bundle), previous)

    def test_file_content_cannot_impersonate_another_tree_entry(self):
        single = self.root / "single"
        multiple = self.root / "multiple"
        single.mkdir()
        multiple.mkdir()
        (single / "x").write_bytes(b"\0y\0\0payload")
        (multiple / "x").write_bytes(b"")
        (multiple / "y").write_bytes(b"payload")
        self.assertNotEqual(updater.tree_hash(single), updater.tree_hash(multiple))


if __name__ == "__main__":
    unittest.main(verbosity=2)
