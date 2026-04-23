#!/usr/bin/env python3
"""
Script to preprocess images in the database and clean up orphaned images.

This script will:
1. Go through all recipes in the database and process their images using save_production_image
2. Iterate through the upload folder and remove images that don't have their path in the database
"""

import os
import sys
import argparse
from pathlib import Path
import shutil

from PIL import Image

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

# Add the server directory to the path so we can import models
sys.path.append(os.path.join(os.path.dirname(__file__), '..', 'server'))

from models import Base, Recipe, ComposedRecipe
from .images import centercrop_resize_image

# Configuration
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))

STATIC_FOLDER_DEFAULT = os.path.join(ROOT, 'static')
STATIC_FOLDER = os.path.abspath(os.getenv("FLASK_STATIC", STATIC_FOLDER_DEFAULT))
STATIC_UPLOAD_FOLDER = os.path.join(STATIC_FOLDER, 'uploads')
ORIGINALS_FOLDER = '/mnt/xshare/projects/recipes/originals'

# Database configuration
DATABASE_URI = f"sqlite:///{STATIC_FOLDER}/database.db"

# Allowed file extensions
ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif', 'webp'}


def image_found(image_path):
    filename = image_path.replace('uploads/', '')

    # Split namespace and extension
    if '.' in filename:
        namespace, extension = filename.rsplit('.', 1)
    else:
        namespace = filename
        extension = 'jpg'  # Default extension

    return os.path.exists(os.path.join(STATIC_UPLOAD_FOLDER, filename))


def extract_all_image_paths(session):
    """Extract all image paths from the database and identify missing images"""
    image_paths = []
    missing_image_objects = []  # List of (object, field_name, index) tuples

    # Get images from Recipe table
    recipes = session.query(Recipe).all()
    for recipe in recipes:
        # Check recipe images
        if recipe.images:
            for i, image_path in enumerate(recipe.images):
                if image_path:
                    # Remove leading slash if present
                    clean_path = image_path.lstrip('/')
                    image_paths.append(clean_path)

                    # Check if image exists
                    if not image_found(clean_path):
                        missing_image_objects.append((recipe, 'images', i))

        # Check recipe instructions/steps for images
        if recipe.instructions:
            for i, instruction in enumerate(recipe.instructions):
                if isinstance(instruction, dict) and 'image' in instruction:
                    image_path = instruction['image']
                    if image_path:
                        # Remove leading slash if present
                        clean_path = image_path.lstrip('/')
                        image_paths.append(clean_path)

                        # Check if image exists
                        if not image_found(clean_path):
                            missing_image_objects.append((recipe, 'instructions', i))

    # Get images from ComposedRecipe table
    composed_recipes = session.query(ComposedRecipe).all()
    for recipe in composed_recipes:
        if recipe.images:
            for i, image_path in enumerate(recipe.images):
                if image_path:
                    # Remove leading slash if present
                    clean_path = image_path.lstrip('/')
                    image_paths.append(clean_path)

                    # Check if image exists
                    if not image_found(clean_path):
                        missing_image_objects.append((recipe, 'images', i))

    return image_paths, missing_image_objects


def get_all_files_in_upload_folder():
    """Get all files in the upload folder"""
    files = set()
    if os.path.exists(STATIC_UPLOAD_FOLDER):
        for root, dirs, filenames in os.walk(STATIC_UPLOAD_FOLDER):
            for filename in filenames:
                # Get relative path from upload folder
                full_path = os.path.join(root, filename)
                relative_path = os.path.relpath(full_path, STATIC_UPLOAD_FOLDER)
                files.add(relative_path)
    return files


def process_image_path(image_path):
    """Process a single image path"""
    try:
        # The image path inside the database is "/uploads/{filename}"
        filename = image_path.replace('uploads/', '')

        # Split namespace and extension
        if '.' in filename:
            namespace, extension = filename.rsplit('.', 1)
        else:
            namespace = filename
            extension = 'jpg'  # Default extension

        file_path = os.path.join(STATIC_UPLOAD_FOLDER, filename)

        # Check if file exists in upload folder
        if os.path.exists(file_path):
            # Move the file to the original folder if it doesn't exist there
            original_dest = os.path.join(ORIGINALS_FOLDER, filename)

            if not os.path.exists(original_dest):
                os.makedirs(os.path.dirname(original_dest), exist_ok=True)
                shutil.copy2(file_path, original_dest)

            # Process the image
            image = Image.open(file_path)
            result_path = centercrop_resize_image(STATIC_UPLOAD_FOLDER, image, namespace, extension)

            return True, result_path
        else:
            return False, f"File not found: {file_path}"

    except Exception as e:
        return False, f"Error processing {image_path}: {e}"


def process_database_images(session):
    """Process all images in the database"""
    print("Processing images in database...")

    # Extract all image paths
    image_paths, missing_image_objects = extract_all_image_paths(session)
    print(f"Found {len(image_paths)} image paths in database")
    print(f"Found {len(missing_image_objects)} missing image references")

    # Remove duplicates while preserving order
    unique_paths = []
    seen = set()
    for path in image_paths:
        if path not in seen:
            unique_paths.append(path)
            seen.add(path)

    print(f"Processing {len(unique_paths)} unique image paths...")

    # Process each image
    processed_count = 0
    error_count = 0

    for image_path in unique_paths:
        success, result = process_image_path(image_path)
        if success:
            processed_count += 1
            print(f"Processed: {result}")
        else:
            error_count += 1
            print(f"Failed: {result}")

    print(f"Processing complete. Processed: {processed_count}, Errors: {error_count}")

    return missing_image_objects


def remove_missing_image_references(missing_image_objects, session, dry_run=False):
    """Remove references to missing images from database objects"""
    print("Removing missing image references from database...")

    removed_count = 0
    modified_objects = set()  # Track which objects were modified

    for obj, field_name, index in missing_image_objects:
        try:
            if field_name == 'images':
                # Handle recipe images array
                if obj.images and index < len(obj.images):
                    image_path = obj.images[index]
                    if not dry_run:
                        obj.images.pop(index)
                        # Explicitly mark the field as modified
                        from sqlalchemy.orm.attributes import flag_modified
                        flag_modified(obj, 'images')
                        modified_objects.add(obj)
                        print(f"Removed missing image reference: {image_path}")
                    else:
                        print(f"Would remove missing image reference: {image_path}")
                    removed_count += 1

            elif field_name == 'instructions':
                # Handle recipe instruction image
                if obj.instructions and index < len(obj.instructions):
                    instruction = obj.instructions[index]
                    if isinstance(instruction, dict) and 'image' in instruction:
                        image_path = instruction['image']
                        if not dry_run:
                            instruction['image'] = None
                            # Explicitly mark the field as modified
                            from sqlalchemy.orm.attributes import flag_modified
                            flag_modified(obj, 'instructions')
                            modified_objects.add(obj)
                            print(f"Removed missing image reference from step: {image_path}")
                        else:
                            print(f"Would remove missing image reference from step: {image_path}")
                        removed_count += 1

        except Exception as e:
            print(f"Error removing missing image reference: {e}")

    if dry_run:
        print(f"Would remove {removed_count} missing image references")
    else:
        print(f"Removed {removed_count} missing image references")
        print(f"Modified {len(modified_objects)} database objects")

    return removed_count


def cleanup_orphaned_images(session, dry_run=False):
    """Remove images in upload folder that don't exist in database"""
    print("Cleaning up orphaned images...")

    # Get all image paths from database
    db_image_paths = set(extract_all_image_paths(session)[0])  # Only get the paths, not the missing objects

    # Get all files in upload folder
    upload_files = get_all_files_in_upload_folder()

    # Find orphaned files
    orphaned_files = set()
    for file_path in upload_files:
        # Convert file path to database path format
        db_path = f"uploads/{file_path}"
        if db_path not in db_image_paths:
            orphaned_files.add(file_path)

    # Remove orphaned files
    removed_count = 0
    for orphaned_file in orphaned_files:
        try:
            full_path = os.path.join(STATIC_UPLOAD_FOLDER, orphaned_file)
            if not dry_run:
                os.remove(full_path)
                print(f"Removed orphaned file: {orphaned_file}")
            else:
                print(f"Would remove orphaned file: {orphaned_file}")
            removed_count += 1
        except Exception as e:
            print(f"Error removing file {orphaned_file}: {e}")

    if dry_run:
        print(f"Cleanup dry-run complete. Would remove {removed_count} orphaned files.")
    else:
        print(f"Cleanup complete. Removed {removed_count} orphaned files.")


def main():
    """Main function to process images and clean up orphaned files"""
    parser = argparse.ArgumentParser(description='Preprocess images in database and clean up orphaned images')
    parser.add_argument('--dry-run', action='store_true', help='Show what would be done without actually doing it')
    args = parser.parse_args()

    print("Starting image preprocessing and cleanup...")
    print(f"Static folder: {STATIC_FOLDER}")
    print(f"Upload folder: {STATIC_UPLOAD_FOLDER}")
    print(f"Originals folder: {ORIGINALS_FOLDER}")

    if args.dry_run:
        print("DRY RUN MODE - No files will be modified")

    # Create database engine and session
    engine = create_engine(DATABASE_URI)
    Session = sessionmaker(bind=engine)

    with Session() as session:
        # Process images in database and get missing image objects
        missing_image_objects = process_database_images(session)

        # Clean up orphaned images
        cleanup_orphaned_images(session, dry_run=args.dry_run)

        # Remove missing image references
        if missing_image_objects:
            remove_missing_image_references(missing_image_objects, session, dry_run=args.dry_run)

            # Commit changes if not dry run
            if not args.dry_run:
                session.commit()
                print("Database changes committed")

    print("Image preprocessing and cleanup complete!")


if __name__ == '__main__':
    main()
