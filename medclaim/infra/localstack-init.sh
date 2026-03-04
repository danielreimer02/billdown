#!/bin/bash
# LocalStack init script — runs when the container is ready.
# Creates the S3 bucket used for document storage.

echo "Creating S3 bucket: medclaim-documents"
awslocal s3 mb s3://medclaim-documents
echo "LocalStack init complete."
