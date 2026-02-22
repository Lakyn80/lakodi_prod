FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    libheif-dev \
    && rm -rf /var/lib/apt/lists/*

COPY backend /app/backend

RUN pip install fastapi uvicorn pytest httpx python-multipart pillow pillow-heif

CMD ["uvicorn", "backend.app.main:app", "--host", "0.0.0.0", "--port", "8016"]
