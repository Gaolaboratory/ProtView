# Use an official Python runtime as a parent image
FROM python:3.9-slim

# Set the working directory in the container
WORKDIR /app

# Install system dependencies if needed (e.g. for lxml or pandas extensions)
# RUN apt-get update && apt-get install -y gcc

# Copy requirements first to leverage Docker cache
COPY requirements.txt .

# Install python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY backend ./backend
COPY frontend ./frontend

# Create a directory for mounting external data
# Use lightweight Nginx header
FROM nginx:alpine

# Copy frontend files to Nginx web root
COPY frontend /usr/share/nginx/html/frontend

# Nginx config to allow wasm MIME type if needed (default usually includes it)
# We just need to make sure we serve the root index
# Custom config is optional, default nginx works for static files

# Expose port 80
EXPOSE 80

# Command to run the application

