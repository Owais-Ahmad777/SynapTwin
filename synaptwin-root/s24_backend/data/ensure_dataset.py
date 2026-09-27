#!/usr/bin/env python3
"""
Ensure campus dataset exists on Render.
Downloads from Hugging Face Hub if configured, otherwise regenerates.
"""
import os
import sys
import subprocess
import logging
import traceback

logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s %(name)s: %(message)s')
log = logging.getLogger("ensure_dataset")

DATASET_DIR = os.path.join(os.path.dirname(__file__), "campus_dataset")
MANIFEST = os.path.join(DATASET_DIR, "manifest.json")
READINGS_DIR = os.path.join(DATASET_DIR, "readings")
MODELS_DIR = os.path.join(os.path.dirname(__file__), "forecast_models")


def dataset_present() -> bool:
    return os.path.exists(MANIFEST) and os.path.isdir(READINGS_DIR)


def download_from_hf() -> bool:
    """Download dataset from Hugging Face Hub using snapshot_download."""
    token = os.environ.get("HF_TOKEN")
    repo_id = os.environ.get("HF_DATASET_REPO")

    log.info(f"HF_TOKEN present: {bool(token)}")
    log.info(f"HF_DATASET_REPO: {repo_id}")

    if not token:
        log.error("HF_TOKEN not set in environment")
        return False
    if not repo_id:
        log.error("HF_DATASET_REPO not set in environment")
        return False

    try:
        from huggingface_hub import snapshot_download
        from huggingface_hub.utils import disable_progress_bars

        disable_progress_bars()
        log.info(f"Downloading dataset from Hugging Face: {repo_id} ...")

        # Download campus_dataset folder
        os.makedirs(READINGS_DIR, exist_ok=True)
        os.makedirs(MODELS_DIR, exist_ok=True)

        # Download campus_dataset/ using snapshot_download with allow_patterns
        log.info("Downloading campus_dataset/ ...")
        snapshot_download(
            repo_id=repo_id,
            repo_type="dataset",
            allow_patterns=["campus_dataset/**"],
            local_dir=os.path.dirname(DATASET_DIR),
            token=token,
        )

        # Download forecast_models/
        log.info("Downloading forecast_models/ ...")
        snapshot_download(
            repo_id=repo_id,
            repo_type="dataset",
            allow_patterns=["forecast_models/**"],
            local_dir=MODELS_DIR,
            token=token,
        )

        log.info("Dataset download from Hugging Face complete")
        return True

    except Exception as e:
        log.error(f"Hugging Face download failed: {e}")
        log.error(f"Full traceback:\n{traceback.format_exc()}")
        return False


def regenerate_dataset() -> bool:
    """Regenerate dataset and models locally (fallback)."""
    log.info("Regenerating campus dataset (this takes 5-10 minutes)...")
    try:
        subprocess.run(
            [sys.executable, "generate_campus_dataset.py", "--days", "365"],
            cwd=os.path.dirname(__file__),
            check=True,
        )
        subprocess.run(
            [sys.executable, "train_load_forecast.py"],
            cwd=os.path.dirname(__file__),
            check=True,
        )
        log.info("Dataset regeneration complete")
        return True
    except subprocess.CalledProcessError as e:
        log.error(f"Regeneration failed: {e}")
        log.error(f"Full traceback:\n{traceback.format_exc()}")
        return False


def main():
    log.info("=== ensure_dataset.py starting ===")
    log.info(f"DATASET_DIR: {DATASET_DIR}")
    log.info(f"MANIFEST: {MANIFEST}")
    log.info(f"Dataset present: {dataset_present()}")

    if dataset_present():
        log.info("Dataset already present")
        return 0

    log.info("Dataset not found, attempting to download from Hugging Face...")
    if download_from_hf():
        log.info("HF download successful")
        return 0

    log.info("HF not configured or download failed, regenerating locally...")
    if regenerate_dataset():
        return 0

    log.error("Failed to ensure dataset")
    return 1


if __name__ == "__main__":
    sys.exit(main())