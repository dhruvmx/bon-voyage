import os
import tempfile
import unittest
from pathlib import Path
from launch_support import frontend_is_stale, dependencies_changed, remember_dependencies

class LauncherTests(unittest.TestCase):
    def test_nested_asset_edits_and_deletions_invalidate_build(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory)
            asset=root/'src'/'assets'/'logo.svg'; asset.parent.mkdir(parents=True)
            index=root/'dist'/'index.html'; index.parent.mkdir(); index.write_text('built')
            asset.write_text('old'); os.utime(asset,ns=(1,1)); os.utime(asset.parent,ns=(1,1))
            os.utime(root/'src',ns=(1,1)); os.utime(index,ns=(100,100))
            self.assertFalse(frontend_is_stale(root))
            asset.write_text('new'); self.assertTrue(frontend_is_stale(root))
            os.utime(asset,ns=(1,1)); os.utime(index,ns=(100,100)); asset.unlink()
            self.assertTrue(frontend_is_stale(root))

    def test_changed_dependency_manifest_is_detected(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory); manifest=root/'package-lock.json'; manifest.write_text('one')
            stamp=root/'node_modules'/'stamp'
            self.assertTrue(dependencies_changed(manifest,stamp)); remember_dependencies(manifest,stamp)
            self.assertFalse(dependencies_changed(manifest,stamp))
            manifest.write_text('two'); self.assertTrue(dependencies_changed(manifest,stamp))
