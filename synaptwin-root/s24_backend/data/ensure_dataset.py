#!/usr/bin/env python3
"""
Ensure campus dataset exists on Render.
Downloads from S3-compatible storage if configured, otherwise regenerates.
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


def download_from_s3() -> bool:
    """Download dataset from S3-compatible storage."""
    bucket = os.environ.get("DATASET_S3_BUCKET")
    key = os.environ.get("DATASET_S3_KEY", "campus_dataset/")
    secret = os.environ.get("DATASET_S3_SECRET")
    region = os.environ.get("DATASET_S3_REGION", "ap-south-1")
    endpoint = os.environ.get("DATASET_S3_ENDPOINT")

    if not (bucket and secret):
        return False

    try:
        import boto3
        from botocore.config import Config

        session = boto3.session.Session()
        s3 = session.client(
            "s3",
            region_name=region,
            endpoint_url=endpoint,
            aws_access_key_id=key,
            aws_secret_access_key=secret,
            config=Config(s3={"addressing_style": "path"}),
        )

        log.info(f"Downloading dataset from s3://{bucket}/{key} ...")
        os.makedirs(READINGS_DIR, exist_ok=True)
        os.makedirs(MODELS_DIR, exist_ok=True)

        # Download manifest
        s3.download_file(bucket, f"{key}manifest.json", MANIFEST)

        # Download all 12 monthly CSVs
        for month in range(1, 13):
            fname = f"2026-{month:02d}.csv"
            local = os.path.join(READINGS_DIR, fname)
            remote = f"{key}readings/{fname}"
            log.info(f"  Downloading {fname}...")
            s3.download_file(bucket, remote, local)

        # Download models
        for model_file in os.listdir(MODELS_DIR):
            if model_file.endswith(".joblib"):
                local = os.path.join(MODELS_DIR, model_file)
                remote = f"{key}forecast_models/{model_file}"
                log.info(f"  Downloading {model_file}...")
                s3.download_file(bucket, remote, local)

        log.info("Dataset download complete")
        return True

    except Exception as e:
        log.error(f"S3 download failed: {e}")
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


def upload_to_s3() -> bool:
    """Upload generated dataset to S3 for future deployments."""
    bucket = os.environ.get("DATASET_S3_BUCKET")
    key = os.environ.get("DATASET_S3_KEY", "campus_dataset/")
    secret = os.environ.get("DATASET_S3_SECRET")
    region = os.environ.get("DATASET_S3_REGION", "ap-south-1")
    endpoint = os.environ.get("DATASET_S3_ENDPOINT")

    if not (bucket and secret):
        return False

    try:
        import boto3
        from botocore.config import Config

        session = boto3.session.Session()
        s3 = session.client(
            "s3",
            region_name=region,
            endpoint_url=endpoint,
            aws_access_key_id=key,
            aws_secret_access_key=secret,
            config=Config(s3={"addressing_style": "path"}),
        )

        log.info("Uploading dataset to S3 for future deployments...")
        s3.upload_file(MANIFEST, bucket, f"{key}manifest.json")

        for month in range(1, 13):
            fname = f"2026-{month:02d}.csv"
            local = os.path.join(READINGS_DIR, fname)
            remote = f"{key}readings/{fname}"
            s3.upload_file(local, bucket, remote)

        for model_file in os.listdir(MODELS_DIR):
            if model_file.endswith(".joblib"):
                local = os.path.join(MODELS_DIR, model_file)
                remote = f"{key}forecast_models/{model_file}"
                s3.upload_file(local, bucket, remote)

        log.info("Dataset upload complete")
        return True

    except Exception as e:
        log.error(f"S3 upload failed: {e}")
        return False


def main():
    if dataset_present():
        log.info("Dataset already present")
        return 0

    log.info("Dataset not found, attempting to download from S3...")
    if download_from_s3():
        return 0

    log.info("S3 not configured or download failed, regenerating locally...")
    if regenerate_dataset():
        # Try to upload for next time
        upload_to_s3()
        return 0

    log.error("Failed to ensure dataset")
    return 1


if __name__ == "__main__":
    sys.exit(main())