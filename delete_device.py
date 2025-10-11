#!/usr/bin/env python3
"""
BUAS Device Complete Deletion Script
===================================
Safely deletes a device and ALL associated data including:
- Audio files and recordings
- Location data
- SMS messages
- Call logs
- File system metadata and tree
- File download requests
- Device assignments
- Device info
- Audit logs (logged but preserved for compliance)
"""

import sqlite3
import os
from datetime import datetime

def delete_device_completely(device_id, delete_audio_files=True):
    """
    Completely delete a device and all associated data including:
    - Recording events and audio files
    - Location data
    - SMS messages
    - Call logs
    - File system metadata and tree
    - File download requests
    - Device assignments
    - Device info
    - Audit logs (logged but preserved for compliance)
    
    Args:
        device_id (str): The device ID to delete
        delete_audio_files (bool): Whether to also delete physical audio files
    """
    
    print(f"🗑️  COMPLETE DEVICE DELETION: {device_id}")
    print("=" * 50)
    
    # Connect to database
    conn = sqlite3.connect('uploads.db')
    cursor = conn.cursor()
    
    try:
        # Step 1: Show what will be deleted
        print("📊 Data to be deleted:")
        print("-" * 25)
        
        # Count recording events
        cursor.execute("SELECT COUNT(*) FROM recording_event WHERE device_id = ?", (device_id,))
        recording_count = cursor.fetchone()[0]
        print(f"   • Recording Events: {recording_count}")
        
        # Count uploads and get filenames
        cursor.execute("SELECT filename FROM upload WHERE device_id = ?", (device_id,))
        upload_files = cursor.fetchall()
        upload_count = len(upload_files)
        print(f"   • Upload Records: {upload_count}")
        
        # Count device locations
        cursor.execute("SELECT COUNT(*) FROM device_location WHERE device_id = ?", (device_id,))
        location_count = cursor.fetchone()[0]
        print(f"   • Location Records: {location_count}")
        
        # Count device info records
        cursor.execute("SELECT COUNT(*) FROM device_info WHERE device_id = ?", (device_id,))
        device_info_count = cursor.fetchone()[0]
        print(f"   • Device Info Records: {device_info_count}")
        
        # Count SMS messages
        try:
            cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='sms_messages'")
            if cursor.fetchone():
                cursor.execute("SELECT COUNT(*) FROM sms_messages WHERE device_id = ?", (device_id,))
                sms_count = cursor.fetchone()[0]
                print(f"   • SMS Messages: {sms_count}")
            else:
                print(f"   • SMS Messages: N/A (table not found)")
        except Exception:
            print(f"   • SMS Messages: N/A (error accessing table)")
        
        # Count call logs
        try:
            cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='call_logs'")
            if cursor.fetchone():
                cursor.execute("SELECT COUNT(*) FROM call_logs WHERE device_id = ?", (device_id,))
                call_logs_count = cursor.fetchone()[0]
                print(f"   • Call Logs: {call_logs_count}")
            else:
                print(f"   • Call Logs: N/A (table not found)")
        except Exception:
            print(f"   • Call Logs: N/A (error accessing table)")
        
        # Count file system metadata
        try:
            cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='file_system_metadata'")
            if cursor.fetchone():
                cursor.execute("SELECT COUNT(*) FROM file_system_metadata WHERE device_id = ?", (device_id,))
                fs_metadata_count = cursor.fetchone()[0]
                print(f"   • File System Metadata: {fs_metadata_count}")
            else:
                print(f"   • File System Metadata: N/A (table not found)")
        except Exception:
            print(f"   • File System Metadata: N/A (error accessing table)")
        
        # Count file system tree
        try:
            cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='file_system_tree'")
            if cursor.fetchone():
                cursor.execute("SELECT COUNT(*) FROM file_system_tree WHERE device_id = ?", (device_id,))
                fs_tree_count = cursor.fetchone()[0]
                print(f"   • File System Tree: {fs_tree_count}")
            else:
                print(f"   • File System Tree: N/A (table not found)")
        except Exception:
            print(f"   • File System Tree: N/A (error accessing table)")
        
        # Count file download requests
        try:
            cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='file_download_requests'")
            if cursor.fetchone():
                cursor.execute("SELECT COUNT(*) FROM file_download_requests WHERE device_id = ?", (device_id,))
                download_requests_count = cursor.fetchone()[0]
                print(f"   • File Download Requests: {download_requests_count}")
            else:
                print(f"   • File Download Requests: N/A (table not found)")
        except Exception:
            print(f"   • File Download Requests: N/A (error accessing table)")
        
        # Count device assignments
        try:
            cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='device_assignments'")
            if cursor.fetchone():
                cursor.execute("SELECT COUNT(*) FROM device_assignments WHERE device_id = ?", (device_id,))
                assignments_count = cursor.fetchone()[0]
                print(f"   • Device Assignments: {assignments_count}")
            else:
                print(f"   • Device Assignments: N/A (table not found)")
        except Exception:
            print(f"   • Device Assignments: N/A (error accessing table)")
        
        # Count audit logs (check if table exists first)
        try:
            cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='audit_logs'")
            if cursor.fetchone():
                cursor.execute("SELECT COUNT(*) FROM audit_logs WHERE resource_id = ? OR details LIKE ?", (device_id, f'%{device_id}%'))
                audit_count = cursor.fetchone()[0]
                print(f"   • Audit Log Entries: {audit_count}")
            else:
                print(f"   • Audit Log Entries: N/A (table not found)")
        except Exception:
            print(f"   • Audit Log Entries: N/A (error accessing table)")
        
        if upload_count > 0:
            print(f"\n📁 Audio files to be deleted:")
            for i, (filename,) in enumerate(upload_files, 1):
                file_path = os.path.join('uploads', filename)
                exists = "✅" if os.path.exists(file_path) else "❌"
                print(f"   {i}. {filename} {exists}")
        
        # Step 2: Confirm deletion
        total_records = recording_count + upload_count + location_count + device_info_count
        # Add counts for new data types (only if they exist)
        try:
            if 'sms_count' in locals():
                total_records += sms_count
            if 'call_logs_count' in locals():
                total_records += call_logs_count
            if 'fs_metadata_count' in locals():
                total_records += fs_metadata_count
            if 'fs_tree_count' in locals():
                total_records += fs_tree_count
            if 'download_requests_count' in locals():
                total_records += download_requests_count
            if 'assignments_count' in locals():
                total_records += assignments_count
        except:
            pass  # If any counts don't exist, just continue
        
        print(f"\n⚠️  TOTAL RECORDS TO DELETE: {total_records}")
        print(f"⚠️  AUDIO FILES TO DELETE: {upload_count}")
        
        response = input(f"\n❓ Are you sure you want to PERMANENTLY delete device '{device_id}' and ALL its data? (type 'DELETE' to confirm): ")
        
        if response != 'DELETE':
            print("❌ Deletion cancelled.")
            return False
        
        # Step 3: Delete physical audio files first
        deleted_files = []
        if delete_audio_files and upload_count > 0:
            print(f"\n🗑️  Deleting audio files...")
            for filename, in upload_files:
                file_path = os.path.join('uploads', filename)
                try:
                    if os.path.exists(file_path):
                        os.remove(file_path)
                        deleted_files.append(filename)
                        print(f"   ✅ Deleted: {filename}")
                    else:
                        print(f"   ⚠️  File not found: {filename}")
                except Exception as e:
                    print(f"   ❌ Error deleting {filename}: {e}")
        
        # Step 4: Delete database records (in proper order to avoid foreign key issues)
        print(f"\n🗑️  Deleting database records...")
        
        # Delete recording events
        cursor.execute("DELETE FROM recording_event WHERE device_id = ?", (device_id,))
        deleted_recordings = cursor.rowcount
        print(f"   ✅ Deleted {deleted_recordings} recording events")
        
        # Delete uploads
        cursor.execute("DELETE FROM upload WHERE device_id = ?", (device_id,))
        deleted_uploads = cursor.rowcount
        print(f"   ✅ Deleted {deleted_uploads} upload records")
        
        # Delete device locations
        cursor.execute("DELETE FROM device_location WHERE device_id = ?", (device_id,))
        deleted_locations = cursor.rowcount
        print(f"   ✅ Deleted {deleted_locations} location records")
        
        # Delete device info
        cursor.execute("DELETE FROM device_info WHERE device_id = ?", (device_id,))
        deleted_device_info = cursor.rowcount
        print(f"   ✅ Deleted {deleted_device_info} device info records")
        
        # Delete SMS messages
        try:
            cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='sms_messages'")
            if cursor.fetchone():
                cursor.execute("DELETE FROM sms_messages WHERE device_id = ?", (device_id,))
                deleted_sms = cursor.rowcount
                print(f"   ✅ Deleted {deleted_sms} SMS messages")
        except Exception as e:
            print(f"   ⚠️  Error deleting SMS messages: {e}")
        
        # Delete call logs
        try:
            cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='call_logs'")
            if cursor.fetchone():
                cursor.execute("DELETE FROM call_logs WHERE device_id = ?", (device_id,))
                deleted_call_logs = cursor.rowcount
                print(f"   ✅ Deleted {deleted_call_logs} call logs")
        except Exception as e:
            print(f"   ⚠️  Error deleting call logs: {e}")
        
        # Delete file system metadata
        try:
            cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='file_system_metadata'")
            if cursor.fetchone():
                cursor.execute("DELETE FROM file_system_metadata WHERE device_id = ?", (device_id,))
                deleted_fs_metadata = cursor.rowcount
                print(f"   ✅ Deleted {deleted_fs_metadata} file system metadata records")
        except Exception as e:
            print(f"   ⚠️  Error deleting file system metadata: {e}")
        
        # Delete file system tree
        try:
            cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='file_system_tree'")
            if cursor.fetchone():
                cursor.execute("DELETE FROM file_system_tree WHERE device_id = ?", (device_id,))
                deleted_fs_tree = cursor.rowcount
                print(f"   ✅ Deleted {deleted_fs_tree} file system tree records")
        except Exception as e:
            print(f"   ⚠️  Error deleting file system tree: {e}")
        
        # Delete file download requests
        try:
            cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='file_download_requests'")
            if cursor.fetchone():
                cursor.execute("DELETE FROM file_download_requests WHERE device_id = ?", (device_id,))
                deleted_download_requests = cursor.rowcount
                print(f"   ✅ Deleted {deleted_download_requests} file download requests")
        except Exception as e:
            print(f"   ⚠️  Error deleting file download requests: {e}")
        
        # Delete device assignments
        try:
            cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='device_assignments'")
            if cursor.fetchone():
                cursor.execute("DELETE FROM device_assignments WHERE device_id = ?", (device_id,))
                deleted_assignments = cursor.rowcount
                print(f"   ✅ Deleted {deleted_assignments} device assignments")
        except Exception as e:
            print(f"   ⚠️  Error deleting device assignments: {e}")
        
        # Note: We keep audit logs for compliance (if table exists)
        try:
            cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='audit_logs'")
            if cursor.fetchone():
                # Calculate total deleted records
                total_deleted_records = deleted_recordings + deleted_uploads + deleted_locations + deleted_device_info
                # Add counts for new data types if they were deleted
                if 'deleted_sms' in locals():
                    total_deleted_records += deleted_sms
                if 'deleted_call_logs' in locals():
                    total_deleted_records += deleted_call_logs
                if 'deleted_fs_metadata' in locals():
                    total_deleted_records += deleted_fs_metadata
                if 'deleted_fs_tree' in locals():
                    total_deleted_records += deleted_fs_tree
                if 'deleted_download_requests' in locals():
                    total_deleted_records += deleted_download_requests
                if 'deleted_assignments' in locals():
                    total_deleted_records += deleted_assignments
                
                cursor.execute("""
                    INSERT INTO audit_logs (action, user_id, resource_type, resource_id, timestamp, details)
                    VALUES (?, ?, ?, ?, ?, ?)
                """, (
                    'DEVICE_DELETED',
                    'admin',
                    'device',
                    device_id,
                    datetime.utcnow().isoformat(),
                    f'{{"device_id": "{device_id}", "deleted_files": {len(deleted_files)}, "deleted_records": {total_deleted_records}}}'
                ))
                print(f"   ✅ Logged deletion in audit trail")
            else:
                print(f"   ⚠️  Audit logging skipped (table not found)")
        except Exception as e:
            print(f"   ⚠️  Audit logging failed: {e}")
        
        # Commit all changes
        conn.commit()
        
        # Step 5: Summary
        print(f"\n✅ DELETION COMPLETE!")
        print("-" * 20)
        print(f"Device ID: {device_id}")
        print(f"Audio files deleted: {len(deleted_files)}")
        
        # Calculate total deleted records for summary
        total_deleted_records = deleted_recordings + deleted_uploads + deleted_locations + deleted_device_info
        if 'deleted_sms' in locals():
            total_deleted_records += deleted_sms
        if 'deleted_call_logs' in locals():
            total_deleted_records += deleted_call_logs
        if 'deleted_fs_metadata' in locals():
            total_deleted_records += deleted_fs_metadata
        if 'deleted_fs_tree' in locals():
            total_deleted_records += deleted_fs_tree
        if 'deleted_download_requests' in locals():
            total_deleted_records += deleted_download_requests
        if 'deleted_assignments' in locals():
            total_deleted_records += deleted_assignments
        
        print(f"Database records deleted: {total_deleted_records}")
        print(f"Deletion logged in audit trail")
        print(f"Timestamp: {datetime.now().isoformat()}")
        
        return True
        
    except Exception as e:
        print(f"❌ Error during deletion: {e}")
        conn.rollback()
        return False
    finally:
        conn.close()

def list_devices_with_data():
    """List all devices with their data counts"""
    print("📱 DEVICES WITH DATA:")
    print("=" * 30)
    
    conn = sqlite3.connect('uploads.db')
    cursor = conn.cursor()
    
    try:
        # Get all unique device IDs
        cursor.execute("""
            SELECT DISTINCT device_id FROM (
                SELECT device_id FROM recording_event
                UNION
                SELECT device_id FROM upload
                UNION 
                SELECT device_id FROM device_location
                UNION
                SELECT device_id FROM device_info
                UNION
                SELECT device_id FROM sms_messages
                UNION
                SELECT device_id FROM call_logs
                UNION
                SELECT device_id FROM file_system_metadata
                UNION
                SELECT device_id FROM file_system_tree
                UNION
                SELECT device_id FROM file_download_requests
                UNION
                SELECT device_id FROM device_assignments
            ) ORDER BY device_id
        """)
        
        devices = cursor.fetchall()
        
        for device_id, in devices:
            # Get counts for each device
            cursor.execute("SELECT COUNT(*) FROM recording_event WHERE device_id = ?", (device_id,))
            recordings = cursor.fetchone()[0]
            
            cursor.execute("SELECT COUNT(*) FROM upload WHERE device_id = ?", (device_id,))
            uploads = cursor.fetchone()[0]
            
            cursor.execute("SELECT COUNT(*) FROM device_location WHERE device_id = ?", (device_id,))
            locations = cursor.fetchone()[0]
            
            # Get counts for new data types (with error handling)
            sms_count = 0
            call_logs_count = 0
            fs_metadata_count = 0
            fs_tree_count = 0
            download_requests_count = 0
            assignments_count = 0
            
            try:
                cursor.execute("SELECT COUNT(*) FROM sms_messages WHERE device_id = ?", (device_id,))
                sms_count = cursor.fetchone()[0]
            except:
                pass
            
            try:
                cursor.execute("SELECT COUNT(*) FROM call_logs WHERE device_id = ?", (device_id,))
                call_logs_count = cursor.fetchone()[0]
            except:
                pass
            
            try:
                cursor.execute("SELECT COUNT(*) FROM file_system_metadata WHERE device_id = ?", (device_id,))
                fs_metadata_count = cursor.fetchone()[0]
            except:
                pass
            
            try:
                cursor.execute("SELECT COUNT(*) FROM file_system_tree WHERE device_id = ?", (device_id,))
                fs_tree_count = cursor.fetchone()[0]
            except:
                pass
            
            try:
                cursor.execute("SELECT COUNT(*) FROM file_download_requests WHERE device_id = ?", (device_id,))
                download_requests_count = cursor.fetchone()[0]
            except:
                pass
            
            try:
                cursor.execute("SELECT COUNT(*) FROM device_assignments WHERE device_id = ?", (device_id,))
                assignments_count = cursor.fetchone()[0]
            except:
                pass
            
            print(f"{device_id}:")
            print(f"   Recordings: {recordings}, Uploads: {uploads}, Locations: {locations}")
            if sms_count > 0 or call_logs_count > 0 or fs_metadata_count > 0 or fs_tree_count > 0 or download_requests_count > 0 or assignments_count > 0:
                print(f"   SMS: {sms_count}, Call Logs: {call_logs_count}, FS Metadata: {fs_metadata_count}")
                print(f"   FS Tree: {fs_tree_count}, Downloads: {download_requests_count}, Assignments: {assignments_count}")
        
    except Exception as e:
        print(f"Error: {e}")
    finally:
        conn.close()

if __name__ == "__main__":
    print("🗑️  BUAS Device Deletion Utility")
    print("=" * 35)
    
    # Show available devices
    list_devices_with_data()
    
    print("\n" + "=" * 35)
    device_to_delete = input("Enter device ID to delete (or 'exit' to cancel): ").strip()
    
    if device_to_delete.lower() == 'exit':
        print("Cancelled.")
    elif device_to_delete:
        delete_device_completely(device_to_delete)
    else:
        print("No device ID provided.")
