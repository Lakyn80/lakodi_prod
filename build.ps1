$ErrorActionPreference = "Stop"

$TAG = "lakodi-all:" + (Get-Date -Format "yyyyMMdd-HHmmss")

Write-Host "Building latest image..."
docker compose build

Write-Host "Tagging image as $TAG"
docker tag lakodi-all:latest $TAG

Write-Host "Stopping old container..."
docker compose down

Write-Host "Starting NEW container from $TAG"
docker run -d --name lakodi-all-timestamp -p 8016:8016 -p 8080:8080 -p 6381:6379 $TAG

Write-Host "HOTOVO — běží image: $TAG"
