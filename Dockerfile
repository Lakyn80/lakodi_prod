FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    libheif-dev \
    redis-server \
    nodejs \
    npm \
    && rm -rf /var/lib/apt/lists/*

COPY backend /app/backend
COPY frontend /app/frontend
COPY start.sh /app/start.sh

RUN pip install fastapi uvicorn pytest httpx python-multipart pillow pillow-heif sqlalchemy resend passlib "bcrypt==4.0.1"
RUN npm --prefix /app/frontend install
RUN chmod +x /app/start.sh

ENV DATABASE_URL=sqlite:////app/data/app.db

EXPOSE 8016 8080 6379

CMD ["/app/start.sh"]
