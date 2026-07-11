FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    fonts-dejavu-core \
    libheif-dev \
    && rm -rf /var/lib/apt/lists/*

COPY backend /app/backend
COPY frontend/public/logo/lakodi_logo_crena_pozadi.png /app/frontend/public/logo/lakodi_logo_crena_pozadi.png

RUN pip install fastapi uvicorn pytest httpx python-multipart pillow pillow-heif reportlab redis openpyxl

CMD ["uvicorn", "backend.app.main:app", "--host", "0.0.0.0", "--port", "8016"]
