package com.rupee.service;

import com.rupee.exception.FileStorageException;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;
import software.amazon.awssdk.core.sync.RequestBody;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.DeleteObjectRequest;
import software.amazon.awssdk.services.s3.model.PutObjectRequest;

import java.io.IOException;
import java.util.UUID;

/**
 * Service responsible for managing file operations with AWS S3.
 * Handles uploading (both web uploads and raw byte streams) and deleting files.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class S3StorageService {

    private final S3Client s3Client;

    @Value("${aws.s3.bucket}")
    private String bucketName;

    @Value("${aws.region}")
    private String region;

    /**
     * Uploads a standard Spring MultipartFile (from web forms) to AWS S3.
     *
     * @param file       The uploaded file from the frontend HTTP request.
     * @param folderName The target folder inside the S3 bucket (e.g., "users", "consultants").
     * @return The fully qualified public URL to access the uploaded file.
     */
    public String uploadFile(MultipartFile file, String folderName) {
        // ✅ 1. BULLETPROOF: If the file itself is null or empty, abort safely without crashing
        if (file == null || file.isEmpty()) {
            return null;
        }

        try {
            // 1. Generate a unique file name to prevent accidental overwrites in the bucket.
            // Replacing spaces with underscores prevents URL encoding issues later.
            // ✅ SonarQube Approved: Safely handles the possibility of a null filename
            String originalFilename = file.getOriginalFilename();
            String cleanOriginalName = (originalFilename != null && !originalFilename.isEmpty())
                    ? originalFilename.replace(" ", "_")
                    : "unnamed_file";
            String uniqueFileName = UUID.randomUUID() + "_" + cleanOriginalName;

            // Joins them with a "/" without using the '+' operator in a messy string
            String fileName = String.join("/", folderName, uniqueFileName);

            // 2. Build the AWS S3 Put Object request
            PutObjectRequest putObjectRequest = PutObjectRequest.builder()
                    .bucket(bucketName)
                    .key(fileName)
                    .contentType(file.getContentType())
                    // .acl(ObjectCannedACL.PUBLIC_READ) // Uncomment if bucket is not natively public via policy
                    .build();

            // 3. Execute the upload to S3 using the file's input stream
            s3Client.putObject(putObjectRequest, RequestBody.fromInputStream(file.getInputStream(), file.getSize()));

            // 4. Construct and return the public URL so the frontend can display the image
            return String.format("https://%s.s3.%s.amazonaws.com/%s", bucketName, region, fileName);

        } catch (IOException e) {
            log.error("Failed to upload file to S3", e);
            throw new FileStorageException("Could not upload file to S3", e);
        }
    }

    /**
     * Uploads a raw byte array to AWS S3.
     * Primarily used for backend-generated files or email attachments (EmailToTicketService).
     *
     * @param fileData         The raw bytes of the file.
     * @param originalFilename The original name of the file.
     * @param contentType      The MIME type of the file.
     * @param folderName       The target folder inside the S3 bucket (e.g., "tickets").
     * @return The fully qualified public URL to access the uploaded file.
     */
    public String uploadFile(byte[] fileData, String originalFilename, String contentType, String folderName) {
        try {
            // 1. Generate a unique file name
            // Professional & Readable
            String cleanName = originalFilename.replace(" ", "_");
            String uniqueName = UUID.randomUUID() + "_" + cleanName;

            String fileName = String.join("/", folderName, uniqueName);

            // 2. Build the request, falling back to a generic binary stream if content type is unknown
            PutObjectRequest putObjectRequest = PutObjectRequest.builder()
                    .bucket(bucketName)
                    .key(fileName)
                    .contentType(contentType != null ? contentType : "application/octet-stream")
                    .build();

            // 3. Execute the upload using the raw byte array
            s3Client.putObject(putObjectRequest, RequestBody.fromBytes(fileData));

            // 4. Return the public URL
            return String.format("https://%s.s3.%s.amazonaws.com/%s", bucketName, region, fileName);

        } catch (Exception e) {
            log.error("Failed to upload raw byte array to S3", e);
            throw new FileStorageException("Could not upload email attachment to S3", e);
        }
    }

    /**
     * Deletes a file from the AWS S3 bucket based on its public URL.
     * Safe to call even if the URL is null or belongs to the local legacy file system.
     *
     * @param fileUrl The full public URL of the file to delete.
     */
    public void deleteFile(String fileUrl) {
        // 1. Safety Check: Ignore nulls or legacy local files (files not hosted on AWS)
        if (fileUrl == null || !fileUrl.contains("amazonaws.com")) {
            return;
        }

        try {
            // 2. Extract the S3 "Key" (the file path inside the bucket) from the full URL.
            // Example URL: https://my-bucket.s3.ap-south-1.amazonaws.com/users/photo.jpg
            // Extracted Key: users/photo.jpg
            String key = fileUrl.substring(fileUrl.indexOf(".com/") + 5);

            // 3. Build and execute the deletion request
            DeleteObjectRequest deleteObjectRequest = DeleteObjectRequest.builder()
                    .bucket(bucketName)
                    .key(key)
                    .build();

            s3Client.deleteObject(deleteObjectRequest);

        } catch (Exception e) {
            // We catch and log (but don't throw) so that a failed S3 deletion
            // doesn't rollback a successful database deletion operation.
            log.error("Failed to delete file from S3: {}", fileUrl, e);
        }
    }
}