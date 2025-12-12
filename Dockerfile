# Use lightweight Nginx header
FROM nginx:alpine

# Copy frontend files to Nginx web root
# We copy the contents of 'frontend' directory to the html root
COPY frontend/. /usr/share/nginx/html/

# Expose port 80
EXPOSE 80


