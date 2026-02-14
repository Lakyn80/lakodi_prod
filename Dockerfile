FROM node:20-alpine

WORKDIR /app

COPY frontend/package.json frontend/package-lock.json ./
RUN npm install

COPY frontend/ ./

EXPOSE 8080

CMD ["npm", "run", "dev", "--", "--hostname", "0.0.0.0", "--port", "8080"]
