import { useState, useRef, useCallback } from 'react';
import {
  Box,
  Button,
  VStack,
  HStack,
  Text,
  Image,
  Spinner
} from '@chakra-ui/react';
import { recipeAPI, imagePath } from '../services/api';


// Simple icons
const UploadIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
    <path d="M14,2H6A2,2 0 0,0 4,4V20A2,2 0 0,0 6,22H18A2,2 0 0,0 20,20V8L14,2M18,20H6V4H13V9H18V20Z" />
  </svg>
);

const DeleteIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
    <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z" />
  </svg>
);

interface ImageUploadProps {
  onImageUpload: (imageUrl: string) => void;
  onImageRemove?: (imageUrl: string) => void;
  existingImages?: string[];
  multiple?: boolean;
  maxImages?: number;
  disabled?: boolean;
  namespace?: string;
}

const ImageUpload: React.FC<ImageUploadProps> = ({
  onImageUpload,
  onImageRemove,
  existingImages = [],
  multiple = false,
  maxImages = 5,
  disabled = false,
  namespace
}) => {
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const showMessage = (message: string, isError: boolean = false) => {
    if (isError) {
      setError(message);
      setTimeout(() => setError(null), 3000);
    } else {
      setSuccess(message);
      setTimeout(() => setSuccess(null), 2000);
    }
  };

  const handleFileUpload = useCallback(async (files: FileList) => {
    if (disabled) return;

    const fileArray = Array.from(files);
    const remainingSlots = maxImages - existingImages.length;

    if (fileArray.length > remainingSlots) {
      showMessage(`You can only upload ${remainingSlots} more image(s)`, true);
      return;
    }

    setUploading(true);
    setError(null);

    try {
      for (const file of fileArray) {
        // Validate file type
        if (!file.type.startsWith('image/')) {
          showMessage("Please select only image files", true);
          continue;
        }

        // No file size limit - removed validation

        const result = await recipeAPI.uploadImage(file, namespace);
        onImageUpload(result.url);
        showMessage("Image uploaded successfully");

        if (!multiple) break; // Only upload one file if not multiple
      }
    } catch (error) {
      showMessage(error instanceof Error ? error.message : "Failed to upload image", true);
    } finally {
      setUploading(false);
    }
  }, [disabled, maxImages, existingImages.length, onImageUpload, multiple, namespace]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    if (!disabled) setDragOver(true);
  }, [disabled]);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);

    if (disabled) return;

    const files = e.dataTransfer.files;
    if (files.length > 0) {
      handleFileUpload(files);
    }
  }, [disabled, handleFileUpload]);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      handleFileUpload(files);
    }
    // Reset input value to allow uploading the same file again
    e.target.value = '';
  }, [handleFileUpload]);

  const handleRemoveImage = useCallback((imageUrl: string) => {
    if (onImageRemove) {
      onImageRemove(imageUrl);
    }
  }, [onImageRemove]);

  const canUploadMore = existingImages.length < maxImages;

  return (
    <VStack align="stretch" gap={4}>
      {/* Status Messages */}
      {error && (
        <Box p={3} bg="red.50" borderRadius="md" borderLeft="4px solid" borderColor="red.400">
          <Text fontSize="sm" color="red.700">{error}</Text>
        </Box>
      )}
      {success && (
        <Box p={3} bg="green.50" borderRadius="md" borderLeft="4px solid" borderColor="green.400">
          <Text fontSize="sm" color="green.700">{success}</Text>
        </Box>
      )}

      {/* Existing Images */}
      {existingImages.length > 0 && (
        <Box>
          <Text fontSize="sm" fontWeight="medium" color="gray.700" mb={2}>
            Current Images ({existingImages.length}/{maxImages})
          </Text>
          <HStack wrap="wrap" gap={2}>
            {existingImages.map((imageUrl, index) => (
              <Box key={index} position="relative" borderRadius="md" overflow="hidden">
                <Image
                  src={imagePath(imageUrl)}
                  alt={`Image ${index + 1}`}
                  width="100px"
                  height="100px"
                  objectFit="cover"
                  border="1px solid"
                  borderColor="gray.200"
                />
                {onImageRemove && !disabled && (
                  <Button
                    size="sm"
                    position="absolute"
                    top={1}
                    right={1}
                    colorScheme="red"
                    variant="solid"
                    onClick={() => handleRemoveImage(imageUrl)}
                    minW="auto"
                    h="24px"
                    w="24px"
                    p={0}
                  >
                    <DeleteIcon />
                  </Button>
                )}
              </Box>
            ))}
          </HStack>
        </Box>
      )}

      {/* Upload Area */}
      {canUploadMore && !disabled && (
        <Box>
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileInput}
            accept="image/*"
            multiple={multiple}
            style={{ display: 'none' }}
          />

          <Box
            border="2px dashed"
            borderColor={dragOver ? "blue.400" : "gray.300"}
            borderRadius="md"
            p={6}
            textAlign="center"
            bg={dragOver ? "blue.50" : "gray.50"}
            cursor="pointer"
            transition="all 0.2s"
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            _hover={{
              borderColor: "blue.400",
              bg: "blue.50"
            }}
          >
            <VStack gap={2}>
              <UploadIcon />
              <Text fontSize="sm" color="gray.600">
                {uploading ? (
                  <HStack justify="center">
                    <Spinner size="sm" />
                    <Text>Uploading...</Text>
                  </HStack>
                ) : (
                  <>
                    Drop images here or <Text as="span" color="blue.500" fontWeight="medium">browse</Text>
                  </>
                )}
              </Text>
              <Text fontSize="xs" color="gray.500">
                PNG, JPG, JPEG, GIF, WEBP (no size limit)
              </Text>
            </VStack>
          </Box>
        </Box>
      )}

      {/* Upload Button (Alternative) */}
      {canUploadMore && !disabled && (
        <Button
          variant="outline"
          colorScheme="blue"
          size="sm"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
        >
          {uploading ? <Spinner size="sm" /> : <UploadIcon />}
          <Text ml={2}>{uploading ? 'Uploading...' : `Add ${multiple ? 'Images' : 'Image'}`}</Text>
        </Button>
      )}

      {/* Max Images Message */}
      {/*
      {existingImages.length >= maxImages && (
        <Box p={3} bg="blue.50" borderRadius="md" borderLeft="4px solid" borderColor="blue.400">
          <Text fontSize="sm" color="blue.700">
            Maximum number of images reached ({maxImages})
          </Text>
        </Box>
      )}
      */}
    </VStack>
  );
};

export default ImageUpload;