"""
Audio File Resolution Utility
Finds actual audio files on the server by pattern matching when database references don't match.
"""

import os
import re
from datetime import datetime
from flask import current_app
from typing import Optional, List, Tuple

class AudioFileResolver:
    """Resolves audio file references to actual filenames on the server"""
    
    def __init__(self, uploads_folder: str = None):
        """
        Initialize the resolver
        
        Args:
            uploads_folder (str): Path to uploads folder. If None, uses Flask config.
        """
        self.uploads_folder = uploads_folder or current_app.config.get('UPLOAD_FOLDER', 'uploads')
        
        # For development/testing, we might not have the actual files locally
        # In production, this should point to the actual uploads directory
        if not os.path.exists(self.uploads_folder):
            current_app.logger.warning(f"Uploads folder not found: {self.uploads_folder}")
            # Try alternative paths
            alternative_paths = [
                '/home/opt/BUAS/uploads',  # Remote server path
                'uploads',  # Local development
                '../uploads'  # Relative path
            ]
            
            for alt_path in alternative_paths:
                if os.path.exists(alt_path):
                    self.uploads_folder = alt_path
                    current_app.logger.info(f"Using alternative uploads folder: {alt_path}")
                    break
        
    def find_audio_file(self, device_id: str, audio_file_id: str = None, 
                       start_date: str = None, start_time: str = None) -> Optional[str]:
        """
        Find the actual audio file for a recording event
        
        Args:
            device_id (str): Device identifier
            audio_file_id (str): Expected filename from database
            start_date (str): Recording start date (YYYY-MM-DD)
            start_time (str): Recording start time (HH:MM:SS)
            
        Returns:
            str: Actual filename if found, None otherwise
        """
        if not os.path.exists(self.uploads_folder):
            current_app.logger.warning(f"Uploads folder not found: {self.uploads_folder}")
            return None
            
        # Get all files in uploads folder
        try:
            files = os.listdir(self.uploads_folder)
        except (OSError, PermissionError) as e:
            current_app.logger.error(f"Error reading uploads folder: {e}")
            return None
        
        # Method 1: Exact match with audio_file_id
        if audio_file_id and audio_file_id.strip():
            if audio_file_id in files:
                return audio_file_id
                
        # Method 2: Pattern matching by device_id and date
        if device_id and start_date:
            # Convert date format (YYYY-MM-DD to YYYYMMDD)
            date_str = start_date.replace('-', '')
            
            # Look for files matching pattern: {device_id}_{date}*
            pattern = f"{device_id}_{date_str}"
            matching_files = [f for f in files if f.startswith(pattern)]
            
            if matching_files:
                # If multiple matches, try to find the best one by time
                if start_time and len(matching_files) > 1:
                    return self._find_best_time_match(matching_files, start_time)
                else:
                    return matching_files[0]  # Return first match
        
        # Method 3: Broader pattern matching by device_id
        if device_id:
            # Look for any files containing device_id
            device_pattern = f"{device_id}_"
            matching_files = [f for f in files if f.startswith(device_pattern)]
            
            if matching_files:
                # Sort by modification time (newest first)
                matching_files.sort(key=lambda f: os.path.getmtime(
                    os.path.join(self.uploads_folder, f)
                ), reverse=True)
                return matching_files[0]
        
        # Method 4: Search by partial device_id match (DISABLED to prevent wrong audio)
        # This method was causing the issue where recent uploads would play previous audio
        # Instead of falling back to newest file, we should return None if specific file not found
        if device_id:
            # Handle cases where device_id might be slightly different
            # e.g., "ITELitel_A665L" vs "ITELitel_A6610L"
            device_base = device_id.split('_')[0] if '_' in device_id else device_id
            matching_files = [f for f in files if f.startswith(device_base)]
            
            if matching_files:
                # Only return a file if we have specific date/time context
                # This prevents playing wrong audio for recent uploads
                if start_date and start_time:
                    # Try to find a file that matches the specific date/time
                    date_str = start_date.replace('-', '')
                    time_pattern = start_time.replace(':', '')
                    
                    # Look for files with specific date and approximate time
                    for filename in matching_files:
                        if date_str in filename and time_pattern[:4] in filename:
                            return filename
                
                # If no specific match found, don't fall back to newest file
                # This prevents playing wrong audio for incomplete uploads
                current_app.logger.warning(f"Specific audio file not found for {device_id} at {start_date} {start_time}, not falling back to newest file")
                return None
        
        current_app.logger.warning(f"No audio file found for device {device_id}, audio_file_id: {audio_file_id}")
        return None
    
    def _find_best_time_match(self, files: List[str], start_time: str) -> str:
        """
        Find the best matching file based on time correlation
        
        Args:
            files (List[str]): List of candidate filenames
            start_time (str): Start time in HH:MM:SS format
            
        Returns:
            str: Best matching filename
        """
        try:
            # Extract time from start_time (HH:MM:SS)
            target_hour = int(start_time.split(':')[0])
            target_minute = int(start_time.split(':')[1])
            target_time_minutes = target_hour * 60 + target_minute
            
            best_match = files[0]
            best_diff = float('inf')
            
            for filename in files:
                # Try to extract time from filename
                # Pattern: {device}_{date}_{time}_*
                time_match = re.search(r'(\d{6})_(\d{6})', filename)
                if time_match:
                    file_time_str = time_match.group(2)  # HHMMSS
                    if len(file_time_str) == 6:
                        file_hour = int(file_time_str[:2])
                        file_minute = int(file_time_str[2:4])
                        file_time_minutes = file_hour * 60 + file_minute
                        
                        # Calculate time difference
                        time_diff = abs(file_time_minutes - target_time_minutes)
                        
                        if time_diff < best_diff:
                            best_diff = time_diff
                            best_match = filename
            
            return best_match
            
        except (ValueError, IndexError) as e:
            current_app.logger.warning(f"Error parsing time for best match: {e}")
            return files[0]  # Return first file as fallback
    
    def get_audio_url(self, device_id: str, audio_file_id: str = None,
                     start_date: str = None, start_time: str = None,
                     base_url: str = "http://105.114.25.157") -> Tuple[str, str]:
        """
        Get the audio URL and filename for a recording event
        
        Args:
            device_id (str): Device identifier
            audio_file_id (str): Expected filename from database
            start_date (str): Recording start date
            start_time (str): Recording start time
            base_url (str): Base URL for the server
            
        Returns:
            Tuple[str, str]: (actual_filename, audio_url) or (None, "Audio Not Available")
        """
        actual_filename = self.find_audio_file(device_id, audio_file_id, start_date, start_time)
        
        if actual_filename:
            # Verify the file actually exists before returning it
            if self.verify_audio_file_exists(actual_filename):
                audio_url = f"{base_url}/api/uploads/{actual_filename}"
                return actual_filename, audio_url
            else:
                current_app.logger.warning(f"Audio file {actual_filename} does not exist on server")
                return None, "Audio Not Available"
        else:
            return None, "Audio Not Available"
    
    def verify_audio_file_exists(self, filename: str) -> bool:
        """
        Verify if an audio file actually exists on the server
        
        Args:
            filename (str): Filename to check
            
        Returns:
            bool: True if file exists, False otherwise
        """
        if not filename:
            return False
            
        file_path = os.path.join(self.uploads_folder, filename)
        return os.path.exists(file_path) and os.path.isfile(file_path)


# Convenience function for easy import
def resolve_audio_file(device_id: str, audio_file_id: str = None,
                      start_date: str = None, start_time: str = None,
                      base_url: str = "http://105.114.25.157") -> Tuple[str, str]:
    """
    Resolve audio file reference to actual filename and URL
    
    Args:
        device_id (str): Device identifier
        audio_file_id (str): Expected filename from database
        start_date (str): Recording start date
        start_time (str): Recording start time
        base_url (str): Base URL for the server
        
    Returns:
        Tuple[str, str]: (actual_filename, audio_url) or (None, "Audio Not Available")
    """
    resolver = AudioFileResolver()
    return resolver.get_audio_url(device_id, audio_file_id, start_date, start_time, base_url)
