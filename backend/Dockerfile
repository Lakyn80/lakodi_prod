FROM python:3.11-slim

WORKDIR /app

COPY backend /app/backend

RUN pip install fastapi uvicorn pytest httpx python-multipart

CMD ["uvicorn", "backend.app.main:app", "--host", "0.0.0.0", "--port", "8016"]
