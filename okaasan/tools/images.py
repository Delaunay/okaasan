import os

from PIL import Image


def resize_image(image, target=(200, 150)):
    target_width, target_height = target
    target_ratio = target_width / target_height

    orig_ratio = image.width / image.height

    if orig_ratio > target_ratio:
        # Image is too wide, crop width
        new_width = int(image.height * target_ratio)
        new_height = image.height
    else:
        # Image is too tall, crop height
        new_width = image.width
        new_height = int(image.width / target_ratio)

    left = (image.width - new_width) // 2
    top = (image.height - new_height) // 2
    right = left + new_width
    bottom = top + new_height

    cropped = image.crop((left, top, right, bottom))
    resized = cropped.resize((target_width, target_height), Image.LANCZOS)

    return resized

def centercrop_resize_image(root, image, namespace, extension):
    file_path = os.path.join(root, f'{namespace}.jpg')
    folder_path = os.path.dirname(file_path)
    os.makedirs(folder_path, exist_ok=True)

    purpose = namespace.split('/')[-1]

    if 'preview' in purpose:
        target = (400, 400)

    elif 'step' in purpose:
        target = (300, 225)

    resized = resize_image(image, target=target)
    resized.save(file_path)
    return f'{namespace}.jpg'
