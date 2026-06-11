# Use an official Python runtime as a parent image
FROM python:3.11-slim

# Set environment variables
ENV PYTHONDONTWRITEBYTECODE 1
ENV PYTHONUNBUFFERED 1
ENV PORT 8080

# Set work directory
WORKDIR /app

# Install system build dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    libc-dev \
    && rm -rf /var/lib/apt/lists/*

# Install python packages
COPY requirements.txt /app/
RUN pip install --no-cache-dir -r requirements.txt

# Copy project files
COPY . /app/

# Expose port (Railway maps dynamic PORT, default 8080 here)
EXPOSE 8080

# Command to execute migrations, collect static files, and launch Gunicorn binding to PORT env var
CMD python manage.py migrate && \
    python manage.py collectstatic --noinput && \
    gunicorn productivityhub.wsgi:application --bind 0.0.0.0:$PORT
