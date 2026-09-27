#!/usr/bin/env python3
"""
Ensure campus dataset exists on Render.
Downloads from Hugging Face Hub if configured, otherwise regenerates.
"""
import os
import sys
import subprocess
import logging

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("ensure_dataset")

DATASET_DIR = os.path.join(os.path.dirname(__file__), "campus_dataset")
MANIFEST = os.path.join(DATASET_DIR, "manifest.json")
READINGS_DIR = os.path.join(DATASET_DIR, "readings")
MODELS_DIR = os.path.join(os.path.dirname(__file__), "forecast_models")


def dataset_present() -> bool:
    return os.path.exists(MANIFEST) and os.path.isdir(READINGS_DIR)


def download_from_hf() -> bool:
    """Download dataset from Hugging Face Hub."""
    token = os.environ.get("HF_TOKEN")
    repo_id = os.environ.get("HF_DATASET_REPO")

    if not (token and repo_id):
        log.info("HF_TOKEN or HF_DATASET_REPO not set, skipping HF download")
        return False

    try:
        from huggingface_hub import HfApi
        from huggingface_hub.utils import disable_progress_bars

        disable_progress_bars()  # Cleaner logs in Render

        api = HfApi(token=token)
        log.info(f"Downloading dataset from Hugging Face: {repo_id} ...")

        # Download campus_dataset folder
        os.makedirs(READINGS_DIR, exist_ok=True)
        os.makedirs(MODELS_DIR, exist_ok=True)

        # Download all files in campus_dataset/
        api.download_folder(
            repo_id=repo_id,
            repo_type="dataset",
            folder_path="campus_dataset",
            local_dir=DATASET_DIR,
            token=token,
        )

        # Download all files in forecast_models/
        api.download_folder(
            repo_id=repo_id,
            repo_type="dataset",
            folder_path="forecast_models",
            local_dir=MODELS_DIR,
            token=token,
        )

        log.info("Dataset download from Hugging Face complete")
        return True

    except Exception as e:
        log.error(f"Hugging Face download failed: {e}")
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
        return False


def main():
    if dataset_present():
        log.info("Dataset already present")
        return 0

    log.info("Dataset not found, attempting to download from Hugging Face...")
    if download_from_hf():
        return 0

    log.info("HF not configured or download failed, regenerating locally...")
    if regenerate_dataset():
        return 0

    log.error("Failed to ensure dataset")
    return 1


if __name__ == "__main__":
    sys.exit(main())