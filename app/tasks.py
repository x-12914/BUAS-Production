from flask import current_app
from .models import db, Upload
import json
import os

def get_celery():
    from .celery_app import celery
    if celery is None:
        raise RuntimeError("Celery not initialized")
    return celery

def save_upload_task(file_data, metadata):
    celery = get_celery()

    @celery.task()
    def save_upload(file_data, metadata):
        try:
            upload_folder = current_app.config['UPLOAD_FOLDER']

            filepath = os.path.join(upload_folder, file_data['filename'])
            # Save file data (optional if already saved)
            with open(filepath, 'wb') as f:
                f.write(file_data['data'])

            metadata_path = os.path.join(upload_folder, file_data['metadata_filename'])
            with open(metadata_path, 'w') as f:
                json.dump(metadata, f)

            entry = Upload(
                device_id=metadata.get("device_id"),
                filename=file_data['filename'],
                metadata_file=file_data['metadata_filename'],
                start_time=metadata.get("start_timestamp"),
                end_time=metadata.get("end_timestamp"),
                latitude=metadata.get("latitude"),
                longitude=metadata.get("longitude")
            )
            db.session.add(entry)
            db.session.commit()
        except Exception as e:
            current_app.logger.error(f"Failed to process upload: {e}")
            raise

    return save_upload.delay(file_data, metadata)
